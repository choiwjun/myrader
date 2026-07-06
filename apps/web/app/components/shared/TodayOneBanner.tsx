// @TASK P1-S0 - today_one_banner 공통 컴포넌트
// @SPEC specs/shared/components.yaml#today_one_banner
// @SPEC docs/planning/05-design-system.md §4 ("오늘 딱 하나" 배너)
//
// 가장 급한 행동 1개를 크게 강조. 응원 톤.
// 정직성 가드: 인과 단정("하면 1위") 금지.

"use client";

import { type ActionTier, actionTierToLabel } from "@/lib/shared/ui-labels";

export interface TodayOneBannerProps {
  /** 행동 제목 (사장님 언어) */
  title: string;
  /** 행동 부제목 (선택) */
  subtitle?: string;
  /** 행동 분류 (4분류) */
  tier?: ActionTier;
  /** 행동 딥링크 또는 핸들러 */
  onStart?: () => void;
  /** 시작 버튼 라벨 (기본: "지금 해볼게요") */
  startLabel?: string;
}

/**
 * "오늘 딱 하나" 배너.
 * 화면 최상단 배치, 단일 우선순위. 응원 톤.
 */
export function TodayOneBanner({
  title,
  subtitle,
  tier,
  onStart,
  startLabel = "지금 해볼게요",
}: TodayOneBannerProps) {
  const tierLabel = tier ? actionTierToLabel(tier) : null;

  return (
    <section
      aria-label="오늘 딱 하나"
      className="relative overflow-hidden rounded-3xl bg-[var(--boina-brand)] p-8 text-white md:p-10"
      style={{ boxShadow: "0 20px 48px rgba(11,122,85,0.24)" }}
    >
      {/* 장식 글로우 */}
      <div
        className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#34D399]/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-10 right-10 h-40 w-40 rounded-full bg-[#F59E0B]/10 blur-2xl"
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-2xl">
        {/* 태그 */}
        <span className="mb-5 inline-block rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold backdrop-blur-md">
          오늘 딱 하나
        </span>

        {/* 행동 제목 — 큰 글씨 */}
        <h2 className="mb-3 text-[26px] font-bold leading-tight md:text-[34px]">{title}</h2>

        {/* 부제목 */}
        {subtitle ? (
          <p className="mb-2 text-[16px] leading-relaxed text-white/90">{subtitle}</p>
        ) : null}

        {/* 분류 표시 */}
        {tierLabel ? (
          <p className="mb-6 text-sm font-semibold text-white/85">{tierLabel.label}</p>
        ) : null}

        {/* 시작 버튼 */}
        {onStart ? (
          <button
            type="button"
            onClick={onStart}
            className="flex items-center gap-2 rounded-xl bg-white px-7 py-4 text-[17px] font-bold text-[var(--boina-brand-deep)] shadow-lg transition-transform active:scale-[0.98]"
            aria-label={startLabel}
          >
            {startLabel}
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
