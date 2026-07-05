/**
 * X-SAG Core Engine — quality-checker.ts 단위 테스트 (Phase P-C)
 *
 * @IMPL packages/core-engine/src/recommendation/quality-checker.ts
 * @IMPL packages/core-engine/src/recommendation/quality-prompts.ts
 *
 * 검증 시나리오:
 * 1. isAvailable() — LLM 주입 여부
 * 2. rule-based 휴리스틱 — 길이/명령조/영문/구체성/컨텍스트
 * 3. LLM check — 정상 응답 파싱
 * 4. LLM check — 잘못된 응답 폴백
 * 5. parseQualityResponse — JSON 추출 (직접/펜스/슬라이스)
 * 6. buildQualityPrompt — 컨텍스트 주입
 */

import { describe, expect, it, vi } from "vitest";
import {
	type QualityLLMProvider,
	RecommendationQualityChecker,
} from "../quality-checker.js";
import {
	type QualityCheckInput,
	buildQualityPrompt,
	parseQualityResponse,
} from "../quality-prompts.js";
import type { BusinessContext } from "../types.js";

const ctx: BusinessContext = {
	businessName: "테스트카페",
	industry: "카페",
	region: "서울 강남",
	mainServices: ["핸드드립", "원두판매"],
};

function makeInput(text: string, ruleId = "SEO-TITLE-001"): QualityCheckInput {
	return { ruleId, recommendation: text, context: ctx };
}

// ---------------------------------------------------------------------------
// Scenario 1: isAvailable
// ---------------------------------------------------------------------------

