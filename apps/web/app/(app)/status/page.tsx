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
//   3rd = 비교 CTA.
// 정직성 가드: 점수(숫자) 0, 전문용어 0, 인과 단정 0, 신호등만.

"use client";

import { type Signal, channelToLabel } from "@/lib/shared/ui-labels";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

// ── 정직성 카피 상수 ──────────────────────────────────────────────────────────

const GOOGLE_PREVIEW_NOTE = "자세한 순위는 다음 단계에서 확인할 수 있어요.";
const AI_NOT_YET_NOTE = "실제로 AI가 추천할 때만 초록불이 켜져요.";

// ── 타입 ─────────────────────────────────────────────────────────────────────

interface ChannelStatus {
  channel: "naver" | "google" | "ai";
  signal: Signal;
  summaryLine: string;
  found: boolean;
  note?: string;
}

interface DiagnosisView {
  id: string;
  status: string;
  overallSignal: Signal;
}

// ── 신호 → 시각 토큰 (점수 없이 색/라벨만) ────────────────────────────────────

const SIGNAL_DOT: Record<Signal, string> = {
  green: "#10B981",
  yellow: "#F59E0B",
  red: "#94A3B8", // red 신호 = "아직 신호 없음" — 비난색(빨강) 대신 중립 슬레이트
};

const SIGNAL_CHIP: Record<Signal, { text: string; color: string; pulse: boolean }> = {
  green: { text: "노출 중", color: "#059669", pulse: false },
  yellow: { text: "확인 중", color: "#B45309", pulse: true },
  red: { text: "신호 대기", color: "#64748B", pulse: false },
};

// 채널별 기본 한 줄 (실측 summaryLine 없을 때)
const CHANNEL_DEFAULT_LINE: Record<ChannelStatus["channel"], string> = {
  naver: "검색 결과에서 우리 가게를 살펴보고 있어요.",
  google: "구글 지도 노출은 다음 단계에서 더 자세히 봐요.",
  ai: "AI가 우리 가게의 특징을 읽기 시작했어요.",
};

const CHANNEL_ICON: Record<ChannelStatus["channel"], string> = {
  naver: "search",
  google: "language",
  ai: "smart_toy",
};

// ── AI HERO 헤드라인/서브카피 (신호 구동) ─────────────────────────────────────

