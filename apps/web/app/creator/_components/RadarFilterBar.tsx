export type RadarFilter = "all" | "rising" | "ai-gap";

const FILTERS = [
  { id: "all", label: "전체" },
  { id: "rising", label: "상승" },
  { id: "ai-gap", label: "AI 공백" },
] as const;

export function RadarFilterBar({
  active,
  onChange,
}: {
  readonly active: RadarFilter;
  readonly onChange: (filter: RadarFilter) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {FILTERS.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={() => onChange(filter.id)}
          className={`min-h-9 rounded-full border px-3 text-sm font-bold ${
            active === filter.id
              ? "border-[var(--creator-line-focus)] bg-[rgba(77,216,255,.12)] text-[var(--creator-signal-ai)]"
              : "border-[var(--creator-line-subtle)] text-[var(--creator-text-body)]"
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
