/**
 * X-SAG Core Engine v2 — Playwright JS Render Provider (TRD § 19.2.2)
 *
 * Playwright(Chromium)로 JS를 실행한 뒤 최종 HTML을 반환한다.
 * POLICY § 24: 30s 타임아웃, 이미지/폰트/미디어 차단 권장.
 *
 * 주의: 이 모듈은 playwright 패키지가 설치된 환경에서만 동작한다.
 * isAvailable() 으로 사전 확인 필수.
 */

import { createRequire } from "node:module";
import type { JsRenderAdapter, RenderOptions, RenderResult } from "../types.js";

const resolveOptionalPeer = createRequire(import.meta.url);

// playwright 타입만 import (런타임 동적 로드로 분리)
type Browser = import("playwright").Browser;
type BrowserContext = import("playwright").BrowserContext;

export class PlaywrightProvider implements JsRenderAdapter {
	readonly name = "playwright" as const;
	private browser: Browser | null = null;

	isAvailable(): boolean {
		try {
			// ESM 환경에서도 optional peer dependency 를 동기 확인한다.
			resolveOptionalPeer.resolve("playwright");
			return true;
		} catch {
			return false;
		}
	}

	private async getBrowser(): Promise<Browser> {
		if (!this.browser) {
			// 동적 import — playwright 없는 환경에서 모듈 자체가 오류 나지 않도록
			const { chromium } = await import("playwright");
			this.browser = await chromium.launch({
				headless: true,
				args: ["--no-sandbox", "--disable-setuid-sandbox"],
			});
		}
		return this.browser;
	}

	async fetchRendered(
		url: string,
		opts: RenderOptions = {},
	): Promise<RenderResult> {
		const startedAt = Date.now();
		const browser = await this.getBrowser();

		const context: BrowserContext = await browser.newContext({
			userAgent: opts.userAgent ?? "Mozilla/5.0 (compatible; X-SAG-Bot/2.0)",
			viewport: opts.viewport ?? { width: 1280, height: 720 },
		});

		// 리소스 차단 (성능 최적화)
		if (opts.blockResources && opts.blockResources.length > 0) {
			const blocked = opts.blockResources;
			await context.route("**/*", (route) => {
				const type = route.request().resourceType();
				if (
					blocked.includes(type as "image" | "font" | "stylesheet" | "media")
				) {
					route.abort();
				} else {
					route.continue();
				}
			});
		}

		const page = await context.newPage();

		try {
			const response = await page.goto(url, {
				waitUntil: opts.waitForLoadState ?? "networkidle",
				timeout: opts.timeoutMs ?? 30_000,
			});

			if (opts.waitForSelector) {
				await page.waitForSelector(opts.waitForSelector, { timeout: 10_000 });
			}

			const html = await page.content();
			const finalUrl = page.url();
			const statusCode = response?.status() ?? 0;

			return {
				html,
				finalUrl,
				statusCode,
				durationMs: Date.now() - startedAt,
				source: "playwright",
				renderedAt: new Date().toISOString(),
			};
		} finally {
			await page.close();
			await context.close();
		}
	}

	/** 브라우저 인스턴스를 명시적으로 닫는다 (리소스 해제). */
	async close(): Promise<void> {
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
		}
	}
}
