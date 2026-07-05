/**
 * BACKLOG-G P5 — adversarial / meta tag overflow 회귀 테스트.
 *
 * 검증 포인트:
 *  - title 1000자, description 5000자, og:* 100개 등 극단 사이즈
 *  - parser 가 truncation 없이 모두 추출 (메모리 / 성능 한계는 호출자가 결정)
 *  - meta 키 중복 (마지막 값으로 덮어쓰기) 동작
 *  - 잘못된 meta 속성 조합 (name+property, content 없음) 도 graceful
 *  - analyzePage / scoreDiagnosis 가 극단 입력에서도 NaN/Infinity 안 만들기
 */

import { describe, expect, it } from "vitest";
import { analyzePage } from "../../analyzers/index.js";
import { scoreDiagnosis } from "../../scoring.js";
import {
	expectValidRuleResult,
	expectValidScore,
	makeRuleContext,
	mockParsedPage,
} from "./helpers.js";

const BASE = "https://example.co.kr/";

describe("meta-overflow — 극단 길이", () => {
	it("title 1000자 — 그대로 추출", () => {
		const longTitle = "강".repeat(1000);
		const html = `<html><head><title>${longTitle}</title></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.title?.length).toBe(1000);
	});

	it("title 10,000자 — 그대로 추출 (truncation 없음)", () => {
		const longTitle = "a".repeat(10_000);
		const html = `<html><head><title>${longTitle}</title></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.title?.length).toBe(10_000);
	});

	it("description 5000자 — 그대로 추출", () => {
		const longDesc = "강".repeat(5000);
		const html = `<html><head><title>t</title><meta name="description" content="${longDesc}"></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.description?.length).toBe(5000);
	});

	it("description 100,000자 — 그대로 추출", () => {
		const longDesc = "x".repeat(100_000);
		const html = `<html><head><title>t</title><meta name="description" content="${longDesc}"></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.description?.length).toBe(100_000);
	});

	it("og:title 1000자 — meta 에 그대로 저장", () => {
		const longOg = "o".repeat(1000);
		const html = `<html><head><title>t</title><meta property="og:title" content="${longOg}"></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.meta["og:title"]?.length).toBe(1000);
	});
});

describe("meta-overflow — 다중 meta 태그", () => {
	it("og:* 100개 (다양한 property)", () => {
		const ogTags = Array.from(
			{ length: 100 },
			(_, i) => `<meta property="og:tag-${i}" content="v${i}">`,
		).join("");
		const html = `<html><head><title>t</title>${ogTags}</head><body></body></html>`;
		const page = mockParsedPage(html);
		// 100개의 키 + description 등 기본
		const ogKeys = Object.keys(page.meta).filter((k) =>
			k.startsWith("og:tag-"),
		);
		expect(ogKeys.length).toBe(100);
	});

	it("meta 1000개 (중복 키 포함) — 마지막 값으로 덮어쓰기", () => {
		let tags = "";
		for (let i = 0; i < 1000; i++) {
			tags += `<meta name="key-${i % 10}" content="value-${i}">`;
		}
		const html = `<html><head><title>t</title>${tags}</head><body></body></html>`;
		const page = mockParsedPage(html);
		// key-0 ~ key-9 의 10개만 존재, 각각 마지막 값
		const filtered = Object.keys(page.meta).filter((k) => k.startsWith("key-"));
		expect(filtered.length).toBe(10);
		// key-0 의 마지막 값은 value-990
		expect(page.meta["key-0"]).toBe("value-990");
	});

	it("meta name 이 빈 문자열 — 무시", () => {
		const html = `<html><head><title>t</title>
      <meta name="" content="empty-name">
      <meta name="valid" content="valid-value">
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.meta["valid"]).toBe("valid-value");
		expect(page.meta[""]).toBeUndefined();
	});

	it("meta content 가 없으면 무시 (content === undefined)", () => {
		const html = `<html><head><title>t</title>
      <meta name="no-content">
      <meta name="has-content" content="x">
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.meta["has-content"]).toBe("x");
		expect(page.meta["no-content"]).toBeUndefined();
	});

	it("meta content 가 빈 문자열이면 빈 문자열로 저장 (undefined !== '')", () => {
		const html = `<html><head><title>t</title>
      <meta name="empty-content" content="">
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.meta["empty-content"]).toBe("");
	});

	it("meta name 과 property 둘 다 있으면 name 우선 (parser.ts || 순서)", () => {
		const html = `<html><head><title>t</title>
      <meta name="name-key" property="property-key" content="v">
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		// name 이 우선
		expect(page.meta["name-key"]).toBe("v");
		expect(page.meta["property-key"]).toBeUndefined();
	});

	it("http-equiv 도 fallback 으로 사용 (name 없을 때)", () => {
		const html = `<html><head><title>t</title>
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		// parser.ts: name || property || http-equiv
		expect(page.meta["x-ua-compatible"]).toBe("IE=edge");
	});

	it("meta 키는 lowercase 로 정규화", () => {
		const html = `<html><head><title>t</title>
      <meta name="Description" content="대문자 description">
      <meta name="OG:Title" content="대문자 og">
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.meta["description"]).toBe("대문자 description");
		expect(page.meta["og:title"]).toBe("대문자 og");
	});
});

describe("meta-overflow — 극단 입력에서 analyzePage / scoring", () => {
	it("title 5000자 + description 10,000자 — analyzePage 정상 동작", () => {
		const html = `<html><head>
      <title>${"x".repeat(5000)}</title>
      <meta name="description" content="${"y".repeat(10_000)}">
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		const ctx = makeRuleContext(page);
		const result = analyzePage(ctx);
		expect(result.seo.results.length).toBeGreaterThan(0);
		for (const r of result.seo.results) {
			expectValidRuleResult(r);
		}
	});

	it("og:* 100개 — scoreDiagnosis 가 NaN/Infinity 없음", () => {
		const ogTags = Array.from(
			{ length: 100 },
			(_, i) => `<meta property="og:t${i}" content="v${i}">`,
		).join("");
		const html = `<html><head><title>t</title>${ogTags}</head><body></body></html>`;
		const page = mockParsedPage(html);
		const ctx = makeRuleContext(page);
		const result = analyzePage(ctx);
		const score = scoreDiagnosis(result);
		expectValidScore(score.seoScore);
		expectValidScore(score.aeoScore);
		expectValidScore(score.geoScore);
		expectValidScore(score.overallScore);
	});

	it("매우 긴 본문 (10MB body text) 도 wordCount 가 NaN 아님", () => {
		const longBody = "강남 카페 ".repeat(500_000); // 약 2MB
		const html = `<html><head><title>t</title></head><body><p>${longBody}</p></body></html>`;
		const page = mockParsedPage(html);
		expect(Number.isFinite(page.wordCount)).toBe(true);
		expect(page.wordCount).toBeGreaterThan(0);
	});

	it("이미지 1000개 + alt 모두 동일 — images 배열 크기", () => {
		const imgs = Array.from(
			{ length: 1000 },
			(_, i) => `<img src="/i-${i}.png" alt="img ${i}">`,
		).join("");
		const html = `<html><head><title>t</title></head><body>${imgs}</body></html>`;
		const page = mockParsedPage(html);
		expect(page.images.length).toBe(1000);
	});

	it("internal link 1000개 (중복 포함) — dedupe 후 적은 개수", () => {
		const links = Array.from(
			{ length: 1000 },
			(_, i) => `<a href="/p-${i % 100}">l</a>`,
		).join("");
		const html = `<html><head><title>t</title></head><body>${links}</body></html>`;
		const page = mockParsedPage(html, BASE);
		// 중복 dedupe → 100개
		expect(page.internalLinks.length).toBe(100);
	});

	it("external link 1000개 — dedupe", () => {
		const links = Array.from(
			{ length: 1000 },
			(_, i) => `<a href="https://ext${i % 50}.example.com/">l</a>`,
		).join("");
		const html = `<html><head><title>t</title></head><body>${links}</body></html>`;
		const page = mockParsedPage(html, BASE);
		// 중복 dedupe → 50개
		expect(page.externalLinks.length).toBe(50);
	});

	it("internal + external 혼합 1000개 — 각각 dedupe", () => {
		let links = "";
		for (let i = 0; i < 500; i++) links += `<a href="/p-${i}">l</a>`;
		for (let i = 0; i < 500; i++)
			links += `<a href="https://ext${i}.example.com/">l</a>`;
		const html = `<html><head><title>t</title></head><body>${links}</body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.internalLinks.length).toBe(500);
		expect(page.externalLinks.length).toBe(500);
	});

	it("h2 5000개 — 모두 추출 가능 (메모리 한계 내)", () => {
		const h2s = Array.from({ length: 5000 }, (_, i) => `<h2>s${i}</h2>`).join(
			"",
		);
		const html = `<html><head><title>t</title></head><body><h1>x</h1>${h2s}</body></html>`;
		const page = mockParsedPage(html);
		expect(page.h2.length).toBe(5000);
	});

	it("schemaJsonLd 100개 (각각 별도 script) — 모두 수집", () => {
		let scripts = "";
		for (let i = 0; i < 100; i++) {
			scripts += `<script type="application/ld+json">{"@type":"X","id":${i}}</script>`;
		}
		const html = `<html><head><title>t</title>${scripts}</head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd.length).toBe(100);
	});

	it("statusCode 200 + 모든 필드 정상 + 극단 길이 → score 계산 finite", () => {
		const html = `<html><head>
      <title>${"a".repeat(5000)}</title>
      <meta name="description" content="${"b".repeat(5000)}">
      <link rel="canonical" href="${BASE}">
    </head><body><h1>x</h1><h2>y</h2></body></html>`;
		const page = mockParsedPage(html, BASE);
		const ctx = makeRuleContext(page);
		const score = scoreDiagnosis(analyzePage(ctx));
		expectValidScore(score.overallScore);
	});
});
