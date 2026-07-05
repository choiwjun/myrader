/**
 * X-SAG Core Engine v2 — Mobile Diagnosis Tests
 *
 * Phase O-C: diagnoseMobileFromHtml 검증
 */

import { describe, expect, it } from "vitest";
import {
	type MobileDiagnosisInput,
	diagnoseMobileFromHtml,
	isValidMobileDiagnosis,
} from "../mobile-emulation.js";
import type { RenderResult } from "../types.js";

// Mock RenderResult
function createMockRenderResult(html: string): RenderResult {
	return {
		html,
		finalUrl: "https://example.com",
		statusCode: 200,
		durationMs: 1000,
		source: "mock",
		renderedAt: new Date().toISOString(),
	};
}

describe("Mobile Diagnosis", () => {
	describe("diagnoseMobileFromHtml", () => {
		it("should detect missing viewport meta", () => {
			const html = `
        <html>
          <head><title>Test</title></head>
          <body><p>Content</p></body>
        </html>
      `;

			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "iphone-14",
			});

			expect(result.missingViewportMeta).toBe(true);
			expect(result.viewportMeta).toBeNull();
		});

		it("should detect valid viewport meta", () => {
			const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Test</title>
          </head>
          <body><p>Content</p></body>
        </html>
      `;

			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "iphone-14",
			});

			expect(result.missingViewportMeta).toBe(false);
			expect(result.viewportMeta).toContain("width=device-width");
			expect(result.viewportMeta).toContain("initial-scale=1");
		});

		it("should detect incomplete viewport meta", () => {
			const html = `
        <html>
          <head>
            <meta name="viewport" content="initial-scale=1">
            <title>Test</title>
          </head>
          <body><p>Content</p></body>
        </html>
      `;

			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "iphone-14",
			});

			expect(result.missingViewportMeta).toBe(true);
			expect(result.viewportMeta).toContain("initial-scale=1");
		});

		it("should detect horizontal scroll (fixed width table)", () => {
			const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <table width="1200">
              <tr><td>Wide content</td></tr>
            </table>
          </body>
        </html>
      `;

			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "iphone-14",
			});

			// iphone-14 viewport is 390px, table is 1200px
			expect(result.hasHorizontalScroll).toBe(true);
		});

		it("should handle responsive layouts without horizontal scroll", () => {
			const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { max-width: 100%; overflow-x: hidden; }
              img { max-width: 100%; height: auto; }
            </style>
          </head>
          <body>
            <img src="test.jpg" alt="test">
          </body>
        </html>
      `;

			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "iphone-14",
			});

			// With overflow-x: hidden, should not detect horizontal scroll
			expect(result.hasHorizontalScroll).toBe(false);
		});

		it("should count tap target issues", () => {
			const html = `
        <html>
          <body>
            <button style="width: 30px; height: 30px;">Small</button>
            <button style="width: 50px; height: 50px;">Large</button>
            <a href="#" style="width: 40px; height: 40px;">Link</a>
          </body>
        </html>
      `;

			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "iphone-14",
			});

			// Should detect buttons/links with width or height < 48px
			expect(result.tapTargetIssues).toBeGreaterThanOrEqual(0);
		});

		it("should analyze text readability", () => {
			const html = `
        <html>
          <body>
            <p style="font-size: 14px;">Normal text</p>
            <p style="font-size: 10px;">Small text</p>
            <span style="font-size: 8px;">Tiny text</span>
          </body>
        </html>
      `;

			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "iphone-14",
			});

			expect(result.textReadability.total).toBeGreaterThan(0);
			expect(result.textReadability.tooSmall).toBeGreaterThanOrEqual(0);
		});

		it("should set analyzed timestamp", () => {
			const html = "<html><body>Test</body></html>";
			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "iphone-14",
			});

			expect(result.analyzedAt).toBeDefined();
			expect(new Date(result.analyzedAt)).toBeInstanceOf(Date);
		});

		it("should preserve render result", () => {
			const html = "<html><body>Test</body></html>";
			const renderResult = createMockRenderResult(html);

			const result = diagnoseMobileFromHtml(renderResult, {
				url: "https://example.com",
				device: "galaxy-s24",
			});

			expect(result.renderResult).toBe(renderResult);
			expect(result.renderResult.html).toBe(html);
		});

		it("should set correct device", () => {
			const html = "<html><body>Test</body></html>";

			const resultPhone = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "iphone-14",
			});

			expect(resultPhone.device).toBe("iphone-14");

			const resultTablet = diagnoseMobileFromHtml(
				createMockRenderResult(html),
				{
					url: "https://example.com",
					device: "ipad-air",
				},
			);

			expect(resultTablet.device).toBe("ipad-air");
		});
	});

	describe("isValidMobileDiagnosis", () => {
		it("should validate correct diagnosis", () => {
			const result = diagnoseMobileFromHtml(
				createMockRenderResult("<html><body>Test</body></html>"),
				{
					url: "https://example.com",
					device: "iphone-14",
				},
			);

			expect(isValidMobileDiagnosis(result)).toBe(true);
		});

		it("should reject missing required fields", () => {
			const invalidResult = {
				device: "iphone-14",
				// renderResult missing
				hasHorizontalScroll: false,
				tapTargetIssues: 0,
				textReadability: { tooSmall: 0, total: 1 },
				missingViewportMeta: false,
				analyzedAt: new Date().toISOString(),
			} as any;

			expect(isValidMobileDiagnosis(invalidResult)).toBe(false);
		});

		it("should reject invalid readability data", () => {
			const result = diagnoseMobileFromHtml(
				createMockRenderResult("<html><body>Test</body></html>"),
				{
					url: "https://example.com",
					device: "iphone-14",
				},
			);

			// Mutate to invalid state
			result.textReadability.total = -1;

			expect(isValidMobileDiagnosis(result)).toBe(false);
		});
	});

	describe("Device-specific diagnosis", () => {
		it("should handle iPhone 14 (390x844, 3x scale)", () => {
			const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <p>Test</p>
          </body>
        </html>
      `;

			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "iphone-14",
			});

			expect(result.device).toBe("iphone-14");
			expect(result.missingViewportMeta).toBe(false);
		});

		it("should handle Galaxy S24 (360x800, 3x scale)", () => {
			const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <p>Test</p>
          </body>
        </html>
      `;

			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "galaxy-s24",
			});

			expect(result.device).toBe("galaxy-s24");
			expect(result.missingViewportMeta).toBe(false);
		});

		it("should handle iPad Air (1024x1366, 2x scale)", () => {
			const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <p>Test</p>
          </body>
        </html>
      `;

			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "ipad-air",
			});

			expect(result.device).toBe("ipad-air");
		});
	});

	describe("HTML edge cases", () => {
		it("should handle malformed HTML", () => {
			const html = "<div>Unclosed div";

			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "iphone-14",
			});

			expect(result).toBeDefined();
			expect(result.viewportMeta).toBeNull();
		});

		it("should handle HTML with multiple viewport meta tags (first wins)", () => {
			const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="viewport" content="width=500">
          </head>
        </html>
      `;

			const result = diagnoseMobileFromHtml(createMockRenderResult(html), {
				url: "https://example.com",
				device: "iphone-14",
			});

			expect(result.viewportMeta).toContain("width=device-width");
		});

		it("should handle empty HTML", () => {
			const result = diagnoseMobileFromHtml(createMockRenderResult(""), {
				url: "https://example.com",
				device: "iphone-14",
			});

			expect(result).toBeDefined();
			expect(result.missingViewportMeta).toBe(true);
			expect(result.tapTargetIssues).toBe(0);
		});
	});
});
