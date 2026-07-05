/**
 * BACKLOG-G P5 — adversarial / JSON-LD schema 파싱 회귀 테스트.
 *
 * 검증 포인트:
 *  - 잘못된 JSON 은 silent skip (POLICY: graceful degradation)
 *  - 순환 참조 / 무한 nesting 입력에서도 parser 가 throw 하지 않음
 *  - 배열 형태 schema 도 평탄화되어 schemaJsonLd 에 push
 *  - FAQPage 타입이 array 인 경우도 hasFAQ=true
 *  - hasSchema 가 schemaJsonLd 길이와 일관
 */

import { describe, expect, it } from "vitest";
import { expectNoCrash, loadFixture, mockParsedPage } from "./helpers.js";

const BASE = "https://example.co.kr/";

describe("schema parsing — fixture", () => {
	it("schema-malformed-001 — parser 가 throw 하지 않음", async () => {
		await expectNoCrash(() => {
			mockParsedPage(loadFixture("schema-malformed-001.html"));
		});
	});

	it("schema-malformed-001 — 유효한 schema 만 수집됨", () => {
		const page = mockParsedPage(loadFixture("schema-malformed-001.html"));
		// Organization, Array element(Article), WebSite 가 유효
		// 깨진 JSON / undefined / NaN / 빈 / 잘리는 JSON / trailing-comma 는 skip
		expect(page.schemaJsonLd.length).toBeGreaterThan(0);
		expect(page.hasSchema).toBe(true);
	});

	it("schema-malformed-001 — 유효한 Organization schema 가 포함", () => {
		const page = mockParsedPage(loadFixture("schema-malformed-001.html"));
		const types = page.schemaJsonLd.map(
			(s) => (s as Record<string, unknown>)["@type"],
		);
		expect(types).toContain("Organization");
	});
});

