/**
 * X-SAG Core Engine — Lighthouse / Performance 타입 정의
 *
 * TRD § 19.2.3 LighthouseAdapter 인터페이스.
 * POLICY § 24.4: PERF 가중치 15%
 * POLICY § 24.5: Lighthouse 캐시 1시간
 */

// ---------------------------------------------------------------------------
// LighthouseOptions
// ---------------------------------------------------------------------------

export interface LighthouseOptions {
	/** 측정 전략. 기본값 "mobile" */
	strategy?: "mobile" | "desktop";
	/** 측정할 카테고리 목록 */
	category?: ("performance" | "accessibility" | "best-practices" | "seo")[];
	/** 결과 언어. 기본값 "ko" */
	locale?: string;
	/**
	 * 단일 측정 요청 타임아웃 (ms). 미지정 시 provider 기본값 사용.
	 * 무거운 사이트(예: 대형 포털)는 PSI Lighthouse 실행이 30s 를 넘길 수 있어
	 * 기본값을 60s 로 두고, 필요 시 호출자가 상향/하향할 수 있게 한다.
	 */
	timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// LighthouseResult
// ---------------------------------------------------------------------------

export interface LighthouseResult {
	/** 측정 대상 URL */
	url: string;
	/** 측정 전략 */
	strategy: "mobile" | "desktop";
	/** Lighthouse Performance 점수 (0-100) */
	performance: number;
	/** Largest Contentful Paint (ms) */
	lcp: number;
	/** First Input Delay (ms) — Lighthouse에서는 TBT/max-potential-fid */
	fid: number;
	/** Cumulative Layout Shift (소수점 2자리) */
	cls: number;
	/** Interaction to Next Paint (ms, optional) */
	inp?: number;
	/** Time to First Byte (ms) */
	ttfb: number;
	/** First Contentful Paint (ms) */
	fcp: number;
	/** 실제 측정 시각 (ISO 8601) */
	measuredAt: string;
	/** 캐시 저장 시각 (ISO 8601) */
	cachedAt: string;
	/** 데이터 출처 */
	source: "psi" | "mock";
}

// ---------------------------------------------------------------------------
// LighthouseAdapter
// ---------------------------------------------------------------------------

export interface LighthouseAdapter {
	/** 어댑터 식별자 */
	readonly name: string;
	/** URL을 측정하고 LighthouseResult를 반환 */
	measure(url: string, opts?: LighthouseOptions): Promise<LighthouseResult>;
	/** 어댑터가 현재 환경에서 사용 가능한지 확인 */
	isAvailable(): boolean;
}
