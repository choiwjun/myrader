"use client";

import type { RadarPreviewStatus, UnsubscribedRadarPreview } from "@/lib/radar/radar-preview";
import Link from "next/link";
import { useState } from "react";

export interface RadarPreviewCardProps {
  readonly preview: UnsubscribedRadarPreview | null;
  readonly loading?: boolean;
}

const STATUS_MARK: Record<RadarPreviewStatus, { readonly shape: string; readonly label: string }> =
  {
    good: { shape: "●", label: "좋아요" },
    mid: { shape: "◐", label: "보통이에요" },
    wait: { shape: "○", label: "준비 중이에요" },
  };

const STATUS_COLOR: Record<RadarPreviewStatus, string> = {
  good: "var(--boina-good)",
  mid: "var(--boina-mid)",
  wait: "var(--boina-wait)",
};

export function RadarPreviewCard({ preview, loading = false }: RadarPreviewCardProps) {
  const [interestOpen, setInterestOpen] = useState(false);
  const sheetEnabled = preview?.sheetEnabled ?? true;
  const primaryHref = preview?.rows.find((row) => row.actionHref)?.actionHref ?? "/write";
  const emptyCaption =
    preview?.mode === "failed"
      ? (preview.caption ?? "스캔 결과를 불러오지 못했어요.")
      : (preview?.caption ?? "아직 보여줄 검색어가 충분하지 않아요.");

  return (
    <section
      aria-label="이번 주 손님이 검색한 말"
      data-testid="radar-preview-card"
      className="rounded-[20px] border border-[var(--boina-line)] bg-[var(--boina-card)] p-5 shadow-[0_1px_3px_rgba(25,31,40,0.06)]"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-bold leading-[26px] text-[var(--boina-ink)]">
          이번 주 손님이 검색한 말
        </h2>
        {preview?.fallbackLabel ? (
          <span className="rounded-full bg-[var(--boina-brand-soft)] px-2.5 py-1 text-[12px] font-bold text-[var(--boina-brand-deep)]">
            {preview.fallbackLabel}
          </span>
        ) : null}
      </div>

      <div className="divide-y divide-[var(--boina-line)]">
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : (
          (preview?.rows ?? []).map((row) => {
            const status = STATUS_MARK[row.status];
            return (
              <div
                key={`${row.text}-${row.locked ? "locked" : "open"}`}
                className={`flex items-center gap-3 py-3 ${row.locked ? "blur-[2px]" : ""}`}
                aria-hidden={row.locked}
              >
                <span
                  className="w-5 shrink-0 text-[18px] font-bold"
                  style={{ color: STATUS_COLOR[row.status] }}
                  aria-label={status.label}
                >
                  {status.shape}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-bold leading-[24px] text-[var(--boina-ink)]">
                    {row.text}
                  </p>
                  <p className="mt-0.5 truncate text-[14px] font-medium leading-[20px] text-[var(--boina-ink-2)]">
                    {row.reason}
                  </p>
                </div>
                {row.actionHref && !row.locked ? (
                  <Link
                    href={row.actionHref}
                    className="hidden shrink-0 rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[13px] font-bold text-[var(--boina-brand)] sm:inline-flex"
                  >
                    글감 만들기
                  </Link>
                ) : (
                  <span className="hidden shrink-0 rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[13px] font-bold text-[var(--boina-brand)] sm:inline-flex">
                    글감 만들기
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {!loading && preview && preview.rows.length === 0 ? (
        <div className="mt-3 rounded-[14px] bg-[var(--boina-bg)] px-4 py-3 text-center text-[14px] font-medium leading-[20px] text-[var(--boina-ink-2)]">
          {emptyCaption}
        </div>
      ) : null}

      {sheetEnabled ? (
        <button
          type="button"
          onClick={() => setInterestOpen(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--boina-brand)] px-4 py-3.5 text-[16px] font-bold text-white transition-colors hover:bg-[var(--boina-brand-deep)] focus:outline-none focus:ring-2 focus:ring-[var(--boina-brand)] focus:ring-offset-2 active:scale-[0.99]"
        >
          {preview?.ctaLabel ?? "매주 검색어 받아보기"}
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            arrow_forward
          </span>
        </button>
      ) : preview?.mode === "subscribed" ? (
        <Link
          href={primaryHref}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--boina-brand)] px-4 py-3.5 text-[16px] font-bold text-white transition-colors hover:bg-[var(--boina-brand-deep)] focus:outline-none focus:ring-2 focus:ring-[var(--boina-brand)] focus:ring-offset-2 active:scale-[0.99]"
        >
          {preview?.ctaLabel ?? "문안 만들기"}
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      ) : (
        <button
          type="button"
          disabled={preview?.mode === "empty"}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--boina-ink)] px-4 py-3.5 text-[16px] font-bold text-white disabled:bg-[var(--boina-ink-3)]"
        >
          {preview?.ctaLabel ??
            (preview?.mode === "failed" ? "다시 시도" : "다음 주에도 지켜볼게요")}
        </button>
      )}
      <p className="mt-2 text-center text-[14px] font-medium leading-[20px] text-[var(--boina-ink-3)]">
        {preview?.priceLine ?? "결제 없이 홈에서 먼저 받아볼 수 있어요"}
      </p>

      {sheetEnabled && interestOpen ? (
        <div
          aria-label="주간 레이더 관심 등록"
          data-testid="radar-interest-sheet"
          className="mt-4 rounded-[20px] border border-[var(--boina-line)] bg-[var(--boina-bg)] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[16px] font-bold leading-[24px] text-[var(--boina-ink)]">
                주간 검색어 준비
              </p>
              <p className="mt-1 text-[14px] font-medium leading-[20px] text-[var(--boina-ink-2)]">
                매주 월요일, 홈에서 이번 주 검색어를 확인해요.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInterestOpen(false)}
              aria-label="닫기"
              className="material-symbols-outlined rounded-full p-1 text-[20px] text-[var(--boina-ink-3)] hover:bg-[var(--boina-line)]"
            >
              close
            </button>
          </div>
          <div className="mt-3 grid gap-2 text-[14px] font-medium leading-[20px] text-[var(--boina-ink-2)]">
            <p>결제나 알림 없이 홈 카드에서 먼저 확인해요.</p>
            <p>검색어가 충분하지 않은 주에는 조용하다고 알려드려요.</p>
          </div>
          <button
            type="button"
            onClick={() => setInterestOpen(false)}
            className="mt-4 flex w-full items-center justify-center rounded-[14px] bg-[var(--boina-ink)] px-4 py-3 text-[15px] font-bold text-white"
          >
            확인했어요
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-3 py-3">
      <div className="h-5 w-5 rounded-full bg-[var(--boina-line)]" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/3 rounded bg-[var(--boina-line)]" />
        <div className="h-3 w-1/2 rounded bg-[var(--boina-line)]" />
      </div>
    </div>
  );
}
