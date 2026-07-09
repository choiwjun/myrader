"use client";

import { DualScore } from "@/app/creator/_components/DualScore";
import { EvidenceRow } from "@/app/creator/_components/EvidenceRow";
import { SignalBadge } from "@/app/creator/_components/SignalBadge";
import type { CreatorKeyword } from "@/lib/creator/types";
import Link from "next/link";
import { useMemo, useState } from "react";

export function KeywordDetailPanel({
  keyword,
  onLookup,
}: {
  readonly keyword: CreatorKeyword;
  readonly onLookup: (keyword: string) => void;
}) {
  const [copyState, setCopyState] = useState("브리핑 복사");
  const briefing = useMemo(
    () =>
      `${keyword.text}\nN ${keyword.naverScore} / AI ${
        keyword.aiScore ?? "측정 대기"
      }\n${keyword.angle}`,
    [keyword],
  );
  const saturation =
    keyword.naverEvidence.saturation === null
      ? "측정 대기"
      : keyword.naverEvidence.saturation.toFixed(2);

  async function copyBriefing() {
    try {
      await navigator.clipboard.writeText(briefing);
      setCopyState("복사됨");
    } catch {
      setCopyState("복사 실패");
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-[var(--creator-text-dim)]">S3 키워드 상세</p>
          <h2 className="mt-2 text-2xl font-extrabold">{keyword.text}</h2>
        </div>
        <SignalBadge verdict={keyword.verdict} />
      </div>
      <div className="mt-4">
        <DualScore naver={keyword.naverScore} ai={keyword.aiScore} size="xl" />
      </div>
      <div className="mt-5 grid gap-3">
        <EvidenceRow
          label="네이버 검색량"
          value={keyword.naverEvidence.volume?.toLocaleString("ko-KR") ?? "대기"}
          summary={`문서 ${
            keyword.naverEvidence.docs?.toLocaleString("ko-KR") ?? "대기"
          }건과 7일 추세를 함께 반영했습니다.`}
          tone="naver"
        />
        <EvidenceRow
          label="문서 포화도"
          value={saturation}
          summary={
            keyword.naverEvidence.saturation !== null && keyword.naverEvidence.saturation < 0.3
              ? "검색 수요 대비 경쟁 문서가 적은 편입니다."
              : "차별화된 경험과 최신 확인일을 앞부분에 배치하세요."
          }
          tone="warning"
        />
        <EvidenceRow
          label="AI 프로브"
          value={keyword.aiScore === null ? "대기" : `${keyword.aiScore}`}
          summary={
            keyword.aiEvidence?.probeSummary ??
            "AI 측정은 사용자가 선택한 키워드에서만 추가 조회합니다."
          }
          tone="ai"
        />
      </div>
      <div className="mt-5 rounded-xl bg-[rgba(77,216,255,.08)] p-4">
        <p className="text-xs font-bold text-[var(--creator-text-dim)]">추천 글 각도</p>
        <p className="mt-2 text-sm leading-6 text-[var(--creator-text-body)]">{keyword.angle}</p>
      </div>
      <div className="mt-5 rounded-xl border border-[var(--creator-line-subtle)] p-3 text-xs leading-5 text-[var(--creator-text-dim)]">
        {keyword.aiEvidence?.queryText ?? "AI 질문문은 프로브 실행 후 표시됩니다."}
        <br />
        {keyword.aiEvidence?.methodology ?? "인용을 보장하지 않는 참고 지표입니다."}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <button
          type="button"
          onClick={() => onLookup(keyword.text)}
          className="min-h-12 rounded-xl border border-[var(--creator-line-focus)] px-3 font-bold text-[var(--creator-signal-ai)]"
        >
          AI 인용 가능성 확인
        </button>
        <button
          type="button"
          onClick={copyBriefing}
          className="min-h-12 rounded-xl border border-[var(--creator-line-subtle)] px-3 font-bold text-[var(--creator-text-hi)]"
        >
          {copyState}
        </button>
        <Link
          href={`/creator/citations?track=${encodeURIComponent(keyword.text)}`}
          className="flex min-h-12 items-center justify-center rounded-xl bg-[var(--creator-signal-naver)] px-3 font-bold text-[#06150f] sm:col-span-2 lg:col-span-1"
        >
          키워드 추적
        </Link>
      </div>
    </>
  );
}
