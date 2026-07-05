/**
 * X-SAG Contracts — Standard Diagnosis JSON Schema (FR-017)
 *
 * Source: TRD § 7.2 (DiagnosisJsonV1).
 * schemaVersion: 1.0.0
 *
 * This is the single source of truth for the Diagnosis JSON structure.
 * All layers (Web, API, Worker, Admin, External API) must import from here.
 *
 * Import: import { DiagnosisJsonSchema, type DiagnosisJson } from "@boina/contracts/diagnosis";
 */

import { z } from "zod";
import {
  CategorySchema,
  ActionTypeSchema,
  PrioritySchema,
  DifficultySchema,
  GradeSchema,
  SnippetTypeSchema,
  CrawlFailureReasonSchema,
  IndustryIdSchema,
  SourceTypeSchema,
} from "./enums.js";
import { RuleCopyRenderedSchema } from "./copy/types.js";

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/** Integer score 0–100 inclusive. */
export const ScoreSchema = z.number().int().min(0).max(100);
export type Score = z.infer<typeof ScoreSchema>;

/** Nullable integer score (some category scores may be null if module not requested). */
export const NullableScoreSchema = ScoreSchema.nullable();

// ---------------------------------------------------------------------------
// meta
// ---------------------------------------------------------------------------

export const PlatformLimitationSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  affectedCategories: z.array(CategorySchema).optional(),
});
export type PlatformLimitation = z.infer<typeof PlatformLimitationSchema>;

export const BusinessPresenceSurfaceKindSchema = z.enum([
  "website",
  "place",
  "blog",
  "social",
  "video",
  "map",
  "review",
  "reservation",
  "other",
]);
export type BusinessPresenceSurfaceKind = z.infer<typeof BusinessPresenceSurfaceKindSchema>;

