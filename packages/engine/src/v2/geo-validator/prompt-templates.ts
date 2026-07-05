/**
 * X-SAG Core Engine v2 — GEO Validator 질의 템플릿
 *
 * 매장 정보 → 표준 질의 5~10개 자동 생성.
 * 4개 facet:
 *   - brand-mention: 매장명 직접 검색
 *   - industry-region: 지역+업종 카테고리 추천
 *   - service-recommendation: 서비스/메뉴별 추천
 *   - comparative: 비교 분석
 */

import type { GeoQuery, GeoValidationInput } from "./types.js";

/** 입력값 정규화 — 공백 정리 */
function clean(value: string): string {
	return value.trim().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// 구조화 추출 (정직성 핵심) — grounded 응답에서 추천 업체를 결정적으로 받기
// ---------------------------------------------------------------------------

/**
 * 추천 업체 구조화 블록의 마커 라인.
 *
 * grounded 모델에게 이 마커 뒤에 번호 목록으로 추천 업체를 출력하도록 요청하고,
 * 파서(parseRecommendedBusinesses)는 이 마커 이후 번호목록 라인만 결정적으로 읽는다.
 * 마커가 없으면 파싱 실패로 보고 빈 배열을 반환한다(이름 생략 > 틀린 이름).
 */
export const RECOMMENDED_BUSINESSES_MARKER = "[추천업체]";

/**
 * grounded 질의에 덧붙이는 구조화 출력 지시문.
 *
 * 정직성 제약:
 *   - 답변은 평소대로 자연스럽게 하되, 마지막에 마커 + 번호목록을 **반드시** 덧붙이게 한다.
 *   - "검색 결과 실제로 확인된" 업체만, "지어내지 말 것"을 명시(환각 방지).
 *   - 확실치 않으면 빈 목록("없음")을 쓰게 한다 — 틀린 이름보다 생략을 선호.
 *   - 한 줄에 한 업체, 번호. 형식 → 결정적 파싱 가능.
 */
export const RECOMMENDED_BUSINESSES_PROMPT = [
	"",
	"",
	`답변 맨 끝에, 위 답변에서 실제로 추천한 업체/매장 이름만 아래 형식으로 정리해줘.`,
	`형식: 첫 줄에 정확히 "${RECOMMENDED_BUSINESSES_MARKER}" 만 쓰고, 다음 줄부터 한 줄에 하나씩 "1. 업체이름" 처럼 번호 목록으로.`,
	`규칙: 검색으로 실제 확인된 업체만 쓰고, 지어내지 마. 추천할 업체가 없으면 마커 다음 줄에 "1. 없음" 이라고만 써.`,
].join("\n");

/**
 * grounded 일 때 단일 질의문에 구조화 출력 지시를 덧붙인다.
 * grounded=false 면 원문 그대로 반환(학습기억 모드에서는 추천 근거를 만들지 않음).
 */
export function withStructuredExtraction(
	query: string,
	grounded: boolean,
): string {
	if (!grounded) return query;
	return `${query}${RECOMMENDED_BUSINESSES_PROMPT}`;
}

/**
 * 매장 정보로부터 기본 GEO 질의 세트를 생성한다.
 *
 * 생성 규칙:
 * - businessName 2건 (brand-mention)
 * - region+industry 2건 (industry-region)
 * - targetKeywords 상위 3건 (service-recommendation)
 * - comparative 1건
 * → 최소 5건, 최대 8건
 *
 * 빈/공백 입력은 안전하게 폴백 (질의 미생성).
 */
export function generateDefaultQueries(input: GeoValidationInput): GeoQuery[] {
	const businessName = clean(input.businessName);
	const industry = clean(input.industry);
	const region = clean(input.region);
	const keywords = (input.targetKeywords ?? [])
		.map(clean)
		.filter((k) => k.length > 0);

	const queries: GeoQuery[] = [];

	// ---- brand-mention ----
	if (businessName.length > 0) {
		queries.push({
			query: `${businessName}에 대해 알려줘`,
			facet: "brand-mention",
		});
		queries.push({
			query: `${businessName}는 어떤 곳인가요?`,
			facet: "brand-mention",
		});
	}

	// ---- industry-region ----
	if (region.length > 0 && industry.length > 0) {
		queries.push({
			query: `${region}에서 가장 인기있는 ${industry} 추천해줘`,
			facet: "industry-region",
		});
		queries.push({
			query: `${region} ${industry} 어디가 좋아?`,
			facet: "industry-region",
		});
	}

	// ---- service-recommendation ----
	for (const kw of keywords.slice(0, 3)) {
		if (region.length > 0) {
			queries.push({
				query: `${region}에서 ${kw} 잘하는 곳 추천해줘`,
				facet: "service-recommendation",
			});
		} else {
			queries.push({
				query: `${kw} 잘하는 곳 추천해줘`,
				facet: "service-recommendation",
			});
		}
	}

	// ---- comparative ----
	if (region.length > 0 && industry.length > 0) {
		queries.push({
			query: `${region} ${industry} 인기 매장 5개 비교해줘`,
			facet: "comparative",
		});
	}

	return queries;
}

/**
 * 단일 facet 의 질의만 생성 (드릴다운 검증용).
 */
export function generateQueriesByFacet(
	input: GeoValidationInput,
	facet: GeoQuery["facet"],
): GeoQuery[] {
	return generateDefaultQueries(input).filter((q) => q.facet === facet);
}
