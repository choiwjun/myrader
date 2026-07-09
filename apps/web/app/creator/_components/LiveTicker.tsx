import type { CreatorKeyword } from "@/lib/creator/types";

export function LiveTicker({
  keywords,
  onSelect,
}: {
  readonly keywords: readonly CreatorKeyword[];
  readonly onSelect?: (keyword: CreatorKeyword) => void;
}) {
  const items = [...keywords.slice(0, 8), ...keywords.slice(0, 8)];
  return (
    <div className="overflow-hidden border-y border-[var(--creator-line-subtle)] bg-[rgba(16,22,36,.92)] py-2">
      <div className="creator-animate flex w-max gap-8 whitespace-nowrap px-4 [animation:creator-ticker_60s_linear_infinite] hover:[animation-play-state:paused]">
        {items.map((keyword, index) => (
          <button
            type="button"
            key={`${keyword.id}-${index}`}
            onClick={() => onSelect?.(keyword)}
            className="font-mono text-xs text-[var(--creator-text-body)] hover:text-[var(--creator-signal-ai)]"
          >
            {keyword.text} · N{keyword.naverScore} · AI{keyword.aiScore ?? "대기"}
          </button>
        ))}
      </div>
    </div>
  );
}
