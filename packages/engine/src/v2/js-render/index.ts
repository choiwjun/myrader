/**
 * X-SAG Core Engine v2 — JS Render Adapter (barrel export)
 *
 * TRD § 19.2.2: JsRenderAdapter 인터페이스 및 구현체.
 */

export type { JsRenderAdapter, RenderOptions, RenderResult } from "./types.js";
export { createJsRenderAdapter } from "./adapter.js";
export { MockJsRenderProvider } from "./providers/mock.js";
export { PlaywrightProvider } from "./providers/playwright.js";
export { UnavailableJsRenderProvider } from "./providers/unavailable.js";
