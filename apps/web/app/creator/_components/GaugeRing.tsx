export function GaugeRing({
  score,
  label,
}: {
  readonly score: number;
  readonly label: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative mx-auto grid size-44 place-items-center">
      <svg aria-hidden="true" className="absolute inset-0 size-full -rotate-90">
        <circle
          cx="88"
          cy="88"
          r={radius}
          className="fill-none stroke-[var(--creator-bg-raised)]"
          strokeWidth="13"
        />
        <circle
          cx="88"
          cy="88"
          r={radius}
          className="fill-none stroke-[var(--creator-signal-ai)]"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="13"
        />
      </svg>
      <div className="text-center">
        <p className="font-mono text-5xl font-extrabold text-[var(--creator-signal-ai)]">
          {Math.round(clamped)}
        </p>
        <p className="mt-1 text-xs font-bold text-[var(--creator-text-dim)]">{label}</p>
      </div>
    </div>
  );
}
