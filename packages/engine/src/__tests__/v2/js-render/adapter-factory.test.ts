/**
 * createJsRenderAdapter() 팩토리 단위 테스트
 *
 * 환경변수 X_SAG_JS_RENDER에 따른 분기를 검증한다.
 */

import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJsRenderAdapter } from "../../../v2/js-render/adapter.js";
import { MockJsRenderProvider } from "../../../v2/js-render/providers/mock.js";
import { PlaywrightProvider } from "../../../v2/js-render/providers/playwright.js";
import { UnavailableJsRenderProvider } from "../../../v2/js-render/providers/unavailable.js";

const resolveOptionalPeer = createRequire(import.meta.url);

function canResolvePlaywright(): boolean {
	try {
		resolveOptionalPeer.resolve("playwright");
		return true;
	} catch {
		return false;
	}
}

describe("createJsRenderAdapter", () => {
	const originalEnv = process.env["X_SAG_JS_RENDER"];

	afterEach(() => {
		vi.restoreAllMocks();
		// 환경변수 원복
		if (originalEnv === undefined) {
			delete process.env["X_SAG_JS_RENDER"];
		} else {
			process.env["X_SAG_JS_RENDER"] = originalEnv;
		}
	});

	it("X_SAG_JS_RENDER=mock 이면 MockJsRenderProvider를 반환해야 한다", () => {
		process.env["X_SAG_JS_RENDER"] = "mock";
		const adapter = createJsRenderAdapter();
		expect(adapter).toBeInstanceOf(MockJsRenderProvider);
		expect(adapter.name).toBe("mock");
	});

	it("반환된 어댑터는 JsRenderAdapter 인터페이스를 충족해야 한다", () => {
		process.env["X_SAG_JS_RENDER"] = "mock";
		const adapter = createJsRenderAdapter();

		expect(typeof adapter.name).toBe("string");
		expect(typeof adapter.fetchRendered).toBe("function");
		expect(typeof adapter.isAvailable).toBe("function");
	});

	it("mock 어댑터는 fetchRendered()로 RenderResult를 반환해야 한다", async () => {
		process.env["X_SAG_JS_RENDER"] = "mock";
		const adapter = createJsRenderAdapter();
		const result = await adapter.fetchRendered("https://example.com");

		expect(result).toMatchObject({
			finalUrl: "https://example.com",
			statusCode: 200,
			source: "mock",
		});
		expect(typeof result.html).toBe("string");
		expect(typeof result.durationMs).toBe("number");
		expect(typeof result.renderedAt).toBe("string");
	});

	it("mock 어댑터는 isAvailable()이 true를 반환해야 한다", () => {
		process.env["X_SAG_JS_RENDER"] = "mock";
		const adapter = createJsRenderAdapter();
		expect(adapter.isAvailable()).toBe(true);
	});

	it("환경변수 미설정 시 Playwright 가 있으면 Playwright, 없으면 unavailable을 반환해야 한다", () => {
		delete process.env["X_SAG_JS_RENDER"];
		const adapter = createJsRenderAdapter();
		if (canResolvePlaywright()) {
			expect(adapter).toBeInstanceOf(PlaywrightProvider);
			expect(adapter.name).toBe("playwright");
		} else {
			expect(adapter).toBeInstanceOf(UnavailableJsRenderProvider);
			expect(adapter.name).toBe("unavailable");
			expect(adapter.isAvailable()).toBe(false);
		}
		expect(typeof adapter.fetchRendered).toBe("function");
	});

	it("환경변수 미설정 시 Playwright 미가용이면 mock 대신 unavailable을 반환해야 한다", () => {
		delete process.env["X_SAG_JS_RENDER"];
		vi.spyOn(PlaywrightProvider.prototype, "isAvailable").mockReturnValue(
			false,
		);

		const adapter = createJsRenderAdapter();

		expect(adapter).toBeInstanceOf(UnavailableJsRenderProvider);
		expect(adapter.name).toBe("unavailable");
		expect(adapter.isAvailable()).toBe(false);
	});

	it("X_SAG_JS_RENDER=playwright 이면 availability는 PlaywrightProvider가 직접 보고한다", () => {
		process.env["X_SAG_JS_RENDER"] = "playwright";
		vi.spyOn(PlaywrightProvider.prototype, "isAvailable").mockReturnValue(
			false,
		);

		const adapter = createJsRenderAdapter();

		expect(adapter).toBeInstanceOf(PlaywrightProvider);
		expect(adapter.name).toBe("playwright");
		expect(adapter.isAvailable()).toBe(false);
	});
});
