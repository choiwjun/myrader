"use client";

import type { CreatorKeyword } from "@/lib/creator/types";
import { useMemo, useState } from "react";

export function StarChart({
  keywords,
  selectedId,
  onSelect,
}: {
  readonly keywords: readonly CreatorKeyword[];
  readonly selectedId: string;
  readonly onSelect: (keyword: CreatorKeyword) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const points = useMemo(
    () =>
      keywords.slice(0, 18).map((keyword, index) => {
        const angle = (index / Math.max(keywords.length, 1)) * Math.PI * 2;
        const combined = keyword.aiScore ?? keyword.naverScore;
        const radius = (44 - combined * 0.3) / zoom;
        return {
          keyword,
          left: 50 + Math.cos(angle) * radius,
          top: 50 + Math.sin(angle) * radius,
        };
      }),
    [keywords, zoom],
  );
  const path = points
    .slice(0, 8)
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.left} ${point.top}`)
    .join(" ");

  function updateZoom(next: number) {
    setZoom(Math.max(0.75, Math.min(1.6, next)));
  }

  return (
    <div
      className="relative aspect-square overflow-hidden rounded-2xl border border-[var(--creator-line-subtle)] bg-[radial-gradient(circle_at_center,rgba(77,216,255,.13),rgba(10,14,26,.05)_38%,rgba(10,14,26,.9)_72%)]"
      onWheel={(event) => {
        event.preventDefault();
        updateZoom(zoom + (event.deltaY > 0 ? -0.08 : 0.08));
      }}
    >
      <div className="absolute inset-[10%] rounded-full border border-[rgba(77,216,255,.18)]" />
      <div className="absolute inset-[24%] rounded-full border border-[rgba(0,224,158,.18)]" />
      <div className="absolute inset-[38%] rounded-full border border-[rgba(255,176,32,.18)]" />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
      >
        <path d={path} fill="none" stroke="rgba(77,216,255,.28)" strokeWidth="0.4" />
      </svg>
      <div className="creator-animate absolute inset-0 bg-[conic-gradient(from_0deg,transparent,rgba(77,216,255,.28),transparent_24deg)] opacity-70 [animation:creator-sweep_12s_linear_infinite]" />
      <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-full border border-[var(--creator-line-subtle)] bg-[rgba(10,14,26,.72)] p-1">
        <button
          type="button"
          onClick={() => updateZoom(zoom - 0.1)}
          className="grid min-h-8 min-w-8 place-items-center rounded-full text-sm font-bold text-[var(--creator-text-body)]"
          aria-label="성도 축소"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => updateZoom(zoom + 0.1)}
          className="grid min-h-8 min-w-8 place-items-center rounded-full text-sm font-bold text-[var(--creator-text-body)]"
          aria-label="성도 확대"
        >
          +
        </button>
      </div>
      {points.map(({ keyword, left, top }, index) => {
        const active = selectedId === keyword.id;
        return (
          <button
            key={keyword.id}
            type="button"
            aria-label={`${keyword.text} 선택`}
            onClick={() => onSelect(keyword)}
            className="absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
            style={{ left: `${left.toFixed(4)}%`, top: `${top.toFixed(4)}%` }}
          >
            <span
              className={`block rounded-full ${
                active
                  ? "h-5 w-5 bg-[var(--creator-signal-ai)] shadow-[0_0_30px_rgba(77,216,255,.9)]"
                  : "h-3 w-3 bg-[var(--creator-signal-naver)] shadow-[0_0_18px_rgba(0,224,158,.65)]"
              }`}
            />
            {index < 3 || active ? (
              <span className="absolute left-8 top-1/2 hidden w-32 -translate-y-1/2 text-left text-xs font-semibold text-[var(--creator-text-hi)] sm:block">
                {keyword.text}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
