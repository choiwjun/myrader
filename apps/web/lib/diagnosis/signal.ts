// @TASK P1-R2 - 점수 → 신호등(HealthBand) 변환 (전달 레이어 책임)
// @SPEC docs/planning/07-coding-convention.md §4 (점수 비노출 — UI 노출은 신호등 변환)
// @TEST apps/web/tests/diagnosis/signal-parity.test.ts
//
// 07 §4: 엔진 내부 점수는 화면에 그대로 노출하지 않고 "전달 레이어"에서 신호등으로
// 변환한다. 이 매핑은 전달 레이어(앱) 책임이므로 여기서 소유한다 — 무거운 엔진 배럴
// (@boina/engine, Playwright 등 server-only 의존 포함)을 읽기 경로로 끌고 오지 않는다.
//
// 임계값은 엔진 scoreToHealthBand(SCREEN-004 v2.0)와 동일하게 유지한다(parity 테스트로 고정):
//   good ≥ 80, fair ≥ 60, weak ≥ 40, else poor. 비정상 값(NaN/음수) → poor.

import type { HealthBand } from "@boina/contracts/enums";

/** 점수(0-100)를 화면 신호등(HealthBand)으로 변환한다. */
export function scoreToSignal(score: number): HealthBand {
  if (!Number.isFinite(score) || score < 0) return "poor";
  if (score >= 80) return "good";
  if (score >= 60) return "fair";
  if (score >= 40) return "weak";
  return "poor";
}
