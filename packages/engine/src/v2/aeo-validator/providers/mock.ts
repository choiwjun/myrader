/**
 * X-SAG Core Engine v2 — Mock AEO Validator Provider
 *
 * 테스트/오프라인 환경용 결정론적 AEO 검증기.
 * 입력 비즈니스명 + 질의 facet 조합으로 가짜 LLM 응답을 생성한다.
 *
 * 활용:
 *   - 단위 테스트 (네트워크 의존성 없이 결정론적 검증)
 *   - 프로미넌스/맥락 로직의 baseline 시뮬레이션
 */

import { generateDefaultAeoQueries } from "../prompt-templates.js";
import type {
	AeoCitation,
	AeoQuery,
	AeoValidationInput,
	AeoValidationResult,
	AeoValidator,
} from "../types.js";
import { analyzeAeoCitation, computeAeoMetrics } from "../validator.js";

/**
 * 결정론적 mock 응답 생성기.
 * facet 별로 비즈니스명 등장 패턴을 다르게 한다 (현실적 appearanceRate 분포).
 */
function makeMockAeoResponse(
	query: AeoQuery,
	input: AeoValidationInput,
): string {
	const { businessName, industry } = input;
	const name = businessName || "어떤브랜드";
	const services = input.mainServices ?? [];
	const firstService = services[0] ?? "서비스";

	switch (query.facet) {
		case "best-of":
			// 추천형 — 비즈니스명이 응답 초반 primary 위치에 등장
			return `${name}을(를) 추천드립니다. ${industry} 분야에서 평판이 좋고 ${firstService} 강점이 있습니다. 자세한 정보는 공식 사이트에서 확인하세요.`;

		case "how-to": {
			// 가이드형 — 응답 중간 즈음 in-list 로 등장
			return [
				`${industry}를 고를 때는 다음을 확인하세요:`,
				"1. 신뢰성 있는 평판",
				`2. ${firstService} 등 핵심 서비스 보유`,
				`3. ${name} 같은 검증된 곳을 우선 검토`,
				"4. 가격 투명성",
			].join("\n");
		}

		case "price":
			// 가격형 — 비즈니스명 미언급 (현실적: 가격 질의에선 브랜드 언급 적음)
			return `${industry}의 가격은 케이스마다 다르며 보통 시장가 기준으로 형성됩니다. 정확한 견적은 직접 문의가 필요합니다.`;

		case "service-howto":
			// 서비스 How-to — 비즈니스명 incidental 등장 (말미)
			return `해당 서비스는 전문 시설에서 받을 수 있습니다. 대표적으로 여러 ${industry}가 제공하며, ${name}도 그 중 하나입니다.`;

		case "what-is":
			// 정의형 — 비즈니스명 미언급
			return `${query.query.replace(/잘하는 곳$/, "")}는 ${industry} 분야의 주요 토픽 중 하나입니다.`;

		default:
			return `${name}에 대한 정보입니다.`;
	}
}

export class MockAeoValidator implements AeoValidator {
	readonly name = "mock" as const;

	isAvailable(): boolean {
		return true;
	}

	async validate(
		input: AeoValidationInput,
		queries?: AeoQuery[],
	): Promise<AeoValidationResult> {
		const qs = queries ?? generateDefaultAeoQueries(input);
		// 결정론적 baseTime — 시점 변동 없이 재현 가능
		const baseTime = new Date("2025-01-01T00:00:00.000Z");

		const citations: AeoCitation[] = qs.map((q) =>
			analyzeAeoCitation(q, makeMockAeoResponse(q, input), input, baseTime),
		);

		return {
			url: input.url,
			businessName: input.businessName,
			citations,
			metrics: computeAeoMetrics(citations),
			source: "mock",
			validatedAt: baseTime.toISOString(),
		};
	}
}
