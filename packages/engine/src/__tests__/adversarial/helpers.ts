/**
 * X-SAG Core Engine — Adversarial 테스트 헬퍼
 *
 * BACKLOG-G P5: 회귀 안전망 강화용 200+ adversarial 케이스에서 공용으로 사용한다.
 *
 * 제공 헬퍼:
 *  - loadFixture(name): fixtures/ 아래 실제 .html / .txt 페이로드 로드
 *  - mockParsedPage(html, url?): HTML 을 직접 ParsedPage 로 변환 (parser 검증용)
 *  - mockParsedPageFromOverrides(overrides): ParsedPage 직접 합성
 *  - makeRuleContext(page): RuleContext 합성
 *  - expectNoCrash(fn): fn 이 throw / console.error 모두 발생 안 함을 검증
 *  - expectValidRuleResult(result): RuleResult 가 NaN/Infinity 없이 enum 안에 있는지 검증
 *  - expectValidScore(score): 점수가 0~100 finite 범위인지 검증
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, vi } from "vitest";
import type {
	BusinessProfile,
	RuleContext,
	RuleResult,
} from "../../analyzers/types.js";
import { parseHtml } from "../../parser.js";
import type { ParsedPage } from "../../types.js";

// ---------------------------------------------------------------------------
// 경로 헬퍼 — ESM 환경에서 __dirname 등가 표현
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// loadFixture — fixtures/ 디렉토리 페이로드 로드
// ---------------------------------------------------------------------------

/**
 * adversarial/fixtures/ 디렉토리에서 텍스트 페이로드(.html, .txt)를 읽어 반환한다.
 *
 * @param name - 파일명 (예: "malformed-html-001.html")
 * @returns 파일 내용 (UTF-8 문자열). 존재하지 않으면 throw 한다.
 */
export function loadFixture(name: string): string {
	const path = join(__dirname, "fixtures", name);
	return readFileSync(path, "utf-8");
}

// ---------------------------------------------------------------------------
// mockParsedPage — HTML → ParsedPage 직변환
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://example.co.kr/";

/**
 * HTML 문자열을 parseHtml() 로 직접 ParsedPage 로 변환한다.
 * adversarial 테스트에서 parser 가 throw 하지 않음을 검증한 뒤
 * 후속 룰 평가까지 진행하는 용도로 사용된다.
 */
export function mockParsedPage(
	html: string,
	url: string = DEFAULT_BASE_URL,
	statusCode = 200,
): ParsedPage {
	return parseHtml(html, url, statusCode);
}

// ---------------------------------------------------------------------------
// mockParsedPageFromOverrides — ParsedPage 직접 합성 (HTML 파싱 우회)
// ---------------------------------------------------------------------------

/**
 * ParsedPage 의 모든 필수 필드를 기본값으로 채운 뒤 overrides 로 덮어쓴다.
 * parser 단계는 건너뛰고 룰/스코어링만 검증할 때 사용한다.
 */
