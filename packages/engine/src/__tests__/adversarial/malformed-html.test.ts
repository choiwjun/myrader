/**
 * BACKLOG-G P5 — adversarial / malformed HTML 회귀 테스트.
 *
 * 검증 포인트:
 *  - parser 가 throw 하지 않고 graceful 하게 ParsedPage 반환
 *  - 닫히지 않은 태그·broken nesting·quote 누락 페이로드에 대해
 *    title/h1/h2/meta 등 핵심 필드를 best-effort 로 추출
 *  - script/style 이 제거되어 bodyText 에 코드가 노출되지 않음
 *  - analyzePage() 가 동작하고 모든 RuleResult 가 무결한지
 */

import { describe, expect, it } from "vitest";
import { analyzePage } from "../../analyzers/index.js";
import { parseHtml } from "../../parser.js";
import { scoreDiagnosis } from "../../scoring.js";
import {
	expectNoCrash,
	expectValidRuleResult,
	expectValidScore,
	loadFixture,
	makeRuleContext,
	mockParsedPage,
} from "./helpers.js";

const BASE_URL = "https://example.co.kr/";

describe("malformed-html — fixture 기반 페이로드", () => {
	it("malformed-html-001 (닫히지 않은 태그) — parser 가 throw 하지 않는다", async () => {
		await expectNoCrash(() => {
			const html = loadFixture("malformed-html-001.html");
			mockParsedPage(html);
		});
	});

	it("malformed-html-001 — title 추출 시 닫는 태그 누락에도 의미 있는 값 반환", () => {
		const page = mockParsedPage(loadFixture("malformed-html-001.html"));
		expect(typeof page.title === "string" || page.title === null).toBe(true);
		// title 이 추출되면 비어있지 않다
		if (page.title) {
			expect(page.title.length).toBeGreaterThan(0);
		}
	});

	it("malformed-html-001 — analyzePage() 가 모든 카테고리 RuleResult 반환", () => {
		const page = mockParsedPage(loadFixture("malformed-html-001.html"));
		const ctx = makeRuleContext(page);
		const result = analyzePage(ctx);
		expect(result.seo.results.length).toBeGreaterThan(0);
		expect(result.aeo.results.length).toBeGreaterThan(0);
		expect(result.geo.results.length).toBeGreaterThan(0);
		for (const r of [
			...result.seo.results,
			...result.aeo.results,
			...result.geo.results,
		]) {
			expectValidRuleResult(r);
		}
	});

	it("malformed-html-002 (broken nesting) — parser graceful", async () => {
		await expectNoCrash(() => {
			mockParsedPage(loadFixture("malformed-html-002.html"));
		});
	});

	it("malformed-html-002 — H1 안에 H2 가 있어도 h1/h2 best-effort 추출", () => {
		const page = mockParsedPage(loadFixture("malformed-html-002.html"));
		// cheerio 는 h1/h2 를 각각 찾아낸다 — 텍스트가 있어야 한다
		expect(page.h1 === null || page.h1.length > 0).toBe(true);
		expect(Array.isArray(page.h2)).toBe(true);
	});

	it("malformed-html-002 — scoring 이 NaN/Infinity 없이 0~100 사이", () => {
		const page = mockParsedPage(loadFixture("malformed-html-002.html"));
		const ctx = makeRuleContext(page);
		const result = analyzePage(ctx);
		const score = scoreDiagnosis(result);
		expectValidScore(score.seoScore);
		expectValidScore(score.aeoScore);
		expectValidScore(score.geoScore);
		expectValidScore(score.overallScore);
	});

	it("malformed-html-003 (잘못된 attribute quote) — parser graceful", async () => {
		await expectNoCrash(() => {
			mockParsedPage(loadFixture("malformed-html-003.html"));
		});
	});

	it("malformed-html-003 — meta 추출 시 일부라도 살리는지", () => {
		const page = mockParsedPage(loadFixture("malformed-html-003.html"));
		expect(typeof page.meta).toBe("object");
		// meta object 는 항상 존재 (비어있을 수 있음)
		expect(page.meta).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// inline 페이로드 — 다양한 malformed 패턴 (fixture 분리 비용을 피하기 위해 inline)
// ---------------------------------------------------------------------------

describe("malformed-html — inline 페이로드", () => {
	it("자기 자신을 닫는 잘못된 형식 (<html/>) 이어도 throw 하지 않음", async () => {
		await expectNoCrash(() => {
			mockParsedPage("<html/>");
		});
	});

	it("완전 빈 문자열 입력에도 throw 하지 않음", async () => {
		await expectNoCrash(() => {
			const page = mockParsedPage("");
			expect(page.title).toBeNull();
			expect(page.bodyText).toBe("");
			expect(page.wordCount).toBe(0);
		});
	});

	it("공백만 있는 입력에도 throw 하지 않음", () => {
		const page = mockParsedPage("   \n\t  \r\n  ");
		expect(page.title).toBeNull();
		expect(page.h1).toBeNull();
		expect(page.h2).toEqual([]);
	});

	it("HTML 이 아닌 plain text 입력에도 throw 하지 않음", async () => {
		await expectNoCrash(() => {
			const page = mockParsedPage("Hello world, 안녕하세요!");
			// cheerio 는 body 텍스트로 처리한다
			expect(page.bodyText.length).toBeGreaterThan(0);
		});
	});

	it("DOCTYPE 만 있는 HTML 도 처리", () => {
		const page = mockParsedPage("<!DOCTYPE html>");
		expect(page.title).toBeNull();
		expect(page.h1).toBeNull();
	});

	it("XHTML 스타일 self-closing 태그도 처리", () => {
		const html = `<html><head><title>XHTML 페이지</title><meta name="description" content="x" /></head><body><br /><img src="/i.png" alt="i" /></body></html>`;
		const page = mockParsedPage(html);
		expect(page.title).toBe("XHTML 페이지");
		expect(page.description).toBe("x");
	});

	it("주석으로만 채워진 body 도 처리", () => {
		const html =
			"<html><head><title>주석 페이지</title></head><body><!-- comment 1 --><!-- comment 2 --></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toBe("주석 페이지");
		expect(page.bodyText).toBe("");
	});

	it("CDATA 섹션이 있어도 처리", () => {
		const html =
			"<html><head><title>CDATA</title></head><body><![CDATA[<script>alert(1)</script>]]>본문</body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toBe("CDATA");
	});

	it("중첩 quote 가 깨진 attribute 도 graceful", () => {
		const html = `<html><head><title>quote test</title></head><body><a href="he said \"hi\"">link</a></body></html>`;
		const page = mockParsedPage(html);
		expect(page.title).toBe("quote test");
	});

	it("처리되지 않는 entity (&undefined;) 도 throw 하지 않음", async () => {
		await expectNoCrash(() => {
			mockParsedPage(
				"<html><head><title>&undefined;&nonexistent;</title></head><body></body></html>",
			);
		});
	});

	it("매우 깊은 nesting (depth 100) 도 처리", () => {
		let html = "<html><head><title>deep</title></head><body>";
		for (let i = 0; i < 100; i++) html += "<div>";
		html += "깊은 본문";
		for (let i = 0; i < 100; i++) html += "</div>";
		html += "</body></html>";

		const page = mockParsedPage(html);
		expect(page.title).toBe("deep");
		expect(page.bodyText).toContain("깊은 본문");
	});

	it("닫는 태그가 거꾸로 있는 경우도 처리", () => {
		const html = "<html><body></body></head><title>broken</title></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("script 와 style 은 bodyText 에서 제거되어야 한다", () => {
		const html = `
      <html><head><title>t</title></head>
      <body>
        <script>alert('should-not-appear')</script>
        <style>body { color: red; }</style>
        <p>실제 본문</p>
      </body></html>
    `;
		const page = mockParsedPage(html);
		expect(page.bodyText).toContain("실제 본문");
		expect(page.bodyText).not.toContain("alert");
		expect(page.bodyText).not.toContain("should-not-appear");
		expect(page.bodyText).not.toContain("color: red");
	});

	it("noscript 도 bodyText 에서 제거된다", () => {
		const html =
			"<html><head><title>t</title></head><body><noscript>JS off message</noscript><p>본문</p></body></html>";
		const page = mockParsedPage(html);
		expect(page.bodyText).not.toContain("JS off message");
		expect(page.bodyText).toContain("본문");
	});

	it("template 태그 안의 내용도 bodyText 에 포함될 수 있다 (cheerio 기본 동작)", () => {
		const html =
			"<html><head><title>t</title></head><body><template><span>hidden template</span></template></body></html>";
		// throw 만 안 하면 된다
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("HTML 5 의 새 태그 (article, section, nav) 도 처리", () => {
		const html = `
      <html><head><title>HTML5</title></head>
      <body>
        <nav><a href="/">홈</a></nav>
        <article><h1>아티클</h1><p>본문</p></article>
        <section><h2>섹션</h2></section>
        <aside>사이드바</aside>
        <footer>푸터</footer>
      </body></html>
    `;
		const page = mockParsedPage(html);
		expect(page.h1).toBe("아티클");
		expect(page.h2).toContain("섹션");
	});

	it("매우 긴 단일 태그 attribute 도 처리", () => {
		const longAttr = "a".repeat(10_000);
		const html = `<html><head><title>long-attr</title></head><body><div class="${longAttr}">x</div></body></html>`;
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("BOM(\\uFEFF) 으로 시작하는 HTML 도 처리", () => {
		const html =
			"﻿<html><head><title>BOM 페이지</title></head><body><h1>x</h1></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toBe("BOM 페이지");
	});

	it("\\r\\n 줄바꿈 페이로드도 처리", () => {
		const html =
			"<html>\r\n<head>\r\n<title>CRLF</title>\r\n</head>\r\n<body>\r\n<h1>x</h1>\r\n</body>\r\n</html>";
		const page = mockParsedPage(html);
		expect(page.title).toBe("CRLF");
	});

	it("\\r 만 사용하는 (구 Mac) 줄바꿈도 처리", () => {
		const html =
			"<html><head><title>CR</title></head><body><h1>x</h1></body></html>".replace(
				/\n/g,
				"\r",
			);
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("title 이 중복으로 두 번 있어도 첫 번째만 추출", () => {
		const html =
			"<html><head><title>첫번째</title><title>두번째</title></head><body></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toBe("첫번째");
	});

	it("head 가 없는 HTML 도 처리", () => {
		const html = "<html><body><h1>head-less</h1><p>본문</p></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toBeNull();
		expect(page.h1).toBe("head-less");
	});

	it("body 가 없는 HTML 도 처리", () => {
		const html = "<html><head><title>body-less</title></head></html>";
		const page = mockParsedPage(html);
		expect(page.title).toBe("body-less");
		expect(page.bodyText).toBe("");
	});

	it("html 태그 자체가 없는 fragment 도 처리", () => {
		const html = "<title>fragment</title><h1>x</h1><p>본문</p>";
		const page = mockParsedPage(html);
		expect(page.title).toBe("fragment");
	});

	it("다중 body 태그가 있어도 throw 하지 않음", () => {
		const html =
			"<html><body><h1>첫번째 body</h1></body><body><h1>두번째 body</h1></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("img 태그에 src 가 없으면 images 에 포함되지 않음", () => {
		const html = `<html><head><title>t</title></head><body><img alt="src 없음"></body></html>`;
		const page = mockParsedPage(html);
		expect(page.images).toHaveLength(0);
	});

	it("a 태그에 href 가 없으면 link 에 포함되지 않음", () => {
		const html =
			"<html><head><title>t</title></head><body><a>href 없음</a></body></html>";
		const page = mockParsedPage(html);
		expect(page.internalLinks).toHaveLength(0);
		expect(page.externalLinks).toHaveLength(0);
	});

	it("a 태그의 href 가 javascript:/mailto:/tel: 이면 link 에 포함되지 않음", () => {
		const html = `
      <html><head><title>t</title></head>
      <body>
        <a href="javascript:void(0)">js</a>
        <a href="mailto:a@b.com">메일</a>
        <a href="tel:+82-2-1234">전화</a>
        <a href="#section">앵커</a>
        <a href="/page">정상</a>
      </body></html>
    `;
		const page = parseHtml(html, BASE_URL, 200);
		// /page 만 internal 에 포함
		expect(page.internalLinks).toEqual([`${BASE_URL}page`]);
		expect(page.externalLinks).toEqual([]);
	});

	it("a 태그의 href 가 비표준 scheme (ftp://, file://) 이면 http 만 수집되므로 link 에 포함되지 않음", () => {
		const html = `<html><head><title>t</title></head><body><a href="ftp://server/file">ftp</a><a href="file:///etc/passwd">file</a></body></html>`;
		const page = parseHtml(html, BASE_URL, 200);
		// http/https 만 수집 — ftp/file 은 skip
		expect(page.internalLinks).toHaveLength(0);
		expect(page.externalLinks).toHaveLength(0);
	});

	it("다중 canonical 이 있어도 첫 번째 canonical 만 사용 (또는 graceful)", () => {
		const html = `
      <html><head>
        <title>multi canonical</title>
        <link rel="canonical" href="https://a.com/1">
        <link rel="canonical" href="https://b.com/2">
      </head><body></body></html>
    `;
		const page = parseHtml(html, BASE_URL, 200);
		// 첫 번째 canonical 만 추출
		expect(page.canonicalUrl).toBe("https://a.com/1");
	});

	it("statusCode 가 비정상 값 (음수, 큰 값) 이어도 그대로 전달", () => {
		const page1 = mockParsedPage("<html></html>", BASE_URL, -1);
		const page2 = mockParsedPage("<html></html>", BASE_URL, 99999);
		expect(page1.statusCode).toBe(-1);
		expect(page2.statusCode).toBe(99999);
	});

	it("statusCode 가 0 (DNS 실패 등) 이어도 처리", () => {
		const page = mockParsedPage("", BASE_URL, 0);
		expect(page.statusCode).toBe(0);
	});

	it("baseUrl 이 잘못된 형식이어도 graceful", async () => {
		await expectNoCrash(() => {
			const html = `<html><head><title>t</title></head><body><a href="/x">x</a></body></html>`;
			// 깨진 baseUrl — relative href 가 해석 실패해도 throw X
			parseHtml(html, "not a url", 200);
		});
	});

	it("dedupe — 동일한 internal link 가 여러 번 있어도 한 번만", () => {
		const html = `
      <html><head><title>t</title></head>
      <body>
        <a href="/page">1</a>
        <a href="/page">2</a>
        <a href="/page">3</a>
      </body></html>
    `;
		const page = parseHtml(html, BASE_URL, 200);
		expect(page.internalLinks).toHaveLength(1);
	});

	it("script type=ld+json 이 비어 있어도 throw 안 함", () => {
		const html = `<html><head><title>t</title><script type="application/ld+json"></script></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toEqual([]);
		expect(page.hasSchema).toBe(false);
	});
});
