"use client";

import { RadarPreviewCard } from "@/app/components/shared/RadarPreviewCard";
import type { RadarHomePreview } from "@/lib/radar/radar-preview";
import type { Signal } from "@/lib/shared/ui-labels";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

const cardClass =
  "rounded-[20px] border border-[var(--boina-line)] bg-[var(--boina-card)] p-5 shadow-[0_1px_3px_rgba(25,31,40,0.06)]";

const RADAR_FAILED_PREVIEW: RadarHomePreview = {
  mode: "failed",
  source: "measured",
  fallbackLabel: null,
  rows: [],
  ctaLabel: "다시 시도",
  priceLine: "이번 주 스캔을 다시 확인해야 해요.",
  caption: "스캔 결과를 불러오지 못했어요.",
  sheetEnabled: false,
};

interface HomeActionItem {
  id: string;
  title: string;
  tier: "green_self" | "yellow_copy" | "red_vendor" | "gray_ongoing";
  isTodayOne: boolean;
  isCompleted?: boolean;
}

interface HomeActionData {
  actions: HomeActionItem[];
  todayOne: HomeActionItem | null;
}

interface HomeChannelStatus {
  channel: "naver" | "google" | "ai";
  signal: Signal;
  summaryLine: string;
}
type FetchResult<T> = { ok: true; data: T | null } | { ok: false };

function withDiagnosisId(href: string, diagnosisId: string | null): string {
  return diagnosisId ? `${href}?diagnosisId=${encodeURIComponent(diagnosisId)}` : href;
}

function signalSummary(channels: HomeChannelStatus[]): string {
  if (channels.length === 0) return "아직 채널 근거를 모으는 중이에요.";
  const urgent = channels.filter((channel) => channel.signal !== "green");
  if (urgent.length === 0) return "네이버, 구글, AI 재료를 잘 지키고 있어요.";
  return urgent[0]?.summaryLine ?? "손볼 곳부터 차근차근 볼게요.";
}

function steadyActionSummary(actions: HomeActionItem[]): string {
  const ongoing = actions.find((action) => action.tier === "gray_ongoing" && !action.isCompleted);
  if (ongoing) return ongoing.title;
  const next = actions.find((action) => !action.isTodayOne && !action.isCompleted);
  return next?.title ?? "리뷰, 사진, 소개글처럼 쌓이는 일을 이어가요.";
}

