// @TASK P2-PERSIST - 진단 영속화 매퍼 (DiagnosisJson/파이프라인 산출 → 5종 테이블 insert 값)
// @SPEC docs/planning/04-database-design.md §3·§4 (engine_result/competitor/gap_row/snippet/action 일관 기록)
// @SPEC docs/planning/07-coding-convention.md §2 (엔진 경계: 배럴/contracts 타입만) / §4 (점수 내부 저장·UI 비노출)
// @SPEC x-sag-FR012-competitor-gap-wiring-spec.md (GapAnalyzer 배선: competitorUrls→CompetitorReport→GapResult)
// @TEST apps/web/tests/diagnosis/diagnosis-persistence.test.ts
// @TEST apps/web/tests/diagnosis/diagnosis-persistence-integration.test.ts
//
// 책임: 잡 핸들러가 산출한 엔진 결과(DiagnosisPipelineOutput)를 04 §4 의 5종 테이블
// (engine_results·competitors·gap_rows·generated_assets·actions) insert 값으로 "매핑"한다.
// 순수 매퍼 — DB 접근 0(repository 가 실제 insert). 점수(impactScore)는 내부 저장만 하고,
// API/UI 응답에는 절대 새어나가지 않는다(읽기 경로가 signal 만 산출 — 07 §4).
//
// 엔진 경계(07 §2): 엔진 GapAnalyzer 로직은 수정하지 않고 호출만 한다(GapAnalyzerPort 주입).
// 엔진 v2/gap 배럴(@boina/engine/v2/gap)은 잡 핸들러가 lazy import 해 주입한다(deep import 0).

import type { DiagnosisItem } from "@boina/contracts/diagnosis";
import type { Category, Difficulty, Priority } from "@boina/contracts/enums";
import type { DiagnosisPipelineOutput } from "@boina/engine";

/**
 * 엔진 LlmValidationSignal 미러(boundary) — DiagnosisPipelineOutput.llmValidation 의 구조.
 * 엔진 배럴이 이 타입을 re-export 하지 않으므로(pipeline 내부 타입), 영속화에 필요한
 * 필드(grounded·competitors)만 구조적으로 미러링한다(deep import 0 — 07 §2 경계).
 */
interface LlmValidationSignal {
  grounded: boolean;
  competitors?: { name: string; mentionedInQueries: number; sampleQuery?: string; url?: string }[];
}

// DB enum 미러(스키마 pgEnum 값과 1:1 — packages/db 수정 0, insert 값 타입 안전성용).
/** competitors.source — competitorSourceEnum(naver_serp/gpt_grounded/manual). */
type CompetitorSource = "naver_serp" | "gpt_grounded" | "manual";
/** generated_assets.type — generatedAssetTypeEnum(엔진 SnippetType). */
type GeneratedAssetType =
  | "LOCAL_BUSINESS"
  | "ORGANIZATION"
  | "SERVICE"
  | "FAQ_SCHEMA"
  | "BREADCRUMB"
  | "LLMS_TXT"
  | "FAQ_HTML";
import { type Action as ActionCard, deriveActions } from "./action-service.js";
import {
  type CompetitorReportLike,
  type GapActionTier,
  type GapAnalyzerPort,
  type GapItem,
  type GapResultLike,
  type SelfReportLike,
  deriveGapItemsFromResult,
} from "./gap-service.js";
import { type GeneratedAsset, deriveGeneratedAssets } from "./generated-asset-service.js";
import {
  BUSINESS_PRESENCE_MEASUREMENT_CODE,
  LLM_VALIDATION_MEASUREMENT_CODE,
} from "./measurement.js";

// ---------------------------------------------------------------------------
// 채널 매핑 (04 §3: engine_result.channel — naver / google / ai_citation)
// ---------------------------------------------------------------------------

/** engine_result.channel — 04 §3 의 채널 코드값(naver/google/ai_citation). */
export type EngineResultChannel = "naver" | "google" | "ai_citation";

/**
 * 엔진 카테고리 → 진단 채널(04 §3).
 *   geo  → naver       (지역/플레이스 노출)
 *   seo  → google      (검색 노출 준비)
 *   aeo  → ai_citation (AI 답변 인용 준비)
 *   그 외(perf/a11y/backlink) → google(검색 품질로 묶음 — 발명 금지, 04 채널 3종 내 유지).
 */
export function categoryToChannel(category: Category): EngineResultChannel {
  switch (category) {
    case "geo":
      return "naver";
    case "aeo":
      return "ai_citation";
    default:
      // seo / perf / a11y / backlink → google.
      return "google";
  }
}

