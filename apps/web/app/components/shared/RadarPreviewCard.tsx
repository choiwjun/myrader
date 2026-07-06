"use client";

import type { RadarHomePreview, RadarPreviewStatus } from "@/lib/radar/radar-preview";
import Link from "next/link";
import { useState } from "react";

export interface RadarPreviewCardProps {
  readonly preview: RadarHomePreview | null;
  readonly diagnosisId?: string | null;
  readonly loading?: boolean;
  readonly onRetry?: () => void;
  readonly onPreviewChange?: (preview: RadarHomePreview) => void;
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

type MutationState = "idle" | "loading" | "success" | "error";

export function RadarPreviewCard({
  preview,
  diagnosisId = null,
  loading = false,
  onPreviewChange,
  onRetry,
}: RadarPreviewCardProps) {
  const [subscriptionState, setSubscriptionState] = useState<MutationState>("idle");
  const [subscriptionMessage, setSubscriptionMessage] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, MutationState>>({});
  const sheetEnabled = preview?.sheetEnabled ?? true;
  const primaryHref = preview?.rows.find((row) => row.actionHref)?.actionHref ?? "/write";
  const subscribing = subscriptionState === "loading";
  const emptyCaption =
    preview?.mode === "failed"
      ? (preview.caption ?? "스캔 결과를 불러오지 못했어요.")
      : preview?.mode === "waiting"
        ? (preview.caption ?? "첫 결과를 준비하고 있어요.")
        : (preview?.caption ?? "아직 보여줄 검색어가 충분하지 않아요.");

  async function createTrialSubscription() {
    if (subscribing) return;
    if (!diagnosisId) {
      setSubscriptionState("error");
      setSubscriptionMessage("진단을 먼저 마치면 매주 검색어를 받아볼 수 있어요.");
      return;
    }

    setSubscriptionState("loading");
    setSubscriptionMessage("이번 주 검색어를 받을 준비를 하고 있어요.");
    try {
      const response = await fetch("/api/radar/subscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ diagnosisId }),
      });
      const json = await response.json();
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Radar subscription failed");
      }
      onPreviewChange?.(json.data);
      setSubscriptionState("success");
      setSubscriptionMessage("신청됐어요. 첫 검색어를 준비하는 중이에요.");
    } catch {
      setSubscriptionState("error");
      setSubscriptionMessage("신청하지 못했어요. 잠시 뒤 다시 눌러주세요.");
    }
  }

  async function recordFeedback(keywordId: string, feedbackType: "used" | "not_yet") {
    if (!diagnosisId) return;

    setFeedbackState((current) => ({ ...current, [keywordId]: "loading" }));
    try {
      const response = await fetch("/api/radar/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ diagnosisId, keywordId, feedbackType }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? "Radar feedback failed");
      }
      setFeedbackState((current) => ({ ...current, [keywordId]: "success" }));
    } catch {
      setFeedbackState((current) => ({ ...current, [keywordId]: "error" }));
    }
  }

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
                key={row.id ?? `${row.text}-${row.locked ? "locked" : "open"}`}
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
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  {preview?.mode === "subscribed" && row.id ? (
                    <div className="flex items-center gap-1" aria-label={`${row.text} 사용 여부`}>
                      <button
                        type="button"
                        disabled={feedbackState[row.id] === "loading"}
                        onClick={() => recordFeedback(row.id as string, "used")}
                        className="rounded-[12px] border border-[var(--boina-line)] px-2.5 py-1.5 text-[12px] font-bold text-[var(--boina-brand)] disabled:opacity-50"
                      >
                        썼어요
                      </button>
                      <button
                        type="button"
                        disabled={feedbackState[row.id] === "loading"}
                        onClick={() => recordFeedback(row.id as string, "not_yet")}
                        className="rounded-[12px] border border-[var(--boina-line)] px-2.5 py-1.5 text-[12px] font-bold text-[var(--boina-ink-2)] disabled:opacity-50"
                      >
                        아직요
                      </button>
                      {feedbackState[row.id] === "success" ? (
                        <span className="text-[12px] font-bold text-[var(--boina-good)]">
                          저장됨
                        </span>
                      ) : feedbackState[row.id] === "error" ? (
                        <span className="text-[12px] font-bold text-[#B45309]">저장 실패</span>
                      ) : null}
                    </div>
                  ) : null}
                  {row.actionHref && !row.locked ? (
                    <Link
                      href={row.actionHref}
                      className="rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[13px] font-bold text-[var(--boina-brand)]"
                    >
                      글감 만들기
                    </Link>
                  ) : (
                    <span className="rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[13px] font-bold text-[var(--boina-brand)]">
                      글감 만들기
                    </span>
                  )}
                </div>
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
          onClick={createTrialSubscription}
          disabled={subscribing}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--boina-brand)] px-4 py-3.5 text-[16px] font-bold text-white transition-colors hover:bg-[var(--boina-brand-deep)] focus:outline-none focus:ring-2 focus:ring-[var(--boina-brand)] focus:ring-offset-2 active:scale-[0.99] disabled:opacity-70"
        >
          {subscribing ? "신청 중..." : (preview?.ctaLabel ?? "매주 검색어 받아보기")}
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
          onClick={preview?.mode === "failed" ? onRetry : undefined}
          disabled={
            preview?.mode === "empty" ||
            preview?.mode === "waiting" ||
            (preview?.mode === "failed" && !onRetry)
          }
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--boina-ink)] px-4 py-3.5 text-[16px] font-bold text-white disabled:bg-[var(--boina-ink-3)]"
        >
          {preview?.ctaLabel ??
            (preview?.mode === "failed"
              ? "다시 시도"
              : preview?.mode === "waiting"
                ? "첫 결과 준비 중"
                : "다음 주에도 지켜볼게요")}
        </button>
      )}
      <p className="mt-2 text-center text-[14px] font-medium leading-[20px] text-[var(--boina-ink-3)]">
        {preview?.priceLine ?? "결제 없이 홈에서 먼저 받아볼 수 있어요"}
      </p>
      {subscriptionMessage ? (
        <output
          className={`mt-2 block text-center text-[13px] font-bold leading-[18px] ${
            subscriptionState === "error" ? "text-[#B45309]" : "text-[var(--boina-good)]"
          }`}
        >
          {subscriptionMessage}
        </output>
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
