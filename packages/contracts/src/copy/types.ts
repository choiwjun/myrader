/**
 * X-SAG Contracts — Copy Module Types
 *
 * @TASK TASK-COPY-001 — 카피 인터페이스 정의
 * @SPEC docs/features/x-sag-diagnosis-engine/TRD.md#v0.4.1
 *
 * TRD § v0.4.1 인터페이스를 그대로 채택.
 * 비서 톤 카피 템플릿 + 산업별 vocab 시스템.
 */

import { z } from "zod";
// IndustryId는 enums.ts 에서 정의 — 이 파일에서 재정의하지 않음
// (packages/contracts/src/index.ts 통합 시 충돌 방지)
export type { IndustryId } from "../enums.js";
import type { IndustryId } from "../enums.js";

// ---------------------------------------------------------------------------
// IndustryVocab — 산업별 12 필드 어휘 사전
// ---------------------------------------------------------------------------

export interface IndustryVocab {
	/** 산업 식별자 (영문 소문자) */
	id: IndustryId;
	/** 단수형 한국어 호칭 — "카페", "식당", "의원" */
	name: string;
	/** 비교 문구용 복수형 — harm 슬롯 "비슷한 {plural}" */
	plural: string;
	/** 손님 호칭 — title 슬롯 "{customer}들이 묻는 걸" */
	customer: string;
	/** 사이트 자연스러운 호칭 — title 슬롯 "{site}에 답이 없어요" */
	site: string;
	/** 벤더 유형 — action_pro 슬롯 "{vendor_type}한테 부탁하시면" */
	vendor_type: string;
	/** 사장님이 관리해야 할 핵심 필드 5개 이내 */
	typical_fields: string[];
	/** harm 슬롯 비교 문구 앵커 */
	comparison_phrase_anchor: string;
	/** 산업별 계절·시기성 요소 */
	seasonal_concerns: string[];
	/** action_self 시간 표현 */
	est_time_dictionary: { short: string; medium: string; long: string };
	/** action_pro 비용 표현 */
	est_cost_dictionary: { low: string; mid: string; high: string };
	/** 산업별 특수 주의사항 */
	compliance_notes: string[];
}

// ---------------------------------------------------------------------------
// RuleCopyTemplate — 룰 × 5슬롯 카피 템플릿
// ---------------------------------------------------------------------------

export interface RuleCopyTemplate {
	ruleId: string;
	category: "seo" | "aeo" | "geo" | "self";
	defaultPriority: "high" | "medium" | "low";
	version: string;
	slots: {
		title: string;
		harm: string;
		action_self: string;
		action_pro: string;
		cta: string;
	};
}

// ---------------------------------------------------------------------------
// RuleCopyRendered — 변수 치환 후 렌더링 결과
// ---------------------------------------------------------------------------

export interface RuleCopyRendered {
	ruleId: string;
	industry: IndustryId;
	templateVersion: string;
	priority?: "high" | "medium" | "low";
	rendered: {
		title: string;
		harm: string;
		action_self: string;
		action_pro: string;
		cta: string;
	};
	unrenderedVars: string[];
	fallbackToGeneral: boolean;
}

// ---------------------------------------------------------------------------
// Zod Schemas — 런타임 검증 + DiagnosisJson 통합 대비
// ---------------------------------------------------------------------------

export const IndustryVocabSchema = z.object({
	id: z.enum([
		"cafe",
		"restaurant",
		"clinic",
		"academy",
		"salon",
		"workshop",
		"retail",
		"general",
	]),
	name: z.string().min(1),
	plural: z.string().min(1),
	customer: z.string().min(1),
	site: z.string().min(1),
	vendor_type: z.string().min(1),
	typical_fields: z.array(z.string()).min(1).max(5),
	comparison_phrase_anchor: z.string().min(1),
	seasonal_concerns: z.array(z.string()),
	est_time_dictionary: z.object({
		short: z.string().min(1),
		medium: z.string().min(1),
		long: z.string().min(1),
	}),
	est_cost_dictionary: z.object({
		low: z.string().min(1),
		mid: z.string().min(1),
		high: z.string().min(1),
	}),
	compliance_notes: z.array(z.string()),
});

export const RuleCopyTemplateSchema = z.object({
	ruleId: z.string().min(1),
	category: z.enum(["seo", "aeo", "geo", "self"]),
	defaultPriority: z.enum(["high", "medium", "low"]),
	version: z.string().min(1),
	slots: z.object({
		title: z.string().min(1).max(240),
		harm: z.string().min(1).max(240),
		action_self: z.string().min(1).max(240),
		action_pro: z.string().min(1).max(240),
		cta: z.string().min(1).max(8),
	}),
});

export const RuleCopyRenderedSchema = z.object({
	ruleId: z.string().min(1),
	industry: z.enum([
		"cafe",
		"restaurant",
		"clinic",
		"academy",
		"salon",
		"workshop",
		"retail",
		"general",
	]),
	templateVersion: z.string().min(1),
	priority: z.enum(["high", "medium", "low"]).optional(),
	rendered: z.object({
		title: z.string(),
		harm: z.string(),
		action_self: z.string(),
		action_pro: z.string(),
		cta: z.string(),
	}),
	unrenderedVars: z.array(z.string()),
	fallbackToGeneral: z.boolean(),
});