describe("RecommendationQualityChecker.isAvailable()", () => {
	it("LLM provider 미주입 시 false", () => {
		expect(new RecommendationQualityChecker().isAvailable()).toBe(false);
	});

	it("LLM provider 주입 시 true", () => {
		const llm: QualityLLMProvider = { generate: async () => "" };
		expect(new RecommendationQualityChecker(llm).isAvailable()).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: rule-based heuristic
// ---------------------------------------------------------------------------

describe("RecommendationQualityChecker — rule-based check", () => {
	const checker = new RecommendationQualityChecker();

	it("너무 짧은 텍스트는 큰 감점", async () => {
		const r = await checker.check(makeInput("짧음"));
		expect(r.issues).toContain("너무 짧음");
		expect(r.qualityScore).toBeLessThan(70);
		expect(r.passed).toBe(false);
	});

	it("권장 길이 미만(20~49자)은 작은 감점", async () => {
		const text = "테스트카페 메인에 title 태그를 추가하세요";
		const r = await checker.check(makeInput(text));
		expect(r.issues).toContain("권장 길이보다 짧음");
	});

	it("너무 긴 텍스트(>300자)는 감점", async () => {
		const long = "아".repeat(310);
		const r = await checker.check(makeInput(long));
		expect(r.issues).toContain("너무 길음");
	});

	it("권장 초과(>200자)는 약한 감점", async () => {
		// 권장 범위 50~200자를 초과(>200) 하되 최대치(300)는 넘지 않도록.
		// 한글 1자 = 코드 포인트 1로 계산되므로 240자 보장.
		const text = "가".repeat(240);
		const r = await checker.check(makeInput(text));
		expect(r.issues).toContain("권장 길이보다 김");
		expect(r.issues).not.toContain("너무 길음");
	});

	it("명령조('하세요') 4회 이상이면 감점", async () => {
		const text =
			"title을 추가하세요. meta description을 추가하세요. og:image를 추가하세요. canonical을 추가하세요.";
		const r = await checker.check(makeInput(text));
		expect(r.issues).toContain("명령조 과다");
	});

	it("영문 비율 30% 초과면 감점", async () => {
		const text =
			"Use proper title tag and meta description for better SEO results indeed";
		const r = await checker.check(makeInput(text));
		expect(r.issues).toContain("영문 과다");
	});

	it("예시도 숫자도 없으면 구체성 부족 감점", async () => {
		const text =
			"테스트카페 홈페이지를 잘 만들고 검색엔진에 잘 노출되도록 신경 써 보세요";
		const r = await checker.check(makeInput(text));
		expect(r.issues).toContain("구체적 예시 부족");
	});

	it("업체명/지역/업종 미반영이면 감점", async () => {
		const text =
			"예를 들어 title 태그를 추가하면 검색 결과 노출이 좋아지고 60자 이내로 다듬는 것이 좋습니다";
		const r = await checker.check(makeInput(text));
		expect(r.issues).toContain("업종/지역/매장명 미반영");
	});

	it("좋은 추천(컨텍스트+예시+적정 길이)은 70점 이상 + passed=true", async () => {
		const text =
			"테스트카페의 메인 페이지에 '<title>테스트카페 | 핸드드립</title>' 형식으로 제목 태그를 추가해 보세요. 서울 강남 지역 검색 노출에 도움이 됩니다.";
		const r = await checker.check(makeInput(text));
		expect(r.qualityScore).toBeGreaterThanOrEqual(70);
		expect(r.passed).toBe(true);
	});

	it("점수는 0~100 범위로 클램프된다", async () => {
		const r = await checker.check(makeInput(""));
		expect(r.qualityScore).toBeGreaterThanOrEqual(0);
		expect(r.qualityScore).toBeLessThanOrEqual(100);
	});

	it("originalRecommendation 은 입력을 그대로 보존", async () => {
		const text = "어떤 추천 문구";
		const r = await checker.check(makeInput(text));
		expect(r.originalRecommendation).toBe(text);
	});

	it("ruleId 가 결과에 그대로 전달된다", async () => {
		const r = await checker.check(makeInput("x", "MY-RULE-001"));
		expect(r.ruleId).toBe("MY-RULE-001");
	});

	it("issues 는 항상 배열", async () => {
		const r = await checker.check(makeInput("어떤 텍스트"));
		expect(Array.isArray(r.issues)).toBe(true);
	});

	it("입력이 null/undefined 같아도 안전 (빈 문자열 처리)", async () => {
		const r = await checker.check({
			ruleId: "X",
			recommendation: "",
			context: ctx,
		});
		expect(r.passed).toBe(false);
		expect(r.issues.length).toBeGreaterThan(0);
	});

	it("rule-based 결과에는 improvedRecommendation 이 설정되지 않는다", async () => {
		const r = await checker.check(makeInput("짧"));
		expect(r.improvedRecommendation).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: LLM check 정상 응답
// ---------------------------------------------------------------------------

describe("RecommendationQualityChecker — LLM check", () => {
	it("LLM JSON 응답을 파싱해 결과를 반환", async () => {
		const llm: QualityLLMProvider = {
			generate: vi.fn().mockResolvedValue(
				JSON.stringify({
					qualityScore: 85,
					issues: ["약간 김"],
					improvedRecommendation: "개선된 문구입니다.",
				}),
			),
		};
		const checker = new RecommendationQualityChecker(llm);
		const r = await checker.check(makeInput("원본 추천"));

		expect(r.qualityScore).toBe(85);
		expect(r.passed).toBe(true);
		expect(r.issues).toEqual(["약간 김"]);
		expect(r.improvedRecommendation).toBe("개선된 문구입니다.");
	});

	it("점수 < 70 이면 passed=false", async () => {
		const llm: QualityLLMProvider = {
			generate: async () =>
				JSON.stringify({
					qualityScore: 50,
					issues: ["불명확"],
					improvedRecommendation: "더 나은 표현",
				}),
		};
		const checker = new RecommendationQualityChecker(llm);
		const r = await checker.check(makeInput("원본"));
		expect(r.passed).toBe(false);
		expect(r.improvedRecommendation).toBe("더 나은 표현");
	});

	it("```json 펜스로 감싼 응답도 파싱", async () => {
		const llm: QualityLLMProvider = {
			generate: async () =>
				'응답:\n```json\n{"qualityScore":90,"issues":[],"improvedRecommendation":null}\n```\n끝',
		};
		const checker = new RecommendationQualityChecker(llm);
		const r = await checker.check(makeInput("x"));
		expect(r.qualityScore).toBe(90);
		expect(r.improvedRecommendation).toBeUndefined();
	});

	it("improvedRecommendation:null 은 undefined 로 매핑", async () => {
		const llm: QualityLLMProvider = {
			generate: async () =>
				JSON.stringify({
					qualityScore: 75,
					issues: [],
					improvedRecommendation: null,
				}),
		};
		const checker = new RecommendationQualityChecker(llm);
		const r = await checker.check(makeInput("x"));
		expect(r.improvedRecommendation).toBeUndefined();
	});

	it("LLM throw 발생 시 rule-based 폴백", async () => {
		const llm: QualityLLMProvider = {
			generate: vi.fn().mockRejectedValue(new Error("LLM down")),
		};
		const checker = new RecommendationQualityChecker(llm);
		const r = await checker.check(
			makeInput(
				"예를 들어 테스트카페에 '<title>테스트카페 | 핸드드립</title>' 형식으로 title 태그를 추가하세요. 서울 강남 노출 향상에 도움이 됩니다.",
			),
		);
		// 폴백 결과는 rule-based 점수 (꽤 좋은 텍스트 → 70+)
		expect(r.qualityScore).toBeGreaterThanOrEqual(70);
		expect(llm.generate).toHaveBeenCalledTimes(1);
	});

	it("LLM 응답이 잘못된 형식이면 rule-based 폴백 사용", async () => {
		const llm: QualityLLMProvider = {
			generate: async () => "그냥 평문, JSON 아님",
		};
		const checker = new RecommendationQualityChecker(llm);
		const r = await checker.check(makeInput("짧"));
		// rule-based 폴백 → 너무 짧음 감점
		expect(r.issues).toContain("너무 짧음");
	});
});

// ---------------------------------------------------------------------------
// Scenario 4: parseQualityResponse 직접 호출
// ---------------------------------------------------------------------------

describe("parseQualityResponse()", () => {
	const input = makeInput("any");

	it("전체가 JSON인 응답을 파싱", () => {
		const r = parseQualityResponse(
			JSON.stringify({ qualityScore: 80, issues: ["a"] }),
			input,
		);
		expect(r.qualityScore).toBe(80);
		expect(r.issues).toEqual(["a"]);
	});

	it("점수가 문자열이어도 숫자로 변환", () => {
		const r = parseQualityResponse('{"qualityScore":"75","issues":[]}', input);
		expect(r.qualityScore).toBe(75);
	});

	it("점수가 100 초과면 100으로 클램프", () => {
		const r = parseQualityResponse('{"qualityScore":150,"issues":[]}', input);
		expect(r.qualityScore).toBe(100);
	});

	it("점수가 음수면 0으로 클램프", () => {
		const r = parseQualityResponse('{"qualityScore":-5,"issues":[]}', input);
		expect(r.qualityScore).toBe(0);
	});

	it("issues 에 비문자열이 섞이면 필터링", () => {
		const r = parseQualityResponse(
			'{"qualityScore":70,"issues":["ok",42,null,"good"]}',
			input,
		);
		expect(r.issues).toEqual(["ok", "good"]);
	});

	it("응답이 빈 문자열이면 0점 폴백", () => {
		const r = parseQualityResponse("", input);
		expect(r.qualityScore).toBe(0);
		expect(r.issues).toEqual([]);
		expect(r.passed).toBe(false);
	});

	it("응답이 잘못된 JSON이면 0점 폴백", () => {
		const r = parseQualityResponse("{not json}", input);
		expect(r.qualityScore).toBe(0);
		expect(r.passed).toBe(false);
	});

	it("중괄호 슬라이스 추출 (앞뒤 평문)", () => {
		const r = parseQualityResponse(
			'before {"qualityScore": 65, "issues": ["x"]} after',
			input,
		);
		expect(r.qualityScore).toBe(65);
		expect(r.issues).toEqual(["x"]);
	});

	it("improvedRecommendation 공백/빈 문자열은 undefined", () => {
		const r = parseQualityResponse(
			'{"qualityScore":70,"issues":[],"improvedRecommendation":"   "}',
			input,
		);
		expect(r.improvedRecommendation).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Scenario 5: buildQualityPrompt
// ---------------------------------------------------------------------------

describe("buildQualityPrompt()", () => {
	it("프롬프트에 룰 ID / 컨텍스트 / 추천 문구가 모두 포함된다", () => {
		const p = buildQualityPrompt(makeInput("어떤 문구", "SEO-META-001"));
		expect(p).toContain("SEO-META-001");
		expect(p).toContain("테스트카페");
		expect(p).toContain("서울 강남");
		expect(p).toContain("카페");
		expect(p).toContain("어떤 문구");
	});

	it("프롬프트는 JSON 응답 지침을 포함한다", () => {
		const p = buildQualityPrompt(makeInput("x"));
		expect(p).toContain("JSON");
		expect(p).toContain("qualityScore");
		expect(p).toContain("issues");
	});
});
