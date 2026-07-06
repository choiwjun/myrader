// @TASK P1-S0 - signal_light 공통 컴포넌트 (정직성 카피 가드 핵심)
// @SPEC specs/shared/components.yaml#signal_light
// @SPEC docs/planning/05-design-system.md §4 (신호등 — 점수 대신)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드)
// @TEST apps/web/tests/shared/ui-labels.test.ts
//
// 정직성 가드 (양보 불가):
//   - props에 score/number 필드 없음 — Signal enum string 만 받는다.
//   - 전문용어(SEO/AEO/GEO/snippet) 화면 노출 0건.
//   - 인과 단정("고치면 1위") 0건.
//   - signalToLabel 변환 함수 경유 필수.

"use client";

import { type Signal, signalToLabel } from "@/lib/shared/ui-labels";

export interface SignalLightProps {
  /**
   * 신호등 상태. Signal enum string 만 허용.
   * score(number)를 직접 받지 않는다 — 정직성 카피 가드.
   */
  signal: Signal;
  /** 채널 이름 (사장님 언어, 전문용어 X) — 예: "네이버", "AI 추천" */
  channelName?: string;
}

/**
 * 신호등 컴포넌트.
 *
 * Signal enum → 색 점 + 사장님 언어 한 줄.
 * 점수 숫자는 표시하지 않는다.
 */
export function SignalLight({ signal, channelName }: SignalLightProps) {
  const label = signalToLabel(signal);

  const dotColor =
    signal === "green" ? "bg-[#10B981]" : signal === "yellow" ? "bg-[#F59E0B]" : "bg-[#94A3B8]";

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3"
      aria-label={`${channelName ?? "상태"}: ${label.summary}`}
    >
      {/* 신호등 도트 */}
      <span
        className={`inline-block w-3.5 h-3.5 rounded-full flex-none ${dotColor}`}
        aria-hidden="true"
      />

      <div className="flex-1 min-w-0">
        {/* 채널명 */}
        {channelName ? (
          <p className="text-base font-bold text-gray-900 leading-tight">{channelName}</p>
        ) : null}
        {/* 사장님 언어 한 줄 */}
        <p className="text-sm font-medium text-gray-600 mt-0.5 leading-snug">{label.summary}</p>
      </div>
    </div>
  );
}
