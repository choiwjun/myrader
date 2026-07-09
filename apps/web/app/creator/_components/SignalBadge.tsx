import type { CreatorVerdict } from "@/lib/creator/types";

const LABELS: Record<CreatorVerdict, string> = {
  now: "지금 쓰세요",
  good: "좋은 기회",
  normal: "보통",
  watch: "관망",
};

const TONES: Record<CreatorVerdict, string> = {
  now: "border-[rgba(255,176,32,.42)] bg-[rgba(255,176,32,.12)] text-[var(--creator-signal-hot)]",
  good: "border-[rgba(77,216,255,.42)] bg-[rgba(77,216,255,.12)] text-[var(--creator-signal-ai)]",
  normal: "border-[rgba(0,224,158,.34)] bg-[rgba(0,224,158,.1)] text-[var(--creator-signal-naver)]",
  watch:
    "border-[var(--creator-line-subtle)] bg-[var(--creator-bg-raised)] text-[var(--creator-text-body)]",
};

export function SignalBadge({ verdict }: { readonly verdict: CreatorVerdict }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${TONES[verdict]}`}>
      {LABELS[verdict]}
    </span>
  );
}
