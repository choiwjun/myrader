/**
 * X-SAG Core Engine — AI Model Cost Table (REM-A5)
 *
 * @TASK REM-A5 - AI 비용 미터 강제 게이트
 * @SPEC docs/features/x-sag-diagnosis-engine/TRD.md#9.5
 *
 * 모델별 1k 토큰당 USD 단가 테이블.
 * providers/*.ts 에 분산된 비용 상수를 단일 진실 소스로 통합.
 */

export interface TokenCostEntry {
	/** USD per 1,000 input tokens */
	input: number;
	/** USD per 1,000 output tokens */
	output: number;
}

/**
 * 모델별 1k 토큰당 비용 (USD).
 * TRD § 7.6 단가 기준.
 */
export const COST_PER_1K_TOKENS_USD: Record<string, TokenCostEntry> = {
	"gpt-4o-mini": { input: 0.00015, output: 0.0006 },
	"gemini-2.5-flash": { input: 0.000075, output: 0.0003 },
	"claude-sonnet-4-6": { input: 0.003, output: 0.015 },
	// ChatMock / rule-based = $0 (로컬, 무료)
};

/**
 * 토큰 수로 예상 비용 계산 (USD).
 *
 * @param model - 모델명 (COST_PER_1K_TOKENS_USD 키)
 * @param tokensIn - 입력 토큰 수
 * @param tokensOut - 출력 토큰 수
 * @returns 예상 비용 USD. 알 수 없는 모델은 0 반환.
 */
export function estimateCostUsd(
	model: string,
	tokensIn: number,
	tokensOut: number,
): number {
	const entry = COST_PER_1K_TOKENS_USD[model];
	if (!entry) return 0;
	return (tokensIn / 1000) * entry.input + (tokensOut / 1000) * entry.output;
}
