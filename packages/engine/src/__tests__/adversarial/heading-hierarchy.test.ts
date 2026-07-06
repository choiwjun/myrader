/**
 * BACKLOG-G P5 — adversarial / heading hierarchy 회귀 테스트.
 *
 * 검증 포인트:
 *  - h1 → h4 점프, 다중 h1, 빈 heading, 깊이 5+ nesting
 *  - parser 의 headingStructure 가 모든 H1~H6 를 수집 (Phase O-D)
 *  - h2, h3 배열이 본문 순서대로 추출
 *  - 빈/공백만 있는 heading 은 제외
 *  - SEO-HEADING-HIERARCHY-001 룰이 NaN 없이 동작
 */

import { describe, expect, it } from "vitest";
import { seoHeadingHierarchy001 } from "../../analyzers/rules/seo-rules.js";
import {
	expectValidRuleResult,
	makeRuleContext,
	mockParsedPage,
} from "./helpers.js";

describe("heading hierarchy — 다중 H1", () => {
	it("H1 이 두 개 있어도 첫 번째만 h1 필드, 나머지는 headingStructure 에 포함", () => {
		const html =
			"<html><head><title>t</title></head><body><h1>첫번째</h1><h1>두번째</h1></body></html>";
		const page = mockParsedPage(html);
		expect(page.h1).toBe("첫번째");
		const h1Count =
			page.headingStructure?.filter((h) => h.level === 1).length ?? 0;
		expect(h1Count).toBe(2);
	});

	it("H1 이 다섯 개 있어도 graceful", () => {
		const html = `<html><head><title>t</title></head><body>
      <h1>1</h1><h1>2</h1><h1>3</h1><h1>4</h1><h1>5</h1>
    </body></html>`;
		const page = mockParsedPage(html);
		const h1Count =
			page.headingStructure?.filter((h) => h.level === 1).length ?? 0;
		expect(h1Count).toBe(5);
	});

	it("H1 이 0개여도 graceful", () => {
		const html =
			"<html><head><title>t</title></head><body><h2>섹션</h2></body></html>";
		const page = mockParsedPage(html);
		expect(page.h1).toBeNull();
	});
});

describe("heading hierarchy — 레벨 점프", () => {
	it("H1 → H4 직접 점프 (H2/H3 건너뛰기)", () => {
		const html = `<html><head><title>t</title></head><body>
      <h1>제목</h1><h4>너무 깊은 서브제목</h4>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.headingStructure?.map((h) => h.level)).toEqual([1, 4]);
	});

	it("H1 → H6 직접 점프", () => {
		const html = `<html><head><title>t</title></head><body>
      <h1>x</h1><h6>너무 깊음</h6>
    </body></html>`;
		const page = mockParsedPage(html);
		const levels = page.headingStructure?.map((h) => h.level) ?? [];
		expect(levels).toContain(1);
		expect(levels).toContain(6);
	});

	it("H2 부터 시작 (H1 없음)", () => {
		const html = `<html><head><title>t</title></head><body>
      <h2>섹션 1</h2><h3>서브 1</h3>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h1).toBeNull();
		expect(page.headingStructure?.[0]?.level).toBe(2);
	});

	it("H6 부터 시작 (역순)", () => {
		const html = `<html><head><title>t</title></head><body>
      <h6>x</h6><h5>x</h5><h4>x</h4>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h1).toBeNull();
	});

	it("정상 hierarchy (H1 → H2 → H3 순서)", () => {
		const html = `<html><head><title>t</title></head><body>
      <h1>제목</h1>
      <h2>섹션</h2>
      <h3>하위</h3>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h1).toBe("제목");
		expect(page.h2).toEqual(["섹션"]);
		expect(page.h3).toEqual(["하위"]);
	});
});

