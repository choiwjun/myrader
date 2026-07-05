/**
 * X-SAG Core Engine v2 — GEO Validator 공통 분석 로직
 *
 * Provider 간 공유:
 *   - analyzeCitation: LLM 응답에서 매장명/URL/직접 인용/경쟁사 추출
 *   - parseRecommendedBusinesses: grounded 응답의 구조화 블록 결정적 파싱
 *   - computeMetrics: 인용 메트릭 집계
 *   - extractDomain: URL → 도메인 추출
 */

import {
	RECOMMENDED_BUSINESSES_MARKER,
	RECOMMENDED_BUSINESSES_PROMPT,
} from "./prompt-templates.js";
import type {
	GeoCitation,
	GeoCitationMetrics,
	GeoQuery,
	GeoValidationInput,
} from "./types.js";

export { RECOMMENDED_BUSINESSES_MARKER, RECOMMENDED_BUSINESSES_PROMPT };

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const MAX_RESPONSE_CHARS = 2000;
const MAX_COMPETITORS = 10;
/** 구조화 추출 업체명 길이 한계 (너무 길면 산문이 새어든 것 — 버림). */
const MAX_BUSINESS_NAME_CHARS = 40;
/** 구조화 추출 상한 — 한 응답당 추천 업체 수. */
const MAX_RECOMMENDED_BUSINESSES = 10;

/** 직접 인용 패턴 — 매장명 뒤에 한국어 조사/조사구가 붙는 형태 */
const KOREAN_PARTICLES = [
	"은",
	"는",
	"이",
	"가",
	"을",
	"를",
	"에서",
	"에",
	"의",
	"와",
	"과",
	"도",
	"로",
	"으로",
];

/** 한국어 매장명 패턴 (간단 휴리스틱) */
const COMPETITOR_KEYWORDS = [
	"카페",
	"식당",
	"매장",
	"가게",
	"음식점",
	"미용실",
	"헤어샵",
	"베이커리",
	"디저트",
	"레스토랑",
	"주점",
	"바",
	"펍",
	"샵",
];

// ---------------------------------------------------------------------------
// 도메인 추출
// ---------------------------------------------------------------------------

/**
 * URL 에서 도메인을 추출한다.
 * 잘못된 URL 이면 빈 문자열을 반환한다.
 */
