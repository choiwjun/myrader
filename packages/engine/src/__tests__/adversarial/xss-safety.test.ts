/**
 * BACKLOG-G P5 — adversarial / XSS 안전성 회귀 테스트.
 *
 * 검증 포인트:
 *  - parser 가 <script> 태그 내용을 bodyText 에 포함하지 않음
 *  - <style> 태그 내용도 bodyText 에 포함되지 않음
 *  - javascript: / data: 스킴 링크는 internal/external 어디에도 포함되지 않음
 *  - on* attribute 가 있어도 parser 가 throw 하지 않음
 *  - meta 의 content 안에 <script> 가 있어도 escape 된 텍스트로만 처리
 *  - 평가/실행이 절대 발생하지 않음 (cheerio 는 정적 HTML 파서)
 */

import { describe, expect, it, vi } from "vitest";
import { analyzePage } from "../../analyzers/index.js";
import { parseHtml } from "../../parser.js";
import {
	expectNoCrash,
	loadFixture,
	makeRuleContext,
	mockParsedPage,
} from "./helpers.js";

const BASE = "https://example.co.kr/";

describe("XSS safety — fixture 페이로드", () => {
	it("xss-attempt-001 — parser 가 throw 하지 않음", async () => {
		await expectNoCrash(() => {
			mockParsedPage(loadFixture("xss-attempt-001.html"));
		});
	});

	it("xss-attempt-001 — bodyText 에 alert 코드가 포함되지 않음", () => {
		const page = mockParsedPage(loadFixture("xss-attempt-001.html"));
		expect(page.bodyText).not.toContain("alert(");
		expect(page.bodyText).not.toContain("document.write");
	});

	it("xss-attempt-001 — script 태그 안의 코드가 schemaJsonLd 에 들어가지 않음", () => {
		const page = mockParsedPage(loadFixture("xss-attempt-001.html"));
		// ld+json 이 아닌 script 는 schemaJsonLd 에 포함되면 안 됨
		expect(page.schemaJsonLd).toEqual([]);
	});

	it("xss-attempt-001 — analyzePage 실행 시에도 코드 evaluation 발생 안 함", async () => {
		const page = mockParsedPage(loadFixture("xss-attempt-001.html"));
		const ctx = makeRuleContext(page);
		await expectNoCrash(() => {
			analyzePage(ctx);
		});
	});
});

