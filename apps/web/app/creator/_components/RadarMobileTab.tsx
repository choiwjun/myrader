export function RadarMobileTab({
  active,
  children,
  onClick,
}: {
  readonly active: boolean;
  readonly children: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-lg text-sm font-bold ${
        active
          ? "bg-[var(--creator-bg-raised)] text-[var(--creator-signal-ai)]"
          : "text-[var(--creator-text-body)]"
      }`}
    >
      {children}
    </button>
  );
}
