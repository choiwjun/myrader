/**
 * @TASK TASK-COPY-006 — 렌더러 단위 테스트
 * @TEST packages/contracts/src/copy/__tests__/renderer.test.ts
 *
 * 30+ 케이스:
 *  1. 변수 치환 정확성 (카페 룰 전체 5슬롯)
 *  2. general 폴백 (undefined / 알 수 없는 industry)
 *  3. 미치환 변수 검출
 *  4. 240자 가드
 *  5. cta 8자 가드
 *  6. 카테고리별 균형 (SEO 10/AEO 5/GEO 5/기타 10)
 *  7. 버전 일관성
 *  8. clinic 의료법 가드
 *  9. 5슬롯 누락 0건
 * 10. renderSlot 단위 테스트
 */

import { describe, expect, it } from "vitest";
import { INDUSTRY_VOCAB } from "../industry-vocab.ko.js";
import {
	hasUnrenderedVars,
	renderAllRules,
	renderRuleCopy,
	renderSlot,
} from "../render.js";
import { RULE_COPY } from "../rule-copy.ko.js";
import { RuleCopyRenderedSchema } from "../types.js";
import type { IndustryId } from "../types.js";

// ---------------------------------------------------------------------------
// 1. renderSlot 단위 테스트
// ---------------------------------------------------------------------------

