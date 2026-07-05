/**
 * X-SAG Core Engine v2 — JS Render Adapter Types (TRD § 19.2.2)
 *
 * POLICY § 24 (Engine v2): JS 렌더링 옵션 (Pro+) — 30s 타임아웃, 폴백 정적 분석
 */

// ---------------------------------------------------------------------------
// RenderOptions
// ---------------------------------------------------------------------------

export interface RenderOptions {
	/** 이 셀렉터가 나타날 때까지 대기 */
	waitForSelector?: string;
	/** 페이지 로드 완료 조건 (default: "networkidle") */
	waitForLoadState?: "load" | "domcontentloaded" | "networkidle";
	/** 타임아웃 ms (default: 30000) — POLICY § 24 */
	timeoutMs?: number;
	/** User-Agent 헤더 */
	userAgent?: string;
	/** 뷰포트 크기 */
	viewport?: { width: number; height: number };
	/** 차단할 리소스 타입 (성능 최적화) */
	blockResources?: ("image" | "font" | "stylesheet" | "media")[];
}

// ---------------------------------------------------------------------------
// RenderResult
// ---------------------------------------------------------------------------

export interface RenderResult {
	/** 렌더링 후 최종 HTML */
	html: string;
	/** 리다이렉트 후 최종 URL */
	finalUrl: string;
	/** HTTP 상태 코드 */
	statusCode: number;
	/** 렌더링 소요 시간 ms */
	durationMs: number;
	/** 결과를 생성한 프로바이더 */
	source: "playwright" | "mock";
	/** 렌더링 완료 시각 (ISO 8601) */
	renderedAt: string;
}

// ---------------------------------------------------------------------------
// JsRenderAdapter
// ---------------------------------------------------------------------------

export interface JsRenderAdapter {
	/** 어댑터 식별 이름 */
	readonly name: string;
	/** 렌더링된 HTML 가져오기 */
	fetchRendered(url: string, opts?: RenderOptions): Promise<RenderResult>;
	/** 이 어댑터가 현재 환경에서 사용 가능한지 여부 */
	isAvailable(): boolean;
}
