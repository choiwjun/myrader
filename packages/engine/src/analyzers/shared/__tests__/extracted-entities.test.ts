/**
 * X-SAG Core Engine — buildExtractedEntities 단위 테스트 (Phase 0 인프라)
 *
 * types/extracted-entities.ts 의 buildExtractedEntities 직접 검증.
 * 결정적: 동일 입력 → 동일 출력. AI/네트워크/시간 의존 없음.
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { BusinessProfile } from "../../types.js";
import { buildExtractedEntities } from "../../types/extracted-entities.js";

// ---------------------------------------------------------------------------
// Helpers (rules/__tests__ 스타일과 동일)
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://example.co.kr/",
		statusCode: 200,
		title: "테스트 카페 강남",
		description: "강남 핸드드립 카페입니다.",
		h1: "강남 카페 메인",
		h2: ["메뉴 안내", "오시는 길"],
		meta: {},
		bodyText:
			"서울 강남구 테헤란로 152 에 위치한 테스트 카페입니다. 전화 02-1234-5678 로 문의 주세요.",
		wordCount: 12,
		internalLinks: [],
		externalLinks: [],
		images: [],
		schemaJsonLd: [],
		hasFAQ: false,
		hasSchema: false,
		canonicalUrl: null,
		robotsMeta: null,
		...overrides,
	};
}

function makeProfile(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
	return {
		businessName: "테스트 카페",
		industry: "카페",
		region: "강남",
		mainServices: ["핸드드립"],
		targetKeywords: ["강남 카페"],
		...overrides,
	};
}

// ===========================================================================
// buildExtractedEntities
// ===========================================================================

describe("buildExtractedEntities", () => {
	it("phones/addresses/businessNameVariants/wordCount 를 채운다", () => {
		const result = buildExtractedEntities(makePage(), makeProfile());

		expect(result.phones.some((p) => p.normalized === "0212345678")).toBe(true);
		expect(result.addresses.some((a) => a.road)).toBe(true);
		expect(result.businessNameVariants).toContain("테스트 카페");
		expect(result.businessNameVariants).toContain("테스트카페");
		expect(result.wordCount).toBe(12);
		expect(Array.isArray(result.sentences)).toBe(true);
		expect((result.sentences ?? []).length).toBeGreaterThan(0);
	});

	it("동일 입력에 대해 결정적(deep-equal)으로 같은 출력을 낸다", () => {
		const page = makePage();
		const profile = makeProfile();
		const a = buildExtractedEntities(page, profile);
		const b = buildExtractedEntities(page, profile);
		expect(a).toEqual(b);
	});

	it("page.wordCount 가 숫자가 아니면 bodyText 어절 수로 폴백한다", () => {
		const page = makePage({
			bodyText: "하나 둘 셋 넷 다섯",
			// @ts-expect-error 의도적으로 비정상 wordCount 주입 (런타임 폴백 검증)
			wordCount: undefined,
		});
		const result = buildExtractedEntities(page, makeProfile());
		expect(result.wordCount).toBe(5);
	});

	it("빈 bodyText 도 안전하게 처리한다 (크래시 X)", () => {
		const page = makePage({ bodyText: "", wordCount: 0 });
		const result = buildExtractedEntities(page, makeProfile());
		expect(result.phones).toEqual([]);
		expect(result.addresses).toEqual([]);
		expect(result.sentences).toEqual([]);
		expect(result.wordCount).toBe(0);
	});

	it("businessName 이 빈 문자열이면 businessNameVariants 는 빈 배열", () => {
		const result = buildExtractedEntities(
			makePage(),
			makeProfile({ businessName: "" }),
		);
		expect(result.businessNameVariants).toEqual([]);
	});

	it("bodyText 가 null/undefined 여도 빈 문자열로 처리한다", () => {
		const page = makePage({
			// @ts-expect-error 런타임 null-safety 검증
			bodyText: undefined,
			wordCount: 0,
		});
		const result = buildExtractedEntities(page, makeProfile());
		expect(result.phones).toEqual([]);
		expect(result.sentences).toEqual([]);
	});
});
