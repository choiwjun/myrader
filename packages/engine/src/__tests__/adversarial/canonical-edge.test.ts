/**
 * BACKLOG-G P5 — adversarial / canonical URL 엣지 케이스 회귀 테스트.
 *
 * 검증 포인트:
 *  - self-referencing, 외부 도메인, 다중 canonical 페이로드
 *  - 상대/절대 canonical 모두 절대 URL 로 해석
 *  - 깨진 canonical href 도 fallback 처리 (parser 가 throw 안 함)
 *  - protocol-less canonical (//host/path) 도 처리
 */

import { describe, expect, it } from "vitest";
import { mockParsedPage } from "./helpers.js";

const BASE = "https://example.co.kr/page";

describe("canonical-edge — 정상 케이스", () => {
	it("절대 URL canonical 추출", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="https://example.co.kr/"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBe("https://example.co.kr/");
	});

	it("상대 URL canonical → 절대 URL 로 해석", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="/about"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBe("https://example.co.kr/about");
	});

	it("canonical 없으면 null", () => {
		const html = "<html><head><title>t</title></head><body></body></html>";
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBeNull();
	});

	it("self-referencing canonical (현재 URL 과 동일)", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="${BASE}"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBe(BASE);
	});

	it("외부 도메인 canonical (cross-origin)", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="https://other.example.com/page"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBe("https://other.example.com/page");
	});
});

describe("canonical-edge — 다중 canonical", () => {
	it("다중 canonical — 첫 번째만 사용", () => {
		const html = `<html><head><title>t</title>
      <link rel="canonical" href="https://a.example.com/">
      <link rel="canonical" href="https://b.example.com/">
    </head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBe("https://a.example.com/");
	});

	it("다중 canonical 이 모두 상대 URL — 첫 번째만 사용", () => {
		const html = `<html><head><title>t</title>
      <link rel="canonical" href="/first">
      <link rel="canonical" href="/second">
    </head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBe("https://example.co.kr/first");
	});

	it("canonical 이 body 안에 있어도 추출 (위치 무관)", () => {
		const html = `<html><head><title>t</title></head>
      <body><link rel="canonical" href="/x"></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBe("https://example.co.kr/x");
	});
});

describe("canonical-edge — 특수 URL 형태", () => {
	it("protocol-less canonical (//host/path) — base 의 protocol 사용", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="//other.example.com/page"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		// base 가 https 이므로 https://other.example.com/page 가 되어야 함
		expect(page.canonicalUrl).toBe("https://other.example.com/page");
	});

	it("canonical href 가 query string 만 (?utm=...)", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="?utm_source=email"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toContain("utm_source=email");
	});

	it("canonical href 가 fragment 만 (#section)", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="#main"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBe(`${BASE}#main`);
	});

	it("canonical href 가 trailing slash", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="/page/"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBe("https://example.co.kr/page/");
	});

	it("canonical href 에 한글 path", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="/메뉴"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		// URL 인코딩 결과
		expect(page.canonicalUrl).toMatch(/^https:\/\/example\.co\.kr\//);
	});

	it("canonical href 가 매우 긴 URL (2000자) 도 처리", () => {
		const longPath = `/${"a".repeat(2000)}`;
		const html = `<html><head><title>t</title><link rel="canonical" href="${longPath}"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl?.length).toBeGreaterThan(1000);
	});

	it("canonical 이 다른 protocol (http vs https)", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="http://example.co.kr/"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBe("http://example.co.kr/");
	});
});

describe("canonical-edge — 깨진 href", () => {
	it("canonical href 가 빈 문자열이면 falsy 체크에 걸려 null", () => {
		// parser.ts: if (canonicalHref) — 빈 문자열은 falsy → null 유지
		const html = `<html><head><title>t</title><link rel="canonical" href=""></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBeNull();
	});

	it("canonical href 가 공백만 있어도 throw 안 함", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="   "></head><body></body></html>`;
		expect(() => mockParsedPage(html, BASE)).not.toThrow();
	});

	it("canonical href 가 javascript: 도 그대로 저장 (validator 단계가 아님)", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="javascript:alert(1)"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		// URL 생성 시 javascript: 도 valid URL 객체
		expect(page.canonicalUrl).toBeTruthy();
	});

	it("canonical href 가 깨진 URL ('not a url') — fallback 으로 그대로 저장", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="not a valid url"></head><body></body></html>`;
		const page = mockParsedPage(html, BASE);
		// new URL() 이 실패하면 fallback 으로 raw 값 저장
		expect(page.canonicalUrl).toBeTruthy();
	});

	it("baseUrl 이 깨진 경우에도 canonical 추출 시 throw 안 함", () => {
		const html = `<html><head><title>t</title><link rel="canonical" href="/x"></head><body></body></html>`;
		// baseUrl 이 깨졌으면 new URL("/x", base) 가 실패 → fallback 으로 raw href 저장
		const page = mockParsedPage(html, "not a url");
		expect(page.canonicalUrl).toBe("/x");
	});

	it("link rel='canonical' 의 rel 이 대문자여도 처리", () => {
		const html = `<html><head><title>t</title><link rel="CANONICAL" href="/x"></head><body></body></html>`;
		// CSS attribute selector 는 cheerio 에서 case-insensitive
		const page = mockParsedPage(html, BASE);
		// 매칭되어야 함
		expect(page.canonicalUrl).toBeTruthy();
	});

	it("link rel='alternate canonical' 처럼 multi-value rel — 추출 동작은 cheerio 의존", () => {
		const html = `<html><head><title>t</title><link rel="alternate canonical" href="/x"></head><body></body></html>`;
		// CSS [rel="canonical"] 는 정확히 'canonical' 만 매칭
		// multi-value 는 매칭 안 됨 — null
		const page = mockParsedPage(html, BASE);
		expect(page.canonicalUrl).toBeNull();
	});
});