function HomePageInner() {
  const searchParams = useSearchParams();
  const diagnosisId = searchParams.get("diagnosisId");
  const [radarPreview, setRadarPreview] = useState<RadarHomePreview | null>(null);
  const [radarLoading, setRadarLoading] = useState(Boolean(diagnosisId));
  const [actionData, setActionData] = useState<HomeActionData | null>(null);
  const [channels, setChannels] = useState<HomeChannelStatus[]>([]);
  const [rivalHeadline, setRivalHeadline] = useState<string | null>(null);
  const [actionFailed, setActionFailed] = useState(false);
  const [channelFailed, setChannelFailed] = useState(false);
  const [competitorFailed, setCompetitorFailed] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!diagnosisId) {
      setRadarLoading(false);
      setRadarPreview(null);
      setActionData(null);
      setChannels([]);
      setRivalHeadline(null);
      setActionFailed(false);
      setChannelFailed(false);
      setCompetitorFailed(false);
      return;
    }

    const currentDiagnosisId = diagnosisId;
    const fetchData = async <T,>(url: string): Promise<FetchResult<T>> => {
      try {
        const response = await fetch(url);
        const json = await response.json();
        if (!response.ok || !json.success) return { ok: false };
        return { ok: true, data: json.data ?? null };
      } catch {
        return { ok: false };
      }
    };

    setRadarLoading(true);
    try {
      const radarUrl = `/api/radar/preview?diagnosisId=${encodeURIComponent(currentDiagnosisId)}`;
      const actionUrl = `/api/action?diagnosisId=${encodeURIComponent(currentDiagnosisId)}`;
      const channelUrl = `/api/channel-status?diagnosisId=${encodeURIComponent(currentDiagnosisId)}`;
      const competitorUrl = `/api/competitor?diagnosisId=${encodeURIComponent(currentDiagnosisId)}`;

      const [radarData, actionSummary, channelSummary, competitorSummary] = await Promise.all([
        fetchData<RadarHomePreview>(radarUrl),
        fetchData<{
          readonly actions?: HomeActionItem[];
          readonly todayOne?: HomeActionItem | null;
        }>(actionUrl),
        fetchData<{ readonly channels?: HomeChannelStatus[] }>(channelUrl),
        fetchData<{ readonly headline?: string | null }>(competitorUrl),
      ]);

      setRadarPreview(
        radarData.ok ? (radarData.data ?? RADAR_FAILED_PREVIEW) : RADAR_FAILED_PREVIEW,
      );
      setActionFailed(!actionSummary.ok);
      setChannelFailed(!channelSummary.ok);
      setCompetitorFailed(!competitorSummary.ok);
      setActionData(
        actionSummary.ok && actionSummary.data
          ? {
              actions: actionSummary.data.actions ?? [],
              todayOne: actionSummary.data.todayOne ?? null,
            }
          : null,
      );
      setChannels(channelSummary.ok ? (channelSummary.data?.channels ?? []) : []);
      setRivalHeadline(competitorSummary.ok ? (competitorSummary.data?.headline ?? null) : null);
    } finally {
      setRadarLoading(false);
    }
  }, [diagnosisId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const statusHref = withDiagnosisId("/status", diagnosisId);
  const rivalsHref = withDiagnosisId("/rivals", diagnosisId);
  const writeHref = withDiagnosisId("/write", diagnosisId);
  const findHref = "/find";
  const todayOneTitle = actionData?.todayOne?.title ?? "오늘 먼저 손볼 한 가지를 준비 중이에요.";
  const steadyTitle = steadyActionSummary(actionData?.actions ?? []);
  const unavailableButtonClass =
    "mt-5 inline-flex min-h-12 items-center rounded-[14px] bg-white px-4 py-3 text-[15px] font-bold text-[var(--boina-brand-deep)]";

  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-4 px-5 py-8 md:py-12">
      <section className="rounded-[24px] bg-[var(--boina-brand)] px-5 py-6 text-white">
        <p className="text-[14px] font-bold opacity-80">① 오늘 볼 것</p>
        <h1 className="mt-2 text-[24px] font-extrabold leading-[32px]">
          {actionFailed ? "오늘 할 일을 불러오지 못했어요." : todayOneTitle}
        </h1>
        <p className="mt-3 text-[16px] font-medium leading-[24px] opacity-90">
          {actionFailed
            ? "추천 행동을 확인할 수 없어 정상 실행 화면으로 이어가지 않았어요."
            : "상태를 확인하고, 바로 쓸 문안까지 한 번에 이어집니다."}
        </p>
        {actionFailed ? (
          <button type="button" onClick={loadSummary} className={unavailableButtonClass}>
            다시 불러오기
          </button>
        ) : (
          <Link href={writeHref} className={unavailableButtonClass}>
            오늘 할 일 보기
          </Link>
        )}
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">② 채널 상태</p>
            <h2 className="mt-1 text-[18px] font-bold leading-[26px] text-[var(--boina-ink)]">
              검색과 AI가 읽을 재료를 확인해요.
            </h2>
            <p className="mt-1 text-[14px] font-medium leading-[20px] text-[var(--boina-ink-2)]">
              {channelFailed
                ? "채널 상태를 불러오지 못했어요. 다시 시도해 주세요."
                : signalSummary(channels)}
            </p>
          </div>
          {channelFailed ? (
            <button
              type="button"
              onClick={loadSummary}
              className="shrink-0 rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[14px] font-bold text-[var(--boina-brand)]"
            >
              재시도
            </button>
          ) : (
            <Link
              href={statusHref}
              className="shrink-0 rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[14px] font-bold text-[var(--boina-brand)]"
            >
              상태
            </Link>
          )}
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">③ 라이벌 한 줄</p>
            <h2 className="mt-1 text-[18px] font-bold leading-[26px] text-[var(--boina-ink)]">
              옆집은 있고, 우리는 빠진 것을 봅니다.
            </h2>
            <p className="mt-1 text-[14px] font-medium leading-[20px] text-[var(--boina-ink-2)]">
              {competitorFailed
                ? "라이벌 비교를 불러오지 못했어요. 다시 시도해 주세요."
                : (rivalHeadline ?? "아직 라이벌 비교 근거를 모으는 중이에요.")}
            </p>
          </div>
          {competitorFailed ? (
            <button
              type="button"
              onClick={loadSummary}
              className="shrink-0 rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[14px] font-bold text-[var(--boina-brand)]"
            >
              재시도
            </button>
          ) : (
            <Link
              href={rivalsHref}
              className="shrink-0 rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[14px] font-bold text-[var(--boina-brand)]"
            >
              라이벌
            </Link>
          )}
        </div>
      </section>

      <section aria-label="④ 이번 주 사람들이 찾는 말">
        <RadarPreviewCard
          preview={radarPreview}
          diagnosisId={diagnosisId}
          loading={radarLoading}
          onPreviewChange={setRadarPreview}
          onRetry={loadSummary}
        />
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">⑤ 꾸준한 한 걸음</p>
            <h2 className="mt-1 text-[18px] font-bold leading-[26px] text-[var(--boina-ink)]">
              리뷰, 사진, 소개글처럼 쌓이는 일을 챙겨요.
            </h2>
            <p className="mt-1 text-[14px] font-medium leading-[20px] text-[var(--boina-ink-2)]">
              {actionFailed ? "꾸준히 할 일을 불러오지 못했어요. 다시 시도해 주세요." : steadyTitle}
            </p>
          </div>
          {actionFailed ? (
            <button
              type="button"
              onClick={loadSummary}
              className="shrink-0 rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[14px] font-bold text-[var(--boina-brand)]"
            >
              재시도
            </button>
          ) : (
            <Link
              href={diagnosisId ? writeHref : findHref}
              className="shrink-0 rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[14px] font-bold text-[var(--boina-brand)]"
            >
              문안
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-[640px] px-5 py-12">
          <p className="text-[16px] font-medium text-[var(--boina-ink-2)]">홈을 불러오는 중...</p>
        </main>
      }
    >
      <HomePageInner />
    </Suspense>
  );
}