export function extractDomain(url: string): string {
	if (!url || typeof url !== "string") return "";
	try {
		const parsed = new URL(url);
		return parsed.hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		// URL 생성 실패 시 — 패턴 매칭 폴백
		const m = url.match(/^(?:https?:\/\/)?(?:www\.)?([^/\s?#]+)/i);
		return m?.[1]?.toLowerCase() ?? "";
	}
}

// ---------------------------------------------------------------------------
// 인용 분석
// ---------------------------------------------------------------------------

/**
 * 정규식 메타문자 이스케이프.
 */
function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 응답 텍스트에서 매장명 + 직접 인용 패턴 검출.
 * 예: "테스트카페는...", "테스트카페에서는..."
 *
 * 한국어는 \b 단어경계가 동작하지 않으므로,
 * 조사 뒤에는 비-한글/영숫자(공백/구두점/한자 등) 또는 문자열 끝을 lookahead 로 검증한다.
 * 그리고 직접 인용의 모호함을 줄이기 위해 매장명 앞은 공백/구두점/문자열 시작이어야 한다
 * (다른 단어의 접미가 우연히 매장명과 일치하는 경우 제외).
 */
function detectDirectMention(response: string, businessName: string): boolean {
	if (!businessName) return false;
	const escaped = escapeRegex(businessName);
	// 가장 긴 조사부터 매칭 (예: "에서" 가 "에" 보다 먼저)
	const particles = [...KOREAN_PARTICLES]
		.sort((a, b) => b.length - a.length)
		.map(escapeRegex)
		.join("|");
	// 매장명 앞: 문자열 시작, 공백, 구두점, 따옴표 등
	// 매장명 뒤: 조사 + (공백/구두점/문장끝/한글 외)
	const pattern = new RegExp(
		`(?:^|[\\s.,!?;:'"\\[\\(\\-—])(?:${escaped})\\s*(?:${particles})(?=[\\s.,!?;:'"\\]\\)\\-—]|$|[가-힣A-Za-z])`,
		"i",
	);
	return pattern.test(response);
}

/**
 * 응답 텍스트에서 경쟁사로 추정되는 매장명 추출.
 * - 한글/영문 2~15자 + 공백 + 업종 키워드 ("카페", "식당" 등) 패턴
 * - 자기 매장은 제외
 * - 중복 제거 + 상한 10건
 */
function extractCompetitors(
	response: string,
	ownBusinessName: string,
): string[] {
	if (!response) return [];

	const ownLower = ownBusinessName.toLowerCase();
	const keywordsAlt = COMPETITOR_KEYWORDS.map(escapeRegex).join("|");
	// 한글, 영문 알파벳, 숫자 허용 (2~15자) — 매장명 + 공백? + 업종키워드
	const pattern = new RegExp(
		`([가-힣A-Za-z0-9]{2,15})\\s?(?:${keywordsAlt})`,
		"g",
	);

	const seen = new Set<string>();
	const result: string[] = [];

	for (const m of response.matchAll(pattern)) {
		const name = (m[1] ?? "").trim();
		if (!name) continue;
		if (name.toLowerCase() === ownLower) continue;
		if (seen.has(name)) continue;
		seen.add(name);
		result.push(name);
		if (result.length >= MAX_COMPETITORS) break;
	}

	return result;
}

/**
 * grounded 응답에서 추천 업체명을 **결정적으로** 추출한다 (정직성 핵심 경로).
 *
 * 입력 응답은 prompt-templates 의 RECOMMENDED_BUSINESSES_PROMPT 지시에 따라
 * 마커 라인(RECOMMENDED_BUSINESSES_MARKER) 뒤에 번호 목록으로 추천 업체를 출력했어야 한다.
 *   예)
 *     [추천업체]
 *     1. 스타벅스 강남점
 *     2. 투썸플레이스 역삼점
 *
 * 결정성 규칙 (LLM 창의성/정규식 휴리스틱 추가 금지):
 *   - 반드시 마커 라인 이후 줄만 본다. 마커가 없으면 빈 배열(파싱 실패 → 이름 생략).
 *   - 마커 다음의 "번호. 이름" 형식 라인만 채택한다. 일반 산문은 무시한다.
 *   - 자기 업체명과 동일(대소문자 무시)한 항목은 제외한다.
 *   - 모델이 빈 목록("없음"/"-"/빈줄)을 내면 빈 배열.
 *   - 너무 긴(>40자) 항목은 산문이 새어든 것으로 보고 버린다.
 *   - 중복 제거 + 상한 10건.
 *
 * 신뢰도가 낮으면(마커 없음·번호목록 없음) **이름을 버린다**. 빈 배열 < 틀린 이름.
 */
export function parseRecommendedBusinesses(
	response: string,
	ownBusinessName: string,
): string[] {
	if (!response || typeof response !== "string") return [];

	const markerIdx = response.indexOf(RECOMMENDED_BUSINESSES_MARKER);
	if (markerIdx === -1) return [];

	// 마커 라인 이후 텍스트만 본다.
	const afterMarker = response.slice(
		markerIdx + RECOMMENDED_BUSINESSES_MARKER.length,
	);

	const ownLower = ownBusinessName.trim().toLowerCase();
	const seen = new Set<string>();
	const result: string[] = [];

	// "1. 이름" / "1) 이름" / "1 - 이름" 형태의 번호 목록 라인만 결정적으로 매칭.
	const numbered = /^\s*\d{1,2}\s*[.)\-:]\s*(.+?)\s*$/;

	for (const rawLine of afterMarker.split(/\r?\n/)) {
		const m = rawLine.match(numbered);
		if (!m) {
			// 번호 목록이 끝나고 산문이 시작되면 멈춘다 (단, 빈 줄은 건너뜀).
			if (rawLine.trim().length === 0) continue;
			break;
		}
		let name = (m[1] ?? "").trim();
		// 흔한 후행 구두점/괄호 부가설명 제거 — 결정적(첫 구분자까지만).
		name = name.replace(/\s*[(（\-—:].*$/, "").trim();
		// 따옴표/별표(markdown bold) 제거.
		name = name.replace(/^["'*`]+|["'*`]+$/g, "").trim();
		if (!name) continue;
		if (name.length > MAX_BUSINESS_NAME_CHARS) continue;
		// 모델이 "없음" 류로 빈 목록을 표현한 경우 제외.
		if (/^(없음|없습니다|해당\s*없음|n\/?a|none|-)$/i.test(name)) continue;
		if (ownLower.length > 0 && name.toLowerCase() === ownLower) continue;
		if (seen.has(name)) continue;
		seen.add(name);
		result.push(name);
		if (result.length >= MAX_RECOMMENDED_BUSINESSES) break;
	}

	return result;
}

/**
 * 단일 LLM 응답을 GeoCitation 으로 분석한다.
 *
 * @param grounded 웹검색 그라운딩 활성 여부. true 일 때만 recommendedBusinesses 를
 *   결정적 구조화 추출로 채운다. false(학습기억 모드)면 항상 빈 배열 — 그라운딩 없는
 *   답변은 추천 근거가 아니므로 이름을 노출하지 않는다(정직성).
 */
export function analyzeCitation(
	query: GeoQuery,
	llmResponse: string,
	input: GeoValidationInput,
	now: Date = new Date(),
	grounded = false,
): GeoCitation {
	const response = typeof llmResponse === "string" ? llmResponse : "";
	const trimmedResponse = response.slice(0, MAX_RESPONSE_CHARS);

	const businessName = input.businessName ?? "";
	const lowerResponse = response.toLowerCase();
	const lowerName = businessName.toLowerCase();

	const domain = extractDomain(input.url);

	const hasMention =
		businessName.length > 0 && lowerResponse.includes(lowerName);
	const hasUrl = domain.length > 0 && lowerResponse.includes(domain);
	const isDirectMention = detectDirectMention(response, businessName);
	const mentionedCompetitors = extractCompetitors(response, businessName);
	// 정직성: grounded 일 때만 결정적 구조화 추출. 아니면 빈 배열.
	const recommendedBusinesses = grounded
		? parseRecommendedBusinesses(response, businessName)
		: [];

	return {
		query: query.query,
		facet: query.facet,
		llmResponse: trimmedResponse,
		hasMention,
		hasUrl,
		isDirectMention,
		mentionedCompetitors,
		recommendedBusinesses,
		measuredAt: now.toISOString(),
	};
}

// ---------------------------------------------------------------------------
// 메트릭 집계
// ---------------------------------------------------------------------------

/**
 * 인용 결과 목록에서 집계 메트릭을 계산한다.
 * 빈 배열이면 모두 0.
 */
export function computeMetrics(citations: GeoCitation[]): GeoCitationMetrics {
	if (citations.length === 0) {
		return {
			mentionRate: 0,
			urlRate: 0,
			directMentionRate: 0,
			competitorCount: 0,
		};
	}

	const n = citations.length;
	const mention = citations.filter((c) => c.hasMention).length;
	const url = citations.filter((c) => c.hasUrl).length;
	const direct = citations.filter((c) => c.isDirectMention).length;
	const competitorTotal = citations.reduce(
		(sum, c) => sum + c.mentionedCompetitors.length,
		0,
	);

	return {
		mentionRate: round(mention / n),
		urlRate: round(url / n),
		directMentionRate: round(direct / n),
		competitorCount: round(competitorTotal / n),
	};
}

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// 추천 경쟁사 집계 (정직성 경로 — recommendedBusinesses 만 사용)
// ---------------------------------------------------------------------------

/** 빈도 집계된 추천 경쟁사 1건. */
export interface RecommendedCompetitor {
	/** 결정적 구조화 추출로 얻은 업체명. */
	name: string;
	/** 이 업체가 추천으로 등장한 질의(citation) 수. 빈도순 정렬 기준. */
	mentionedInQueries: number;
	/** 대표 질의 예시 — 이 업체가 처음 등장한 질의문. */
	sampleQuery: string;
}

/**
 * citation 목록에서 `recommendedBusinesses`(결정적 구조화 추출 결과)만 모아
 * 업체별 등장 질의 수를 집계하고 빈도순으로 정렬한다.
 *
 * ⚠️ 정직성: `mentionedCompetitors`(정규식 휴리스틱)는 절대 집계에 쓰지 않는다.
 * 한 citation 안에서 같은 업체가 여러 번 나와도 질의 1건으로만 센다(de-dup per citation).
 * 같은 빈도면 처음 등장한 순서를 유지(결정적). 신뢰 항목이 없으면 빈 배열.
 *
 * @param limit 반환 상한 (기본 무제한). top N 추출 시 사용.
 */
export function aggregateRecommendedCompetitors(
	citations: Array<{ recommendedBusinesses: string[]; query: string }>,
	limit?: number,
): RecommendedCompetitor[] {
	// name → { count, sampleQuery, firstSeen } — 결정적 순서 유지를 위해 삽입 순서 기록.
	const acc = new Map<
		string,
		{ count: number; sampleQuery: string; order: number }
	>();
	let order = 0;

	for (const citation of citations) {
		const names = citation.recommendedBusinesses ?? [];
		// citation 내부 중복은 1건으로 — 같은 질의에서 동일 업체 중복 카운트 방지.
		const uniqueInCitation = new Set(names);
		for (const name of uniqueInCitation) {
			const trimmed = name.trim();
			if (!trimmed) continue;
			const existing = acc.get(trimmed);
			if (existing) {
				existing.count += 1;
			} else {
				acc.set(trimmed, {
					count: 1,
					sampleQuery: citation.query,
					order: order++,
				});
			}
		}
	}

	const sorted = [...acc.entries()]
		.map(([name, v]) => ({
			name,
			mentionedInQueries: v.count,
			sampleQuery: v.sampleQuery,
			order: v.order,
		}))
		// 빈도 desc, 동률은 삽입 순서 asc (결정적).
		.sort((a, b) => b.mentionedInQueries - a.mentionedInQueries || a.order - b.order)
		.map(({ order: _order, ...rest }) => rest);

	return typeof limit === "number" && limit >= 0
		? sorted.slice(0, limit)
		: sorted;
}
