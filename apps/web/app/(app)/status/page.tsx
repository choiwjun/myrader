// @TASK P2-S2 - 내 상태 (/status) 화면 — Stitch 반응형 디자인 통합
// @SPEC specs/screens/my-status.yaml (S2: REQ-002)
// @SPEC design/mockups/status.html (AI HERO 신호등 + 채널 글래스카드 + CTA)
// @SPEC docs/planning/05-design-system.md §1-A (AI HERO — 양보불가) §4 (신호등) §5 (정직성)
// @TEST apps/web/tests/screens/my-status.test.ts
//
// 정보 계층 (05-design-system §1-A):
//   1st = AI HERO — 화면 최상단·최대 비주얼. channel==='ai' 를 channels 배열 순서와
//         무관하게 HERO로 분리. 신호등 비주얼 + 맥락 헤드라인 + 미래지향 카피.
//   2nd = 채널 글래스카드(연료) — 네이버·구글(맛보기)·AI 추천 작은 카드.
//   3rd = 우선순위 할 일 + 확인한 근거.
// 정직성 가드: 점수(숫자) 0, 전문용어 0, 인과 단정 0, 신호등만.

"use client";

import { type Signal, channelToLabel } from "@/lib/shared/ui-labels";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const GOOGLE_PREVIEW_NOTE = "자세한 순위는 다음 단계에서 확인할 수 있어요.";
const AI_NOT_YET_NOTE = "실제로 AI가 추천할 때만 초록불이 켜져요.";

export type MeasurementLabel = "measured" | "estimated" | "unavailable";

export interface EvidenceItem {
  label: string;
  detail: string;
}

export interface ChannelStatus {
  channel: "naver" | "google" | "ai";
  signal: Signal;
  summaryLine: string;
  found: boolean;
  note?: string;
  source?: string | null;
  collectedAt?: string | null;
  measurementLabel?: MeasurementLabel | null;
  evidence?: EvidenceItem[];
}

const SIGNAL_DOT: Record<Signal, string> = {
  green: "#10B981",
  yellow: "#F59E0B",
  red: "#94A3B8",
};

const SIGNAL_CHIP: Record<Signal, { text: string; color: string; pulse: boolean }> = {
  green: { text: "노출 중", color: "#059669", pulse: false },
  yellow: { text: "확인 중", color: "#B45309", pulse: true },
  red: { text: "신호 대기", color: "#64748B", pulse: false },
};

const CHANNEL_DEFAULT_LINE: Record<ChannelStatus["channel"], string> = {
  naver: "검색 결과에서 우리 가게를 살펴보고 있어요.",
  google: "구글 지도 노출은 다음 단계에서 더 자세히 봐요.",
  ai: "AI가 우리 가게의 특징을 읽기 시작했어요.",
};
const REQUIRED_CHANNELS: ChannelStatus["channel"][] = ["naver", "google", "ai"];

const CHANNEL_INSUFFICIENT_LINE: Record<ChannelStatus["channel"], string> = {
  naver: "네이버 근거가 아직 부족해요. 조금 더 살펴보는 중이에요.",
  google: "구글 근거가 아직 부족해요. 조금 더 살펴보는 중이에요.",
  ai: "AI 추천 근거가 아직 부족해요. 조금 더 살펴보는 중이에요.",
};

function insufficientChannel(channel: ChannelStatus["channel"]): ChannelStatus {
  return {
    channel,
    signal: "red",
    summaryLine: CHANNEL_INSUFFICIENT_LINE[channel],
    found: false,
    source: "unavailable",
    measurementLabel: "unavailable",
    evidence: [],
  };
}

const CHANNEL_ICON: Record<ChannelStatus["channel"], string> = {
  naver: "search",
  google: "language",
  ai: "smart_toy",
};

function aiHeadline(signal: Signal): { head: string; sub: string } {
  switch (signal) {
    case "green":
      return {
        head: "AI가 우리 가게를 알고 있어요",
        sub: "지금처럼 꾸준히 관리하면 더 잘 잡혀요.",
      };
    case "yellow":
      return {
        head: "아직 AI가 우리 가게를 익히는 중이에요",
        sub: "괜찮아요 — 아직 대부분 가게가 그래요. 지금 준비하는 가게가 먼저 잡혀요.",
      };
    case "red":
      return {
        head: "AI는 아직 우리 가게를 몰라요",
        sub: "괜찮아요 — 아직 대부분 가게가 그래요. 지금 준비하는 가게가 AI 시대에 먼저 잡혀요.",
      };
  }
}

