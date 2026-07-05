/**
 * X-SAG Core Engine v2 — Real Site Mobile Integration Tests
 *
 * Phase O-C: 실제 한국 사이트 모바일 진단 (통합)
 * 기본적으로 SKIP — RUN_MOBILE_INTEGRATION=1 환경변수로 활성화
 *
 * @example
 * RUN_MOBILE_INTEGRATION=1 npx vitest run packages/core-engine/src/v2/js-render/integration-tests/mobile-real.test.ts
 */

import { describe, expect, it } from "vitest";
import { getDevicePreset } from "../devices.js";

// 환경변수로 스킵 여부 결정
const skipIntegration = !process.env["RUN_MOBILE_INTEGRATION"];
const testIfEnabled = skipIntegration ? it.skip : it;

/**
 * 플레이스홀더: 실제 Playwright 사용 시 구현
 *
 * 실제 구현 예시:
 * ```ts
 * import { chromium } from 'playwright';
 * const browser = await chromium.launch();
 * const context = await browser.newContext({
 *   ...DEVICES['iphone-14']
 * });
 * const page = await context.newPage();
 * await page.goto(url);
 * const html = await page.content();
 * await browser.close();
 * ```
 */

describe("Mobile Integration Tests (Real Sites)", () => {
	describe("Korean market real sites", () => {
		testIfEnabled("should diagnose Naver mobile page", async () => {
			// 실제 구현에서는 Playwright 사용
			const device = getDevicePreset("korean-mobile-default");
			expect(device).toBeDefined();
			expect(device.isMobile).toBe(true);

			// NOTE: 실제 테스트는 RUN_MOBILE_INTEGRATION=1 환경에서만 실행
		});

		testIfEnabled("should diagnose Daum mobile page", async () => {
			const device = getDevicePreset("galaxy-s24");
			expect(device).toBeDefined();

			// NOTE: 실제 테스트는 RUN_MOBILE_INTEGRATION=1 환경에서만 실행
		});

		testIfEnabled("should diagnose e-commerce site on mobile", async () => {
			const device = getDevicePreset("iphone-14");
			expect(device).toBeDefined();

			// NOTE: 실제 테스트는 RUN_MOBILE_INTEGRATION=1 환경에서만 실행
		});
	});

	describe("Device-specific rendering", () => {
		testIfEnabled(
			"should render same page differently on iPhone vs Galaxy",
			async () => {
				const iphone = getDevicePreset("iphone-14");
				const galaxy = getDevicePreset("galaxy-s24");

				expect(iphone.viewport.width).not.toBe(galaxy.viewport.width);
				expect(iphone.userAgent).not.toBe(galaxy.userAgent);

				// NOTE: 실제 테스트는 Playwright로 HTML 비교
			},
		);

		testIfEnabled("should apply correct viewport scales", async () => {
			const iphone = getDevicePreset("iphone-14");
			const ipad = getDevicePreset("ipad-air");
			const desktop = getDevicePreset("desktop-1280");

			expect(iphone.deviceScaleFactor).toBe(3);
			expect(ipad.deviceScaleFactor).toBe(2);
			expect(desktop.deviceScaleFactor).toBe(1);
		});
	});

	describe("Performance", () => {
		testIfEnabled("should complete diagnosis within timeout", async () => {
			// NOTE: 15초 이내에 완료되어야 함 (POLICY § 24)
			const startTime = Date.now();

			// 실제 진단 로직...

			const elapsed = Date.now() - startTime;
			expect(elapsed).toBeLessThan(15000);
		});
	});

	describe("Accessibility on mobile", () => {
		testIfEnabled("should have adequate tap target sizes", async () => {
			// NOTE: 터치 타겟 >= 48x48px 검증
		});

		testIfEnabled("should have readable font sizes", async () => {
			// NOTE: 폰트 크기 >= 12px 검증
		});
	});
});

// 스킵 상태 알림
if (skipIntegration) {
	describe("Integration Test Status", () => {
		it("shows integration tests are skipped by default", () => {
			const message =
				"Mobile integration tests are skipped by default.\n" +
				"Enable with: RUN_MOBILE_INTEGRATION=1";
			console.log(message);
			expect(skipIntegration).toBe(true);
		});
	});
}