describe("heading hierarchy — 빈/공백 heading", () => {
	it("빈 H1 (<h1></h1>) 은 h1 필드에서 null 로 처리", () => {
		// parser.ts: $("h1").first().text().trim() || null
		// 첫 번째 H1 이 빈 문자열이면 falsy → null
		const html =
			"<html><head><title>t</title></head><body><h1></h1></body></html>";
		const page = mockParsedPage(html);
		expect(page.h1).toBeNull();
	});

	it("공백만 있는 H1 (<h1>   </h1>) 도 trim 후 null", () => {
		const html =
			"<html><head><title>t</title></head><body><h1>   </h1></body></html>";
		const page = mockParsedPage(html);
		expect(page.h1).toBeNull();
	});

	it("줄바꿈/탭만 있는 H1 도 trim 후 null", () => {
		const html =
			"<html><head><title>t</title></head><body><h1>\n\t\r</h1></body></html>";
		const page = mockParsedPage(html);
		expect(page.h1).toBeNull();
	});

	it("빈 H1 + 비어있지 않은 H1 — first() 가 빈 H1 을 선택하므로 null (현재 동작)", () => {
		// parser.ts 동작: $("h1").first().text().trim() || null
		// first() 가 빈 H1 을 선택하면 text='' → trim='' → falsy → null
		const html =
			"<html><head><title>t</title></head><body><h1></h1><h1>실제</h1></body></html>";
		const page = mockParsedPage(html);
		expect(page.h1).toBeNull();
	});

	it("H2 배열에서 빈 항목 제외", () => {
		const html = `<html><head><title>t</title></head><body>
      <h2>A</h2><h2></h2><h2>B</h2><h2>   </h2>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h2).toEqual(["A", "B"]);
	});

	it("HTML 주석만 들어있는 heading 도 빈 것으로 처리", () => {
		const html = `<html><head><title>t</title></head><body>
      <h2><!-- comment --></h2><h2>실제</h2>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h2).toEqual(["실제"]);
	});

	it("inline 태그만 있고 텍스트 없는 heading 도 빈 것으로 처리", () => {
		const html = `<html><head><title>t</title></head><body>
      <h2><span></span><b></b></h2><h2>실제</h2>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h2).toEqual(["실제"]);
	});
});

describe("heading hierarchy — 깊이 5+ nesting", () => {
	it("H1 안에 H2 (잘못된 nesting) 도 graceful", () => {
		const html = `<html><head><title>t</title></head><body>
      <h1>외부<h2>내부</h2>외부 끝</h1>
    </body></html>`;
		const page = mockParsedPage(html);
		// cheerio 는 부모/자식을 평탄화한다
		expect(page.h1).toBeTruthy();
		expect(page.h2.length).toBeGreaterThanOrEqual(1);
	});

	it("div 안에 깊게 nested 된 H2 도 추출", () => {
		const html = `<html><head><title>t</title></head><body>
      <div><div><div><div><div><h2>깊은 H2</h2></div></div></div></div></div>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h2).toContain("깊은 H2");
	});

	it("table > tbody > tr > td 안의 H3 도 추출", () => {
		const html = `<html><head><title>t</title></head><body>
      <table><tbody><tr><td><h3>표 안 제목</h3></td></tr></tbody></table>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h3).toContain("표 안 제목");
	});

	it("article > section > article 등 sectioning content 안의 heading", () => {
		const html = `<html><head><title>t</title></head><body>
      <article>
        <h1>article 제목</h1>
        <section>
          <h2>section A</h2>
          <article>
            <h3>nested article 제목</h3>
          </article>
        </section>
      </article>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h1).toBe("article 제목");
		expect(page.h2).toContain("section A");
		expect(page.h3).toContain("nested article 제목");
	});
});

describe("heading hierarchy — inline 태그 포함 텍스트", () => {
	it("strong/em 안의 텍스트도 헤딩 텍스트에 포함", () => {
		const html = `<html><head><title>t</title></head><body>
      <h1>강남 <strong>최고</strong> <em>카페</em></h1>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h1).toBe("강남 최고 카페");
	});

	it("a 태그 안의 텍스트도 헤딩에 포함", () => {
		const html = `<html><head><title>t</title></head><body>
      <h1><a href="/x">링크 제목</a></h1>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h1).toBe("링크 제목");
	});

	it("img 태그만 있는 heading (텍스트 없음) — first() 가 빈 H1 을 선택해 null", () => {
		// parser.ts 동작: alt 텍스트는 .text() 에 포함되지 않으므로 first() = ''
		const html = `<html><head><title>t</title></head><body>
      <h1><img src="/i.png" alt="제목 이미지"></h1>
      <h1>실제 제목</h1>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h1).toBeNull();
	});

	it("br 태그가 포함된 heading", () => {
		const html = `<html><head><title>t</title></head><body>
      <h1>첫 줄<br>두 번째 줄</h1>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h1).toContain("첫 줄");
		expect(page.h1).toContain("두 번째 줄");
	});
});

