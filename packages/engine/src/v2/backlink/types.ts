/**
 * X-SAG Core Engine — Backlink Adapter Types
 *
 * Phase R-D: 백링크/도메인 권위 어댑터 (휴리스틱 + 외부 API 스텁).
 *
 * 목적:
 * - 도메인 권위(DA/DR), 백링크 수, 참조 도메인 추정.
 * - 휴리스틱 estimator(API 없이) + Ahrefs/Moz 어댑터(스텁) 체인.
 *
 * BacklinkResult 는 RuleContext.backlinkResult 로 주입되어
 * backlink-rules 8개에서 사용된다.
 *
 * POLICY § 7.1: 규칙 평가는 결정적. 휴리스틱 결과의 confidence 가 낮으면
 * 룰은 informational 로 처리한다.
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface BacklinkInput {
	/** 분석 대상 URL */
	url: string;
	/** 도메인 (예: "example.co.kr") */
	domain: string;
}

// ---------------------------------------------------------------------------
// Signals — ParsedPage 로부터 추출 가능한 휴리스틱 시그널
// ---------------------------------------------------------------------------

export interface BacklinkSignals {
	/** HTTPS 강제 (http → https 리다이렉트 또는 origin이 https) */
	httpsEnforced: boolean;
	/** HSTS 헤더 존재 */
	hsts: boolean;
	/** sitemap.xml 존재 */
	sitemapPresent: boolean;
	/** robots.txt 존재 */
	robotsTxtPresent: boolean;
	/** JSON-LD structured data 개수 */
	structuredDataCount: number;
	/** og:*, twitter:* 등 소셜 메타 태그 개수 */
	socialMetaCount: number;
	/** canonical 일관성 (모든 페이지 canonical 이 동일 도메인) */
	canonicalConsistency: boolean;
	/** content_length 점수 (0-100) — 본문 길이 휴리스틱 */
	contentLengthScore: number;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type BacklinkSource = "ahrefs" | "moz" | "heuristic" | "mock";

export interface BacklinkResult {
	/** 도메인 (예: "example.co.kr") */
	domain: string;
	/** 추정 도메인 권위 (0-100). DR(Ahrefs) 또는 DA(Moz). */
	domainAuthority: number;
	/** 추정 백링크 수 */
	estimatedBacklinks: number;
	/** 추정 참조 도메인 수 */
	estimatedReferringDomains: number;
	/** 신뢰도 (0~1). 휴리스틱 ≈ 0.3, Moz/Ahrefs ≈ 0.9+ */
	confidence: number;
	/** 출처 */
	source: BacklinkSource;
	/** 휴리스틱 시그널 (인용·디버깅 용도) */
	signals: BacklinkSignals;
	/** ISO 8601 측정 시각 */
	measuredAt: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface BacklinkAdapter {
	/** 어댑터 이름 */
	readonly name: BacklinkSource;
	/** 어댑터가 현재 환경에서 사용 가능한지 (API 키 등) */
	isAvailable(): boolean;
	/** 백링크 데이터 조회 */
	analyze(input: BacklinkInput): Promise<BacklinkResult>;
}