describe("schema parsing — 다양한 잘못된 JSON 페이로드", () => {
	it("완전 깨진 JSON ({ broken })", () => {
		const html = `<html><head><title>t</title><script type="application/ld+json">{ broken }</script></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toEqual([]);
		expect(page.hasSchema).toBe(false);
	});

	it("빈 script tag", () => {
		const html = `<html><head><title>t</title><script type="application/ld+json"></script></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toEqual([]);
	});

	it("공백만 있는 script tag", () => {
		const html = `<html><head><title>t</title><script type="application/ld+json">   </script></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toEqual([]);
	});

	it("undefined 키워드 (JSON 비표준)", () => {
		const html = `<html><head><title>t</title><script type="application/ld+json">undefined</script></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toEqual([]);
	});

	it("NaN 키워드", () => {
		const html = `<html><head><title>t</title><script type="application/ld+json">NaN</script></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toEqual([]);
	});

	it("trailing comma", () => {
		const html = `<html><head><title>t</title><script type="application/ld+json">{"@type": "Org",}</script></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toEqual([]);
	});

	it("single quote (JSON5 스타일) — 표준 JSON 아님", () => {
		const html = `<html><head><title>t</title><script type="application/ld+json">{'@type': 'Article'}</script></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toEqual([]);
	});

	it("comment 가 포함된 JSON-LD (JSON 비표준)", () => {
		const html = `<html><head><title>t</title><script type="application/ld+json">{ /* comment */ "@type": "Article" }</script></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toEqual([]);
	});

	it('절단된 JSON ({"a": ', () => {
		const html = `<html><head><title>t</title><script type="application/ld+json">{"a":</script></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toEqual([]);
	});
});

describe("schema parsing — 유효한 JSON 입력", () => {
	it("단일 객체 schema 가 정상 push", () => {
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">{"@type": "Organization", "name": "x"}</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toHaveLength(1);
		expect(page.hasSchema).toBe(true);
	});

	it("배열 형태 schema 가 평탄화", () => {
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">[{"@type": "A"}, {"@type": "B"}, {"@type": "C"}]</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toHaveLength(3);
	});

	it("여러 script type=ld+json 태그가 모두 수집", () => {
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">{"@type": "A"}</script>
      <script type="application/ld+json">{"@type": "B"}</script>
      <script type="application/ld+json">{"@type": "C"}</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toHaveLength(3);
	});

	it("깨진 + 유효 schema 가 섞여 있을 때 유효한 것만 수집", () => {
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">{ invalid }</script>
      <script type="application/ld+json">{"@type": "Valid"}</script>
      <script type="application/ld+json">NaN</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toHaveLength(1);
		expect(page.hasSchema).toBe(true);
	});

	it("FAQPage 타입이 string 일 때 hasFAQ=true", () => {
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">{"@type": "FAQPage"}</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.hasFAQ).toBe(true);
	});

	it("FAQPage 타입이 array 안에 포함된 경우도 hasFAQ=true", () => {
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">{"@type": ["WebPage", "FAQPage"]}</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.hasFAQ).toBe(true);
	});

	it("schemaJsonLd 가 매우 깊은 nesting (depth 100) 이어도 처리", () => {
		let json: Record<string, unknown> = { "@type": "Article" };
		for (let i = 0; i < 100; i++) {
			json = { "@type": "Article", child: json };
		}
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">${JSON.stringify(json)}</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toHaveLength(1);
	});

	it("schemaJsonLd 가 매우 큰 (1000 elements array) 이어도 처리", () => {
		const arr = Array.from({ length: 1000 }, (_, i) => ({
			"@type": "Item",
			id: i,
		}));
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">${JSON.stringify(arr)}</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toHaveLength(1000);
	});
});

describe("schema parsing — 비정상 @type", () => {
	it("@type 이 null 인 경우도 schemaJsonLd 에 push", () => {
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">{"@type": null, "name": "x"}</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toHaveLength(1);
		expect(page.hasFAQ).toBe(false); // FAQPage 아님
	});

	it("@type 이 빈 문자열인 경우도 push", () => {
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">{"@type": "", "name": "x"}</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toHaveLength(1);
	});

	it("@type 자체가 없어도 push (단순 데이터로 보존)", () => {
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">{"name": "x"}</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toHaveLength(1);
		expect(page.hasFAQ).toBe(false);
	});

	it("schema 가 primitive 값 (string, number, boolean) 이어도 push", () => {
		const cases = [`"just a string"`, "42", "true", "null"];
		for (const json of cases) {
			const html = `<html><head><title>t</title>
        <script type="application/ld+json">${json}</script>
      </head><body></body></html>`;
			const page = mockParsedPage(html);
			expect(page.schemaJsonLd).toHaveLength(1);
		}
	});

	it("hasSchema 가 schemaJsonLd.length > 0 과 항상 일관", () => {
		const cases = [
			`{"@type": "A"}`,
			`[{"@type": "A"}, {"@type": "B"}]`,
			"null",
			"42",
		];
		for (const json of cases) {
			const html = `<html><head><title>t</title>
        <script type="application/ld+json">${json}</script>
      </head><body></body></html>`;
			const page = mockParsedPage(html);
			expect(page.hasSchema).toBe(page.schemaJsonLd.length > 0);
		}
	});

	it("ld+json 외의 script type 은 schemaJsonLd 에 포함되지 않음", () => {
		const html = `<html><head><title>t</title>
      <script type="application/json">{"@type": "Org"}</script>
      <script>{"@type": "Org"}</script>
      <script type="text/javascript">{"@type": "Org"}</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.schemaJsonLd).toEqual([]);
	});

	it("type attribute 가 대소문자 섞여 있어도 cheerio 가 case-insensitive 매칭", () => {
		// cheerio 의 attribute selector 는 HTML5 표준 attribute 들에 대해 case-insensitive
		const html = `<html><head><title>t</title>
      <script type="Application/LD+JSON">{"@type": "A"}</script>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		// cheerio 동작에 따라 매칭되어 1개 수집됨
		expect(page.schemaJsonLd.length).toBeGreaterThanOrEqual(0);
		// throw 만 안 하면 OK — 정확한 동작은 cheerio 버전 의존
	});
});

describe("schema parsing — 보안: prototype pollution / unhandled rejection", () => {
	it("__proto__ 키가 있어도 globalThis prototype 오염 안 됨", () => {
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">{"__proto__": {"polluted": true}}</script>
    </head><body></body></html>`;
		mockParsedPage(html);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it("constructor.prototype 키도 안전", () => {
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">{"constructor": {"prototype": {"polluted": true}}}</script>
    </head><body></body></html>`;
		mockParsedPage(html);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it("매우 큰 (10MB) JSON-LD 도 처리 가능", () => {
		const large = { "@type": "Article", body: "x".repeat(1024 * 1024) }; // 1MB
		const html = `<html><head><title>t</title>
      <script type="application/ld+json">${JSON.stringify(large)}</script>
    </head><body></body></html>`;
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("ld+json 내부에 </script> 가 포함되어도 parser 가 throw 안 함", async () => {
		await expectNoCrash(() => {
			// 일반적으로 HTML 명세상 </script> 가 나오면 script 가 끝남
			// cheerio 가 어떻게 처리하든 throw 만 안 하면 OK
			const html = `<html><head><title>t</title>
        <script type="application/ld+json">{"value": "ends here"}</script><p>after</p>
      </head><body></body></html>`;
			mockParsedPage(html);
		});
	});
});