export const BusinessPresenceSurfaceSchema = z.object({
  sourceType: SourceTypeSchema,
  surfaceKind: BusinessPresenceSurfaceKindSchema.optional(),
  url: z.string().url(),
  status: z.enum(["fetched", "skipped", "failed"]),
  sourceLabel: z.string(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  services: z.array(z.string()).optional(),
  limitations: z.array(PlatformLimitationSchema).optional(),
});
export type BusinessPresenceSurface = z.infer<typeof BusinessPresenceSurfaceSchema>;

export const BusinessPresenceModelSchema = z.object({
  primarySourceType: SourceTypeSchema,
  primaryUrl: z.string().url(),
  canonicalName: z.string().nullable(),
  services: z.array(z.string()),
  surfaces: z.array(BusinessPresenceSurfaceSchema),
  limitations: z.array(PlatformLimitationSchema).optional(),
});
export type BusinessPresenceModel = z.infer<typeof BusinessPresenceModelSchema>;

/**
 * 네이버 지역 SERP 상위에 실제로 노출된 경쟁 업체 1건.
 *
 * 정직성 원칙: `name` 은 네이버 Search API(local) 가 반환한 실 랭킹 항목의
 * 업체명만 사용한다. 내 업체는 제외한다. 정규식/휴리스틱으로 응답 텍스트에서
 * 긁어낸 이름은 절대 넣지 않는다. source 는 항상 "naver_serp" 고정.
 *
 * 파싱 실패·자격증명 없음·내 업체만 노출 등으로 신뢰할 수 있는 경쟁 업체명을
 * 얻지 못하면 competitorTop 자체를 생략하거나 빈 배열로 둔다(틀린 이름 노출 금지).
 */
export const NaverCompetitorSchema = z.object({
  /** 네이버 local SERP 실 랭킹 항목의 업체명(내 업체 제외). */
  name: z.string().min(1),
  /** SERP 노출 순위(1-based). */
  rank: z.number().int().positive(),
  /** 이 경쟁사가 상위 노출된 검색 질의. */
  query: z.string().min(1),
  /** 신뢰 소스 고정값 — 네이버 실 SERP 랭킹. */
  source: z.literal("naver_serp"),
});
export type NaverCompetitor = z.infer<typeof NaverCompetitorSchema>;

/**
 * 실제 네이버 검색 노출(라이브 측정) — 준비도 점수가 아니라 "진짜 뜨는지".
 * Naver Search API(local/web/blog)로 측정. 자격증명 없으면 생략(optional).
 */
export const NaverPresenceSchema = z.object({
  place: z.object({
    queries: z.array(
      z.object({
        query: z.string(),
        found: z.boolean(),
        rank: z.number().int().nullable(),
      }),
    ),
    visibleCount: z.number().int().nonnegative(),
    totalQueries: z.number().int().nonnegative(),
  }),
  web: z.object({
    homepageFound: z.boolean(),
    homepageRank: z.number().int().nullable(),
    blogDominatesTop: z.boolean(),
  }),
  blog: z.object({ reviewCount: z.number().int().nonnegative() }),
  checkedAt: z.string().optional(),
  source: z.string().optional(),
  /**
   * (additive, optional) 네이버 지역 SERP 상위에 실제로 뜬 경쟁 업체 — 내 업체 제외.
   * 손실 프레이밍 티저("경쟁사 OOO는 네이버 1위, 당신은 안 보임")용 실 랭킹 근거.
   * 신뢰 소스(naver_serp 실 랭킹)로 확인된 항목만. 없으면 생략/빈 배열(graceful degrade).
   * UI 는 이 배열과 LlmValidation.competitors 를 정규화 이름 매칭하여 교차검증("both")을
   * 런타임 계산한다(B/C 독립 저장 유지 — 교차결과는 영속화하지 않음).
   */
  competitorTop: z.array(NaverCompetitorSchema).optional(),
});
export type NaverPresence = z.infer<typeof NaverPresenceSchema>;

/**
 * grounded GPT 답변이 사용자(내 업체) 대신 추천한 경쟁 업체 1건.
 *
 * 정직성 원칙: `name` 은 grounded GPT 응답에서 **구조화 추출**(결정적 파싱, 모델에게
 * 자유 창작·이름 추가 금지)로 얻은 업체명만 사용한다. GeoCitation.mentionedCompetitors
 * 같은 정규식 휴리스틱 추출명은 절대 재사용하지 않는다(틀린 이름 노출 < 이름 생략).
 * grounded=false(학습기억 모드)거나 구조화 추출 실패 시 competitors 자체를 생략한다.
 * source 는 항상 "gpt_grounded" 고정.
 */
export const LlmCompetitorSchema = z.object({
  /** grounded GPT 응답에서 구조화 추출한 추천 경쟁 업체명(내 업체 제외). */
  name: z.string().min(1),
  /** 이 경쟁사가 추천으로 등장한 질의 수(빈도순 정렬 기준). */
  mentionedInQueries: z.number().int().positive(),
  /** 대표 질의 예시(있으면) — "GPT가 ~~ 물으면 이 업체를 추천" 카피용. */
  sampleQuery: z.string().min(1).optional(),
  /** 신뢰 소스 고정값 — grounded GPT 구조화 추출. */
  source: z.literal("gpt_grounded"),
});
export type LlmCompetitor = z.infer<typeof LlmCompetitorSchema>;

/**
 * 실제 GPT·AI 노출 측정(WS5a, informational, 점수 미반영).
 * grounded=false 면 학습기억(브랜드 친숙도) 측정 — disclaimer 로 명시.
 */
export const LlmValidationSchema = z.object({
  provider: z.string(),
  grounded: z.boolean(),
  disclaimer: z.string(),
  geo: z
    .object({ mentionRate: z.number(), directMentionRate: z.number() })
    .nullable(),
  aeo: z
    .object({ appearanceRate: z.number(), prominenceScore: z.number() })
    .nullable(),
  /**
   * (additive, optional) grounded GPT 가 내 업체 대신 추천한 경쟁 업체 top N(빈도순).
   * 손실 프레이밍 티저("경쟁사 OOO는 GPT도 추천, 당신은 안 보임")용 근거.
   * grounded=true + 구조화 추출 성공일 때만 채운다. grounded=false 거나 파싱 실패면 생략.
   * UI 는 이 배열과 NaverPresence.competitorTop 를 정규화 이름 매칭하여 교차검증("both")을
   * 런타임 계산한다(B/C 독립 저장 유지 — 교차결과는 영속화하지 않음).
   */
  competitors: z.array(LlmCompetitorSchema).optional(),
});
export type LlmValidation = z.infer<typeof LlmValidationSchema>;

export const DiagnosisMetaSchema = z.object({
  websiteUrl: z.string().url(),
  sourceType: SourceTypeSchema.optional(),
  businessName: z.string().min(1).max(50),
  industry: z.string().min(1),
  region: z.string().min(1),
  mainServices: z.array(z.string().max(50)).min(1).max(5),
  targetKeywords: z.array(z.string().max(30)).min(1).max(10),
  modules: z.array(CategorySchema).min(1),
  engineVersion: z.string(),    // semver e.g. "1.0.0"
  scoringVersion: z.string(),   // semver e.g. "1.0.0"
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  platformLimitations: z.array(PlatformLimitationSchema).optional(),
  businessPresence: BusinessPresenceModelSchema.optional(),
  naverPresence: NaverPresenceSchema.optional(),
  llmValidation: LlmValidationSchema.optional(),
});
export type DiagnosisMeta = z.infer<typeof DiagnosisMetaSchema>;

// ---------------------------------------------------------------------------
// scores
// ---------------------------------------------------------------------------

export const ScoresSchema = z.object({
  overall: ScoreSchema,
  seo: NullableScoreSchema,
  aeo: NullableScoreSchema,
  geo: NullableScoreSchema,
  /** Lighthouse Performance score (0-100). Optional + nullable — absent when PERF module not requested. */
  perf: NullableScoreSchema.optional(),
  grade: GradeSchema,       // poor 0-39 / low 40-59 / fair 60-79 / good 80-100
  disclaimer: z.string(),   // "참고 지표입니다. 노출을 보장하지 않습니다."
});
export type Scores = z.infer<typeof ScoresSchema>;

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

export const TopIssueSchema = z.object({
  itemId: z.string().uuid(),
  title: z.string(),
  category: CategorySchema,
  priority: PrioritySchema,
});
export type TopIssue = z.infer<typeof TopIssueSchema>;

export const ActionCountsSchema = z.object({
  self_fix: z.number().int().nonnegative(),
  snippet_action: z.number().int().nonnegative(),
  vendor_action: z.number().int().nonnegative(),
  si_action: z.number().int().nonnegative(),
});
export type ActionCounts = z.infer<typeof ActionCountsSchema>;

export const SummarySchema = z.object({
  headline: z.string(),
  topIssues: z.array(TopIssueSchema).max(5),
  actionCounts: ActionCountsSchema,
});
export type Summary = z.infer<typeof SummarySchema>;

// ---------------------------------------------------------------------------
// analyzedPages
// ---------------------------------------------------------------------------

export const ExtractedMetaSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  h1: z.array(z.string()),
  h2: z.array(z.string()),
  canonical: z.string().nullable(),
  ogTags: z.record(z.string(), z.string()).optional(),
  imgAltRatio: z.number().min(0).max(1).nullable(),
});
export type ExtractedMeta = z.infer<typeof ExtractedMetaSchema>;

