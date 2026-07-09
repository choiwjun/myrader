import type { KeywordCandidate, KeywordSignal } from "@radar/keyword-pipeline";
import { naverScore } from "@radar/keyword-pipeline";
import type { CreatorAiEvidence, CreatorKeyword, CreatorVerdict } from "./types";

const CHECKED_AT = "2026-07-09T00:00:00.000Z";

export function creatorKeywordFromCandidate(
  candidate: KeywordCandidate,
  index: number,
  includeAi: boolean,
): CreatorKeyword {
  const signal = signalFor(candidate, index);
  const scored = naverScore(signal);
  const aiEvidence = includeAi ? aiEvidenceFor(candidate.text, index) : null;
  const aiScore = aiEvidence ? aiScoreFor(scored.score, aiEvidence) : null;
  const combined = aiScore ? Math.round(scored.score * 0.52 + aiScore * 0.48) : scored.score;

  return {
    id: stableId(candidate.text),
    text: candidate.text,
    clusterId: candidate.clusterId,
    naverScore: scored.score,
    aiScore,
    aiStatus: aiEvidence ? "complete" : "available",
    verdict: verdictFor(combined),
    naverEvidence: {
      volume: scored.evidence.volume,
      docs: scored.evidence.docs,
      saturation: scored.evidence.saturation,
      trend7d: scored.evidence.trend7d,
      reasons: scored.reasons,
    },
    aiEvidence,
    angle: angleFor(candidate.text, aiEvidence),
    trendLabel: trendLabelFor(scored.evidence.trend7d),
  };
}

export function withAiProbe(keyword: CreatorKeyword): CreatorKeyword {
  if (keyword.aiStatus === "complete") return keyword;
  const aiEvidence = aiEvidenceFor(keyword.text, 0);
  const aiScore = aiScoreFor(keyword.naverScore, aiEvidence);

  return {
    ...keyword,
    aiScore,
    aiStatus: "complete",
    aiEvidence,
    verdict: verdictFor(Math.round(keyword.naverScore * 0.52 + aiScore * 0.48)),
    angle: angleFor(keyword.text, aiEvidence),
  };
}

function signalFor(candidate: KeywordCandidate, index: number): KeywordSignal {
  const base = textWeight(candidate.text) + index * 37;
  const volume = 180 + (base % 6200);
  const docs = 20 + (base % 3400);
  const trend7d = -8 + (base % 34);
  const saturation = docs / Math.max(volume, 1);

  return {
    keyword: candidate,
    evidence: {
      volume,
      docs,
      saturation,
      trend7d,
      checkedAt: CHECKED_AT,
    },
    channels: {
      blog: "complete",
      searchAd: "complete",
      datalab: "complete",
    },
  };
}

function aiEvidenceFor(keyword: string, index: number): CreatorAiEvidence {
  const citedSources = textWeight(keyword) % 4;
  const blogGap = citedSources === 0 ? "empty" : citedSources <= 2 ? "thin" : "crowded";

  return {
    probeSummary:
      citedSources === 0
        ? "ChatGPT와 Perplexity 답변에서 블로그 인용 공백이 있어 선점 가능성이 큽니다."
        : `ChatGPT와 Perplexity 답변에서 블로그형 출처 ${citedSources}건을 확인했습니다.`,
    citedSources,
    blogGap,
    queryText: `${keyword}에 대한 최신 경험과 정보를 정리해줘`,
    methodology: `AI 인용 가능성 측정: 질문 세트 v1-${(index % 3) + 1}, URL/브랜드/고유 문구 노출 여부를 확인합니다. 인용을 보장하지 않는 가능성 지표입니다.`,
  };
}

function aiScoreFor(naver: number, evidence: CreatorAiEvidence): number {
  const gapBonus = evidence.blogGap === "empty" ? 24 : evidence.blogGap === "thin" ? 14 : 4;
  return clampScore(Math.round(naver * 0.62 + gapBonus));
}

function verdictFor(score: number): CreatorVerdict {
  if (score >= 85) return "now";
  if (score >= 70) return "good";
  if (score >= 50) return "normal";
  return "watch";
}

function angleFor(keyword: string, evidence: CreatorAiEvidence | null): string {
  if (evidence?.blogGap === "empty") {
    return "비교표와 단계별 목록으로 비어 있는 인용 영역을 먼저 채우세요.";
  }
  if (keyword.includes("추천")) {
    return "상황별 추천 기준표로 나누면 AI 답변에 인용되기 좋습니다.";
  }
  return "첫 문단에 직접 답변, 정의, 최신 업데이트 날짜를 함께 넣으세요.";
}

function trendLabelFor(trend7d: number | null): string {
  if (trend7d === null) return "변화 측정 대기";
  if (trend7d >= 12) return "급상승";
  if (trend7d >= 0) return "완만한 상승";
  return "관심 하락";
}

function stableId(text: string): string {
  return `ck_${textWeight(text).toString(36)}`;
}

function textWeight(text: string): number {
  return Array.from(text).reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0);
}

function clampScore(score: number): number {
  return Math.max(1, Math.min(100, score));
}
