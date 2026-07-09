type EvidenceTone = "naver" | "ai" | "neutral" | "warning";

const TONE_CLASS: Record<EvidenceTone, string> = {
  naver: "border-l-[var(--creator-signal-naver)]",
  ai: "border-l-[var(--creator-signal-ai)]",
  warning: "border-l-[var(--creator-signal-hot)]",
  neutral: "border-l-[var(--creator-line-focus)]",
};

export function EvidenceRow({
  label,
  value,
  summary,
  tone = "neutral",
}: {
  readonly label: string;
  readonly value: string;
  readonly summary: string;
  readonly tone?: EvidenceTone;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--creator-line-subtle)] border-l-4 bg-[var(--creator-bg-raised)] p-3 ${TONE_CLASS[tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold text-[var(--creator-text-dim)]">{label}</p>
        <p className="font-mono text-sm font-bold text-[var(--creator-text-hi)]">{value}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--creator-text-body)]">{summary}</p>
    </div>
  );
}
