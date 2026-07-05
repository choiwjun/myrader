/**
 * X-SAG Core Engine v2 — Mock JS Render Provider (테스트/폴백용)
 *
 * 실제 브라우저 없이 테스트 가능한 더미 구현.
 * X_SAG_JS_RENDER=mock 환경변수로 명시한 경우에만 사용한다.
 */

import type { JsRenderAdapter, RenderOptions, RenderResult } from "../types.js";

export class MockJsRenderProvider implements JsRenderAdapter {
	readonly name = "mock" as const;

	isAvailable(): boolean {
		return true;
	}

	async fetchRendered(
		url: string,
		_opts?: RenderOptions,
	): Promise<RenderResult> {
		return {
			html: `<html><body><h1>Mock for ${url}</h1><p>Rendered content</p></body></html>`,
			finalUrl: url,
			statusCode: 200,
			durationMs: 50,
			source: "mock",
			renderedAt: new Date().toISOString(),
		};
	}
}
