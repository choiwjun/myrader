/**
 * X-SAG Core Engine — 추천 품질 검수 프롬프트 (Phase P-C)
 *
 * LLM에 한국어 SEO 추천 문구를 검수시키기 위한 프롬프트/파서 유틸.
 * LLM provider 인터페이스는 의도적으로 `(prompt: string) => Promise<string>` 로 두어
 * RecommendationProvider 와 직접 결합되지 않도록 한다.
 */

import type { BusinessContext } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityCheckInput {
	ruleId: string;
	recommendation: string;
	context: BusinessContext;
}

export interface QualityCheckResult {
	ruleId: string;
	originalRecommendation: string;
	qualityScore: number; // 0~100
	issues: string[];
	improvedRecommendation?: string;
	passed: boolean; // qualityScore >= 70
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

export function buildQualityPrompt(input: QualityCheckInput): string {
	const { businessName, industry, region } = input.context;
	return `다음 한국 소상공인 대상 SEO 추천 문구를 검수해라.

룰 ID: ${input.ruleId}
업종: ${industry}
지역: ${region}
매장명: ${businessName}

추천 문구:
"${input.recommendation}"

검수 기준:
1. 자연스러운 한국어인가 (어색한 번역체 X)
2. 비전문가가 이해 가능한가
3. 구체적 실행 방법 포함하는가
4. 톤이 친절하고 적절한가 (명령조 과다 X)
5. 길이 적절한가 (50~200자)
6. 업종/지역 맥락 반영하는가

JSON 응답 (다른 텍스트 없이 JSON만):
{
  "qualityScore": 0~100 정수,
  "issues": ["문제 1", "문제 2"],
  "improvedRecommendation": "개선된 버전 또는 null"
}`;
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

/**
 * LLM 응답 문자열을 QualityCheckResult 로 파싱.
 * 응답이 JSON이 아니거나 형식이 다르면 안전한 폴백을 반환한다.
 */
export function parseQualityResponse(
	response: string,
	input: QualityCheckInput,
): QualityCheckResult {
	const parsed = extractJson(response);

	const score = clampScore(parsed?.qualityScore);
	const issues = Array.isArray(parsed?.issues)
		? (parsed.issues as unknown[]).filter(
				(x): x is string => typeof x === "string",
			)
		: [];

	let improved: string | undefined;
	const raw = parsed?.improvedRecommendation;
	if (
		typeof raw === "string" &&
		raw.trim().length > 0 &&
		raw.trim() !== "null"
	) {
		improved = raw.trim();
	}

	const result: QualityCheckResult = {
		ruleId: input.ruleId,
		originalRecommendation: input.recommendation,
		qualityScore: score,
		issues,
		passed: score >= 70,
	};
	if (improved !== undefined) {
		result.improvedRecommendation = improved;
	}
	return result;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface RawQualityPayload {
	qualityScore?: unknown;
	issues?: unknown;
	improvedRecommendation?: unknown;
}

/**
 * 응답 문자열에서 JSON 페이로드를 추출. 다음 순서로 시도:
 *  1. 전체가 JSON
 *  2. ```json ... ``` 코드 블록
 *  3. 첫 `{` ~ 마지막 `}` 슬라이스
 * 모두 실패하면 null.
 */
function extractJson(response: string): RawQualityPayload | null {
	const trimmed = response.trim();
	if (!trimmed) return null;

	// 1. 전체 JSON
	const direct = tryParse(trimmed);
	if (direct) return direct;

	// 2. ```json fence
	const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	if (fenceMatch?.[1]) {
		const fenced = tryParse(fenceMatch[1]);
		if (fenced) return fenced;
	}

	// 3. brace slice
	const first = trimmed.indexOf("{");
	const last = trimmed.lastIndexOf("}");
	if (first !== -1 && last > first) {
		const slice = trimmed.substring(first, last + 1);
		const sliced = tryParse(slice);
		if (sliced) return sliced;
	}

	return null;
}

function tryParse(s: string): RawQualityPayload | null {
	try {
		const v = JSON.parse(s);
		if (typeof v === "object" && v !== null) return v as RawQualityPayload;
		return null;
	} catch {
		return null;
	}
}

function clampScore(raw: unknown): number {
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return Math.max(0, Math.min(100, Math.round(raw)));
	}
	if (typeof raw === "string") {
		const n = Number.parseFloat(raw);
		if (Number.isFinite(n)) {
			return Math.max(0, Math.min(100, Math.round(n)));
		}
	}
	return 0;
}
