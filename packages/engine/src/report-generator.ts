/**
 * X-SAG Core Engine — Report JSON Generator
 *
 * TASK-CORE-010: DiagnosisJson 생성 + Zod 검증
 * contracts 의 DiagnosisJsonSchema (TRD § 7.2) 와 1:1 일치하는 객체 생성.
 *
 * POLICY § 7.1: 규칙 기반, 결정적 출력
 * POLICY § 7.2: isAiGenerated 플래그 모든 항목에 포함
 */

import {
	ENGINE_VERSION,
	SCHEMA_VERSION,
	SCORING_VERSION,
} from "@boina/contracts";
import {
	type AnalyzedPage,
	type BusinessPresenceModel,
	type DiagnosisItem,
	type DiagnosisJson,
	DiagnosisJsonSchema,
	type LlmValidation,
	type NaverPresence,
	type PlatformLimitation,
	type Recommendations,
	type Scores,
	type SnippetAvailability,
	type Summary,
	scoreGrade,
} from "@boina/contracts/diagnosis";
import type { Category, IndustryId, SourceType } from "@boina/contracts/enums";
import type { ParsedPage } from "./types.js";

// ---------------------------------------------------------------------------
// ReportGeneratorInput — report-generator 호출 시 필요한 모든 입력
// ---------------------------------------------------------------------------

export interface ReportScores {
	overallScore: number;
	seoScore: number | null;
	aeoScore: number | null;
	geoScore: number | null;
	/** Lighthouse Performance score — optional; omit or null when PERF module not requested. */
	perfScore?: number | null;
}

export interface ReportGeneratorInput {
	reportId: string;
	profileId?: string;
	websiteUrl: string;
	sourceType?: SourceType;
	businessName: string;
	industry: string;
	region: string;
	mainServices: string[];
	targetKeywords: string[];
	modules: Category[];
	scores: ReportScores;
	startedAt: string;
	completedAt: string;
	durationMs: number;
	analyzedPages: AnalyzedPage[];
	platformLimitations?: PlatformLimitation[];
	businessPresence?: BusinessPresenceModel;
	naverPresence?: NaverPresence;
	llmValidation?: LlmValidation;
	items: DiagnosisItem[];
	recommendations: Recommendations;
	snippets?: SnippetAvailability[];
	/** vendor_action itemIds (FR-010) */
	prescriptionItems?: string[];
	/** v0.4 신규 — 산업별 카피 렌더에 사용된 industryId (additive, optional) */
	industryId?: IndustryId;
}

// ---------------------------------------------------------------------------
// parsedPageToAnalyzedPage — ParsedPage → AnalyzedPage 변환
// ---------------------------------------------------------------------------

export function parsedPageToAnalyzedPage(
	p: ParsedPage,
	isMainPage = false,
): AnalyzedPage {
	// ogTags: meta에서 og: 접두사 키만 추출
	const ogTags: Record<string, string> = {};
	for (const [key, val] of Object.entries(p.meta)) {
		if (key.startsWith("og:") || key.startsWith("og_")) {
			ogTags[key] = val;
		}
	}

	// imgAltRatio: images 배열에서 alt 있는 비율 계산
	const imgAltRatio =
		p.images.length > 0
			? p.images.filter((img) => img.alt !== null && img.alt.trim() !== "")
					.length / p.images.length
			: null;

	// schemas: schemaJsonLd 배열에서 @type 추출
	const schemas = (p.schemaJsonLd ?? [])
		.filter(
			(s): s is Record<string, unknown> =>
				typeof s === "object" && s !== null && "@type" in s,
		)
		.map((s) => ({
			type: String(s["@type"]),
			raw: s as Record<string, unknown>,
		}));

	return {
		url: p.url,
		isMainPage,
		httpStatus: p.statusCode,
		responseTimeMs: null,
		robotsBlocked: p.robotsMeta ? /noindex|none/i.test(p.robotsMeta) : false,
		jsRenderFailed: p.failureReason === "JS_RENDER_FAILED",
		...(p.failureReason ? { failureReason: p.failureReason } : {}),
		extractedMeta: {
			title: p.title,
			description: p.description,
			h1: p.h1 ? [p.h1] : [],
			h2: p.h2 ?? [],
			canonical: p.canonicalUrl,
			...(Object.keys(ogTags).length > 0 ? { ogTags } : {}),
			imgAltRatio,
		},
		schemas,
	};
}

