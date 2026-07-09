import type { CreatorKeyword } from "@/lib/creator/types";
import { DualScore } from "./DualScore";
import { SignalBadge } from "./SignalBadge";

export function KeywordCard({
  keyword,
  selected,
  onSelect,
}: {
  readonly keyword: CreatorKeyword;
  readonly selected: boolean;
  readonly onSelect: (keyword: CreatorKeyword) => void;
}) {
  const sparkBars = [
    keyword.naverEvidence.trend7d ?? 0,
    keyword.naverScore - 14,
    keyword.naverScore - 7,
    keyword.naverScore,
  ].map((value) => Math.max(22, Math.min(92, value)));
  const evidenceTitle = `검색량 ${
    keyword.naverEvidence.volume?.toLocaleString("ko-KR") ?? "대기"
  }, 문서 ${keyword.naverEvidence.docs?.toLocaleString("ko-KR") ?? "대기"}, AI ${
    keyword.aiScore ?? "측정 대기"
  }`;

  return (
    <button
      type="button"
      onClick={() => onSelect(keyword)}
      title={evidenceTitle}
      className={`min-h-[132px] w-full rounded-xl border bg-[var(--creator-bg-panel)] p-4 text-left transition-transform hover:-translate-y-0.5 hover:bg-[var(--creator-bg-raised)] ${
        selected
          ? "border-[var(--creator-signal-ai)] shadow-[0_0_28px_rgba(77,216,255,.16)]"
          : "border-[var(--creator-line-subtle)]"
      }`}
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-1 h-10 w-1 rounded-full bg-[var(--creator-signal-ai)]" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[17px] font-semibold leading-6">{keyword.text}</p>
          <p className="mt-1 text-xs text-[var(--creator-text-dim)]">{keyword.trendLabel}</p>
        </div>
      </div>
      <DualScore naver={keyword.naverScore} ai={keyword.aiScore} />
      <div className="mt-3 flex items-center justify-between gap-3">
        <SignalBadge verdict={keyword.verdict} />
        <span className="flex h-8 items-end gap-1" aria-label="7일 추세">
          {sparkBars.map((height, index) => (
            <span
              key={`${keyword.id}-bar-${index}`}
              className="w-1.5 rounded-full bg-[var(--creator-signal-hot)] opacity-80"
              style={{ height: `${height}%` }}
            />
          ))}
        </span>
      </div>
    </button>
  );
}
