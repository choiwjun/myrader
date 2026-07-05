/**
 * X-SAG Core Engine — SERP 타입 정의
 *
 * TRD § 19.2.1 SerpAdapter 인터페이스.
 * POLICY § 22: SERP 데이터 수집 규칙
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type SerpDevice = "mobile" | "desktop";
export type SerpSource = "serpapi" | "naver" | "mock";

// ---------------------------------------------------------------------------
// SerpQuery
// ---------------------------------------------------------------------------

export interface SerpQuery {
	/** 검색 키워드 */
	keyword: string;
	/** 지역 (예: "서울 강남구") */
	region?: string;
	/** 디바이스 종류. 기본값 "mobile" */
	device?: SerpDevice;
	/** 검색 언어. 기본값 "ko" */
	language?: string;
	/** 반환할 결과 수. 기본값 10 */
	limit?: number;
}

// ---------------------------------------------------------------------------
// PopularitySignals
// ---------------------------------------------------------------------------

export interface PopularitySignals {
	/** SERP 순위 (1-based) */
	rank: number;
	/** 도메인 권위 점수 (0-100, 선택적) */
	domainAuthority?: number;
	/** 리뷰 수 (선택적) */
	reviewCount?: number;
	/** 키워드 결과 내 언급 횟수 (선택적, 집계 시 사용) */
	mentions?: number;
}

// ---------------------------------------------------------------------------
// SerpCompetitor
// ---------------------------------------------------------------------------

export interface SerpCompetitor {
	/** SERP 순위 (1-based) */
	rank: number;
	/** 비즈니스 이름 */
	name: string;
	/** 웹사이트 URL */
	url: string;
	/** 검색 결과 스니펫 (선택적) */
	snippet?: string;
	/** 인기 신호 */
	signals: PopularitySignals;
}

// ---------------------------------------------------------------------------
// SerpResult
// ---------------------------------------------------------------------------

export interface SerpResult {
	/** 자기 매장 SERP 순위 (null = 상위 결과에 없음) */
	rank: number | null;
	/** 경쟁사 목록 */
	competitors: SerpCompetitor[];
	/** 데이터 소스 */
	source: SerpSource;
	/** 캐시 저장 시각 (ISO 8601) */
	cachedAt: string;
	/** 캐시 만료 시각 (ISO 8601) */
	expiresAt: string;
}

// ---------------------------------------------------------------------------
// SerpAdapter
// ---------------------------------------------------------------------------

export interface SerpAdapter {
	/** 어댑터 식별자 */
	readonly name: string;
	/**
	 * SERP 검색 실행.
	 * @param query 검색 쿼리
	 * @param selfDomain 자기 매장 도메인 (순위 계산용, 선택적)
	 */
	search(query: SerpQuery, selfDomain?: string): Promise<SerpResult>;
	/** 어댑터가 현재 환경에서 사용 가능한지 확인 */
	isAvailable(): boolean;
}
