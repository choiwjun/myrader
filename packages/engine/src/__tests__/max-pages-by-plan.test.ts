/**
 * X-SAG Core Engine — getMaxPagesForPlan 단위 테스트 (TASK-CORE-017, Audit 4 E)
 *
 * Plan tier 별 사이트당 분석 페이지 수 매핑 검증.
 *
 *   guest:    10
 *   free:     20
 *   basic:    30
 *   pro:      50  (DEFAULT 와 일치)
 *   business: 100
 *
 * 알 수 없는 / 누락된 plan → DEFAULT_CRAWL_OPTIONS.maxPagesPerSite (50) 폴백.
 *
 * 본 테스트는 함수의 결정성과 폴백 안전성을 보장한다.
 */

import { describe, expect, it } from "vitest";
import {
	DEFAULT_CRAWL_OPTIONS,
	MAX_PAGES_BY_PLAN,
	getMaxPagesForPlan,
} from "../types.js";

// DEFAULT 값을 캡처 — 본문에서 50 으로 변경되더라도 테스트가 따라간다
const DEFAULT_MAX_PAGES = DEFAULT_CRAWL_OPTIONS.maxPagesPerSite;

// ---------------------------------------------------------------------------
// 1. 알려진 plan tier — 정확한 페이지 수 반환
// ---------------------------------------------------------------------------

describe("getMaxPagesForPlan — 알려진 plan tier", () => {
	it("guest → 10", () => {
		expect(getMaxPagesForPlan("guest")).toBe(10);
	});

	it("free → 20", () => {
		expect(getMaxPagesForPlan("free")).toBe(20);
	});

	it("basic → 30", () => {
		expect(getMaxPagesForPlan("basic")).toBe(30);
	});

	it("pro → 50", () => {
		expect(getMaxPagesForPlan("pro")).toBe(50);
	});

	it("business → 100", () => {
		expect(getMaxPagesForPlan("business")).toBe(100);
	});

	it("MAX_PAGES_BY_PLAN 정의와 일치 (단일 진실원본)", () => {
		expect(getMaxPagesForPlan("guest")).toBe(MAX_PAGES_BY_PLAN.guest);
		expect(getMaxPagesForPlan("free")).toBe(MAX_PAGES_BY_PLAN.free);
		expect(getMaxPagesForPlan("basic")).toBe(MAX_PAGES_BY_PLAN.basic);
		expect(getMaxPagesForPlan("pro")).toBe(MAX_PAGES_BY_PLAN.pro);
		expect(getMaxPagesForPlan("business")).toBe(MAX_PAGES_BY_PLAN.business);
	});
});

// ---------------------------------------------------------------------------
// 2. 누락 / 알 수 없는 plan → DEFAULT 폴백
// ---------------------------------------------------------------------------

describe("getMaxPagesForPlan — DEFAULT 폴백", () => {
	it("undefined → DEFAULT (50)", () => {
		expect(getMaxPagesForPlan(undefined)).toBe(DEFAULT_MAX_PAGES);
		expect(getMaxPagesForPlan(undefined)).toBe(50);
	});

	it("null → DEFAULT (50)", () => {
		expect(getMaxPagesForPlan(null)).toBe(DEFAULT_MAX_PAGES);
		expect(getMaxPagesForPlan(null)).toBe(50);
	});

	it("빈 문자열 → DEFAULT (truthy 가드)", () => {
		expect(getMaxPagesForPlan("")).toBe(DEFAULT_MAX_PAGES);
	});

	it('알려지지 않은 plan ("invalid") → DEFAULT', () => {
		expect(getMaxPagesForPlan("invalid")).toBe(DEFAULT_MAX_PAGES);
	});

	it('대소문자 다른 ("Free") → DEFAULT — exact-match 검증', () => {
		// Plan 명은 lowercase 가 약속된 형식. 케이싱이 다르면 폴백.
		expect(getMaxPagesForPlan("Free")).toBe(DEFAULT_MAX_PAGES);
		expect(getMaxPagesForPlan("PRO")).toBe(DEFAULT_MAX_PAGES);
	});

	it('앞뒤 공백 포함 ("  pro  ") → DEFAULT — trim 안 함', () => {
		expect(getMaxPagesForPlan("  pro  ")).toBe(DEFAULT_MAX_PAGES);
	});
});

// ---------------------------------------------------------------------------
// 3. 결정성 + tier 단조 증가 검증
// ---------------------------------------------------------------------------

describe("getMaxPagesForPlan — 일관성", () => {
	it("동일 입력 → 동일 출력", () => {
		expect(getMaxPagesForPlan("free")).toBe(getMaxPagesForPlan("free"));
		expect(getMaxPagesForPlan("business")).toBe(getMaxPagesForPlan("business"));
	});

	it("tier 단계가 높아질수록 페이지 수 증가 (guest < free < basic < pro < business)", () => {
		const guest = getMaxPagesForPlan("guest");
		const free = getMaxPagesForPlan("free");
		const basic = getMaxPagesForPlan("basic");
		const pro = getMaxPagesForPlan("pro");
		const business = getMaxPagesForPlan("business");

		expect(guest).toBeLessThan(free);
		expect(free).toBeLessThan(basic);
		expect(basic).toBeLessThan(pro);
		expect(pro).toBeLessThan(business);
	});
});
