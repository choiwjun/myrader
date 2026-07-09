export function DualScore({
  naver,
  ai,
  size = "md",
}: {
  readonly naver: number;
  readonly ai: number | null;
  readonly size?: "sm" | "md" | "xl";
}) {
  const textSize = size === "xl" ? "text-3xl" : size === "sm" ? "text-xs" : "text-sm";
  return (
    <div className={`flex flex-wrap items-center gap-2 font-mono ${textSize}`}>
      <span className="rounded-full bg-[rgba(0,224,158,.12)] px-2 py-1 text-[var(--creator-signal-naver)]">
        N {naver}
      </span>
      <span className="rounded-full bg-[rgba(77,216,255,.12)] px-2 py-1 text-[var(--creator-signal-ai)]">
        AI {ai ?? "측정 대기"}
      </span>
    </div>
  );
}
