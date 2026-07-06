/**
 * Unit tests — parser.ts (MOD-PARSER)
 *
 * 5개 케이스:
 *  1. 정상 HTML — 기본 필드 추출
 *  2. missing title — title=null
 *  3. FAQ Schema — hasFAQ=true, hasSchema=true
 *  4. canonical URL 추출
 *  5. multiple H1 — h1 은 첫 번째만, h2[] 는 모두
 */

import { describe, expect, it } from "vitest";
import { parseHtml } from "../parser.js";

const BASE_URL = "https://example.com/";

// ---------------------------------------------------------------------------
// 케이스 1: 정상 HTML
// ---------------------------------------------------------------------------

describe("parseHtml — 케이스 1: 정상 HTML", () => {
	const html = `
    <html>
      <head>
        <title>테스트 카페 강남</title>
        <meta name="description" content="강남 최고의 카페입니다.">
        <meta name="robots" content="index,follow">
        <meta property="og:title" content="테스트 카페">
        <link rel="canonical" href="https://example.com/">
        <link rel="alternate" hreflang="en" href="https://example.com/en/">
        <link rel="next" href="https://example.com/page/2">
      </head>
      <body>
        <h1>강남 카페 메인</h1>
        <h2>우리 메뉴</h2>
        <h2>오시는 길</h2>
        <p>아메리카노 4,500원. 케이크도 있어요.</p>
        <a href="/menu">메뉴 보기</a>
        <a href="https://naver.com">네이버</a>
        <img src="/logo.png" alt="카페 로고" loading="lazy" width="200" height="80">
        <a href="mailto:info@example.com?subject=문의">이메일 문의</a>
        <a href="tel:+82-2-1234-5678">전화 문의</a>
        <img src="/food.jpg" alt="">
      </body>
    </html>
  `;

	const page = parseHtml(html, BASE_URL, 200);

	it("title 을 올바르게 추출한다", () => {
		expect(page.title).toBe("테스트 카페 강남");
	});

	it("description 을 올바르게 추출한다", () => {
		expect(page.description).toBe("강남 최고의 카페입니다.");
	});

	it("h1 을 추출한다", () => {
		expect(page.h1).toBe("강남 카페 메인");
	});

	it("h2[] 를 모두 추출한다", () => {
		expect(page.h2).toEqual(["우리 메뉴", "오시는 길"]);
	});

	it("statusCode 를 올바르게 저장한다", () => {
		expect(page.statusCode).toBe(200);
	});

	it("robotsMeta 를 추출한다", () => {
		expect(page.robotsMeta).toBe("index,follow");
	});

	it("internalLinks 에 내부 링크만 포함된다", () => {
		expect(page.internalLinks).toContain("https://example.com/menu");
		expect(page.internalLinks).not.toContain("https://naver.com");
	});

	it("externalLinks 에 외부 링크만 포함된다", () => {
		// new URL("https://naver.com").toString() → "https://naver.com/" (trailing slash 자동 추가)
		expect(
			page.externalLinks.some((u) => u.startsWith("https://naver.com")),
		).toBe(true);
	});

	it("images 를 올바르게 추출한다", () => {
		expect(page.images).toHaveLength(2);
		expect(page.images[0]).toMatchObject({ alt: "카페 로고" });
		expect(page.images[1]).toMatchObject({ alt: "" });
	});

	it("img 의 loading/width/height 속성을 추출한다 (없으면 undefined)", () => {
		// 속성이 있는 첫 번째 이미지 (loading 은 소문자 정규화)
		expect(page.images[0]).toMatchObject({
			loading: "lazy",
			width: "200",
			height: "80",
		});
		// 속성이 없는 두 번째 이미지 → undefined (선언 안 함)
		expect(page.images[1].loading).toBeUndefined();
		expect(page.images[1].width).toBeUndefined();
		expect(page.images[1].height).toBeUndefined();
	});

	it("paragraphs/textBlocks 가 bodyText 와 별개로 블록 경계를 보존한다", () => {
		expect(page.bodyText).toContain(
			"아메리카노 4,500원. 케이크도 있어요. 메뉴 보기",
		);
		expect(page.paragraphs).toEqual(["아메리카노 4,500원. 케이크도 있어요."]);
		expect(page.textBlocks).toEqual([
			{ tag: "h1", text: "강남 카페 메인" },
			{ tag: "h2", text: "우리 메뉴" },
			{ tag: "h2", text: "오시는 길" },
			{ tag: "p", text: "아메리카노 4,500원. 케이크도 있어요." },
		]);
	});

	it("contactLinks 에 tel/mailto 를 구조화하고 HTTP 링크 배열에서는 제외한다", () => {
		expect(page.contactLinks).toEqual([
			{
				kind: "mailto",
				href: "mailto:info@example.com?subject=문의",
				value: "info@example.com",
				text: "이메일 문의",
			},
			{
				kind: "tel",
				href: "tel:+82-2-1234-5678",
				value: "+82-2-1234-5678",
				text: "전화 문의",
			},
		]);
		expect(page.internalLinks).not.toContain("mailto:info@example.com?subject=문의");
		expect(page.internalLinks).not.toContain("tel:+82-2-1234-5678");
		expect(page.externalLinks).not.toContain("mailto:info@example.com?subject=문의");
		expect(page.externalLinks).not.toContain("tel:+82-2-1234-5678");
	});

	it("linkTags 에서 rel/href/hreflang 를 추출한다 (rel 소문자, 없으면 null)", () => {
		const links = page.linkTags ?? [];
		// canonical + alternate(hreflang) + next = 3개
		expect(links.length).toBeGreaterThanOrEqual(3);
		// rel="alternate" hreflang="en"
		const alt = links.find((l) => l.rel === "alternate");
		expect(alt).toMatchObject({
			rel: "alternate",
			hreflang: "en",
			href: "https://example.com/en/",
		});
		// rel="next" — hreflang 없으면 null
		const next = links.find((l) => l.rel === "next");
		expect(next).toMatchObject({ rel: "next", hreflang: null });
		// canonical — hreflang 없음
		const canon = links.find((l) => l.rel === "canonical");
		expect(canon?.hreflang).toBeNull();
	});

	it("wordCount 가 0 보다 크다", () => {
		expect(page.wordCount).toBeGreaterThan(0);
	});

	it("canonical URL 을 추출한다", () => {
		expect(page.canonicalUrl).toBe("https://example.com/");
	});

	it("hasSchema 가 false 이다 (JSON-LD 없음)", () => {
		expect(page.hasSchema).toBe(false);
	});

	it("hasFAQ 가 false 이다", () => {
		expect(page.hasFAQ).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 케이스 2: missing title
// ---------------------------------------------------------------------------

describe("parseHtml — 케이스 2: title 없음", () => {
	const html = `
    <html>
      <head>
        <meta name="description" content="설명이 있지만 타이틀 없음">
      </head>
      <body>
        <h1>H1 텍스트</h1>
        <p>본문 내용</p>
      </body>
    </html>
  `;

	const page = parseHtml(html, BASE_URL, 200);

	it("title 이 null 이어야 한다", () => {
		expect(page.title).toBeNull();
	});

	it("description 은 추출된다", () => {
		expect(page.description).toBe("설명이 있지만 타이틀 없음");
	});

	it("h1 은 추출된다", () => {
		expect(page.h1).toBe("H1 텍스트");
	});
});

// ---------------------------------------------------------------------------
// 케이스 3: FAQ Schema — hasFAQ=true, hasSchema=true
// ---------------------------------------------------------------------------

describe("parseHtml — 케이스 3: FAQ Schema", () => {
	const faqSchema = JSON.stringify({
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: [
			{
				"@type": "Question",
				name: "영업시간이 어떻게 되나요?",
				acceptedAnswer: {
					"@type": "Answer",
					text: "매일 09:00 ~ 22:00 입니다.",
				},
			},
		],
	});

	const html = `
    <html>
      <head>
        <title>FAQ 페이지</title>
        <script type="application/ld+json">${faqSchema}</script>
      </head>
      <body>
        <h1>자주 묻는 질문</h1>
        <p>궁금하신 점을 모아봤습니다.</p>
      </body>
    </html>
  `;

	const page = parseHtml(html, BASE_URL, 200);

	it("hasSchema 가 true 이어야 한다", () => {
		expect(page.hasSchema).toBe(true);
	});

	it("hasFAQ 가 true 이어야 한다", () => {
		expect(page.hasFAQ).toBe(true);
	});

	it("schemaJsonLd 에 FAQPage 타입이 포함된다", () => {
		const schemas = page.schemaJsonLd as Array<Record<string, unknown>>;
		expect(schemas.some((s) => s["@type"] === "FAQPage")).toBe(true);
	});

	it("@graph 내부 FAQPage 도 hasFAQ=true 로 인식한다", () => {
		const graphSchema = JSON.stringify({
			"@context": "https://schema.org",
			"@graph": [
				{ "@type": "WebSite", name: "르시그널" },
				{ "@type": "FAQPage", mainEntity: [] },
			],
		});
		const graphHtml = `
      <html><head>
        <script type="application/ld+json">${graphSchema}</script>
      </head><body><h1>일반 안내</h1></body></html>
    `;
		const graphPage = parseHtml(graphHtml, BASE_URL, 200);

		expect(graphPage.hasFAQ).toBe(true);
	});

	it("잘못된 JSON-LD 는 무시된다", () => {
		const htmlWithBroken = `
      <html><head>
        <script type="application/ld+json">{ broken json }</script>
        <script type="application/ld+json">${faqSchema}</script>
      </head><body></body></html>
    `;
		const p = parseHtml(htmlWithBroken, BASE_URL, 200);
		// 깨진 JSON 은 skip, 유효한 1개만 파싱
		expect(p.schemaJsonLd).toHaveLength(1);
		expect(p.hasSchema).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 케이스 4: canonical URL 추출
// ---------------------------------------------------------------------------

describe("parseHtml — 케이스 4: canonical", () => {
	it("절대 canonical URL 을 올바르게 추출한다", () => {
		const html = `
      <html><head>
        <title>페이지 타이틀</title>
        <link rel="canonical" href="https://example.com/page">
      </head><body></body></html>
    `;
		const page = parseHtml(html, "https://example.com/page?utm=1", 200);
		expect(page.canonicalUrl).toBe("https://example.com/page");
	});

	it("상대 canonical URL 을 절대 URL 로 해석한다", () => {
		const html = `
      <html><head>
        <title>페이지 타이틀</title>
        <link rel="canonical" href="/about">
      </head><body></body></html>
    `;
		const page = parseHtml(html, "https://example.com/about?x=1", 200);
		expect(page.canonicalUrl).toBe("https://example.com/about");
	});

	it("canonical 이 없으면 null 을 반환한다", () => {
		const html = "<html><head><title>t</title></head><body></body></html>";
		const page = parseHtml(html, BASE_URL, 200);
		expect(page.canonicalUrl).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 케이스 5: multiple H1 — h1 은 첫 번째, h2[] 는 모두
// ---------------------------------------------------------------------------

describe("parseHtml — 케이스 5: multiple H1", () => {
	const html = `
    <html>
      <head><title>다중 H1 페이지</title></head>
      <body>
        <h1>첫 번째 H1</h1>
        <h2>섹션 A</h2>
        <h1>두 번째 H1</h1>
        <h2>섹션 B</h2>
        <h2>섹션 C</h2>
      </body>
    </html>
  `;

	const page = parseHtml(html, BASE_URL, 200);

	it("h1 은 첫 번째 H1 만 반환한다", () => {
		expect(page.h1).toBe("첫 번째 H1");
	});

	it("h2[] 는 모든 H2 를 반환한다", () => {
		expect(page.h2).toEqual(["섹션 A", "섹션 B", "섹션 C"]);
	});

	it("h2 는 H1 텍스트를 포함하지 않는다", () => {
		expect(page.h2).not.toContain("첫 번째 H1");
		expect(page.h2).not.toContain("두 번째 H1");
	});
});
describe("parseHtml — structured parser signals", () => {
	it("headingStructure 는 H1~H6 를 문서 순서대로 interleaving 보존한다", () => {
		const html = `
    <html><head><title>t</title></head>
      <body>
        <h2>먼저 나온 H2</h2>
        <h1>나중 H1</h1>
        <h3>하위 H3</h3>
        <h2>다음 H2</h2>
      </body>
    </html>
  `;
		const page = parseHtml(html, BASE_URL, 200);

		expect(page.h1).toBe("나중 H1");
		expect(page.h2).toEqual(["먼저 나온 H2", "다음 H2"]);
		expect(page.h3).toEqual(["하위 H3"]);
		expect(page.headingStructure).toEqual([
			{ level: 2, text: "먼저 나온 H2" },
			{ level: 1, text: "나중 H1" },
			{ level: 3, text: "하위 H3" },
			{ level: 2, text: "다음 H2" },
		]);
	});

	it("여러 단락과 텍스트 블록을 collapse 하지 않고 순서대로 노출한다", () => {
		const html = `
    <html><head><title>t</title></head>
      <body>
        <p>첫 문단입니다. 문장 경계를 유지합니다.</p>
        <div>래퍼 텍스트 <p>두 번째 문단입니다.</p></div>
        <ul><li>목록 블록</li></ul>
      </body>
    </html>
  `;
		const page = parseHtml(html, BASE_URL, 200);

		expect(page.bodyText).toBe(
			"첫 문단입니다. 문장 경계를 유지합니다. 래퍼 텍스트 두 번째 문단입니다. 목록 블록",
		);
		expect(page.paragraphs).toEqual([
			"첫 문단입니다. 문장 경계를 유지합니다.",
			"두 번째 문단입니다.",
		]);
		expect(page.textBlocks).toEqual([
			{ tag: "p", text: "첫 문단입니다. 문장 경계를 유지합니다." },
			{ tag: "p", text: "두 번째 문단입니다." },
			{ tag: "li", text: "목록 블록" },
		]);
	});
});

// ---------------------------------------------------------------------------
// 부가: hasFAQ — H2 키워드 기반
// ---------------------------------------------------------------------------

describe("parseHtml — hasFAQ H2 키워드", () => {
	it("H2 에 'FAQ' 가 포함되면 hasFAQ=true", () => {
		const html = `
      <html><head><title>t</title></head>
      <body>
        <h2>FAQ</h2>
        <h2>다른 섹션</h2>
      </body></html>
    `;
		const page = parseHtml(html, BASE_URL, 200);
		expect(page.hasFAQ).toBe(true);
	});

	it("H2 에 '자주 묻는 질문' 이 포함되면 hasFAQ=true", () => {
		const html = `
      <html><head><title>t</title></head>
      <body><h2>자주 묻는 질문</h2></body></html>
    `;
		const page = parseHtml(html, BASE_URL, 200);
		expect(page.hasFAQ).toBe(true);
	});

	it("FAQ 관련 키워드가 없으면 hasFAQ=false", () => {
		const html = `
      <html><head><title>t</title></head>
      <body><h2>일반 섹션</h2></body></html>
    `;
		const page = parseHtml(html, BASE_URL, 200);
		expect(page.hasFAQ).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 부가: failureReason 전달
// ---------------------------------------------------------------------------

describe("parseHtml — failureReason 전달", () => {
	it("failureReason 을 그대로 전달한다", () => {
		const page = parseHtml("", BASE_URL, 0, "DNS_FAILED");
		expect(page.failureReason).toBe("DNS_FAILED");
	});

	it("failureReason 이 없으면 undefined 이다", () => {
		const html = "<html><head><title>t</title></head><body></body></html>";
		const page = parseHtml(html, BASE_URL, 200);
		expect(page.failureReason).toBeUndefined();
	});
});

describe("parseHtml — language signals", () => {
	it("html lang 과 Content-Language 헤더를 구조화해서 전달한다", () => {
		const html =
			'<html lang="ko-KR"><head><title>t</title></head><body></body></html>';
		const page = parseHtml(html, BASE_URL, 200, {
			contentLanguageHeader: "ko-KR",
		});
		expect(page.htmlLang).toBe("ko-KR");
		expect(page.contentLanguageHeader).toBe("ko-KR");
	});
});

// ---------------------------------------------------------------------------
// rawHtml — TRANSIENT field (POLICY § 4.4/§ 8.4)
// ---------------------------------------------------------------------------

describe("parseHtml — rawHtml (TRANSIENT, POLICY § 4.4/§ 8.4)", () => {
	it("rawHtml 은 파싱된 ParsedPage 에 원시 HTML 을 그대로 담는다", () => {
		const html = '<html><head><title>t</title></head><body><p>hello</p></body></html>';
		const page = parseHtml(html, BASE_URL, 200);
		expect(page.rawHtml).toBe(html);
	});

	it("rawHtml 은 bodyText 와 다르다 (markup 포함)", () => {
		const html = '<html><head><title>t</title></head><body><p>visible text</p></body></html>';
		const page = parseHtml(html, BASE_URL, 200);
		// rawHtml contains tags; bodyText is only visible text
		expect(page.rawHtml).toContain("<p>");
		expect(page.bodyText).not.toContain("<p>");
	});

	it("빈 HTML 이면 rawHtml 도 빈 문자열이다", () => {
		const page = parseHtml("", BASE_URL, 200);
		expect(page.rawHtml).toBe("");
	});
});