// ---------------------------------------------------------------------------
// engine_results 매핑 (DiagnosisItem → engine_results insert 값)
// ---------------------------------------------------------------------------

/** engine_results insert 값(채널·카테고리·룰 항목 — 점수는 내부 저장 impactScore). */
export interface EngineResultInsert {
  diagnosisId: string;
  channel: EngineResultChannel;
  category: Category;
  actionType: DiagnosisItem["actionType"];
  priority: Priority;
  difficulty: Difficulty;
  code: string;
  title: string;
  description: string;
  evidence: Record<string, unknown> | null;
  impactScore: number | null;
  expectedEffect: string | null;
  isAiGenerated: boolean;
  relatedSnippetType: string | null;
  recommendationText: string | null;
  pageUrl: string | null;
  ruleVersion: string;
}

/**
 * 엔진 산출 항목(DiagnosisItem[])을 engine_results insert 값으로 매핑한다(채널별 + 카테고리별).
 * 04 §3: 한 진단의 채널/카테고리별 결과·노출 실측값을 기록. 점수는 impactScore 로 내부 저장만.
 */
export function mapEngineResults(
  diagnosisId: string,
  items: DiagnosisItem[],
): EngineResultInsert[] {
  return items.map((it) => ({
    diagnosisId,
    channel: categoryToChannel(it.category),
    category: it.category,
    actionType: it.actionType,
    priority: it.priority,
    difficulty: it.difficulty,
    code: it.code,
    title: it.title,
    description: it.description,
    evidence: it.evidence ?? null,
    impactScore: typeof it.impactScore === "number" ? it.impactScore : null,
    expectedEffect: it.expectedEffect ?? null,
    isAiGenerated: it.isAiGenerated === true,
    relatedSnippetType: it.relatedSnippetType ?? null,
    recommendationText: it.recommendationText ?? null,
    pageUrl: it.pageUrl ?? null,
    ruleVersion: it.ruleVersion ?? "1.0.0",
  }));
}

