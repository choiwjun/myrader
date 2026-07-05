/**
 * X-SAG Core Engine v2 — Mock GEO Validator Provider
 *
 * 테스트/오프라인 환경용 결정론적 GEO 검증기.
 * 입력 매장명 + 질의 facet 조합으로 가짜 LLM 응답을 생성한다.
 *
 * 활용:
 *   - 단위 테스트 (의존성 없이 결정론적 검증)
 *   - 룰 효과성 추정의 baseline (LLM 호출 비용 없이 시뮬레이션)
 */

import { generateDefaultQueries } from "../prompt-templates.js";
import type {
	GeoCitation,
	GeoQuery,
	GeoValidationInput,
	GeoValidationResult,
	GeoValidator,
} from "../types.js";
import { analyzeCitation, computeMetrics } from "../validator.js";

/**
 * 결정론적 mock 응답 생성기.
 * facet 별로 매장명을 포함시키는 비율을 다르게 한다 (현실적 mentionRate 분포).
 */
function makeMockResponse(query: GeoQuery, input: GeoValidationInput): string {
	const { businessName, industry, region } = input;
	const name = businessName || "어떤매장";

	switch (query.facet) {
		case "brand-mention":
			// 매장명 직접 검색은 거의 항상 매장명을 언급 (높은 인용률)
			return `${name}은 ${region}에 위치한 ${industry}입니다. 추천 메뉴와 분위기가 좋아 손님들에게 인기가 많습니다.`;

		case "industry-region":
			// 카테고리 추천 — 자기 매장은 종종 포함, 경쟁사도 같이 노출
			return `${region}의 인기 ${industry}로는 스타벅스 카페, 투썸 카페, 메가커피 매장 등이 있습니다. 각각 분위기와 가격대가 다르니 취향에 맞게 선택하세요.`;

		case "service-recommendation":
			// 서비스 추천 — 자기 매장 언급은 낮은 비율
			return "해당 서비스를 잘하는 곳으로는 여러 매장이 있습니다. 블루보틀 카페, 폴바셋 카페 등이 유명합니다.";

		case "comparative":
			// 비교 — 다수 경쟁사 노출
			return `${region} ${industry} 비교: 1) 스타벅스 카페 - 프리미엄, 2) 투썸 카페 - 디저트 강점, 3) 메가커피 매장 - 가성비, 4) ${name} - 지역 특화, 5) 이디야 카페 - 합리적.`;

		default:
			return `${name}에 대한 정보입니다.`;
	}
}

export class MockGeoValidator implements GeoValidator {
	readonly name = "mock" as const;

	isAvailable(): boolean {
		return true;
	}

	async validate(
		input: GeoValidationInput,
		queries?: GeoQuery[],
	): Promise<GeoValidationResult> {
		const qs = queries ?? generateDefaultQueries(input);
		// 결정론적 baseTime — 시점 변동 없이 재현 가능
		const baseTime = new Date("2025-01-01T00:00:00.000Z");

		const citations: GeoCitation[] = qs.map((q) =>
			analyzeCitation(q, makeMockResponse(q, input), input, baseTime),
		);

		return {
			url: input.url,
			businessName: input.businessName,
			citations,
			metrics: computeMetrics(citations),
			source: "mock",
			validatedAt: baseTime.toISOString(),
		};
	}
}