describe("heading hierarchy — Phase O-D 룰 (seoHeadingHierarchy001)", () => {
	it("정상 hierarchy (H1 → H2 → H3) — passed=true 가능", () => {
		const html = `<html><head><title>t</title></head><body>
      <h1>제목</h1><h2>섹션</h2><h3>하위</h3>
    </body></html>`;
		const page = mockParsedPage(html);
		const ctx = makeRuleContext(page);
		const result = seoHeadingHierarchy001(ctx);
		expectValidRuleResult(result);
	});

	it("H1 → H4 점프 — 룰이 throw 없이 결과 반환", () => {
		const html = `<html><head><title>t</title></head><body>
      <h1>x</h1><h4>y</h4>
    </body></html>`;
		const page = mockParsedPage(html);
		const ctx = makeRuleContext(page);
		const result = seoHeadingHierarchy001(ctx);
		expectValidRuleResult(result);
	});

	it("H1 0개 + H2 만 있어도 룰이 결과 반환", () => {
		const html = `<html><head><title>t</title></head><body>
      <h2>x</h2><h2>y</h2>
    </body></html>`;
		const page = mockParsedPage(html);
		const ctx = makeRuleContext(page);
		const result = seoHeadingHierarchy001(ctx);
		expectValidRuleResult(result);
	});

	it("heading 이 하나도 없어도 룰이 결과 반환", () => {
		const html =
			"<html><head><title>t</title></head><body><p>no headings</p></body></html>";
		const page = mockParsedPage(html);
		const ctx = makeRuleContext(page);
		const result = seoHeadingHierarchy001(ctx);
		expectValidRuleResult(result);
	});

	it("매우 많은 heading (100개 H2) 도 처리", () => {
		const h2Tags = Array.from(
			{ length: 100 },
			(_, i) => `<h2>섹션 ${i}</h2>`,
		).join("");
		const html = `<html><head><title>t</title></head><body><h1>x</h1>${h2Tags}</body></html>`;
		const page = mockParsedPage(html);
		expect(page.h2.length).toBe(100);
		const ctx = makeRuleContext(page);
		const result = seoHeadingHierarchy001(ctx);
		expectValidRuleResult(result);
	});
});

describe("heading hierarchy — headingStructure 필드", () => {
	it("모든 H1~H6 가 headingStructure 에 수집됨", () => {
		const html = `<html><head><title>t</title></head><body>
      <h1>1</h1><h2>2</h2><h3>3</h3><h4>4</h4><h5>5</h5><h6>6</h6>
    </body></html>`;
		const page = mockParsedPage(html);
		const levels = page.headingStructure?.map((h) => h.level).sort() ?? [];
		expect(levels).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it("headingStructure 가 항상 배열 (heading 없어도 빈 배열)", () => {
		const page = mockParsedPage("<html></html>");
		expect(Array.isArray(page.headingStructure)).toBe(true);
	});

	it("headingStructure 각 항목 — level 1~6, text 비어있지 않음", () => {
		const html = `<html><head><title>t</title></head><body>
      <h1>x</h1><h2>y</h2><h6>z</h6>
    </body></html>`;
		const page = mockParsedPage(html);
		for (const h of page.headingStructure ?? []) {
			expect(h.level).toBeGreaterThanOrEqual(1);
			expect(h.level).toBeLessThanOrEqual(6);
			expect(typeof h.text).toBe("string");
			expect(h.text.length).toBeGreaterThan(0);
		}
	});

	it("headingStructure 는 레벨별 그룹이 아니라 실제 문서 순서 interleaving 을 보존", () => {
		const html = `<html><head><title>t</title></head><body>
      <h2>먼저 나온 H2</h2>
      <h4>깊은 제목</h4>
      <h1>나중 H1</h1>
      <h3>하위 H3</h3>
      <h2>다음 H2</h2>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.h1).toBe("나중 H1");
		expect(page.h2).toEqual(["먼저 나온 H2", "다음 H2"]);
		expect(page.h3).toEqual(["하위 H3"]);
		expect(page.headingStructure).toEqual([
			{ level: 2, text: "먼저 나온 H2" },
			{ level: 4, text: "깊은 제목" },
			{ level: 1, text: "나중 H1" },
			{ level: 3, text: "하위 H3" },
			{ level: 2, text: "다음 H2" },
		]);
	});
	it("listTableCount — ul/ol/table 카운트 정확", () => {
		const html = `<html><head><title>t</title></head><body>
      <ul><li>a</li></ul>
      <ul><li>b</li></ul>
      <ol><li>c</li></ol>
      <table><tr><td>x</td></tr></table>
      <table><tr><td>y</td></tr></table>
      <table><tr><td>z</td></tr></table>
    </body></html>`;
		const page = mockParsedPage(html);
		expect(page.listTableCount?.ul).toBe(2);
		expect(page.listTableCount?.ol).toBe(1);
		expect(page.listTableCount?.table).toBe(3);
	});

	it("listTableCount — 빈 페이지에서도 모두 0", () => {
		const page = mockParsedPage("<html></html>");
		expect(page.listTableCount?.ul).toBe(0);
		expect(page.listTableCount?.ol).toBe(0);
		expect(page.listTableCount?.table).toBe(0);
	});
});
