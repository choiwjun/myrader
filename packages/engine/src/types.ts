/**
 * X-SAG Core Engine — Internal Types
 *
 * POLICY § 4.2 크롤링 제약 값을 DEFAULT_CRAWL_OPTIONS 에 반영.
 * ParsedPage 는 AnalyzedPage (contracts) 와 매핑 가능한 구조.
 */

import type { CrawlFailureReason } from "@boina/contracts/enums";
import type { DeviceId } from "./v2/js-render/devices.js";

// ---------------------------------------------------------------------------
// CrawlOptions — POLICY § 4.2
// ---------------------------------------------------------------------------

export interface CrawlOptions {
	/** User-Agent 헤더 (POLICY § 4.2) */
	userAgent: string;
	/** 도메인당 동시 요청 수 — POLICY § 4.2: 1 */
	perDomainConcurrency: number;
	/** 요청 간 최소 간격 ms — POLICY § 4.2: 1000 */
	requestIntervalMs: number;
	/** 페이지당 최대 응답 크기 bytes — POLICY § 4.2: 5MB */
	maxResponseBytes: number;
	/** 페이지당 응답 타임아웃 ms — POLICY § 4.2: 15000 */
	responseTimeoutMs: number;
	/**
	 * 사이트당 최대 분석 페이지 수.
	 *
	 * BACKLOG-G P3 (TASK-CORE-016, 2026-05-22): 10 → 50 으로 상향.
	 * 시간 예산 검증 (worst case):
	 *   50 페이지 × perDomainConcurrency=1 × requestIntervalMs=1000ms = 50s
	 *   여전히 totalTimeoutMs=60_000ms 예산 내. 응답 자체가 느리면 totalTimeoutMs 가
	 *   먼저 발동되어 partialResult=true 로 반환된다 (crawler.ts § 6).
	 *
	 * NOTE(POLICY § 4.2): POLICY 문서 원본은 10 으로 고정. 본 코드 상수는
	 * BACKLOG-G P3 결정에 따라 50 으로 선행 상향했으며, POLICY § 4.2 의
	 * 후속 업데이트가 필요하다 (BACKLOG-G § 3.2.2 의 plan별 차등 — Guest 10 /
	 * Free 20 / Pro 50 / Business 100 — 이 적용될 때 함께 정비).
	 */
	maxPagesPerSite: number;
	/** 진단당 총 타임아웃 ms — POLICY § 4.2: 60000 */
	totalTimeoutMs: number;
	/** JS 렌더링 토글 — 1차 MVP 기본 false */
	enableJsRendering: boolean;
	/** 모바일/태블릿/데스크탑 emulation 디바이스 — Phase O-C (default: "desktop-1280") */
	device?: DeviceId;
	/**
	 * sitemap.xml 우선 사용 여부 (BACKLOG-G P3, 기본 true).
	 * false 면 기존 BFS (메인 페이지 → internalLinks) 만 사용한다.
	 * sitemap 발견 실패 시에도 자동으로 BFS 로 폴백한다.
	 */
	useSitemap?: boolean;
}

export const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
	userAgent: "Mozilla/5.0 (compatible; X-SAG-Bot/1.0; +https://X-SAG.com/bot)",
	perDomainConcurrency: 1,
	requestIntervalMs: 1000,
	maxResponseBytes: 5 * 1024 * 1024, // 5MB
	responseTimeoutMs: 15_000,
	maxPagesPerSite: 50,
	totalTimeoutMs: 60_000,
	enableJsRendering: false,
	useSitemap: true,
};

// ---------------------------------------------------------------------------
// Plan tier 별 maxPagesPerSite (TASK-CORE-017, BACKLOG-G § 3.2.2)
// ---------------------------------------------------------------------------

/**
 * Plan tier 별 사이트당 분석 페이지 수.
 * - guest:    10 — 비로그인 / 게스트 진단
 * - free:     20 — 무료 회원
 * - basic:    30 — basic plan
 * - pro:      50 — pro plan (DEFAULT 와 일치)
 * - business: 100 — business plan (대형 사이트 대응)
 *
 * totalTimeoutMs=60s 예산 내 worst-case 검증:
 * - business 100 × requestIntervalMs=1000ms = 100s → 60s timeout 발동 시 partialResult=true
 * - business 사용자는 별도 totalTimeoutMs 상향 옵션 적용 가능 (운영 결정).
 */
export const MAX_PAGES_BY_PLAN: Record<
	"guest" | "free" | "basic" | "pro" | "business",
	number
> = {
	guest: 10,
	free: 20,
	basic: 30,
	pro: 50,
	business: 100,
};

/**
 * Plan tier 에 대응하는 maxPagesPerSite 반환.
 * 알 수 없는 plan / undefined → DEFAULT_CRAWL_OPTIONS.maxPagesPerSite 폴백.
 */
export function getMaxPagesForPlan(plan: string | null | undefined): number {
	if (!plan) return DEFAULT_CRAWL_OPTIONS.maxPagesPerSite;
	return (
		MAX_PAGES_BY_PLAN[plan as keyof typeof MAX_PAGES_BY_PLAN] ??
		DEFAULT_CRAWL_OPTIONS.maxPagesPerSite
	);
}

