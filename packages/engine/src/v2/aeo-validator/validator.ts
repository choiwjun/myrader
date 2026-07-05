/**
 * X-SAG Core Engine v2 — AEO Validator 공통 분석 로직
 *
 * Provider 간 공유:
 *   - analyzeAeoCitation: LLM 응답에서 비즈니스명/URL/프로미넌스/맥락 추출
 *   - computeAeoMetrics: AEO 메트릭 (appearanceRate / prominenceScore / citationRate) 집계
 *   - extractDomain: URL → 도메인 추출
 */

import type {
	AeoCitation,
	AeoMentionContext,
	AeoMetrics,
	AeoQuery,
	AeoValidationInput,
} from "./types.js";

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const MAX_RESPONSE_CHARS = 2000;

/** 부정적 맥락을 시사하는 키워드 (간단 휴리스틱) */
const NEGATIVE_KEYWORDS = [
	"비추",
	"비추천",
	"주의",
	"조심",
	"피해",
	"불만",
	"별로",
	"추천하지",
	"권하지 않",
];

/** "리스트" 형태로 언급되었는지 판정할 패턴 */
const LIST_MARKERS = ["1)", "2)", "1.", "2.", "①", "②", "- ", "* "];

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
// 위치 기반 프로미넌스
// ---------------------------------------------------------------------------

/**
 * 첫 언급 위치(charIndex)와 응답 길이로 프로미넌스 점수를 계산한다.
 *
 * 점수 규칙 (선형 감쇠):
 *   - index = 0           → 1.0 (응답 시작)
 *   - index = length/2    → 0.5 (응답 중간)
 *   - index = length      → 0.0 (응답 말미)
 *   - 미언급(-1)          → 0.0
 *
 * 길이 0(빈 응답)은 0 으로 처리.
 */
export function computeProminence(
	firstMentionIndex: number,
	responseLength: number,
): number {
	if (firstMentionIndex < 0) return 0;
	if (responseLength <= 0) return 0;
	// 인덱스가 길이 이상이면 잘못된 입력 — 0 으로 클램프
	const clamped = Math.min(firstMentionIndex, responseLength);
	const raw = 1 - clamped / responseLength;
	return round(raw);
}

// ---------------------------------------------------------------------------
// 맥락(컨텍스트) 판정
// ---------------------------------------------------------------------------

/**
 * 첫 언급 위치 주변 텍스트를 살펴 맥락을 분류한다.
 *
 * 우선순위:
 *   1. 미언급 → "none"
 *   2. 주변(±60자)에 부정 키워드 → "negative"
 *   3. 응답이 리스트 마커를 포함하며 매장명이 리스트 항목 안 → "in-list"
 *   4. 응답 전체에서 첫 번째 언급이 상위 25% 안 + 리스트가 아님 → "primary"
 *   5. 그 외 → "incidental"
 */
function detectContext(
	response: string,
	firstMentionIndex: number,
	businessName: string,
): AeoMentionContext {
	if (firstMentionIndex < 0 || !businessName) return "none";

	const len = response.length;
	if (len === 0) return "none";

	// 주변 텍스트 (±60자)
	const start = Math.max(0, firstMentionIndex - 60);
	const end = Math.min(len, firstMentionIndex + businessName.length + 60);
	const surrounding = response.slice(start, end).toLowerCase();

	// 부정 맥락 우선 — "추천하지 않" 같은 패턴은 강한 신호
	for (const neg of NEGATIVE_KEYWORDS) {
		if (surrounding.includes(neg.toLowerCase())) {
			return "negative";
		}
	}

	// 리스트 마커 존재 여부
	const hasListMarker = LIST_MARKERS.some((m) => response.includes(m));

	// primary: 상위 25% 안에 첫 언급 + 리스트 형태가 아닌 경우
	const isEarly = firstMentionIndex < len * 0.25;
	if (isEarly && !hasListMarker) {
		return "primary";
	}

	if (hasListMarker) {
		return "in-list";
	}

	return "incidental";
}

// ---------------------------------------------------------------------------
// 인용 분석
// ---------------------------------------------------------------------------

/**
 * 응답 텍스트에서 비즈니스명의 첫 등장 인덱스를 찾는다.
 * 대소문자 무시. 미발견은 -1.
 */
function findFirstMentionIndex(response: string, businessName: string): number {
	if (!businessName || !response) return -1;
	const lowerResponse = response.toLowerCase();
	const lowerName = businessName.toLowerCase();
	return lowerResponse.indexOf(lowerName);
}

/**
 * 단일 LLM 응답을 AeoCitation 으로 분석한다.
 *
 * - mentioned: businessName 이 응답에 포함되는가
 * - firstMentionIndex: 첫 언급 문자 인덱스 (없으면 -1)
 * - prominence: 위치 기반 점수 (0~1)
 * - urlCited: 응답에 URL/도메인이 명시되는가
 * - context: primary / in-list / incidental / negative / none
 */
export function analyzeAeoCitation(
	query: AeoQuery,
	llmResponse: string,
	input: AeoValidationInput,
	now: Date = new Date(),
): AeoCitation {
	const response = typeof llmResponse === "string" ? llmResponse : "";
	const trimmedResponse = response.slice(0, MAX_RESPONSE_CHARS);

	const businessName = input.businessName ?? "";
	const firstMentionIndex = findFirstMentionIndex(response, businessName);
	const mentioned = firstMentionIndex >= 0;

	const domain = extractDomain(input.url);
	const urlCited = domain.length > 0 && response.toLowerCase().includes(domain);

	const prominence = computeProminence(firstMentionIndex, response.length);
	const context = detectContext(response, firstMentionIndex, businessName);

	return {
		query: query.query,
		facet: query.facet,
		llmResponse: trimmedResponse,
		mentioned,
		firstMentionIndex,
		prominence,
		urlCited,
		context,
		measuredAt: now.toISOString(),
	};
}

// ---------------------------------------------------------------------------
// 메트릭 집계
// ---------------------------------------------------------------------------

/**
 * AEO 인용 결과 목록에서 집계 메트릭을 계산한다.
 * 빈 배열이면 모두 0.
 *
 * - appearanceRate: 언급된 질의 비율
 * - prominenceScore: 전체 평균 프로미넌스 (미언급도 0 으로 포함)
 * - citationRate: URL 인용된 질의 비율
 */
export function computeAeoMetrics(citations: AeoCitation[]): AeoMetrics {
	if (citations.length === 0) {
		return {
			appearanceRate: 0,
			prominenceScore: 0,
			citationRate: 0,
		};
	}

	const n = citations.length;
	const mentioned = citations.filter((c) => c.mentioned).length;
	const urls = citations.filter((c) => c.urlCited).length;
	const prominenceSum = citations.reduce((sum, c) => sum + c.prominence, 0);

	return {
		appearanceRate: round(mentioned / n),
		prominenceScore: round(prominenceSum / n),
		citationRate: round(urls / n),
	};
}

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}
