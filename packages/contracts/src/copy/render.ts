/**
 * X-SAG Contracts — 카피 렌더 엔진
 *
 * @TASK TASK-COPY-005 — 변수 치환 함수
 * @SPEC docs/features/x-sag-diagnosis-engine/TRD.md#v0.4.2
 *
 * IndustryVocab → 변수 맵 변환 + 슬롯 치환 + general 폴백 처리.
 * 미치환 변수 검출 (Sentry 경고 연계).
 */

import { INDUSTRY_VOCAB, getVocabOrFallback } from "./industry-vocab.ko.js";
import { RULE_COPY } from "./rule-copy.ko.js";
import type {
	IndustryId,
	IndustryVocab,
	RuleCopyRendered,
	RuleCopyTemplate,
} from "./types.js";

// ---------------------------------------------------------------------------
// vocabToVars — IndustryVocab → variable map 변환
// ---------------------------------------------------------------------------

/**
 * IndustryVocab → 변수 맵 변환.
 * est_time_dictionary, est_cost_dictionary 는 평탄화.
 * 모든 12 필드 → 12 + 3 = 15개 변수 키 생성.
 */
export function vocabToVars(vocab: IndustryVocab): Record<string, string> {
	return {
		name: vocab.name,
		plural: vocab.plural,
		customer: vocab.customer,
		site: vocab.site,
		vendor_type: vocab.vendor_type,
		comparison_phrase_anchor: vocab.comparison_phrase_anchor,
		est_time_short: vocab.est_time_dictionary.short,
		est_time_medium: vocab.est_time_dictionary.medium,
		est_time_long: vocab.est_time_dictionary.long,
		est_cost_low: vocab.est_cost_dictionary.low,
		est_cost_mid: vocab.est_cost_dictionary.mid,
		est_cost_high: vocab.est_cost_dictionary.high,
	};
}

// ---------------------------------------------------------------------------
// renderSlot — 단일 슬롯 변수 치환
// ---------------------------------------------------------------------------

/**
 * 단일 슬롯 변수 치환.
 * @param template 슬롯 템플릿 문자열 (예: "{site}에 이름표가 없어요")
 * @param vars 변수 맵 (예: { site: "카페 사이트" })
 * @returns 치환된 텍스트 + 미치환 변수 목록
 */
export function renderSlot(
	template: string,
	vars: Record<string, string>,
): {
	text: string;
	unrendered: string[];
} {
	const unrendered: string[] = [];
	// g 플래그 정규식은 lastIndex 상태를 가지므로 매 호출마다 새로 생성한다.
	const pattern = /\{(\w+)\}/g;
	const text = template.replace(pattern, (match, key: string): string => {
		if (key in vars) return vars[key] as string;
		unrendered.push(key);
		return match;
	});
	return { text, unrendered };
}

// ---------------------------------------------------------------------------
// renderAllSlots — 5슬롯 전체 치환 (내부 헬퍼)
// ---------------------------------------------------------------------------

type SlotKey = "title" | "harm" | "action_self" | "action_pro" | "cta";
const SLOT_KEYS: SlotKey[] = [
	"title",
	"harm",
	"action_self",
	"action_pro",
	"cta",
];

function renderAllSlots(
	template: RuleCopyTemplate,
	vars: Record<string, string>,
): { rendered: Record<SlotKey, string>; allUnrendered: string[] } {
	const rendered = {} as Record<SlotKey, string>;
	const allUnrendered: string[] = [];

	for (const slot of SLOT_KEYS) {
		const result = renderSlot(template.slots[slot], vars);
		rendered[slot] = result.text;
		allUnrendered.push(...result.unrendered);
	}

	return { rendered, allUnrendered };
}

// ---------------------------------------------------------------------------
// renderRuleCopy — 룰 + 산업 → 5슬롯 카피 렌더
// ---------------------------------------------------------------------------

/**
 * 룰 + 산업 → 5슬롯 카피 렌더.
 * 룰 카피 미존재 시 null 반환 (API 측에서 처리).
 * 산업 vocab 미존재 또는 미치환 변수 발생 시 general 폴백.
 */
export function renderRuleCopy(
	ruleId: string,
	industry: IndustryId | undefined,
): RuleCopyRendered | null {
	const template = RULE_COPY[ruleId];
	if (!template) return null; // 카피 시드 없는 룰은 null 반환

	// industry가 undefined이거나 INDUSTRY_VOCAB에 없는 경우 general 폴백
	const hasRequestedVocab =
		industry !== undefined && industry in INDUSTRY_VOCAB;

	const requestedIndustry: IndustryId =
		hasRequestedVocab && industry !== undefined ? industry : "general";
	const initialFallback = !hasRequestedVocab;

	// 1차 시도: 요청된 산업 vocab 사용
	const vocab = INDUSTRY_VOCAB[requestedIndustry] ?? INDUSTRY_VOCAB.general;

	const vars = vocabToVars(vocab);
	const { rendered, allUnrendered } = renderAllSlots(template, vars);

	// 2차 시도: 미치환 변수가 있고 아직 general 폴백 전이라면 general 재시도
	if (allUnrendered.length > 0 && !initialFallback) {
		const generalVars = vocabToVars(INDUSTRY_VOCAB.general);
		const { rendered: retryRendered, allUnrendered: retryUnrendered } =
			renderAllSlots(template, generalVars);
		return {
			ruleId,
			industry: "general",
			templateVersion: template.version,
			priority: template.defaultPriority,
			rendered: retryRendered,
			unrenderedVars: Array.from(new Set(retryUnrendered)),
			fallbackToGeneral: true,
		};
	}

	return {
		ruleId,
		industry: initialFallback ? "general" : requestedIndustry,
		templateVersion: template.version,
		priority: template.defaultPriority,
		rendered,
		unrenderedVars: Array.from(new Set(allUnrendered)),
		fallbackToGeneral: initialFallback,
	};
}

// ---------------------------------------------------------------------------
// hasUnrenderedVars — 미치환 변수 검출 헬퍼 (Sentry 경고용)
// ---------------------------------------------------------------------------

/**
 * 미치환 변수 검출 헬퍼.
 * Sentry 경고 또는 관리자 알림 시스템 연계 사용.
 */
export function hasUnrenderedVars(result: RuleCopyRendered): boolean {
	return result.unrenderedVars.length > 0;
}

// ---------------------------------------------------------------------------
// renderAllRules — 특정 산업의 모든 룰 렌더 (배치용)
// ---------------------------------------------------------------------------

/**
 * 등록된 모든 룰에 대해 특정 산업 카피를 렌더.
 * null 결과(카피 시드 없는 룰)는 필터링.
 */
export function renderAllRules(
	industry: IndustryId | undefined,
): RuleCopyRendered[] {
	const results: RuleCopyRendered[] = [];
	for (const ruleId of Object.keys(RULE_COPY)) {
		const result = renderRuleCopy(ruleId, industry);
		if (result !== null) results.push(result);
	}
	return results;
}

// Re-export vocab helper for convenience
export { getVocabOrFallback, vocabToVars as buildVarsFromIndustry };