describe("XSS safety — script 태그 변종", () => {
	it("<script>alert(1)</script> — bodyText 에서 제거", () => {
		const html =
			"<html><head><title>t</title></head><body><p>before</p><script>alert(1)</script><p>after</p></body></html>";
		const page = mockParsedPage(html);
		expect(page.bodyText).not.toContain("alert");
		expect(page.bodyText).toContain("before");
		expect(page.bodyText).toContain("after");
	});

	it("inline script 안의 한글 본문도 bodyText 에 포함되지 않음", () => {
		const html = `<html><head><title>t</title></head><body><script>const x = "비밀 본문";</script><p>실제 본문</p></body></html>`;
		const page = mockParsedPage(html);
		expect(page.bodyText).not.toContain("비밀 본문");
		expect(page.bodyText).toContain("실제 본문");
	});

	it("외부 script (src=)도 무시되고 schemaJsonLd 에 포함되지 않음", () => {
		const html = `<html><head><title>t</title><script src="https://evil.com/x.js"></script></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toEqual([]);
	});

	it("대문자 SCRIPT 태그도 제거", () => {
		const html =
			"<html><head><title>t</title></head><body><SCRIPT>alert(1)</SCRIPT><p>본문</p></body></html>";
		const page = mockParsedPage(html);
		expect(page.bodyText.toLowerCase()).not.toContain("alert");
	});

	it("script 안의 nested </script> 도 처리", () => {
		const html = `<html><head><title>t</title></head><body><script>var x = '<\\/script>';</script><p>실제</p></body></html>`;
		const page = mockParsedPage(html);
		expect(page.bodyText).toContain("실제");
	});

	it("script type=text/javascript 도 제거", () => {
		const html = `<html><head><title>t</title></head><body><script type="text/javascript">alert(1)</script><p>x</p></body></html>`;
		const page = mockParsedPage(html);
		expect(page.bodyText).not.toContain("alert");
	});

	it("script type=module 도 제거", () => {
		const html = `<html><head><title>t</title></head><body><script type="module">import x from 'evil'</script><p>x</p></body></html>`;
		const page = mockParsedPage(html);
		expect(page.bodyText).not.toContain("import");
	});

	it("style 태그 안의 CSS 도 bodyText 에서 제거", () => {
		const html = `<html><head><title>t</title></head><body><style>body { background: url('javascript:alert(1)'); }</style><p>실제</p></body></html>`;
		const page = mockParsedPage(html);
		expect(page.bodyText).not.toContain("javascript:");
		expect(page.bodyText).not.toContain("background:");
		expect(page.bodyText).toContain("실제");
	});

	it("noscript 태그도 bodyText 에서 제거", () => {
		const html =
			"<html><head><title>t</title></head><body><noscript>JS 비활성화 메시지</noscript><p>본문</p></body></html>";
		const page = mockParsedPage(html);
		expect(page.bodyText).not.toContain("JS 비활성화");
	});
});

describe("XSS safety — 위험 URL 스킴", () => {
	it("javascript: 링크는 link 에 포함되지 않음", () => {
		const html = `<html><head><title>t</title></head><body><a href="javascript:alert(1)">위험</a></body></html>`;
		const page = parseHtml(html, BASE, 200);
		expect(page.internalLinks).toHaveLength(0);
		expect(page.externalLinks).toHaveLength(0);
	});

	it("대문자 JAVASCRIPT: 도 무시", () => {
		const html = `<html><head><title>t</title></head><body><a href="JAVASCRIPT:alert(1)">x</a></body></html>`;
		const page = parseHtml(html, BASE, 200);
		// parser.ts: href.startsWith("javascript:") — 대소문자 구분
		// 대문자 JAVASCRIPT: 는 startsWith 체크를 통과하므로 URL parsing 시도
		// new URL("JAVASCRIPT:alert(1)") 는 valid 한 URL 객체를 만들지만 http/https 가 아니므로 skip
		expect(page.internalLinks).toHaveLength(0);
		expect(page.externalLinks).toHaveLength(0);
	});

	it("data:text/html 링크도 link 에 포함되지 않음 (http/https 만 수집)", () => {
		const html = `<html><head><title>t</title></head><body><a href="data:text/html,<script>alert(1)</script>">x</a></body></html>`;
		const page = parseHtml(html, BASE, 200);
		expect(page.internalLinks).toHaveLength(0);
		expect(page.externalLinks).toHaveLength(0);
	});

	it("vbscript: 링크도 무시 (http 만 수집)", () => {
		const html = `<html><head><title>t</title></head><body><a href="vbscript:msgbox(1)">x</a></body></html>`;
		const page = parseHtml(html, BASE, 200);
		expect(page.internalLinks).toHaveLength(0);
		expect(page.externalLinks).toHaveLength(0);
	});

	it("mailto: 링크는 무시", () => {
		const html = `<html><head><title>t</title></head><body><a href="mailto:a@b.com">메일</a></body></html>`;
		const page = parseHtml(html, BASE, 200);
		expect(page.internalLinks).toHaveLength(0);
		expect(page.externalLinks).toHaveLength(0);
	});

	it("tel: 링크도 무시", () => {
		const html = `<html><head><title>t</title></head><body><a href="tel:01012345678">전화</a></body></html>`;
		const page = parseHtml(html, BASE, 200);
		expect(page.internalLinks).toHaveLength(0);
		expect(page.externalLinks).toHaveLength(0);
	});

	it("# 으로 시작하는 anchor 링크도 무시", () => {
		const html = `<html><head><title>t</title></head><body><a href="#top">위로</a></body></html>`;
		const page = parseHtml(html, BASE, 200);
		expect(page.internalLinks).toHaveLength(0);
	});

	it("about:blank 같은 about: 스킴도 http 가 아니므로 무시", () => {
		const html = `<html><head><title>t</title></head><body><a href="about:blank">about</a></body></html>`;
		const page = parseHtml(html, BASE, 200);
		expect(page.internalLinks).toHaveLength(0);
		expect(page.externalLinks).toHaveLength(0);
	});
});

describe("XSS safety — on* attribute / 인라인 이벤트 핸들러", () => {
	it("onload, onclick, onerror 등이 있어도 parser 가 throw 하지 않음", async () => {
		await expectNoCrash(() => {
			const html = `<html><head><title>t</title></head><body onload="evil()"><img src="/i.png" onerror="alert(1)"><a href="/x" onclick="evil()">x</a></body></html>`;
			mockParsedPage(html);
		});
	});

	it("on* attribute 의 값은 bodyText 에 포함되지 않음 (attribute 라서)", () => {
		const html = `<html><head><title>t</title></head><body><p onclick="alert('xss-attempt')">실제 본문</p></body></html>`;
		const page = mockParsedPage(html);
		expect(page.bodyText).not.toContain("xss-attempt");
		expect(page.bodyText).toContain("실제 본문");
	});

	it("iframe 태그가 있어도 parser 가 throw 하지 않음", async () => {
		await expectNoCrash(() => {
			const html = `<html><head><title>t</title></head><body><iframe src="javascript:alert(1)"></iframe></body></html>`;
			mockParsedPage(html);
		});
	});

	it("svg + onload 도 graceful", async () => {
		await expectNoCrash(() => {
			const html = `<html><head><title>t</title></head><body><svg onload="alert(1)"></svg></body></html>`;
			mockParsedPage(html);
		});
	});

	it("svg 안의 <script> 도 처리", () => {
		const html =
			"<html><head><title>t</title></head><body><svg><script>alert(1)</script></svg><p>x</p></body></html>";
		const page = mockParsedPage(html);
		expect(page.bodyText).not.toContain("alert");
	});

	it("object/embed 태그도 throw 안 함", async () => {
		await expectNoCrash(() => {
			const html = `<html><head><title>t</title></head><body><object data="javascript:alert(1)"></object><embed src="data:..."></embed></body></html>`;
			mockParsedPage(html);
		});
	});

	it("meta http-equiv=refresh + javascript: 도 무시", () => {
		const html = `<html><head><title>t</title><meta http-equiv="refresh" content="0; url=javascript:alert(1)"></head><body></body></html>`;
		const page = mockParsedPage(html);
		// meta 는 그대로 수집되지만 평가는 절대 발생하지 않음
		expect(page.meta["refresh"]).toBeTruthy();
	});

	it("base href 가 javascript: 여도 처리", () => {
		const html = `<html><head><title>t</title><base href="javascript:alert(1)"></head><body><a href="/x">x</a></body></html>`;
		// throw 만 안 하면 됨
		expect(() => parseHtml(html, BASE, 200)).not.toThrow();
	});
});

describe("XSS safety — meta 의 content 안 위험 페이로드", () => {
	it("meta description content 에 script 태그 텍스트가 들어가도 안전", () => {
		const html = `<html><head><title>t</title><meta name="description" content="<script>alert(1)</script>"></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.description).toBeTruthy();
		// description 은 단순 문자열로 저장되며 평가되지 않음
		expect(typeof page.description).toBe("string");
	});

	it("og:title 의 content 가 <img onerror> 여도 안전", () => {
		const html = `<html><head><title>t</title><meta property="og:title" content="<img src=x onerror=alert(1)>"></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.meta["og:title"]).toBeTruthy();
	});

	it("evaluation 이 절대 일어나지 않음 (window/global side effect 검증)", () => {
		const beforeKeys = Object.keys(globalThis).length;
		const html = `<html><head><title>t</title><script>globalThis.xssTest_${Date.now()} = true;</script></head><body></body></html>`;
		mockParsedPage(html);
		const afterKeys = Object.keys(globalThis).length;
		expect(afterKeys).toBe(beforeKeys);
	});

	it("schemaJsonLd 에 사용자가 inject 한 evil JSON 이 들어가도 단순 데이터로 보존", () => {
		// 사용자가 ld+json 안에 위험한 JSON 을 넣어도 parser 는 단순히 JSON.parse 만 함
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">{"@type": "Article", "headline": "&lt;script&gt;alert(1)&lt;/script&gt;"}</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toHaveLength(1);
		// 단순 데이터로 보존되어야 한다
		const article = page.schemaJsonLd[0] as Record<string, unknown>;
		expect(article["@type"]).toBe("Article");
	});

	it("__proto__ 등 prototype 오염 시도 페이로드도 안전", () => {
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">{"__proto__": {"polluted": true}}</script>
    </head><body></body></html>`;
		mockParsedPage(html);
		// JSON.parse 는 __proto__ 를 own property 로 만들지 않거나, 만들어도 prototype chain 에는 영향 X
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});
});

describe("XSS safety — console.error / console.warn 미발생", () => {
	it("정상 페이로드에서 console.error 호출 안 됨", () => {
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const html =
				"<html><head><title>t</title></head><body><p>본문</p></body></html>";
			mockParsedPage(html);
			expect(errSpy).not.toHaveBeenCalled();
		} finally {
			errSpy.mockRestore();
		}
	});

	it("깨진 JSON-LD 가 있어도 console.error 미호출 (catch 후 skip)", () => {
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const html = `<html><head><title>t</title>
        <script type="application/ld+json">{ broken json }</script>
      </head><body></body></html>`;
			mockParsedPage(html);
			expect(errSpy).not.toHaveBeenCalled();
		} finally {
			errSpy.mockRestore();
		}
	});
});
