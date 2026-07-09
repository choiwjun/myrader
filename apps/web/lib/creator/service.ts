import { expand } from "@radar/keyword-pipeline";
import { maybePersistCreatorRadar } from "./persistence";
import { creatorKeywordFromCandidate, withAiProbe } from "./scoring";
import type {
  CreatorArticleDiagnosis,
  CreatorCitationSnapshot,
  CreatorLookupInput,
  CreatorPlan,
  CreatorRadarSnapshot,
  CreatorTopicPreview,
  CreatorWeeklyReport,
} from "./types";

const DEFAULT_TOPIC = "제주 여행";
const CREATOR_NOW = "2026-07-09T09:00:00.000+09:00";
const CREATOR_NEXT_SCAN = "2026-07-10T07:00:00.000+09:00";

const RELATED_SUFFIXES = [
  "추천",
  "비오는날",
  "가족 여행",
  "혼자 여행",
  "코스",
  "비용",
  "준비물",
  "맛집",
  "숙소",
  "카페",
  "실패 후기",
  "일정표",
  "체크리스트",
  "초보",
  "비교",
  "예약",
  "교통",
  "사진 명소",
] as const;

export async function previewCreatorTopic(seed: string): Promise<CreatorTopicPreview> {
  const result = await expand(seed, { limit: 5, source: relatedSource() });
  return {
    seed: result.seed,
    keywords: result.keywords.map((keyword) => keyword.text),
    message:
      result.keywords.length > 0
        ? "이 주제로 레이더를 시작할 수 있습니다."
        : "직접 조합을 찾아볼게요. 진행은 막히지 않습니다.",
    warnings: result.warnings,
  };
}

export async function buildCreatorRadarSnapshot(input: {
  readonly accountId?: string | null;
  readonly topicName?: string;
  readonly channelUrl?: string | null;
  readonly plan?: CreatorPlan;
}): Promise<CreatorRadarSnapshot> {
  const topicName = normalizeTopic(input.topicName);
  const expanded = await expand(topicName, { limit: 18, source: relatedSource() });
  const keywords = expanded.keywords
    .map((candidate, index) => creatorKeywordFromCandidate(candidate, index, true))
    .sort((a, b) => combinedScore(b) - combinedScore(a));
  const topKeyword = keywords[0];
  const snapshot: CreatorRadarSnapshot = {
    topic: {
      id: `topic_${slug(topicName)}`,
      name: topicName,
      channelUrl: input.channelUrl ?? null,
      plan: input.plan ?? "free",
    },
    scan: {
      id: `scan_${slug(topicName)}`,
      status: "done",
      stageDetail: "네이버 검색량, 문서 포화도, 7일 추세, AI 인용 가능성 프로브 완료",
      lastScannedAt: CREATOR_NOW,
      nextScanAt: CREATOR_NEXT_SCAN,
    },
    quota: quotaForPlan(input.plan ?? "free"),
    channels: [
      { name: "블로그", status: "good", detail: "관련 문서 후보 수집 완료" },
      { name: "검색광고", status: "good", detail: "월 검색량과 경쟁 강도 반영" },
      { name: "데이터랩", status: "good", detail: "최근 7일 상승 신호 반영" },
      { name: "AI 프로브", status: "good", detail: "상위 키워드 질문 세트 점검" },
    ],
    topSignal: {
      keyword: topKeyword?.text ?? topicName,
      reason:
        topKeyword?.aiEvidence?.blogGap === "empty"
          ? "AI 답변에 블로그 인용 공백이 있어 선점 가능성이 큽니다."
          : "검색 수요 대비 문서 포화도가 낮고 AI 인용 가능성이 있습니다.",
    },
    keywords,
  };

  return maybePersistCreatorRadar(snapshot, {
    accountId: input.accountId ?? null,
    trigger: "manual",
  });
}

export async function lookupCreatorKeyword(input: CreatorLookupInput) {
  const expanded = await expand(input.keyword, { limit: 1, source: relatedSource() });
  const first = expanded.keywords[0];
  if (!first) throw new Error("keyword is required");
  const keyword = creatorKeywordFromCandidate(first, 0, false);
  return input.includeAi ? withAiProbe(keyword) : keyword;
}