function mapMeasurementEngineResults(
  diagnosisId: string,
  output: DiagnosisPipelineOutput,
): EngineResultInsert[] {
  const rows: EngineResultInsert[] = [];
  const naverSurface = output.businessPresence.surfaces.find(
    (surface) => surface.sourceType === "naver_place",
  );
  rows.push({
    diagnosisId,
    channel: "naver",
    category: "geo",
    actionType: "self_fix",
    priority: "low",
    difficulty: "easy",
    code: BUSINESS_PRESENCE_MEASUREMENT_CODE,
    title: "보유 채널 수집",
    description: "가게 보유 채널과 표면 수집 결과",
    evidence: {
      measurementKind: "business_presence",
      source: naverSurface?.sourceType ?? output.businessPresence.primarySourceType,
      measurementLabel: naverSurface?.status === "fetched" ? "measured" : "estimated",
      found: naverSurface?.status === "fetched",
      payload: output.businessPresence,
    },
    impactScore: null,
    expectedEffect: null,
    isAiGenerated: false,
    relatedSnippetType: null,
    recommendationText: null,
    pageUrl: output.businessPresence.primaryUrl,
    ruleVersion: "measurement.v1",
  });
  if (output.llmValidation) {
    rows.push({
      diagnosisId,
      channel: "ai_citation",
      category: "aeo",
      actionType: "self_fix",
      priority: "low",
      difficulty: "easy",
      code: LLM_VALIDATION_MEASUREMENT_CODE,
      title: "AI 인용 측정",
      description: "LLM 가시성 측정 원자료",
      evidence: {
        measurementKind: "llm_validation",
        source: "llm_validation",
        measurementLabel: "measured",
        payload: output.llmValidation,
      },
      impactScore: null,
      expectedEffect: null,
      isAiGenerated: false,
      relatedSnippetType: null,
      recommendationText: null,
      pageUrl: output.businessPresence.primaryUrl,
      ruleVersion: "measurement.v1",
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// competitors 매핑 (신뢰 소스만 — naver_serp 실측 / gpt_grounded 구조화 추출)
// ---------------------------------------------------------------------------

/** competitors insert 값(신뢰 소스 경쟁사 — 추측 0). url 은 NOT NULL 이므로 출처별 안정 식별자. */
export interface CompetitorInsert {
  diagnosisId: string;
  url: string;
  name: string;
  serpRank: number | null;
  source: CompetitorSource;
}

/** 네이버 SERP 실측 경쟁사(naverPresence.competitorTop) 미러 — contracts NaverCompetitor 와 1:1. */
export interface NaverCompetitorTop {
  name: string;
  rank: number;
  query: string;
  source: "naver_serp";
  /** Optional real SERP target URL when the discovery provider measured one. */
  url?: string;
}

/**
 * 신뢰 경쟁사(naver_serp 실측 + gpt_grounded grounded 추출)를 competitors insert 값으로 매핑한다.
 *
 * 정직성(07 §4 / contracts 정직성):
 *   - naver_serp: 실 SERP 랭킹(rank 보존). url 은 SERP 식별자(이름 기반 placeholder — 실 URL 미보유).
 *   - gpt_grounded: grounded=true 일 때만(게이팅). grounded=false 면 AI 경쟁사 0.
 *   - 이름이 비면 제외(틀린/빈 이름 노출 < 생략). 둘 다 없으면 빈 배열(추측 0).
 */
export function mapCompetitors(
  diagnosisId: string,
  input: {
    naverCompetitorTop?: NaverCompetitorTop[];
    llm?: LlmValidationSignal;
    competitorUrls?: string[];
    competitorReports?: CompetitorReportLike[];
  },
): CompetitorInsert[] {
  const out = new Map<string, CompetitorInsert>();

  const add = (row: CompetitorInsert) => {
    const key = row.url.trim();
    if (!key || out.has(key)) return;
    out.set(key, { ...row, url: key });
  };

  // naver_serp 실측 — rank 오름차순. 실 URL 이 있으면 보존, 없으면 안정 placeholder.
  const naverTop = [...(input.naverCompetitorTop ?? [])].sort((a, b) => a.rank - b.rank);
  for (const c of naverTop) {
    const name = (c.name ?? "").trim();
    if (!name) continue;
    add({
      diagnosisId,
      url: c.url?.trim() || competitorUrlPlaceholder("naver_serp", name),
      name,
      serpRank: c.rank,
      source: "naver_serp",
    });
  }

  // gpt_grounded — grounded=true 일 때만(게이팅). URL 이 있으면 보존, 없으면 안정 placeholder.
  const grounded = input.llm?.grounded === true;
  const llmComps = grounded ? (input.llm?.competitors ?? []) : [];
  for (const c of llmComps) {
    const name = (c.name ?? "").trim();
    if (!name) continue;
    const targetUrl = "url" in c && typeof c.url === "string" ? c.url.trim() : "";
    add({
      diagnosisId,
      url: targetUrl || competitorUrlPlaceholder("gpt_grounded", name),
      name,
      serpRank: null,
      source: "gpt_grounded",
    });
  }

  // manual/explicit URLs — measured naver/gpt rows above win on duplicate URLs.
  const reportByUrl = new Map(
    (input.competitorReports ?? []).map((report) => [report.competitorUrl, report]),
  );
  for (const rawUrl of input.competitorUrls ?? []) {
    const url = rawUrl.trim();
    if (!url) continue;
    const report = reportByUrl.get(url);
    add({
      diagnosisId,
      url,
      name: report?.competitorName?.trim() || competitorNameFromUrl(url),
      serpRank: typeof report?.serpRank === "number" ? report.serpRank : null,
      source: "manual",
    });
  }

  return [...out.values()];
}

/**
 * competitors.url(NOT NULL) placeholder — 실 URL 미보유(이름만 신뢰 추출) 시 출처+이름 식별자.
 * 실 URL 이 아님을 분명히 한다(스킴 없는 식별자). unique(diagnosis_id,url) 충돌 방지용 안정 키.
 */
function competitorUrlPlaceholder(source: CompetitorSource, name: string): string {
  return `${source}:${name}`;
}

function competitorNameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// GapAnalyzer self-report 구성 + gap_rows 매핑
// ---------------------------------------------------------------------------

/**
 * 엔진 진단 항목(DiagnosisItem[]) → GapAnalyzer selfReport(SelfReportLike).
 * 엔진 gap DiagnosisJson 형태(ruleId/category/passed/actionType/priority)로 변환한다.
 * passed: 엔진 items 는 "트리거된(미통과) 항목"이므로 selfPassed=false 로 본다(룰 역공학 입력).
 */
export function buildSelfReport(
  reportId: string,
  websiteUrl: string,
  items: DiagnosisItem[],
): SelfReportLike {
  const gapCategory = (c: Category): "seo" | "aeo" | "geo" | "perf" =>
    c === "seo" || c === "aeo" || c === "geo" || c === "perf" ? c : "seo";
  return {
    reportId,
    websiteUrl,
    diagnosisItems: items.map((it) => ({
      ruleId: it.code,
      category: gapCategory(it.category),
      passed: false, // items 는 트리거된(개선필요) 항목 — 자기 미통과.
      actionType: it.actionType,
      priority: it.priority,
    })),
  };
}

interface CompetitorReportCoverage {
  partialResult: boolean;
  measuredPageCount: number;
  measuredSurfaceCount: number;
}

type CompetitorReportWithCoverage = CompetitorReportLike & {
  coverage?: CompetitorReportCoverage;
};

function competitorCoverageFromOutput(output: DiagnosisPipelineOutput): CompetitorReportCoverage {
  return {
    partialResult: output.partialResult || output.crawlResult.partialResult,
    measuredPageCount: output.crawlResult.pages.length,
    measuredSurfaceCount: output.businessPresence.surfaces.filter(
      (surface) => surface.status === "fetched",
    ).length,
  };
}

function hasCompetitorReportCoverage(report: CompetitorReportLike): boolean {
  const coverage = (report as CompetitorReportWithCoverage).coverage;
  if (!coverage) return true;
  if (coverage.partialResult) return false;
  return coverage.measuredPageCount > 0 || coverage.measuredSurfaceCount > 0;
}

export function buildCompetitorReportFromOutput(
  competitorUrl: string,
  output: DiagnosisPipelineOutput,
  selfReport: SelfReportLike,
  meta: { competitorName?: string; serpRank?: number } = {},
): CompetitorReportLike {
  const failedRuleIds = new Set(output.items.map((item) => item.code));
  const coverage = competitorCoverageFromOutput(output);
  const hasCoverage =
    !coverage.partialResult &&
    (coverage.measuredPageCount > 0 || coverage.measuredSurfaceCount > 0);
  const report: CompetitorReportWithCoverage = {
    competitorUrl,
    diagnosisItems: hasCoverage
      ? selfReport.diagnosisItems.map((item) => ({
          ruleId: item.ruleId,
          category: item.category,
          passed: !failedRuleIds.has(item.ruleId),
        }))
      : [],
    coverage,
  };
  if (hasCoverage) {
    report.seoScore = output.scores.seoScore;
    report.aeoScore = output.scores.aeoScore;
    report.geoScore = output.scores.geoScore;
    if (typeof output.scores.perfScore === "number") report.perfScore = output.scores.perfScore;
    report.overallScore = output.scores.overallScore;
  }
  if (meta.competitorName) report.competitorName = meta.competitorName;
  if (typeof meta.serpRank === "number") report.serpRank = meta.serpRank;
  return report;
}

/** gap_rows insert 값 — competitor_id 는 repository 가 채운다(여기선 행 내용만). */
export interface GapRowInsert {
  /** S4 사장님 언어 label(룰 코드값 비노출). */
  item: string;
  competitorHas: boolean;
  isMyGap: boolean;
  description: string | null;
  /**
   * action 4분류(🟢🟡🔴⏳) 보존 — gapItem.actionTier(deriveGapItemsFromResult 가 엔진
   * actionType 에서 도출)를 그대로 저장한다. 읽기 경로(deriveGapViewFromPersisted)가 복원해
   * S5 4분류가 green 으로 수렴하던 버그(#1)를 막는다. mapGapRows 와 읽기 매핑은 동일 actionTier.
   */
  actionTier: GapActionTier;
}

/**
 * GapResult → gap_rows insert 값(사장님 언어 label, 룰 코드값 비노출 — 07 §4).
 * deriveGapItemsFromResult(유료=전체)로 번역한 gapItem 을 gap_rows 행으로 매핑한다.
 *
 * ★ actionTier 보존(#1): gapItem 은 이미 actionTypeToTier(엔진 actionType→도메인 tier)를 거친
 * actionTier 를 갖는다. 그 값을 그대로 저장해, 읽기 경로(deriveGapViewFromPersisted)가
 * deriveActions 에 동일 tier 를 넘기도록 정렬한다(저장↔읽기 매핑 일치 — 4분류 정확 복원).
 */
export function mapGapRows(result: GapResultLike): GapRowInsert[] {
  // 영속화는 전체 매트릭스(isPaid=true) — 화면 무료/유료 경계는 읽기 경로(deriveGapItemsFromResult)가 적용.
  const items = deriveGapItemsFromResult(result, { isPaid: true });
  return items.map((g) => ({
    item: g.label, // 사장님 언어(코드값 0).
    competitorHas: g.competitorHas,
    isMyGap: !g.iHave,
    description: null,
    actionTier: g.actionTier, // gapItem 이 이미 도출한 도메인 tier(self_fix/snippet/vendor/ongoing).
  }));
}

// ---------------------------------------------------------------------------
// generated_assets 매핑 (resource AssetType ↔ engine SnippetType enum 양방향)
// ---------------------------------------------------------------------------

import type { AssetType as ResourceAssetType } from "../shared/ui-labels.js";

/**
 * resource AssetType ↔ DB generated_asset_type(engine SnippetType enum) 양방향(bijective) 매핑.
 *
 * DB enum(generatedAssetTypeEnum)은 엔진 SnippetType(LOCAL_BUSINESS…FAQ_HTML)으로 고정돼 있고
 * (스키마 수정 금지), 화면 resource 는 4종(snippet/place_intro/review_request/vendor_prescription)이다.
 * 무손실 왕복(저장 후 읽기로 resource type 복원)을 위해 4:4 일대일 매핑을 둔다 — 컬럼 추가 0.
 */
const ASSET_TYPE_TO_DB: Record<ResourceAssetType, GeneratedAssetType> = {
  snippet: "FAQ_HTML",
  place_intro: "LOCAL_BUSINESS",
  review_request: "ORGANIZATION",
  vendor_prescription: "SERVICE",
};

const DB_TO_ASSET_TYPE: Record<string, ResourceAssetType> = Object.fromEntries(
  Object.entries(ASSET_TYPE_TO_DB).map(([k, v]) => [v, k as ResourceAssetType]),
) as Record<string, ResourceAssetType>;

/** resource AssetType → DB generated_asset_type(engine enum). */
export function assetTypeToDb(type: ResourceAssetType): GeneratedAssetType {
  return ASSET_TYPE_TO_DB[type];
}

/** DB generated_asset_type(engine enum) → resource AssetType(없으면 null — 발명 금지). */
export function dbToAssetType(dbType: string): ResourceAssetType | null {
  return DB_TO_ASSET_TYPE[dbType] ?? null;
}

/** generated_assets insert 값 — 카피 가드 통과 생성물만(deriveGeneratedAssets 가 보증). */
export interface GeneratedAssetInsert {
  diagnosisId: string;
  type: GeneratedAssetType;
  code: string;
  codeFormat: "json-ld" | "html" | "text" | "other";
  generatedBy: "rule" | "ai" | "hybrid";
  status: "draft" | "published" | "archived";
  isLatest: boolean;
  actionTier: "high" | "medium" | "low" | "waiting" | null;
}

/**
 * 생성물(GeneratedAsset[4종]) → generated_assets insert 값.
 * content 는 code(text) 로, resource type 은 DB enum 으로 매핑(왕복 복원 가능).
 * codeFormat=text(사장님 언어 복붙 본문 — JSON-LD/HTML 코드 아님), generatedBy=rule(룰 기반 합성).
 */
export function mapGeneratedAssets(
  diagnosisId: string,
  assets: GeneratedAsset[],
): GeneratedAssetInsert[] {
  return assets.map((a) => ({
    diagnosisId,
    type: assetTypeToDb(a.type),
    code: a.content,
    codeFormat: "text",
    generatedBy: "rule",
    status: "draft",
    isLatest: true,
    actionTier: null,
  }));
}

// ---------------------------------------------------------------------------
// actions 매핑 (4분류 + "오늘 딱 하나")
// ---------------------------------------------------------------------------

/** action_tier(DB enum) — 4분류 → high/medium/low/waiting 매핑. */
type DbActionTier = "high" | "medium" | "low" | "waiting";

/** S5 4분류(green_self/yellow_copy/red_vendor/gray_ongoing) → DB action_tier. */
function actionClassToTier(tier: ActionCard["tier"]): DbActionTier {
  switch (tier) {
    case "red_vendor":
      return "high"; // 🔴 업체(가장 큰 비용/긴급).
    case "yellow_copy":
      return "medium"; // 🟡 복붙.
    case "green_self":
      return "low"; // 🟢 직접(가볍게 바로).
    case "gray_ongoing":
      return "waiting"; // ⏳ 꾸준히.
  }
}

/** actions insert 값 — action_ref 는 화면 식별자(gapItem.id 승계), tier/오늘딱하나 보존. */
export interface ActionInsert {
  diagnosisId: string;
  actionRef: string;
  actionTier: DbActionTier;
  isTodayOne: boolean;
}

/**
 * gapItem → 4분류 action 카드 → actions insert 값.
 * deriveActions(유료=전체)로 4분류 + "오늘 딱 하나"(정확히 1개)를 산출해 행으로 매핑한다.
 */
export function mapActions(diagnosisId: string, gapItems: GapItem[]): ActionInsert[] {
  const cards = deriveActions(gapItems, { isPaid: true });
  return cards.map((c) => ({
    diagnosisId,
    actionRef: c.id,
    actionTier: actionClassToTier(c.tier),
    isTodayOne: c.isTodayOne === true,
  }));
}

// ---------------------------------------------------------------------------
// 통합 매퍼: 파이프라인 산출 → 5종 테이블 insert 값 묶음
// ---------------------------------------------------------------------------

/** 영속화 매퍼 입력 — 파이프라인 산출 + 비즈니스 프로파일 + 수동 competitorUrls + GapAnalyzer 주입. */
export interface BuildPersistenceInput {
  diagnosisId: string;
  reportId: string;
  websiteUrl: string;
  output: DiagnosisPipelineOutput;
  /** GapAnalyzer 리포트 구성에 쓸 측정 경쟁사 식별자. 비면 gap_rows/actions 는 비운다. */
  competitorUrls: string[];
  /** 저장된/주입된 경쟁사 리포트. 없으면 gap_rows/actions 는 비우고 measured-unavailable 로 읽는다. */
  competitorReports?: CompetitorReportLike[];
  /** 잡 핸들러가 주입한 실 GapAnalyzer(@boina/engine/v2/gap) 또는 테스트 mock. */
  analyzer: GapAnalyzerPort;
  /** 생성물 입력(business 프로필 + FAQ). 없으면 생성물 0. */
  assetInput?: Parameters<typeof deriveGeneratedAssets>[0];
  /** (선택) naverPresence.competitorTop 실측 — 있으면 naver_serp 경쟁사도 저장. */
  naverCompetitorTop?: NaverCompetitorTop[];
}

/** 5종 테이블 insert 값 묶음(repository 가 순서대로 insert — competitor→gap_row FK 보존). */
export interface PersistencePlan {
  engineResults: EngineResultInsert[];
  competitors: CompetitorInsert[];
  /** gap_rows 는 competitor_id 가 필요 — repository 가 각 competitor 행에 연결한다. */
  gapRows: GapRowInsert[];
  generatedAssets: GeneratedAssetInsert[];
  actions: ActionInsert[];
}

/**
 * 파이프라인 산출 → 04 §4 5종 테이블 insert 값 묶음(순수 매퍼 — DB 접근 0).
 *
 * 일관 기록(04 §4): 한 진단의 engine_result·competitor·gap_row·snippet·action 을 함께 산출한다.
 * 경쟁사 갭은 저장/주입된 competitorReports 가 있을 때만 계산한다. 리포트가 없으면
 * gap_rows/actions 는 비워 읽기 경로가 measured-unavailable 상태를 정직하게 노출한다.
 */
export function buildPersistencePlan(input: BuildPersistenceInput): PersistencePlan {
  const { diagnosisId, reportId, websiteUrl, output } = input;

  const engineResults = [
    ...mapEngineResults(diagnosisId, output.items),
    ...mapMeasurementEngineResults(diagnosisId, output),
  ];
  const competitors = mapCompetitors(diagnosisId, {
    competitorUrls: input.competitorUrls,
    competitorReports: input.competitorReports,
    naverCompetitorTop: input.naverCompetitorTop,
    llm: output.llmValidation,
  });

  const selfReport = buildSelfReport(reportId, websiteUrl, output.items);
  const competitorReports = (input.competitorReports ?? []).filter(hasCompetitorReportCoverage);
  let gapRows: GapRowInsert[] = [];
  let gapItems: GapItem[] = [];
  if (input.competitorUrls.length > 0 && competitorReports.length > 0) {
    const result = input.analyzer.analyze({ selfReport, competitors: competitorReports });
    gapRows = mapGapRows(result);
    gapItems = deriveGapItemsFromResult(result, { isPaid: true });
  }

  const assets = input.assetInput ? deriveGeneratedAssets(input.assetInput, { isPaid: true }) : [];
  const generatedAssets = mapGeneratedAssets(diagnosisId, assets);

  const actions = mapActions(diagnosisId, gapItems);

  return { engineResults, competitors, gapRows, generatedAssets, actions };
}