// ---------------------------------------------------------------------------
// generateSummary — 간단한 한국어 요약 (규칙 기반)
// ---------------------------------------------------------------------------

export function generateSummary(
	scores: ReportScores,
	items: DiagnosisItem[],
): Summary {
	const overall = scores.overallScore;

	// headline 생성
	let headline: string;
	if (overall >= 80) {
		headline =
			"홈페이지의 SEO/AEO/GEO 최적화 수준이 전반적으로 우수합니다. 일부 세부 항목을 보완하면 더욱 완성도 있는 구조를 갖출 수 있습니다.";
	} else if (overall >= 60) {
		headline =
			"홈페이지의 기본 구조는 갖춰져 있으나 FAQ, 구조화 데이터, 지역 기반 서비스 설명이 부족합니다. 우선순위 높은 항목부터 개선하세요.";
	} else if (overall >= 40) {
		headline =
			"홈페이지의 SEO 최적화가 미흡합니다. 기본 메타 태그, 구조화 데이터, 지역 정보 등 핵심 항목을 우선 개선해야 합니다.";
	} else {
		headline =
			"홈페이지의 검색엔진·AI 검색 최적화가 매우 부족한 상태입니다. 기초부터 체계적인 개선이 필요합니다.";
	}

	// topIssues: high → medium 순, 최대 5개
	const topIssues = items
		.filter((item) => !item.isAiGenerated || item.priority === "high")
		.sort((a, b) => {
			const order = { high: 0, medium: 1, low: 2 } as const;
			return order[a.priority] - order[b.priority];
		})
		.slice(0, 5)
		.map((item) => ({
			itemId: item.id,
			title: item.title,
			category: item.category,
			priority: item.priority,
		}));

	// actionCounts: items 에서 집계
	const actionCounts = {
		self_fix: items.filter((i) => i.actionType === "self_fix").length,
		snippet_action: items.filter((i) => i.actionType === "snippet_action")
			.length,
		vendor_action: items.filter((i) => i.actionType === "vendor_action").length,
		si_action: items.filter((i) => i.actionType === "si_action").length,
	};

	return { headline, topIssues, actionCounts };
}

// ---------------------------------------------------------------------------
// generateReportJson — DiagnosisJson 생성 + Zod 검증
// ---------------------------------------------------------------------------

export function generateReportJson(input: ReportGeneratorInput): DiagnosisJson {
	const scores: Scores = {
		overall: input.scores.overallScore,
		seo: input.scores.seoScore,
		aeo: input.scores.aeoScore,
		geo: input.scores.geoScore,
		// perf: only included when explicitly provided — null/undefined → field absent
		...(input.scores.perfScore !== undefined
			? { perf: input.scores.perfScore ?? null }
			: {}),
		grade: scoreGrade(input.scores.overallScore),
		disclaimer: "참고 지표입니다. 노출을 보장하지 않습니다.",
	};

	const summary = generateSummary(input.scores, input.items);

	const doc: DiagnosisJson = {
		schemaVersion: SCHEMA_VERSION,
		reportId: input.reportId,
		profileId: input.profileId ?? null,
		// v0.4 신규 (additive) — 카피 렌더에 사용된 industryId
		...(input.industryId !== undefined ? { industryId: input.industryId } : {}),

		meta: {
			websiteUrl: input.websiteUrl,
			...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
			businessName: input.businessName,
			industry: input.industry,
			region: input.region,
			mainServices: input.mainServices,
			targetKeywords: input.targetKeywords,
			modules: input.modules,
			engineVersion: ENGINE_VERSION,
			scoringVersion: SCORING_VERSION,
			startedAt: input.startedAt,
			completedAt: input.completedAt,
			durationMs: input.durationMs,
			...(input.platformLimitations !== undefined &&
			input.platformLimitations.length > 0
				? { platformLimitations: input.platformLimitations }
				: {}),
			...(input.businessPresence !== undefined
				? { businessPresence: input.businessPresence }
				: {}),
			...(input.naverPresence !== undefined
				? { naverPresence: input.naverPresence }
				: {}),
			...(input.llmValidation !== undefined
				? { llmValidation: input.llmValidation }
				: {}),
		},

		scores,
		summary,
		analyzedPages: input.analyzedPages,
		items: input.items,
		recommendations: input.recommendations,
		snippets: input.snippets ?? [],
		prescriptionItems: input.prescriptionItems ?? [],
	};

	// Zod 검증 — 실패 시 ZodError throw
	return DiagnosisJsonSchema.parse(doc);
}