export function mockParsedPageFromOverrides(
	overrides: Partial<ParsedPage> = {},
): ParsedPage {
	return {
		url: DEFAULT_BASE_URL,
		statusCode: 200,
		title: "테스트 페이지",
		description: "테스트 설명",
		h1: "테스트 H1",
		h2: ["섹션 A", "섹션 B"],
		meta: {},
		bodyText: "테스트 본문 내용입니다.",
		wordCount: 5,
		internalLinks: [],
		externalLinks: [],
		images: [],
		schemaJsonLd: [],
		hasFAQ: false,
		hasSchema: false,
		canonicalUrl: null,
		robotsMeta: null,
		headingStructure: [],
		h3: [],
		listTableCount: { ul: 0, ol: 0, table: 0 },
		lastModified: null,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// makeRuleContext — RuleContext 합성
// ---------------------------------------------------------------------------

const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
	businessName: "테스트 카페",
	industry: "카페",
	region: "서울 강남",
	mainServices: ["핸드드립", "디저트"],
	targetKeywords: ["강남 카페", "핸드드립"],
};

/**
 * 단일 페이지 기준 RuleContext 를 생성한다.
 */
export function makeRuleContext(
	page: ParsedPage,
	profile: Partial<BusinessProfile> = {},
): RuleContext {
	return {
		pages: [page],
		mainPage: page,
		businessProfile: { ...DEFAULT_BUSINESS_PROFILE, ...profile },
	};
}

// ---------------------------------------------------------------------------
// expectNoCrash — fn 이 throw 하지 않고 console.error 도 호출 안 함을 검증
// ---------------------------------------------------------------------------

/**
 * fn 이 throw 하지 않고 console.error 도 호출되지 않음을 검증한다.
 * 비동기 fn 도 지원 (Promise reject 도 throw 로 간주한다).
 */
export async function expectNoCrash(
	fn: () => void | Promise<void>,
): Promise<void> {
	const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

	try {
		let threw = false;
		let thrown: unknown = null;
		try {
			await fn();
		} catch (err) {
			threw = true;
			thrown = err;
		}
		expect(threw, `fn threw: ${String(thrown)}`).toBe(false);
		expect(errorSpy).not.toHaveBeenCalled();
	} finally {
		errorSpy.mockRestore();
		warnSpy.mockRestore();
	}
}

// ---------------------------------------------------------------------------
// expectValidRuleResult — RuleResult 무결성 검증
// ---------------------------------------------------------------------------

const VALID_SEVERITY = new Set(["high", "medium", "low"]);
const VALID_CATEGORY = new Set([
	"seo",
	"aeo",
	"geo",
	"perf",
	"backlink",
	"a11y",
]);
const VALID_ACTION = new Set([
	"self_fix",
	"snippet_action",
	"vendor_action",
	"si_action",
]);
const VALID_DIFFICULTY = new Set(["easy", "medium", "hard"]);
const VALID_IMPACT = new Set(["low", "medium", "high"]);

/**
 * RuleResult 의 enum 필드가 valid 한지, ruleWeight 가 finite number 인지 검증한다.
 */
export function expectValidRuleResult(result: RuleResult): void {
	expect(typeof result.ruleId).toBe("string");
	expect(result.ruleId.length).toBeGreaterThan(0);
	expect(VALID_CATEGORY.has(result.category)).toBe(true);
	expect(typeof result.passed).toBe("boolean");
	expect(VALID_SEVERITY.has(result.severity)).toBe(true);
	expect(VALID_ACTION.has(result.actionType)).toBe(true);
	expect(VALID_DIFFICULTY.has(result.difficulty)).toBe(true);
	expect(VALID_IMPACT.has(result.expectedImpact)).toBe(true);

	// ruleWeight 는 finite number (NaN/Infinity 금지)
	expect(Number.isFinite(result.ruleWeight)).toBe(true);
	expect(result.ruleWeight).toBeGreaterThanOrEqual(0);
	expect(result.ruleWeight).toBeLessThanOrEqual(10);

	// 텍스트 필드는 string 이어야 한다 (undefined / null 불허)
	expect(typeof result.title).toBe("string");
	expect(typeof result.description).toBe("string");
	expect(typeof result.recommendation).toBe("string");
	expect(Array.isArray(result.evidence)).toBe(true);
}

// ---------------------------------------------------------------------------
// expectValidScore — 점수 finite + 0~100 범위 검증
// ---------------------------------------------------------------------------

/**
 * 점수가 NaN/Infinity 가 아니고 0~100 범위 안에 있음을 검증한다.
 */
export function expectValidScore(score: number): void {
	expect(Number.isFinite(score)).toBe(true);
	expect(score).toBeGreaterThanOrEqual(0);
	expect(score).toBeLessThanOrEqual(100);
}

// ---------------------------------------------------------------------------
// expectBodyTextNotPersisted — POLICY § 4.4 검증 헬퍼
// ---------------------------------------------------------------------------

/**
 * POLICY § 4.4: bodyText 는 ParsedPage 에만 존재해야 한다.
 * 외부로 직렬화 / 저장되지 않음을 검증할 때 사용한다.
 *
 * 본 헬퍼는 "직렬화된 payload" 안에 bodyText 가 포함되지 않았는지만 확인한다.
 * ParsedPage 자체에는 bodyText 가 존재한다 (parser 출력).
 */
export function expectBodyTextNotPersisted(
	serialized: string | Record<string, unknown>,
): void {
	const json =
		typeof serialized === "string" ? serialized : JSON.stringify(serialized);
	// 직렬화 결과에 "bodyText" 키가 포함되면 POLICY 위반
	expect(json).not.toMatch(/"bodyText"\s*:/);
}
