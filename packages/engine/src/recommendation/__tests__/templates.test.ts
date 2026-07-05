/**
 * X-SAG Core Engine — templates.ts 단위 테스트 (Phase P-C)
 *
 * @IMPL packages/core-engine/src/recommendation/templates.ts
 *
 * 검증 시나리오:
 * 1. applyContext — 토큰 치환 (단일/다중/중첩 경로)
 * 2. applyContext — 변수 누락 처리 (keep/blank/fallback)
 * 3. getTemplate — 등록된 룰 / 미등록 룰
 * 4. renderTemplate — 통합 사용
 * 5. listTemplateRuleIds — 등록 룰 수
 */

import { describe, expect, it } from "vitest";
import {
	applyContext,
	getTemplate,
	listTemplateRuleIds,
	renderTemplate,
} from "../templates.js";
import type { BusinessContext } from "../types.js";

const ctx: BusinessContext = {
	businessName: "테스트카페",
	industry: "카페",
	region: "서울 강남",
	mainServices: ["핸드드립", "원두판매", "베이커리"],
};

// ---------------------------------------------------------------------------
// Scenario 1: applyContext 기본 치환
// ---------------------------------------------------------------------------

describe("applyContext() — 기본 치환", () => {
	it("businessName 토큰을 치환한다", () => {
		expect(applyContext("어서오세요, {{businessName}}!", ctx)).toBe(
			"어서오세요, 테스트카페!",
		);
	});

	it("industry / region 토큰을 동시에 치환한다", () => {
		expect(applyContext("{{region}}의 {{industry}}", ctx)).toBe(
			"서울 강남의 카페",
		);
	});

	it("mainServices.0 인덱스 접근을 지원한다", () => {
		expect(applyContext("대표 서비스: {{mainServices.0}}", ctx)).toBe(
			"대표 서비스: 핸드드립",
		);
	});

	it("mainServices.1 / .2 인덱스 접근을 지원한다", () => {
		expect(applyContext("{{mainServices.1}}, {{mainServices.2}}", ctx)).toBe(
			"원두판매, 베이커리",
		);
	});

	it("동일 토큰 반복도 모두 치환된다", () => {
		expect(applyContext("{{businessName}} {{businessName}}", ctx)).toBe(
			"테스트카페 테스트카페",
		);
	});

	it("토큰이 없으면 원본 문자열 그대로", () => {
		expect(applyContext("그냥 평문입니다.", ctx)).toBe("그냥 평문입니다.");
	});

	it("빈 문자열은 빈 문자열 반환", () => {
		expect(applyContext("", ctx)).toBe("");
	});

	it("토큰 주위 공백은 trim 된다", () => {
		expect(applyContext("{{  businessName  }}", ctx)).toBe("테스트카페");
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: 변수 누락 처리
// ---------------------------------------------------------------------------

describe("applyContext() — 변수 누락", () => {
	it("기본(blank) 옵션은 미존재 토큰을 빈 문자열로 치환", () => {
		expect(applyContext("값: {{nonexistent}}", ctx)).toBe("값: ");
	});

	it("onMissing=keep 은 토큰을 그대로 유지", () => {
		expect(
			applyContext("값: {{nonexistent}}", ctx, { onMissing: "keep" }),
		).toBe("값: {{nonexistent}}");
	});

	it("onMissing=fallback 은 fallbackText 로 치환", () => {
		expect(
			applyContext("값: {{nonexistent}}", ctx, {
				onMissing: "fallback",
				fallbackText: "(미입력)",
			}),
		).toBe("값: (미입력)");
	});

	it("배열 인덱스 초과는 미존재로 취급", () => {
		expect(
			applyContext("{{mainServices.99}}", ctx, {
				onMissing: "fallback",
				fallbackText: "X",
			}),
		).toBe("X");
	});

	it("mainServices 가 비어있어도 안전 (빈 치환)", () => {
		const emptyCtx: BusinessContext = {
			businessName: "A",
			industry: "B",
			region: "C",
			mainServices: [],
		};
		expect(
			applyContext("{{mainServices.0}}", emptyCtx, { onMissing: "blank" }),
		).toBe("");
	});

	it("targetKeywords 옵션 컨텍스트도 치환 가능", () => {
		expect(
			applyContext("{{targetKeywords.0}}", {
				...ctx,
				targetKeywords: ["강남 카페", "핸드드립"],
			}),
		).toBe("강남 카페");
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: getTemplate
// ---------------------------------------------------------------------------

describe("getTemplate()", () => {
	it("등록된 룰 ID 는 템플릿을 반환한다", () => {
		const tpl = getTemplate("SEO-TITLE-001");
		expect(tpl).not.toBeNull();
		expect(tpl?.ruleId).toBe("SEO-TITLE-001");
		expect(tpl?.contextualTemplate).toContain("{{businessName}}");
		expect(["friendly", "professional", "urgent"]).toContain(tpl?.tone);
		expect(Array.isArray(tpl?.variations)).toBe(true);
	});

	it("미등록 룰 ID 는 null", () => {
		expect(getTemplate("NONEXISTENT-RULE-999")).toBeNull();
	});

	it("템플릿에는 baseText 폴백이 포함된다", () => {
		const tpl = getTemplate("SEO-META-001");
		expect(tpl?.baseText.length).toBeGreaterThan(10);
	});

	it("여러 카테고리(SEO/GEO/AEO/MOBILE/PERF) 모두 커버", () => {
		const ids = listTemplateRuleIds();
		expect(ids.some((id) => id.startsWith("SEO-"))).toBe(true);
		expect(ids.some((id) => id.startsWith("GEO-"))).toBe(true);
		expect(ids.some((id) => id.startsWith("AEO-"))).toBe(true);
		expect(ids.some((id) => id.startsWith("MOBILE-"))).toBe(true);
		expect(ids.some((id) => id.startsWith("PERF-"))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Scenario 4: listTemplateRuleIds
// ---------------------------------------------------------------------------

describe("listTemplateRuleIds()", () => {
	it("최소 30개 이상의 룰이 등록되어 있다", () => {
		const ids = listTemplateRuleIds();
		expect(ids.length).toBeGreaterThanOrEqual(30);
	});

	it("중복된 ruleId 가 없다", () => {
		const ids = listTemplateRuleIds();
		expect(new Set(ids).size).toBe(ids.length);
	});
});

// ---------------------------------------------------------------------------
// Scenario 5: renderTemplate (통합)
// ---------------------------------------------------------------------------

describe("renderTemplate()", () => {
	it("등록된 룰은 컨텍스트가 반영된 문자열을 반환", () => {
		const out = renderTemplate("SEO-TITLE-001", ctx, "fallback");
		expect(out).toContain("테스트카페");
		expect(out).not.toContain("{{businessName}}");
	});

	it("미등록 룰은 fallback 문자열을 그대로 반환", () => {
		const out = renderTemplate("UNKNOWN-RULE", ctx, "이건 폴백 문구입니다.");
		expect(out).toBe("이건 폴백 문구입니다.");
	});

	it("핵심 컨텍스트(매장명/지역/업종)가 자연스럽게 반영된다", () => {
		const out = renderTemplate("GEO-REGION-001", ctx, "fallback");
		expect(out).toContain("서울 강남");
		expect(out).toContain("테스트카페");
	});

	it("mainServices 비어 있어도 렌더 실패하지 않음 (빈 문자열로 치환)", () => {
		const emptyCtx: BusinessContext = {
			businessName: "솔로카페",
			industry: "카페",
			region: "부산",
			mainServices: [],
		};
		const out = renderTemplate("SEO-TITLE-001", emptyCtx, "fallback");
		// {{mainServices.0}} 는 빈 문자열로 치환되지만 throw 는 발생 안 함
		expect(out).toContain("솔로카페");
		expect(out).not.toContain("{{");
	});
});
