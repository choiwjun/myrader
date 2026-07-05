/**
 * Phase R-D — CheerioStaticA11yProvider tests
 */

import { describe, expect, it } from "vitest";
import { CheerioStaticA11yProvider } from "../providers/cheerio-static.js";

const URL = "https://example.co.kr/";

async function analyze(html: string) {
	const p = new CheerioStaticA11yProvider();
	return p.analyze({ html, url: URL });
}

describe("CheerioStaticA11yProvider", () => {
	it("is always available", () => {
		expect(new CheerioStaticA11yProvider().isAvailable()).toBe(true);
	});

	it("detects missing image alt", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><main><img src='a.png'></main></body></html>",
		);
		const v = r.violations.find((x) => x.ruleId === "image-alt");
		expect(v).toBeDefined();
		expect(v?.affectedNodes).toBeGreaterThanOrEqual(1);
	});

	it("passes image-alt when alt is present", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><main><img src='a.png' alt='hi'></main></body></html>",
		);
		expect(r.violations.find((x) => x.ruleId === "image-alt")).toBeUndefined();
	});

	it("detects missing html-has-lang", async () => {
		const r = await analyze(
			"<!doctype html><html><head><title>t</title></head><body><main>x</main></body></html>",
		);
		expect(
			r.violations.find((x) => x.ruleId === "html-has-lang"),
		).toBeDefined();
	});

	it("detects missing document-title", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head></head><body><main>x</main></body></html>",
		);
		expect(
			r.violations.find((x) => x.ruleId === "document-title"),
		).toBeDefined();
	});

	it("detects landmark-one-main when no <main>", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><div>x</div></body></html>",
		);
		expect(
			r.violations.find((x) => x.ruleId === "landmark-one-main"),
		).toBeDefined();
	});

	it("detects heading-order violation (H1 → H3)", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><main><h1>A</h1><h3>B</h3></main></body></html>",
		);
		expect(
			r.violations.find((x) => x.ruleId === "heading-order"),
		).toBeDefined();
	});

	it("detects link-name (empty <a>)", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><main><a href='/x'></a></main></body></html>",
		);
		expect(r.violations.find((x) => x.ruleId === "link-name")).toBeDefined();
	});

	it("detects tabindex > 0", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><main><button tabindex='5'>x</button></main></body></html>",
		);
		expect(r.violations.find((x) => x.ruleId === "tabindex")).toBeDefined();
	});

	it("detects autoplay video without controls", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><main><video autoplay src='a.mp4'></video></main></body></html>",
		);
		expect(r.violations.find((x) => x.ruleId === "autoplay")).toBeDefined();
	});

	it("passes autoplay when controls present", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><main><video autoplay controls src='a.mp4'></video></main></body></html>",
		);
		expect(r.violations.find((x) => x.ruleId === "autoplay")).toBeUndefined();
	});

	it("detects meta-viewport with user-scalable=no", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title><meta name='viewport' content='width=device-width, user-scalable=no'></head><body><main>x</main></body></html>",
		);
		expect(
			r.violations.find((x) => x.ruleId === "meta-viewport"),
		).toBeDefined();
	});

	it("detects duplicate-id", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><main><span id='x'>1</span><span id='x'>2</span></main></body></html>",
		);
		expect(r.violations.find((x) => x.ruleId === "duplicate-id")).toBeDefined();
	});

	it("detects label missing on input", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><main><input type='text' id='x'></main></body></html>",
		);
		expect(r.violations.find((x) => x.ruleId === "label")).toBeDefined();
	});

	it("passes label when input has aria-label", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><main><input type='text' aria-label='이름'></main></body></html>",
		);
		expect(r.violations.find((x) => x.ruleId === "label")).toBeUndefined();
	});

	it("returns source='cheerio-static' and ISO measuredAt", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><main>x</main></body></html>",
		);
		expect(r.source).toBe("cheerio-static");
		expect(r.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("computes wcag21AaCompliance in [0,1]", async () => {
		const r = await analyze(
			"<!doctype html><html lang='ko'><head><title>t</title></head><body><main><img src='x' alt='x'></main></body></html>",
		);
		expect(r.wcag21AaCompliance).toBeGreaterThanOrEqual(0);
		expect(r.wcag21AaCompliance).toBeLessThanOrEqual(1);
	});
});