// ---------------------------------------------------------------------------
// ParsedPage — HTML 파싱 결과 (bodyText 는 호출자가 저장 X: POLICY § 4.4)
// ---------------------------------------------------------------------------

export interface ParsedPage {
	url: string;
	statusCode: number;
	title: string | null;
	description: string | null;
	h1: string | null;
	h2: string[];
	/** 모든 <meta> 태그 name/property → content 맵 */
	meta: Record<string, string>;
	/** visible body text (script/style 제외) — POLICY § 4.4: 저장 금지, 분석 후 폐기 */
	bodyText: string;
	/** 공백 기준 어절 수 (한국어 포함) */
	wordCount: number;
	internalLinks: string[];
	externalLinks: string[];
	/**
	 * <img> 요소들. src/alt 외에 (commit 512973d) loading/width/height 속성을 노출한다.
	 * - loading: <img loading="lazy"|"eager"> 원문 값 (속성 없으면 undefined)
	 * - width/height: <img width height> 속성 원문 문자열 (속성 없으면 undefined)
	 * 이 필드들은 SEO-IMG-LAZY-001(지연 로딩)/SEO-IMG-DIMENSIONS-001(CLS) 실측에 사용된다.
	 */
	images: {
		src: string;
		alt: string | null;
		loading?: string | undefined;
		width?: string | undefined;
		height?: string | undefined;
	}[];
	/** <script type="application/ld+json"> 파싱 결과 배열 */
	schemaJsonLd: unknown[];
	/** FAQPage schema 또는 FAQ 관련 H2/H3 텍스트가 발견된 경우 true */
	hasFAQ: boolean;
	/** schemaJsonLd 가 비어 있지 않으면 true */
	hasSchema: boolean;
	canonicalUrl: string | null;
	/** meta[name="robots"] content */
	robotsMeta: string | null;
	failureReason?: CrawlFailureReason | undefined;
	// -------------------------------------------------------------------------
	// Phase O-D 신규 — optional 필드 (기존 룰에 영향 없음, 신규 룰에서만 사용)
	// -------------------------------------------------------------------------
	/** H1~H6 전체 위계 구조 (SEO-HEADING-HIERARCHY-001 등) */
	headingStructure?: { level: number; text: string }[];
	/** 본문 내 구조화된 텍스트 블록 (문서 순서, block boundary 보존) */
	textBlocks?: { tag: string; text: string }[];
	/** <p> 단락 텍스트 (문서 순서, paragraph boundary 보존) */
	paragraphs?: string[];
	/** tel:/mailto: 연락처 링크 (HTTP 링크 배열과 분리) */
	contactLinks?: {
		kind: "tel" | "mailto";
		href: string;
		value: string;
		text: string;
	}[];
	/** HTTP Last-Modified 헤더 또는 og:updated_time / article:modified_time 값 */
	lastModified?: string | null;
	/** HTTP 프로토콜 버전 ("1.1" | "2" | "3"). 런타임 근거가 없으면 null. */
	httpProtocol?: "1.1" | "2" | "3" | null;
	/** HTTP 응답 리다이렉트 체인 길이 (직접 응답: 0, 1회 리다이렉트: 1...) */
	redirectChainLength?: number | null;
	/** Content-Language 응답 헤더 값 (예: "ko-KR") */
	contentLanguageHeader?: string | null;
	/** <html lang="..."> attribute value (for SEO/A11Y language checks) */
	htmlLang?: string | null;
	/** 본문에서 추출한 <ul>/<ol>/<table> 요소 개수 (AEO-LIST-AND-TABLE-001 등) */
	listTableCount?: { ul: number; ol: number; table: number };
	/** 본문 H3 텍스트 (AEO-HEADING-QUESTION-RATIO-001 등) */
	h3?: string[];
	/**
	 * <link> 요소 목록 (rel/href/hreflang).
	 * SEO-HREFLANG-001(rel="alternate" hreflang), SEO-PAGINATION-001(rel="prev"|"next") 실측용.
	 * 속성 없으면 null. rel 은 소문자 정규화.
	 */
	linkTags?: { rel: string | null; href: string | null; hreflang: string | null }[];
	/**
	 * TRANSIENT — raw HTML string. Used in-pipeline for a11y analysis only.
	 * NEVER persisted to DB (POLICY § 4.4/§ 8.4), NEVER passed to any AI/recommendation call.
	 * Same lifecycle as bodyText: discarded after analysis completes.
	 */
	rawHtml?: string;
}

// ---------------------------------------------------------------------------
// CrawlResult — crawlSite() 반환값
// ---------------------------------------------------------------------------

export interface CrawlResult {
	pages: ParsedPage[];
	/** totalTimeoutMs 초과 또는 일부 페이지 실패 시 true */
	partialResult: boolean;
	failureReason?: CrawlFailureReason | undefined;
	startedAt: string; // ISO 8601
	completedAt: string; // ISO 8601
	/**
	 * BACKLOG-G P3 — sitemap.xml 이 발견되어 URL 선정에 사용되었는지 여부.
	 * `useSitemap: false` 이거나 sitemap fetch/파싱이 실패하면 false.
	 */
	sitemapUsed?: boolean;
}

// ---------------------------------------------------------------------------
// Re-export CrawlFailureReason for internal convenience
// ---------------------------------------------------------------------------

export type { CrawlFailureReason };