function TrafficSignal({ signal, loading }: { signal: Signal; loading: boolean }) {
  const lit = loading ? "yellow" : signal;
  const glow: Record<Signal, string> = {
    red: "0 0 20px rgba(100,116,139,0.35)",
    yellow: "0 0 24px rgba(245,158,11,0.55)",
    green: "0 0 24px rgba(16,185,129,0.55)",
  };
  const litColor: Record<Signal, string> = {
    red: "#94A3B8",
    yellow: "#F59E0B",
    green: "#10B981",
  };
  const Lamp = ({ pos }: { pos: Signal }) => {
    const on = lit === pos;
    return (
      <div
        className={`h-7 w-7 rounded-full md:h-9 md:w-9 ${on ? "animate-pulse" : ""}`}
        style={{
          backgroundColor: on ? litColor[pos] : "#E2E8F0",
          boxShadow: on ? glow[pos] : "none",
          border: on ? "none" : "1px solid #CBD5E1",
        }}
      />
    );
  };
  return (
    <div className="relative mb-8 flex h-40 w-40 items-center justify-center md:h-52 md:w-52">
      <div
        className="absolute inset-0 rounded-full bg-[var(--boina-brand-soft)]"
        style={{ animation: "pulse-soft 3s ease-in-out infinite" }}
        aria-hidden="true"
      />
      <div
        className="relative flex h-28 w-28 items-center justify-center rounded-full border border-[#CBD5E1]/40 bg-white md:h-36 md:w-36"
        style={{ boxShadow: "0 12px 40px rgba(11,122,85,0.10)" }}
      >
        <div className="flex flex-col gap-2">
          <Lamp pos="red" />
          <Lamp pos="yellow" />
          <Lamp pos="green" />
        </div>
      </div>
    </div>
  );
}

