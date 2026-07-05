/**
 * X-SAG Core Engine v2 — LLM Provider 시스템 에러
 *
 * quota(429) / auth(401·403) 같은 에러는 **모든 후속 호출도 실패**시킨다.
 * 이를 빈 응답("")으로 삼키면 검증기 mentionRate 가 0 으로 계산되어 —
 * **"AI 가시성 0"(진짜 측정 결과)과 "API 실패"(측정 안 됨)가 구분되지 않는다.**
 *
 * 실증(2026-05-30): OpenAI 쿼터 소진(429) 시 108개 업체가 전부 mentionRate=0 으로
 * 기록되어 상관 데이터를 오염시킴. 검증기는 이 시스템 에러를 throw 해서 배치가
 * "실패"로 기록하게 한다(loud failure) — 데이터 정직성(HALLUCINATION_GUARD).
 */
export class LlmHttpError extends Error {
	readonly status: number;
	constructor(status: number, statusText: string) {
		super(`LLM HTTP ${status} ${statusText}`);
		this.name = "LlmHttpError";
		this.status = status;
	}
}

/**
 * quota/auth 처럼 모든 호출이 실패할 **시스템 에러**인지 판정.
 * 일시적 5xx 는 제외(부분 허용 — 한 질의 실패가 전체 배치를 멈추지 않음).
 */
export function isSystemicLlmStatus(status: number): boolean {
	return status === 429 || status === 401 || status === 403;
}
