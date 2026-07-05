// @TASK P1-S0 - step_nav 공통 컴포넌트
// @SPEC specs/shared/components.yaml#step_nav
// @SPEC docs/planning/05-design-system.md §2 (한 번에 하나 원칙·큰 버튼)
//
// S2~S6 자유 왕복. "한 번에 하나" — 이전/다음 버튼만.
// 접근성: 버튼 최소 44×44px, aria-label.

"use client";

export interface StepNavProps {
  onPrev?: () => void;
  onNext?: () => void;
  /** 이전 버튼 숨김(첫 스텝) */
  hidePrev?: boolean;
  /** 다음 버튼 숨김(마지막 스텝) */
  hideNext?: boolean;
  /** 이전 버튼 비활성 */
  prevDisabled?: boolean;
  /** 다음 버튼 비활성 */
  nextDisabled?: boolean;
  /** 다음 버튼 라벨 커스텀 (기본: "다음") */
  nextLabel?: string;
}

/**
 * 하단 이전/다음 네비게이션.
 * position: fixed, 하단 safe-area 대응.
 * 버튼 높이 ≥ 52px (모바일 사장님 큰 손가락).
 */
export function StepNav({
  onPrev,
  onNext,
  hidePrev = false,
  hideNext = false,
  prevDisabled = false,
  nextDisabled = false,
  nextLabel = "다음",
}: StepNavProps) {
  return (
    <nav
      aria-label="단계 이동"
      className="fixed bottom-0 left-0 right-0 z-30 flex gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-white via-white/95 to-transparent max-w-[430px] mx-auto"
    >
      {/* 이전 버튼 */}
      {!hidePrev && (
        <button
          type="button"
          onClick={onPrev}
          disabled={prevDisabled}
          aria-label="이전 단계로 이동"
          className="flex-none w-24 min-h-[52px] rounded-2xl bg-gray-100 text-gray-700 text-base font-bold disabled:opacity-40 active:scale-[0.97] transition-transform"
        >
          이전
        </button>
      )}

      {/* 다음 버튼 */}
      {!hideNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          aria-label="다음 단계로 이동"
          className="flex-1 min-h-[52px] rounded-2xl bg-blue-600 text-white text-base font-bold disabled:opacity-40 active:scale-[0.97] transition-transform"
        >
          {nextLabel}
        </button>
      )}
    </nav>
  );
}