export const PageSchemaItemSchema = z.object({
  type: z.string(),           // "LocalBusiness", "FAQPage", etc.
  raw: z.record(z.string(), z.unknown()),
});
export type PageSchemaItem = z.infer<typeof PageSchemaItemSchema>;

export const FaqItemSchema = z.object({
  question: z.string(),
  answer: z.string(),
});
export type FaqItem = z.infer<typeof FaqItemSchema>;

export const AnalyzedPageSchema = z.object({
  url: z.string().url(),
  isMainPage: z.boolean(),
  httpStatus: z.number().int().nullable(),
  responseTimeMs: z.number().int().nullable(),
  robotsBlocked: z.boolean(),
  jsRenderFailed: z.boolean(),
  failureReason: CrawlFailureReasonSchema.optional(),
  extractedMeta: ExtractedMetaSchema,
  schemas: z.array(PageSchemaItemSchema),
  faqs: z.array(FaqItemSchema).optional(),
});
export type AnalyzedPage = z.infer<typeof AnalyzedPageSchema>;

// ---------------------------------------------------------------------------
// items (DiagnosisItem)
// ---------------------------------------------------------------------------

export const DiagnosisItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),            // e.g. "SEO_TITLE_MISSING"
  category: CategorySchema,
  actionType: ActionTypeSchema,
  priority: PrioritySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  evidence: z.record(z.string(), z.unknown()),    // { url, foundValue, expectedValue }
  impactScore: z.number().int().min(0).max(100),
  difficulty: DifficultySchema,
  expectedEffect: z.string().min(1),
  isAiGenerated: z.boolean(),         // POLICY § 7.2 — must be present on every item
  recommendationText: z.string().nullable(),
  relatedSnippetType: z.string().nullable(),
  pageUrl: z.string().url().nullable(),
  ruleVersion: z.string().min(1),
  copy: RuleCopyRenderedSchema.optional(),  // v0.4 신규 (additive) — 산업별 비서 톤 카피
});
export type DiagnosisItem = z.infer<typeof DiagnosisItemSchema>;

