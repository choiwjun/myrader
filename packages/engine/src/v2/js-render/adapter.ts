/**
 * X-SAG Core Engine v2 — JsRenderAdapter Factory (TRD § 19.2.2)
 *
 * 환경변수 X_SAG_JS_RENDER 에 따라 적절한 어댑터를 선택한다:
 *  - "mock"       → MockJsRenderProvider (테스트/CI 명시 경로)
 *  - "playwright" → PlaywrightProvider
 *  - 미설정       → PlaywrightProvider (가용 시), 아니면 unavailable
 */

import { MockJsRenderProvider } from "./providers/mock.js";
import { PlaywrightProvider } from "./providers/playwright.js";
import { UnavailableJsRenderProvider } from "./providers/unavailable.js";
import type { JsRenderAdapter } from "./types.js";

/**
 * 현재 환경에 맞는 JsRenderAdapter 인스턴스를 생성한다.
 *
 * @example
 * const adapter = createJsRenderAdapter();
 * const result = await adapter.fetchRendered("https://example.com");
 */
export function createJsRenderAdapter(): JsRenderAdapter {
	const mode = process.env.X_SAG_JS_RENDER?.trim().toLowerCase();

	// 테스트/CI: 명시적으로 mock 요청한 경우에만 mock HTML을 사용한다.
	if (mode === "mock") {
		return new MockJsRenderProvider();
	}

	// Playwright 가용 여부 확인 후 사용
	const playwright = new PlaywrightProvider();
	if (mode === "playwright" || playwright.isAvailable()) {
		return playwright;
	}

	return new UnavailableJsRenderProvider();
}
