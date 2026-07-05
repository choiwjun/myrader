/**
 * X-SAG Core Engine v2 — AEO Validator 질의 템플릿
 *
 * 비즈니스 정보 → 표준 AEO 질의 5~10개 자동 생성.
 *
 * GEO 와 달리 "지역" 기반이 아니라 "정보/지식" 질의를 생성한다:
 *   - how-to: "{industry} 어떻게 골라야 하나요?"
 *   - what-is: "{keyword} 가 뭔가요?"
 *   - best-of: "{industry} 추천 좀 해주세요"
 *   - price: "{industry} 가격 알려주세요"
 *   - service-howto: "{service} 어디서 받을 수 있나요?"
 */

import type { AeoQuery, AeoValidationInput } from "./types.js";

/** 입력값 정규화 — 공백 정리 */
function clean(value: string): string {
	return value.trim().replace(/\s+/g, " ");
}

/**
 * 비즈니스 정보로부터 기본 AEO 질의 세트를 생성한다.
 *
 * 생성 규칙 (최소 5건, 최대 10건):
 * - best-of  : industry 기반 1건
 * - how-to   : industry 기반 1건
 * - price    : industry 기반 1건
 * - service-howto : mainServices 상위 3건
 * - what-is  : targetKeywords 상위 3건
 *
 * 빈/공백 입력은 안전하게 폴백 (질의 미생성).
 */
export function generateDefaultAeoQueries(
	input: AeoValidationInput,
): AeoQuery[] {
	const industry = clean(input.industry);
	const services = (input.mainServices ?? [])
		.map(clean)
		.filter((s) => s.length > 0);
	const keywords = (input.targetKeywords ?? [])
		.map(clean)
		.filter((k) => k.length > 0);

	const queries: AeoQuery[] = [];

	// ---- best-of (1건) ----
	if (industry.length > 0) {
		queries.push({
			query: `${industry} 추천 좀 해주세요`,
			facet: "best-of",
		});
	}

	// ---- how-to (1건) — 업종 선택 가이드 ----
	if (industry.length > 0) {
		queries.push({
			query: `${industry} 어떻게 골라야 하나요?`,
			facet: "how-to",
		});
	}

	// ---- price (1건) ----
	if (industry.length > 0) {
		queries.push({
			query: `${industry} 가격 알려주세요`,
			facet: "price",
		});
	}

	// ---- service-howto (서비스별, 상위 3건) ----
	for (const svc of services.slice(0, 3)) {
		queries.push({
			query: `${svc} 어디서 받을 수 있나요?`,
			facet: "service-howto",
		});
	}

	// ---- what-is (키워드별, 상위 3건) ----
	for (const kw of keywords.slice(0, 3)) {
		queries.push({
			query: `${kw} 잘하는 곳`,
			facet: "what-is",
		});
	}

	// 안전 가드 — 최대 10개 컷
	return queries.slice(0, 10);
}

/**
 * 단일 facet 의 질의만 생성 (드릴다운 검증용).
 */
export function generateAeoQueriesByFacet(
	input: AeoValidationInput,
	facet: AeoQuery["facet"],
): AeoQuery[] {
	return generateDefaultAeoQueries(input).filter((q) => q.facet === facet);
}