function ChannelCard({
  channelKey,
  signal,
  summaryLine,
  isAi = false,
  note,
  measurementLabel,
}: {
  channelKey: ChannelStatus["channel"];
  signal: Signal;
  summaryLine?: string;
  isAi?: boolean;
  note?: string;
  measurementLabel?: MeasurementLabel | null;
}) {
  const chip = SIGNAL_CHIP[signal];
  const label = channelToLabel(channelKey).label;
  const line = summaryLine?.trim() ? summaryLine : CHANNEL_DEFAULT_LINE[channelKey];

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl p-5 transition-transform hover:-translate-y-1 hover:shadow-lg ${
        isAi ? "border-2 border-[var(--boina-brand)]/15" : "border border-[#E2E8F0]"
      }`}
      style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-sm font-bold ${isAi ? "text-[var(--boina-brand-deep)]" : "text-[#434654]"}`}
        >
          {label}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {measurementLabel ? (
            <span className="rounded-full bg-[var(--boina-brand-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--boina-brand-deep)]">
              {measurementLabelToText(measurementLabel)}
            </span>
          ) : null}
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${chip.pulse ? "animate-pulse" : ""}`}
              style={{ backgroundColor: SIGNAL_DOT[signal] }}
            />
            <span className="text-xs font-semibold" style={{ color: chip.color }}>
              {chip.text}
            </span>
          </div>
        </div>
      </div>
      <p className="text-[15px] font-medium leading-relaxed text-[#0F172A]">{line}</p>
      <div className="mt-auto flex items-center justify-between border-t border-[#E2E8F0]/70 pt-3">
        <span
          className="material-symbols-outlined text-[20px]"
          style={{ color: isAi ? "var(--boina-brand)" : "#94A3B8" }}
        >
          {CHANNEL_ICON[channelKey]}
        </span>
        {note ? <span className="text-[11px] text-[#94A3B8]">{note}</span> : null}
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <div className="h-4 w-20 rounded bg-[#E2E8F0]" />
      <div className="h-4 w-full rounded bg-[var(--boina-brand-soft)]" />
      <div className="h-4 w-3/4 rounded bg-[var(--boina-brand-soft)]" />
    </div>
  );
}

function measurementLabelToText(label: MeasurementLabel) {
  switch (label) {
    case "measured":
      return "실측";
    case "estimated":
      return "추정";
    case "unavailable":
      return "근거 부족";
  }
}

function deriveMeasurementLabel(channel: ChannelStatus): MeasurementLabel {
  if (channel.measurementLabel) return channel.measurementLabel;
  if (channel.channel === "google") return "estimated";
  if (channel.found) return "measured";
  return "unavailable";
}

export function sourceToText(channel: ChannelStatus) {
  switch (channel.source) {
    case "engine_results":
      return "살펴보기 결과";
    case "naver_serp":
      return "네이버 확인";
    case "gpt_grounded":
      return "AI 직접 확인";
    case "manual":
      return "직접 입력";
    case "unavailable":
      return "출처 확인 전";
    default:
      return "출처 확인 전";
  }
}

function hasConfirmedAiEvidence(channel: ChannelStatus) {
  if (channel.channel !== "ai" || channel.signal !== "green") return true;
  return channel.source === "gpt_grounded" && (channel.evidence?.length ?? 0) > 0;
}

export function normalizeDisplayChannels(channels: ChannelStatus[]): ChannelStatus[] {
  const byChannel = new Map(channels.map((channel) => [channel.channel, channel]));

  return REQUIRED_CHANNELS.map((channelKey) => {
    const channel = byChannel.get(channelKey);
    if (!channel) {
      return insufficientChannel(channelKey);
    }

    const hasSummary = channel.summaryLine.trim().length > 0;
    const lacksConfirmedAiEvidence = !hasConfirmedAiEvidence(channel);
    const needsMoreEvidence = !channel.found || !hasSummary || lacksConfirmedAiEvidence;
    return {
      ...channel,
      signal: needsMoreEvidence ? "red" : channel.signal,
      summaryLine: needsMoreEvidence ? CHANNEL_INSUFFICIENT_LINE[channelKey] : channel.summaryLine,
      source: channel.source ?? (needsMoreEvidence ? "unavailable" : null),
      measurementLabel: channel.measurementLabel ?? (needsMoreEvidence ? "unavailable" : undefined),
      evidence: channel.evidence ?? [],
    };
  });
}

function buildPriorityFixes(channels: ChannelStatus[]) {
  return channels
    .filter((channel) => channel.signal !== "green")
    .map((channel) => ({
      id: channel.channel,
      title:
        channel.channel === "naver"
          ? "네이버에 보일 재료부터 채우기"
          : channel.channel === "google"
            ? "구글이 읽기 쉬운 소개글 다듬기"
            : "AI가 읽을 설명과 질문 재료 채우기",
      description: channel.summaryLine,
      tier:
        channel.channel === "naver"
          ? "green_self"
          : channel.channel === "google"
            ? "yellow_copy"
            : "gray_ongoing",
    }));
}

function StatusPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const diagnosisId = searchParams.get("diagnosisId");

  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!diagnosisId) {
      setLoading(false);
      setError("살펴볼 가게 정보가 없어요. 가게 찾기부터 시작해 볼까요?");
      return;
    }

    const currentDiagnosisId = diagnosisId;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const statusParams = new URLSearchParams();
        statusParams.set("diagnosisId", currentDiagnosisId);
        const res = await fetch(`/api/channel-status?${statusParams.toString()}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          setError("결과를 불러오지 못했어요. 잠깐 후에 다시 확인해 볼까요?");
          return;
        }
        setChannels(json.data?.channels ?? []);
      } catch {
        setError("연결이 잠깐 끊겼어요. 다시 시도해 볼까요?");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [diagnosisId]);

  const displayChannels = normalizeDisplayChannels(channels);
  const ai =
    displayChannels.find((channel) => channel.channel === "ai") ?? insufficientChannel("ai");
  const aiSignal: Signal = ai.signal;
  const hero = aiHeadline(aiSignal);
  const fixes = buildPriorityFixes(displayChannels);

  function goWrite(tier?: string) {
    const params = new URLSearchParams();
    if (diagnosisId) params.set("diagnosisId", diagnosisId);
    if (tier) params.set("tier", tier);
    router.push(`/write${params.toString() ? `?${params.toString()}` : ""}`);
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20">
        <div
          role="alert"
          className="rounded-2xl border border-[#F59E0B]/40 bg-[#FFFBEB] px-5 py-6 text-center"
        >
          <p className="mb-1 text-lg font-bold text-[#B45309]">잠깐, 문제가 생겼어요</p>
          <p className="text-sm text-[#92400E]">{error}</p>
          <button
            type="button"
            onClick={() => router.push("/find")}
            className="mt-4 rounded-xl bg-[var(--boina-brand)] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--boina-brand-deep)]"
          >
            가게 찾기로 가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center px-6 py-12 md:py-16">
      <section
        aria-label="AI 추천 상태 (HERO)"
        data-testid="ai-hero-slot"
        className="mb-16 flex w-full max-w-3xl flex-col items-center text-center"
      >
        <TrafficSignal signal={aiSignal} loading={loading} />
        <p className="mb-3 text-sm font-semibold tracking-wide text-[#94A3B8]">
          요즘 손님은 AI한테 물어봐요
        </p>
        <h1 className="mb-4 text-[28px] font-bold leading-tight text-[#0F172A] md:text-[42px]">
          {loading ? "AI가 우리 가게를 살펴보는 중이에요" : hero.head}
        </h1>
        {!loading && (
          <p className="max-w-2xl text-[16px] leading-relaxed text-[#64748B] md:text-[18px]">
            {hero.sub}
          </p>
        )}
      </section>

      <section className="w-full">
        <h2 className="mb-5 flex items-center gap-2 text-[20px] font-bold text-[#0F172A] md:text-[24px]">
          내 가게를 찾게 하는 채널
          <span className="rounded-full bg-[var(--boina-brand-soft)] px-2 py-0.5 text-xs font-bold text-[var(--boina-brand-deep)]">
            연료
          </span>
        </h2>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {loading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : (
            <>
              {displayChannels.map((channel) => (
                <ChannelCard
                  key={channel.channel}
                  channelKey={channel.channel}
                  signal={channel.signal}
                  summaryLine={channel.summaryLine}
                  note={channel.channel === "google" ? GOOGLE_PREVIEW_NOTE : undefined}
                  isAi={channel.channel === "ai"}
                  measurementLabel={deriveMeasurementLabel(channel)}
                />
              ))}
            </>
          )}
        </div>

        <p className="mb-12 text-center text-[13px] text-[#94A3B8]">* {AI_NOT_YET_NOTE}</p>
      </section>

      {!loading ? (
        <section className="mb-8 w-full rounded-[20px] border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(25,31,40,0.06)]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">오늘 먼저 고칠 것</p>
              <h2 className="mt-1 text-[22px] font-extrabold leading-[30px] text-[#0F172A]">
                우선순위 할 일
              </h2>
            </div>
            <button
              type="button"
              onClick={() => goWrite()}
              className="rounded-[14px] bg-[var(--boina-brand)] px-4 py-2 text-[14px] font-bold text-white"
            >
              문안 고치러 가기
            </button>
          </div>

          {fixes.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {fixes.map((fix) => (
                <button
                  key={fix.id}
                  type="button"
                  onClick={() => goWrite(fix.tier)}
                  className="rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-left transition hover:border-[var(--boina-brand)]"
                >
                  <p className="text-[16px] font-bold text-[#0F172A]">{fix.title}</p>
                  <p className="mt-1 text-[14px] leading-[20px] text-[#64748B]">
                    {fix.description}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-[16px] border border-[#A7F3D0] bg-[#ECFDF5] px-5 py-6">
              <p className="text-[17px] font-bold text-[#065F46]">
                지금은 안정적으로 보이고 있어요.
              </p>
              <p className="mt-1 text-[14px] leading-[20px] text-[#047857]">
                복붙 문안이나 꾸준히 할 일을 보고 싶다면 문안 화면에서 이어서 볼 수 있어요.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {!loading ? (
        <>
          <section className="w-full rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] p-5">
            <div className="mb-4">
              <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">근거 보기</p>
              <h2 className="mt-1 text-[22px] font-extrabold leading-[30px] text-[#0F172A]">
                확인한 근거
              </h2>
            </div>
            <div className="grid gap-3">
              {displayChannels.map((channel) => {
                const label = channelToLabel(channel.channel).label;
                const measurementLabel = deriveMeasurementLabel(channel);
                return (
                  <details
                    key={channel.channel}
                    className="rounded-[16px] border border-[#E2E8F0] bg-white px-4 py-3"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <div>
                        <p className="text-[15px] font-bold text-[#0F172A]">{label}</p>
                        <p className="text-[13px] text-[#64748B]">
                          {measurementLabelToText(measurementLabel)}
                        </p>
                      </div>
                      <span className="text-[13px] font-medium text-[#64748B]">
                        {channel.collectedAt ?? "수집 시각 기록 전"}
                      </span>
                    </summary>
                    <div className="mt-3 grid gap-2 border-t border-[#E2E8F0] pt-3 text-[14px] text-[#475569]">
                      <p>출처: {sourceToText(channel)}</p>
                      <p>메모: {channel.note ?? channel.summaryLine}</p>
                      {(channel.evidence?.length ?? 0) > 0 ? (
                        <ul className="grid gap-1">
                          {channel.evidence?.map((item) => (
                            <li key={`${channel.channel}-${item.label}`}>
                              {item.label}: {item.detail}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>확인한 자료가 더 쌓이면 여기에 함께 보여드릴게요.</p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
          <section className="mt-8 flex w-full max-w-xl flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams();
                if (diagnosisId) params.set("diagnosisId", diagnosisId);
                router.push(`/rivals${params.toString() ? `?${params.toString()}` : ""}`);
              }}
              className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--boina-brand)] px-8 py-5 text-[18px] font-bold text-white transition-all hover:bg-[var(--boina-brand-deep)] active:scale-[0.98]"
              style={{ boxShadow: "0 8px 24px rgba(11,122,85,0.18)" }}
            >
              옆집과 비교해 볼까요?
              <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">
                arrow_forward
              </span>
            </button>
            <p className="text-sm text-[#64748B]">
              다음 단계에서 우리 가게의 경쟁력을 확인해 보세요.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function StatusPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-base text-[#94A3B8]">결과를 불러오는 중...</p>
        </div>
      }
    >
      <StatusPageInner />
    </Suspense>
  );
}