// ---------------------------------------------------------------------------
// recommendations
// ---------------------------------------------------------------------------

export const AiSummarySchema = z.object({
  text: z.string(),
  aiModel: z.string(),
  isAiGenerated: z.literal(true),     // POLICY § 7.2 — always true in this sub-object
});
export type AiSummary = z.infer<typeof AiSummarySchema>;

export const RecommendationsSchema = z.object({
  executionOrder: z.array(z.string().uuid()),   // itemId list in recommended order
  quickWins: z.array(z.string().uuid()),         // itemIds with quick impact
  aiSummary: AiSummarySchema.nullable(),
});
export type Recommendations = z.infer<typeof RecommendationsSchema>;

// ---------------------------------------------------------------------------
// snippets (availability summary — not full code, see snippet.ts)
// ---------------------------------------------------------------------------

export const SnippetAvailabilitySchema = z.object({
  type: SnippetTypeSchema,
  available: z.boolean(),             // can be generated from this report
  suggestion: z.string().nullable(),
});
export type SnippetAvailability = z.infer<typeof SnippetAvailabilitySchema>;

// ---------------------------------------------------------------------------
// DiagnosisJsonSchema — top-level (TRD § 7.2)
// ---------------------------------------------------------------------------

export const DiagnosisJsonSchema = z.object({
  // TRD § 13 호환성 규칙: 1.x → 1.y MINOR 무중단 (1.0.0 보고서 + 1.1.0 보고서 모두 허용)
  schemaVersion: z.string().refine((v) => v.startsWith("1."), {
    message: "schemaVersion must be a 1.x version string",
  }),
  reportId: z.string().uuid(),
  profileId: z.string().uuid().nullable(),

  // v0.4 신규 (additive) — 카피 렌더에 사용된 산업 ID
  industryId: IndustryIdSchema.optional(),

  meta: DiagnosisMetaSchema,
  scores: ScoresSchema,
  summary: SummarySchema,
  analyzedPages: z.array(AnalyzedPageSchema),
  items: z.array(DiagnosisItemSchema),
  recommendations: RecommendationsSchema,
  snippets: z.array(SnippetAvailabilitySchema),
  prescriptionItems: z.array(z.string().uuid()), // vendor_action itemIds (FR-010)
});

export type DiagnosisJson = z.infer<typeof DiagnosisJsonSchema>;

// ---------------------------------------------------------------------------
// ScoreTier helper (Work Order spec)
// ---------------------------------------------------------------------------

import { type ScoreTier } from "./enums.js";

/**
 * Derive ScoreTier from a numeric score.
 * very_low: 0-39, low: 40-59, ok: 60-79, good: 80-100
 */
export function scoreTier(n: number): ScoreTier {
  if (n < 40) return "very_low";
  if (n < 60) return "low";
  if (n < 80) return "ok";
  return "good";
}

/**
 * Derive Grade label used inside DiagnosisJson.scores.grade.
 * Maps identical thresholds to TRD § 7.2 literal values.
 */
export function scoreGrade(n: number): import("./enums.js").Grade {
  if (n < 40) return "poor";
  if (n < 60) return "low";
  if (n < 80) return "fair";
  return "good";
}
