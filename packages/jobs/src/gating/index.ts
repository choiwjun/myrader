/**
 * @TASK P0-T3 - 비용 게이팅 함수 자리 (더미 구현)
 * @SPEC docs/planning/02-trd.md#5-리스크 (AI 인용·SERP 비용 폭증 → 게이팅)
 * @SPEC docs/planning/07-coding-convention.md#6 (어댑터/레지스트리 확장점)
 *
 * [비용 게이팅] 자리(placeholder)만 구현한다.
 *
 * 목적: grounded llmValidation·SERP 호출이 단위경제를 깨지 않도록, 호출 직전
 * "이 호출을 허용할지" 판단을 한 곳에 모은다. 실제 판단 로직(쿼터·예산·캐시
 * 히트·플랜 티어)은 P1+에서 채운다. 지금은 인터페이스 + 항상-허용 더미.
 *
 * 발명 금지: 구체 정책(예산 한도·쿼터 수치)은 미결정이므로 [OPEN]으로 둔다.
 * 게이트 함수 인터페이스만 고정하여 호출부가 먼저 배선될 수 있게 한다.
 */

/** [비용 게이팅] 게이트가 보호하는 비용 발생 작업 종류. */
export type CostGatedOperation =
  | "llm_validation" // grounded LLM 인용 검증 (토큰 비용)
  | "serp_query" // SERP/검색 API 호출 (호출당 과금)
  | "ai_overview"; // 구글 AI Overview 조회 (조건부·비용)

/** [비용 게이팅] 게이트 판단에 필요한 컨텍스트. */
export interface CostGateContext {
  operation: CostGatedOperation;
  /** 진단/비즈니스 식별자 (쿼터·캐시 키 산정용). */
  diagnosisId?: string;
  businessId?: string;
  /** 플랜 티어 (티어별 한도 차등용). [OPEN] 한도 수치 미결정. */
  plan?: "free" | "basic" | "pro" | "business";
  /** 이번 호출의 예상 단위 수(토큰·쿼리 수 등). */
  estimatedUnits?: number;
}

/** [비용 게이팅] 게이트 판단 결과. */
export interface CostGateDecision {
  /** true면 호출 허용, false면 차단. */
  allowed: boolean;
  /** 차단/허용 사유 (로깅·UI 카피용, 민감정보 비포함). */
  reason: string;
  /** 차단 시 권장 폴백 (예: 캐시 사용·다음 진단 회차로 연기). */
  fallback?: "use_cache" | "defer" | "skip";
}

/**
 * [비용 게이팅] 비용 발생 작업 허용 여부를 판단하는 게이트 함수 시그니처.
 *
 * 어댑터/레지스트리 확장점(07 §6): 정책 구현을 이 시그니처 뒤에 두고,
 * 운영 정책이 바뀌면 구현만 교체한다(호출부 불변).
 */
export type CostGate = (ctx: CostGateContext) => Promise<CostGateDecision>;

/**
 * [비용 게이팅] 더미 게이트 — 항상 허용한다.
 *
 * ⚠️ 골격 단계 전용. P1+에서 실제 정책(예산·쿼터·캐시·플랜 티어)으로 교체한다.
 * [OPEN] 예산 한도·플랜별 쿼터·캐시 TTL 수치 미결정 (REQ-007 / OQ-2 연동).
 */
export const allowAllCostGate: CostGate = async (ctx) => {
  // [비용 게이팅] 자리만: 실제 비용 판단 없음. 항상 통과시키되 사유를 남긴다.
  return {
    allowed: true,
    reason: `[placeholder] cost gate not yet enforced for "${ctx.operation}"`,
  };
};

/**
 * [비용 게이팅] 전역 기본 게이트. 호출부는 이 export를 import해서 사용하고,
 * 정책이 확정되면 이 바인딩만 교체한다(레지스트리 단일 진입점).
 */
export const defaultCostGate: CostGate = allowAllCostGate;