describe("renderSlot — 기본 변수 치환", () => {
	it("변수 1개 — 치환 성공", () => {
		const { text, unrendered } = renderSlot("{site}에 이름표가 없어요", {
			site: "카페 사이트",
		});
		expect(text).toBe("카페 사이트에 이름표가 없어요");
		expect(unrendered).toHaveLength(0);
	});

	it("변수 복수 — 모두 치환", () => {
		const { text, unrendered } = renderSlot(
			"{comparison_phrase_anchor} 이미 {customer}에게 알려줬어요",
			{ comparison_phrase_anchor: "동네 카페 대부분은", customer: "손님" },
		);
		expect(text).toBe("동네 카페 대부분은 이미 손님에게 알려줬어요");
		expect(unrendered).toHaveLength(0);
	});

	it("변수 없는 템플릿 — 그대로 반환", () => {
		const { text, unrendered } = renderSlot("바로 고치기", {});
		expect(text).toBe("바로 고치기");
		expect(unrendered).toHaveLength(0);
	});

	it("미존재 변수 — unrendered에 기록", () => {
		const { text, unrendered } = renderSlot("{site}에 {unknown_var}이 없어요", {
			site: "카페 사이트",
		});
		expect(text).toContain("카페 사이트에");
		expect(text).toContain("{unknown_var}");
		expect(unrendered).toContain("unknown_var");
	});

	it("같은 변수 두 번 사용 — 모두 치환", () => {
		const { text, unrendered } = renderSlot("{name}은 {name}입니다", {
			name: "카페",
		});
		expect(text).toBe("카페은 카페입니다");
		expect(unrendered).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 2. 변수 치환 정확성 — 카페 룰 전체
// ---------------------------------------------------------------------------

describe("renderRuleCopy — 카페 산업 변수 치환", () => {
	const cafeVocab = INDUSTRY_VOCAB.cafe;

	for (const [ruleId] of Object.entries(RULE_COPY)) {
		it(`${ruleId} — 카페 치환 결과에 {site} 변수가 남지 않는다`, () => {
			const result = renderRuleCopy(ruleId, "cafe");
			expect(result).not.toBeNull();
			if (result === null) return;
			const allText = Object.values(result.rendered).join(" ");
			expect(allText).not.toMatch(/\{site\}/);
		});

		it(`${ruleId} — 카페 치환 시 site='카페 사이트' 로 치환된다`, () => {
			const result = renderRuleCopy(ruleId, "cafe");
			if (result === null) return;
			const slots = RULE_COPY[ruleId]!.slots;
			const hasSiteVar = Object.values(slots).some((s) => s.includes("{site}"));
			if (hasSiteVar) {
				const allText = Object.values(result.rendered).join(" ");
				expect(allText).toContain(cafeVocab.site);
			}
		});
	}

	it("SEO-TITLE-001 카페 — {customer} → '손님' 치환 없이도 자연스럽게 치환", () => {
		const result = renderRuleCopy("SEO-TITLE-001", "cafe");
		expect(result).not.toBeNull();
		expect(result!.industry).toBe("cafe");
		expect(result!.unrenderedVars).toHaveLength(0);
	});

	it("렌더 결과에 템플릿 defaultPriority 를 priority 로 포함한다", () => {
		const result = renderRuleCopy("SEO-TITLE-001", "cafe");
		expect(result).not.toBeNull();
		expect(result!.priority).toBe(RULE_COPY["SEO-TITLE-001"]!.defaultPriority);
	});

	it("RuleCopyRenderedSchema 가 priority 를 보존한다", () => {
		const result = renderRuleCopy("SEO-TITLE-001", "cafe");
		expect(result).not.toBeNull();

		const parsed = RuleCopyRenderedSchema.parse(result);
		expect(parsed.priority).toBe("high");
	});

	it("AEO-FAQ-001 카페 — title에 '손님들이 묻는 걸' 포함", () => {
		const result = renderRuleCopy("AEO-FAQ-001", "cafe");
		expect(result).not.toBeNull();
		expect(result!.rendered.title).toContain("손님들이 묻는 걸");
	});

	it("AEO-FAQ-001 카페 — rendered.title에 '카페 사이트' 포함", () => {
		const result = renderRuleCopy("AEO-FAQ-001", "cafe");
		expect(result!.rendered.title).toContain("카페 사이트");
	});

	it("AEO-FAQ-001 카페 — rendered.action_pro에 '웹 디자이너' 포함", () => {
		const result = renderRuleCopy("AEO-FAQ-001", "cafe");
		expect(result!.rendered.action_pro).toContain("웹 디자이너");
	});

	it("AEO-FAQ-001 카페 — rendered.harm에 '동네 카페 대부분은' 포함", () => {
		const result = renderRuleCopy("AEO-FAQ-001", "cafe");
		expect(result!.rendered.harm).toContain("동네 카페 대부분은");
	});
});

// ---------------------------------------------------------------------------
// 3. general 폴백
// ---------------------------------------------------------------------------

describe("renderRuleCopy — general 폴백", () => {
	it("industry=undefined → general vocab 사용", () => {
		const result = renderRuleCopy("SEO-TITLE-001", undefined);
		expect(result).not.toBeNull();
		expect(result!.industry).toBe("general");
		expect(result!.fallbackToGeneral).toBe(true);
	});

	it("industry='unknown' → general vocab 사용", () => {
		const result = renderRuleCopy(
			"SEO-TITLE-001",
			"unknown_industry" as IndustryId,
		);
		expect(result).not.toBeNull();
		expect(result!.industry).toBe("general");
		expect(result!.fallbackToGeneral).toBe(true);
	});

	it("general 폴백 시 '고객'이 포함된다 (AEO-FAQ-001)", () => {
		const result = renderRuleCopy("AEO-FAQ-001", undefined);
		expect(result!.rendered.title).toContain("고객들이 묻는 걸");
	});

	it("general 폴백 시 '사이트'가 포함된다 (SEO-TITLE-001)", () => {
		const result = renderRuleCopy("SEO-TITLE-001", undefined);
		expect(result!.rendered.title).toContain("사이트");
	});

	it("존재하지 않는 ruleId → null 반환", () => {
		const result = renderRuleCopy("SEO-NONEXISTENT-999", "cafe");
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 4. 240자 가드
// ---------------------------------------------------------------------------

describe("240자 가드 — 모든 룰 × 5슬롯", () => {
	const industries: IndustryId[] = [
		"cafe",
		"restaurant",
		"clinic",
		"academy",
		"general",
	];

	for (const industry of industries) {
		for (const [ruleId] of Object.entries(RULE_COPY)) {
			it(`${ruleId} / ${industry} — 모든 슬롯 240자 이내`, () => {
				const result = renderRuleCopy(ruleId, industry);
				if (result === null) return;
				for (const [slot, text] of Object.entries(result.rendered)) {
					expect(
						text.length,
						`${ruleId}.${slot} 렌더 결과가 ${text.length}자로 240자 초과`,
					).toBeLessThanOrEqual(240);
				}
			});
		}
	}
});

// ---------------------------------------------------------------------------
// 5. cta 8자 가드 (템플릿 단계에서 검증)
// ---------------------------------------------------------------------------

describe("cta 8자 가드 — RULE_COPY 템플릿", () => {
	for (const [ruleId, template] of Object.entries(RULE_COPY)) {
		it(`${ruleId} — cta 슬롯 8자 이내`, () => {
			expect(
				template.slots.cta.length,
				`${ruleId}.cta = "${template.slots.cta}" (${template.slots.cta.length}자)`,
			).toBeLessThanOrEqual(8);
		});
	}
});

// ---------------------------------------------------------------------------
// 6. 카테고리별 균형 검증
// ---------------------------------------------------------------------------

describe("카테고리 분포 — SEO/AEO/GEO/self 균형 (high 30 + medium 60 = 90)", () => {
	// F.2 (TASK-COPY-008) 이후: 30(high) + 60(medium) = 90 룰로 확장.
	it("총 90개 룰이 등록돼 있다 (high 30 + medium 60)", () => {
		expect(Object.keys(RULE_COPY).length).toBe(90);
	});

	it("SEO 카테고리 룰이 최소 10개 이상이다 (high 10 + medium 추가)", () => {
		const seoRules = Object.values(RULE_COPY).filter(
			(r) => r.category === "seo",
		);
		expect(seoRules.length).toBeGreaterThanOrEqual(10);
	});

	it("AEO 카테고리 룰이 최소 5개 이상이다", () => {
		const aeoRules = Object.values(RULE_COPY).filter(
			(r) => r.category === "aeo",
		);
		expect(aeoRules.length).toBeGreaterThanOrEqual(5);
	});

	it("GEO 카테고리 룰이 최소 5개 이상이다", () => {
		const geoRules = Object.values(RULE_COPY).filter(
			(r) => r.category === "geo",
		);
		expect(geoRules.length).toBeGreaterThanOrEqual(5);
	});

	it("self(기타) 카테고리 룰이 최소 10개 이상이다", () => {
		const selfRules = Object.values(RULE_COPY).filter(
			(r) => r.category === "self",
		);
		expect(selfRules.length).toBeGreaterThanOrEqual(10);
	});
});

// ---------------------------------------------------------------------------
// 7. 버전 일관성
// ---------------------------------------------------------------------------

describe("버전 일관성 — 모든 RULE_COPY version='1.0.0'", () => {
	for (const [ruleId, template] of Object.entries(RULE_COPY)) {
		it(`${ruleId} — version='1.0.0'`, () => {
			expect(template.version).toBe("1.0.0");
		});
	}
});

// ---------------------------------------------------------------------------
// 8. clinic 의료법 가드
// ---------------------------------------------------------------------------

describe("clinic 산업 — 의료법 준수 카피 검증", () => {
	const FORBIDDEN_MEDICAL = ["최고", "치료", "완치", "최단", "확실히"];

	for (const [ruleId] of Object.entries(RULE_COPY)) {
		it(`${ruleId} clinic — 의료 효능 금지 표현 미포함`, () => {
			const result = renderRuleCopy(ruleId, "clinic");
			if (result === null) return;
			const allText = Object.values(result.rendered).join(" ");
			for (const forbidden of FORBIDDEN_MEDICAL) {
				expect(
					allText,
					`${ruleId} clinic 카피에 금지 표현 '${forbidden}' 포함`,
				).not.toContain(forbidden);
			}
		});
	}
});

// ---------------------------------------------------------------------------
// 9. 5슬롯 누락 0건
// ---------------------------------------------------------------------------

describe("5슬롯 누락 검증 — RULE_COPY 모든 항목", () => {
	const REQUIRED_SLOTS = [
		"title",
		"harm",
		"action_self",
		"action_pro",
		"cta",
	] as const;

	for (const [ruleId, template] of Object.entries(RULE_COPY)) {
		it(`${ruleId} — title/harm/action_self/action_pro/cta 모두 non-empty`, () => {
			for (const slot of REQUIRED_SLOTS) {
				expect(
					template.slots[slot],
					`${ruleId}.slots.${slot} 없음`,
				).toBeDefined();
				expect(
					template.slots[slot].length,
					`${ruleId}.slots.${slot} 비어있음`,
				).toBeGreaterThan(0);
			}
		});
	}
});

// ---------------------------------------------------------------------------
// 10. 미치환 변수 검출
// ---------------------------------------------------------------------------

describe("hasUnrenderedVars — 미치환 변수 검출", () => {
	it("정상 렌더 결과 → hasUnrenderedVars false", () => {
		const result = renderRuleCopy("SEO-TITLE-001", "cafe");
		expect(result).not.toBeNull();
		expect(hasUnrenderedVars(result!)).toBe(false);
	});

	it("가짜 룰에 알 수 없는 변수 주입 → unrenderedVars 비어있지 않음", () => {
		const { unrendered } = renderSlot("{site}에 {unknown_var}이 있어요", {
			site: "카페 사이트",
		});
		expect(unrendered).toContain("unknown_var");
		expect(unrendered.length).toBeGreaterThan(0);
	});

	it("renderAllRules — cafe 산업 전체 렌더 시 null 없음", () => {
		const results = renderAllRules("cafe");
		// F.2 (TASK-COPY-008) 이후: high 30 + medium 60 = 90
		expect(results.length).toBe(Object.keys(RULE_COPY).length);
		for (const result of results) {
			expect(result).not.toBeNull();
		}
	});

	it("renderAllRules — general 폴백 렌더 시 null 없음", () => {
		const results = renderAllRules(undefined);
		expect(results.length).toBe(Object.keys(RULE_COPY).length);
	});
});

// ---------------------------------------------------------------------------
// 11. 추가: 산업별 핵심 변수 치환 정확성 샘플
// ---------------------------------------------------------------------------

describe("산업별 핵심 변수 치환 샘플", () => {
	it("restaurant — '식당 사이트' 치환", () => {
		const result = renderRuleCopy("SEO-TITLE-001", "restaurant");
		expect(result!.rendered.title).toContain("식당 사이트");
	});

	it("academy — '학부모들이 묻는 걸' 포함 (AEO-FAQ-001)", () => {
		const result = renderRuleCopy("AEO-FAQ-001", "academy");
		expect(result!.rendered.title).toContain("학부모들이 묻는 걸");
	});

	it("salon — '동네 미용실 대부분은' 포함", () => {
		const result = renderRuleCopy("SEO-META-001", "salon");
		expect(result!.rendered.harm).toContain("동네 미용실 대부분은");
	});

	it("clinic — '병원 홈페이지' 치환", () => {
		const result = renderRuleCopy("SEO-TITLE-001", "clinic");
		expect(result!.rendered.title).toContain("병원 홈페이지");
	});

	it("workshop — action_pro에 '웹 디자이너' 포함", () => {
		const result = renderRuleCopy("AEO-FAQ-001", "workshop");
		expect(result!.rendered.action_pro).toContain("웹 디자이너");
	});

	it("retail — '비슷한 가게들 대부분은' 포함", () => {
		const result = renderRuleCopy("SEO-META-001", "retail");
		expect(result!.rendered.harm).toContain("비슷한 가게들 대부분은");
	});
});

// ---------------------------------------------------------------------------
// 12. ruleId-category 매핑 일관성
// ---------------------------------------------------------------------------

describe("ruleId-category 매핑 일관성", () => {
	it("SEO-로 시작하는 룰은 category='seo' 또는 'self'다 (SEO-IMG-ALT-001은 self)", () => {
		const seoRuleIds = Object.keys(RULE_COPY).filter((id) =>
			id.startsWith("SEO-"),
		);
		for (const id of seoRuleIds) {
			expect(
				["seo", "self"],
				`${id}의 category가 seo 또는 self여야 함`,
			).toContain(RULE_COPY[id]!.category);
		}
	});

	it("AEO-로 시작하는 룰은 category='aeo'다", () => {
		const aeoRuleIds = Object.keys(RULE_COPY).filter((id) =>
			id.startsWith("AEO-"),
		);
		for (const id of aeoRuleIds) {
			expect(RULE_COPY[id]!.category).toBe("aeo");
		}
	});

	it("GEO-로 시작하는 룰은 category='geo'다", () => {
		const geoRuleIds = Object.keys(RULE_COPY).filter((id) =>
			id.startsWith("GEO-"),
		);
		for (const id of geoRuleIds) {
			expect(RULE_COPY[id]!.category).toBe("geo");
		}
	});

	it("PERF-/A11Y-/MOBILE-/NLP- 로 시작하는 룰은 category='self' 또는 'aeo'다", () => {
		// NLP-EEAT-* 룰은 core engine 에서 category='aeo' 로 정의됨 (E-E-A-T 신호).
		// BACKLINK-* 룰은 category='self' 로 처리.
		const selfPrefixes = ["PERF-", "A11Y-", "MOBILE-", "NLP-", "BACKLINK-"];
		const selfRuleIds = Object.keys(RULE_COPY).filter((id) =>
			selfPrefixes.some((p) => id.startsWith(p)),
		);
		for (const id of selfRuleIds) {
			expect(
				["self", "aeo"],
				`${id}의 category가 self 또는 aeo여야 함`,
			).toContain(RULE_COPY[id]!.category);
		}
	});
});

// ---------------------------------------------------------------------------
// 13. [TASK-QA-006] 회귀 강화 — 변수 누락 검출 강화
// ---------------------------------------------------------------------------

describe("[QA-006] 변수 누락 검출 강화", () => {
	it("unknown 변수가 포함된 템플릿은 unrenderedVars 에 정확히 기록된다", () => {
		const { unrendered } = renderSlot(
			"{site}에 {completely_unknown_var_xyz}이 없어요. {another_unknown}도 없음",
			{ site: "카페 사이트" },
		);
		expect(unrendered).toContain("completely_unknown_var_xyz");
		expect(unrendered).toContain("another_unknown");
		expect(unrendered).toHaveLength(2);
	});

	it("모든 변수가 치환된 슬롯은 unrenderedVars = [] 이다", () => {
		const { unrendered } = renderSlot("{site}에 이름표가 없어요", {
			site: "카페 사이트",
		});
		expect(unrendered).toHaveLength(0);
	});

	it("빈 문자열 변수값도 치환으로 인정한다", () => {
		const { text, unrendered } = renderSlot("{site}에 이름표가 없어요", {
			site: "",
		});
		expect(text).toBe("에 이름표가 없어요");
		expect(unrendered).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// 14. [TASK-QA-006] 회귀 강화 — 30 룰 × 전체 슬롯 일관성 (150 슬롯)
// ---------------------------------------------------------------------------

describe("[QA-006] 30 룰 × 5슬롯 = 150 슬롯 완전성", () => {
	const industries: IndustryId[] = [
		"cafe",
		"restaurant",
		"clinic",
		"academy",
		"salon",
		"workshop",
		"retail",
		"general",
	];
	const REQUIRED_SLOTS = [
		"title",
		"harm",
		"action_self",
		"action_pro",
		"cta",
	] as const;

	it("모든 30 룰이 RULE_COPY 에 등록되어 있다", () => {
		const expectedRuleIds = [
			"SEO-TITLE-001",
			"SEO-META-001",
			"SEO-H1-001",
			"SEO-ROBOTS-001",
			"SEO-MOBILE-001",
			"SEO-HTTPS-001",
			"SEO-KEYWORD-001",
			"SEO-STRUCTURED-DATA-001",
			"SEO-OG-001",
			"SEO-REGION-001",
			"AEO-FAQ-001",
			"AEO-SERVICE-DESC-001",
			"AEO-QUESTION-FORMAT-001",
			"AEO-CONTACT-DIRECT-001",
			"AEO-DIRECT-ANSWER-001",
			"GEO-BUSINESS-NAME-001",
			"GEO-LOCAL-BUSINESS-SCHEMA-001",
			"GEO-REGION-001",
			"GEO-LLMS-TXT-001",
			"GEO-INDUSTRY-001",
			"PERF-LCP-001",
			"PERF-CLS-001",
			"PERF-FCP-001",
			"A11Y-IMAGE-ALT-001",
			"A11Y-COLOR-CONTRAST-001",
			"MOBILE-VIEWPORT-OK-001",
			"MOBILE-TAP-TARGET-001",
			"NLP-READABILITY-001",
			"NLP-KEYWORD-DENSITY-001",
			"SEO-IMG-ALT-001",
		];
		for (const ruleId of expectedRuleIds) {
			expect(RULE_COPY, `${ruleId}이 RULE_COPY 에 없음`).toHaveProperty(ruleId);
		}
	});

	it("PERF-SPEED-INDEX-001 (가상 ruleId) 는 RULE_COPY 에 없다 — DL-046 정정 확인", () => {
		expect(Object.keys(RULE_COPY)).not.toContain("PERF-SPEED-INDEX-001");
	});

	it("PERF-FCP-001 (정정된 실제 ruleId) 가 RULE_COPY 에 존재한다 — DL-046 정정 확인", () => {
		expect(Object.keys(RULE_COPY)).toContain("PERF-FCP-001");
	});

	for (const industry of industries) {
		it(`${industry} 산업으로 전체 ${Object.keys(RULE_COPY).length} 룰 렌더 시 unrenderedVars=0 (general 폴백 포함)`, () => {
			const results = renderAllRules(industry);
			// F.2 (TASK-COPY-008) 이후: high 30 + medium 60 = 90
			expect(results).toHaveLength(Object.keys(RULE_COPY).length);
			for (const result of results) {
				expect(result, `${industry} 산업 렌더 결과에 null 포함`).not.toBeNull();
				if (result) {
					expect(
						result.unrenderedVars,
						`${result.ruleId} / ${industry} 에 미치환 변수: [${result.unrenderedVars.join(", ")}]`,
					).toHaveLength(0);
				}
			}
		});
	}

	for (const slot of REQUIRED_SLOTS) {
		it(`모든 30 룰의 ${slot} 슬롯이 non-empty 이다`, () => {
			for (const [ruleId, template] of Object.entries(RULE_COPY)) {
				expect(
					template.slots[slot],
					`${ruleId}.slots.${slot} 없음`,
				).toBeDefined();
				expect(
					template.slots[slot].trim().length,
					`${ruleId}.slots.${slot} 비어있음`,
				).toBeGreaterThan(0);
			}
		});
	}
});

// ---------------------------------------------------------------------------
// 15. [TASK-QA-006] 회귀 강화 — clinic vocab 강제 의료 안전 검증
// ---------------------------------------------------------------------------

describe("[QA-006] clinic vocab 강제 의료 안전 검증", () => {
	const FORBIDDEN_MEDICAL = ["최고", "치료", "완치", "최단", "확실히"];

	it("clinic 산업으로 30 룰 전체 렌더 시 어떤 슬롯에도 의료 효능 단어가 포함되지 않는다", () => {
		const results = renderAllRules("clinic");
		for (const result of results) {
			if (!result) continue;
			const allText = Object.values(result.rendered).join(" ");
			for (const forbidden of FORBIDDEN_MEDICAL) {
				expect(
					allText,
					`${result.ruleId} clinic 렌더에 금지어 '${forbidden}' 포함`,
				).not.toContain(forbidden);
			}
		}
	});

	it("clinic 렌더 결과의 site 는 '병원 홈페이지' 로 치환된다 (SEO-TITLE-001)", () => {
		const result = renderRuleCopy("SEO-TITLE-001", "clinic");
		expect(result).not.toBeNull();
		expect(result!.rendered.title).toContain("병원 홈페이지");
	});
});

// ---------------------------------------------------------------------------
// 16. [TASK-QA-006] 회귀 강화 — 캐시 동시성 (동일 ruleId+industry 동시 호출)
// ---------------------------------------------------------------------------

describe("[QA-006] 캐시 동시성 — 같은 ruleId+industry 동시 호출", () => {
	it("같은 ruleId+industry 를 동시에 10번 호출해도 결과가 일관된다", async () => {
		const calls = Array.from({ length: 10 }, () =>
			Promise.resolve(renderRuleCopy("SEO-TITLE-001", "cafe")),
		);
		const results = await Promise.all(calls);

		const firstTitle = results[0]!.rendered.title;
		for (const result of results) {
			expect(result).not.toBeNull();
			expect(result!.rendered.title).toBe(firstTitle);
		}
	});

	it("같은 ruleId + 다른 industry 동시 호출 시 각각 다른 vocab 결과를 반환한다", async () => {
		const [cafeResult, clinicResult, generalResult] = await Promise.all([
			Promise.resolve(renderRuleCopy("AEO-FAQ-001", "cafe")),
			Promise.resolve(renderRuleCopy("AEO-FAQ-001", "clinic")),
			Promise.resolve(renderRuleCopy("AEO-FAQ-001", undefined)),
		]);

		expect(cafeResult!.rendered.title).toContain("손님들이 묻는 걸");
		expect(clinicResult!.rendered.title).toContain("환자들이 묻는 걸");
		expect(generalResult!.rendered.title).toContain("고객들이 묻는 걸");
		expect(cafeResult!.industry).toBe("cafe");
		expect(clinicResult!.industry).toBe("clinic");
		expect(generalResult!.industry).toBe("general");
	});
});