function aiHeadline(signal: Signal): { head: string; sub: string } {
  switch (signal) {
    case "green":
      return {
        head: "AI가 우리 가게를 알고 있어요 👍",
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

// ── AI HERO 신호등 비주얼 ─────────────────────────────────────────────────────

function TrafficSignal({ signal, loading }: { signal: Signal; loading: boolean }) {
  const lit = loading ? "yellow" : signal;
  const glow: Record<Signal, string> = {
    red: "0 0 24px rgba(239,68,68,0.6)",
    yellow: "0 0 24px rgba(245,158,11,0.6)",
    green: "0 0 24px rgba(16,185,129,0.6)",
  };
  const litColor: Record<Signal, string> = {
    red: "#EF4444",
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
        className="absolute inset-0 rounded-full bg-[#EEF2FF]"
        style={{ animation: "pulse-soft 3s ease-in-out infinite" }}
        aria-hidden="true"
      />
      <div
        className="relative flex h-28 w-28 items-center justify-center rounded-full border border-[#CBD5E1]/40 bg-white md:h-36 md:w-36"
        style={{ boxShadow: "0 12px 40px rgba(79,70,229,0.10)" }}
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

// ── 채널 글래스카드 ───────────────────────────────────────────────────────────

function ChannelCard({
  channelKey,
  signal,
  summaryLine,
  isAi = false,
  note,
}: {
  channelKey: ChannelStatus["channel"];
  signal: Signal;
  summaryLine?: string;
  isAi?: boolean;
  note?: string;
}) {
  const chip = SIGNAL_CHIP[signal];
  const label = channelToLabel(channelKey).label;
  const line = summaryLine?.trim() ? summaryLine : CHANNEL_DEFAULT_LINE[channelKey];

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl p-5 transition-transform hover:-translate-y-1 hover:shadow-lg ${
        isAi ? "border-2 border-[#4F46E5]/15" : "border border-[#E2E8F0]"
      }`}
      style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)" }}
    >
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${isAi ? "text-[#4338CA]" : "text-[#434654]"}`}>
          {label}
        </span>
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
      <p className="text-[15px] font-medium leading-relaxed text-[#0F172A]">{line}</p>
      <div className="mt-auto flex items-center justify-between border-t border-[#E2E8F0]/70 pt-3">
        <span
          className="material-symbols-outlined text-[20px]"
          style={{ color: isAi ? "#4F46E5" : "#94A3B8" }}
        >
          {CHANNEL_ICON[channelKey]}
        </span>
        {note ? <span className="text-[11px] text-[#94A3B8]">{note}</span> : null}
      </div>
    </div>
  );
}

// ── 카드 스켈레톤 ─────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <div className="h-4 w-20 rounded bg-[#E2E8F0]" />
      <div className="h-4 w-full rounded bg-[#EEF2FF]" />
      <div className="h-4 w-3/4 rounded bg-[#EEF2FF]" />
    </div>
  );
}

// ── 내부 페이지 ───────────────────────────────────────────────────────────────

function StatusPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const diagnosisId = searchParams.get("diagnosisId");

  const [, setDiagnosis] = useState<DiagnosisView | null>(null);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!diagnosisId) {
      setLoading(false);
      setError("살펴볼 가게 정보가 없어요. 가게 찾기부터 시작해 볼까요?");
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [diagRes, chanRes] = await Promise.all([
          fetch(`/api/diagnosis?id=${diagnosisId}`),
          fetch(`/api/channel-status?diagnosisId=${diagnosisId}`),
        ]);
        const [diagJson, chanJson] = await Promise.all([diagRes.json(), chanRes.json()]);

        if (!diagRes.ok || !diagJson.success) {
          setError("결과를 불러오지 못했어요. 잠깐 후에 다시 확인해 볼까요?");
          return;
        }
        setDiagnosis(diagJson.data);
        if (chanRes.ok && chanJson.success) {
          setChannels(chanJson.data?.channels ?? []);
        }
      } catch {
        setError("연결이 잠깐 끊겼어요. 다시 시도해 볼까요?");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [diagnosisId]);

  // AI는 channels 배열 순서와 무관하게 HERO 슬롯으로 분리(§1-A)
  const getChannel = (ch: ChannelStatus["channel"]) => channels.find((c) => c.channel === ch);
  const naver = getChannel("naver");
  const google = getChannel("google");
  const ai = getChannel("ai");

  const aiSignal: Signal = ai?.signal ?? "red";
  const hero = aiHeadline(aiSignal);

  // ── 에러 화면 ───────────────────────────────────────────────────────────────
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
            className="mt-4 rounded-xl bg-[#4F46E5] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#4338CA]"
          >
            가게 찾기로 가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center px-6 py-12 md:py-16">
      {/* ── AI HERO ── */}
      <section
        aria-label="AI 추천 상태 (HERO)"
        data-testid="ai-hero-slot"
        className="mb-16 flex w-full max-w-3xl flex-col items-center text-center"
      >
        <TrafficSignal signal={aiSignal} loading={loading} />
        <p className="mb-3 text-sm font-semibold tracking-wide text-[#94A3B8]">
          요즘 손님은 AI한테 물어봐요
        </p>
        <h1
          className="mb-4 text-[28px] font-bold leading-tight text-[#0F172A] md:text-[42px]"
          style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
        >
          {loading ? "AI가 우리 가게를 살펴보는 중이에요" : hero.head}
        </h1>
        {!loading && (
          <p className="max-w-2xl text-[16px] leading-relaxed text-[#64748B] md:text-[18px]">
            {hero.sub}
          </p>
        )}
      </section>

      {/* ── 채널 연료 카드 ── */}
      <section className="w-full">
        <h2
          className="mb-5 flex items-center gap-2 text-[20px] font-bold text-[#0F172A] md:text-[24px]"
          style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
        >
          내 가게를 찾게 하는 채널
          <span className="rounded-full bg-[#E0E7FF] px-2 py-0.5 text-xs font-bold text-[#4338CA]">
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
              <ChannelCard
                channelKey="naver"
                signal={naver?.signal ?? "yellow"}
                summaryLine={naver?.summaryLine}
              />
              <ChannelCard
                channelKey="google"
                signal={google?.signal ?? "yellow"}
                summaryLine={google?.summaryLine}
                note={GOOGLE_PREVIEW_NOTE}
              />
              <ChannelCard channelKey="ai" signal={aiSignal} summaryLine={ai?.summaryLine} isAi />
            </>
          )}
        </div>

        <p className="mb-12 text-center text-[13px] text-[#94A3B8]">* {AI_NOT_YET_NOTE}</p>
      </section>

      {!loading && (
        <section className="flex w-full max-w-xl flex-col items-center gap-3">
          <button
            type="button"
            onClick={() =>
              router.push(diagnosisId ? `/rivals?diagnosisId=${diagnosisId}` : "/rivals")
            }
            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4F46E5] px-8 py-5 text-[18px] font-bold text-white transition-all hover:bg-[#4338CA] active:scale-[0.98]"
            style={{ boxShadow: "0 8px 24px rgba(79,70,229,0.2)" }}
          >
            옆집과 비교해 볼까요? 👀
            <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">
              arrow_forward
            </span>
          </button>
          <p className="text-sm text-[#64748B]">
            다음 단계에서 우리 가게의 경쟁력을 확인해 보세요.
          </p>
        </section>
      )}
    </div>
  );
}

// ── 내보내기 (Suspense 래핑) ──────────────────────────────────────────────────

/**
 * S2 내 상태 (/status) — 풀 반응형.
 * auth: false. diagnosisId 쿼리로 데이터 로드.
 * 정보계층: AI HERO(최상단) → 채널 연료(네이버·구글·AI) → 비교 CTA.
 * 점수 0. 전문용어 0. 인과 단정 0.
 */
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