export async function diagnoseCreatorArticle(input: {
  readonly url: string;
}): Promise<CreatorArticleDiagnosis> {
  const titleHint = input.url.includes("example") ? "예시 글" : "등록 글";
  return {
    id: `diag_${new URL(input.url).hostname.replace(/\W+/g, "_")}`,
    url: input.url,
    status: "completed",
    score: 76,
    grade: "좋은 기회",
    checklist: [
      {
        status: "weak",
        title: `${titleHint} 첫 문단 직접성`,
        fix: "첫 문단에 주제와 답을 한 문장으로 정의하면 AI 인용 가능성이 올라갑니다.",
        impact: "high",
      },
      {
        status: "missing",
        title: "외부 출처 인용",
        fix: "통계, 공식 안내, 뉴스 원문 링크를 1개 이상 붙이면 콘텐츠 신뢰도가 올라갑니다.",
        impact: "high",
      },
      {
        status: "pass",
        title: "목록형 구조",
        fix: "현재 구조는 유지하고 각 항목에 최신 확인 날짜를 넣으면 더 좋습니다.",
        impact: "medium",
      },
    ],
    methodology: "AEO/GEO 체크리스트 기반 진단입니다. 고쳐도 인용을 보장하지는 않습니다.",
  };
}

export function getCreatorCitations(): CreatorCitationSnapshot {
  return {
    trackedCount: 3,
    weeklyCitationCount: 1,
    previousWeekDelta: 1,
    events: [
      {
        id: "event_jeju_rain_01",
        articleUrl: "https://example.com/blog/jeju-rain",
        model: "ChatGPT",
        question: "제주 비오는날 실내 코스 추천해줘",
        excerpt: "비오는 날에는 실내 전시와 동선 짧은 카페 코스를 묶는 방식이 적합합니다.",
        kind: "phrase",
        foundAt: "2026-07-09T08:20:00.000+09:00",
      },
    ],
    trackedTargets: [
      {
        id: "target_jeju_rain",
        title: "제주 비오는날 코스 정리",
        url: "https://example.com/blog/jeju-rain",
        keyword: "제주 비오는날 코스",
        registeredAt: "2026-07-02T09:30:00.000+09:00",
        lastProbedAt: CREATOR_NOW,
        citationCount: 1,
        status: "tracking",
      },
      {
        id: "target_jeju_family",
        title: "제주 가족 여행 준비물",
        url: "https://example.com/blog/jeju-family",
        keyword: "제주 가족 여행 준비물",
        registeredAt: "2026-07-04T11:00:00.000+09:00",
        lastProbedAt: CREATOR_NOW,
        citationCount: 0,
        status: "needs_fix",
      },
      {
        id: "target_jeju_cafe",
        title: "제주 카페 비교 리스트",
        url: "https://example.com/blog/jeju-cafe",
        keyword: "제주 카페 비교",
        registeredAt: "2026-07-06T15:20:00.000+09:00",
        lastProbedAt: CREATOR_NOW,
        citationCount: 0,
        status: "tracking",
      },
    ],
    methodology:
      "매주 월요일 07:00, 질문 12종을 ChatGPT와 Perplexity에 질의하고 URL, 브랜드명, 고유 문구를 탐지합니다.",
  };
}

export async function getCreatorWeeklyReport(): Promise<CreatorWeeklyReport> {
  const radar = await buildCreatorRadarSnapshot({ topicName: DEFAULT_TOPIC, plan: "starter" });
  return {
    week: "2026-W28",
    topKeywords: radar.keywords.slice(0, 5),
    citationEvents: getCreatorCitations().events,
    missedOpportunities: ["제주 비오는날 코스", "제주 가족 여행 준비물", "제주 카페 비교"],
    archiveWeeks: ["2026-W27", "2026-W26", "2026-W25"],
  };
}

function relatedSource() {
  return {
    async suggest(seed: string): Promise<readonly string[]> {
      return RELATED_SUFFIXES.map((suffix) => `${seed} ${suffix}`);
    },
  };
}

function normalizeTopic(topic?: string): string {
  const normalized = topic?.trim();
  return normalized ? normalized : DEFAULT_TOPIC;
}

function combinedScore(keyword: { readonly naverScore: number; readonly aiScore: number | null }) {
  return Math.round(keyword.naverScore * 0.52 + (keyword.aiScore ?? keyword.naverScore) * 0.48);
}

function quotaForPlan(plan: CreatorPlan) {
  if (plan === "pro") return { scansUsed: 1, scansLimit: 30, lookupsUsed: 1, lookupsLimit: 999 };
  if (plan === "starter") return { scansUsed: 1, scansLimit: 30, lookupsUsed: 1, lookupsLimit: 20 };
  return { scansUsed: 1, scansLimit: 1, lookupsUsed: 1, lookupsLimit: 3 };
}

function slug(value: string) {
  return encodeURIComponent(value).replace(/%/g, "").toLowerCase();
}
