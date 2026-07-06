// @TASK P2-R4 - gapItem 변환·정직성·GapAnalyzer 배선 (전달 레이어: GapResult → 역공학 갭)
// @SPEC specs/domain/resources.yaml (gapItem: id/label/competitorHas/iHave/category/actionTier/priority/isPaid)
// @SPEC specs/screens/reverse-gap.yaml (S4: 무료 Top3 / 유료 전체 / actionTier 연결 / 정직성)
// @SPEC docs/planning/07-coding-convention.md §2 (엔진 경계) / §4 (룰 코드값 노출 0·인과 단정 0)
// @SPEC docs/planning/05-design-system.md §1-A/§5 (역공학·응원 톤·인과 단정 금지)
// @SPEC x-sag-FR012-competitor-gap-wiring-spec.md (잠든 GapAnalyzer 라이브 배선)
// @TEST apps/web/tests/diagnosis/gap-service.test.ts
//
// 책임(REQ-004, S4): x-sag GapAnalyzer 를 "실제로 배선"한다 — competitorUrls(수동/mock,
// 실 SERP 자동발견 키 없이 동작; 메모리 FR-012) → CompetitorReport → GapAnalyzer.analyze()
// → GapResult(matrix/priorities/selfStrengths). 그 GapMatrixRow 를 "사장님 언어 gapItem"으로
// 번역한다(경쟁사 보유 vs 내 갭 매트릭스 + priority Top3 + isPaid 경계 + actionTier).
//
// 배선 배경(FR-012 §0): x-sag 에서 GapAnalyzer 는 완성됐으나 worker 가 competitorUrls 를
// 읽지 않아 호출이 끊긴 "잠든 기능"이었다. 보이나에서 이 전달 레이어가 실제로 호출한다.
//
// 정직성 가드(07 §4 — 양보 불가):
//   1. 룰 코드값(SEO/AEO/GEO ruleId)은 엔진 내부 식별자 — UI 노출 0. label 은 사장님 언어만.
//      미등록 룰도 카테고리 기반 폴백으로 번역(코드값 절대 노출 0).
//   2. on-page 위생/구조 격차다 — "따라하면 AI 추천" 인과 단정 금지(점수↔실인용 무상관).
//      "도움이 돼요" 응원 톤. 경쟁사 비방 0(이름 미언급 — 보유 여부만).
//   3. competitorTop(P2-R3 실측 누가)과 구분 — 여기는 룰 역공학(어떻게).
//   4. [무료] priority Top3 만 / [유료] 전체 매트릭스(isPaid 경계). 금액은 OQ-3 placeholder.
//
// 엔진 경계(07 §2): 엔진 GapAnalyzer 로직은 수정하지 않고 호출만 한다. 이 서비스는
// 엔진 내부를 직접 import 하지 않고 GapAnalyzerPort(주입 가능 인터페이스) + 엔진 gap 타입을
// 구조적으로 미러링한 boundary 타입(GapResultLike 등)에만 의존한다. 실제 GapAnalyzer 인스턴스는
// 배선 지점(잡 핸들러/route)에서 주입한다 — diagnosis-handler 의 runPipeline 주입 패턴과 동형.
//
// [OPEN] 선언된 cross-package export: @boina/engine 배럴/exports 에 v2/gap 가 아직 선언되지
// 않았다(packages/* 수정 금지 대상). 선언되면 defaultGapAnalyzer 가 그 배럴을 lazy import 한다.
// FR-012 §4.4 의 contracts CompetitorGap Zod(additive) 영속화도 오케스트레이터 [OPEN].

import type { ActionTier } from "../shared/ui-labels.js";

// ---------------------------------------------------------------------------
// 엔진 gap 타입 미러링 (boundary types) — deep import 없이 구조 동일
// ---------------------------------------------------------------------------
//
// 엔진 gap/types.ts 의 GapResult/GapMatrixRow/PriorityGap 를 구조적으로 미러링한다.
// 엔진 타입과 1:1 호환(테스트가 할당 가능성으로 검증). FR-012 §4.4 는 이를 contracts Zod
// 로 승격하도록 권하나, 그 contracts 변경은 [OPEN]이므로 전달 레이어 boundary 로 둔다.

/** 엔진 ActionType 미러 — gap 우선순위/매트릭스 행동 분류(내부 신호). */
export type EngineActionType = "self_fix" | "snippet_action" | "vendor_action" | "si_action";

/** 엔진 Priority 미러 — 룰 우선순위(내부 신호). */
export type EnginePriority = "high" | "medium" | "low";

/** 엔진 룰 카테고리 미러(내부 신호 — UI 노출 0). */
export type EngineCategory = "seo" | "aeo" | "geo" | "perf";

/** 엔진 GapMatrixRow 미러 — gap>0=경쟁사 우위, gap<0=내 우위. */
export interface GapMatrixRowLike {
  ruleId: string;
  category: EngineCategory;
  selfPassed: boolean;
  competitorPassedCount: number;
  competitorTotal: number;
  selfScore?: number;
  competitorAvg?: number;
  top1Score?: number;
  /** 음수=내 우위 / 양수=경쟁사 우위. */
  gap: number;
  actionType: EngineActionType;
  priority: EnginePriority;
}

/** 엔진 PriorityGap 미러 — Top5 우선순위(rank 1=가장 급함). */
export interface PriorityGapLike {
  rank: 1 | 2 | 3 | 4 | 5;
  ruleId: string;
  reason: string;
  actionType: EngineActionType;
  expectedImpact: "low" | "medium" | "high";
}

/** 엔진 ScoreSnapshot 미러(내부 신호 — UI 노출 0). */
export interface ScoreSnapshotLike {
  seo: number;
  aeo: number;
  geo: number;
  perf: number;
  overall: number;
}

/** 엔진 GapResult 미러 — GapAnalyzer.analyze() 산출. */
export interface GapResultLike {
  matrix: GapMatrixRowLike[];
  priorities: PriorityGapLike[];
  selfStrengths: string[];
  marketAverage: ScoreSnapshotLike;
}

/** 엔진 CompetitorReport 미러 — GapAnalyzer 입력(경쟁사 경량 진단 요약). */
export interface CompetitorReportLike {
  competitorUrl: string;
  competitorName?: string;
  serpRank?: number;
  seoScore?: number;
  aeoScore?: number;
  geoScore?: number;
  perfScore?: number;
  overallScore?: number;
  diagnosisItems: { ruleId: string; category: EngineCategory; passed: boolean }[];
  isAnonymized?: boolean;
}

/** 엔진 자기 진단 요약(GapAnalyzer 입력 selfReport) 미러. */
export interface SelfReportLike {
  reportId: string;
  websiteUrl: string;
  diagnosisItems: {
    ruleId: string;
    category: EngineCategory;
    passed: boolean;
    actionType: EngineActionType;
    priority: EnginePriority;
  }[];
  seoScore?: number;
  aeoScore?: number;
  geoScore?: number;
  perfScore?: number;
  overallScore?: number;
}

/** 엔진 GapInput 미러. */
export interface GapInputLike {
  selfReport: SelfReportLike;
  competitors: CompetitorReportLike[];
}

/**
 * GapAnalyzer 주입 포트 — 엔진 GapAnalyzer 인스턴스가 구조적으로 만족한다.
 * 이 서비스는 엔진을 직접 import 하지 않고 이 포트에만 의존한다(테스트 mock·실엔진 모두 주입).
 * diagnosis-handler 의 RunDiagnosisPipeline 주입 패턴과 동형(실 외부 호출은 배선 지점에서).
 */
export interface GapAnalyzerPort {
  analyze(input: GapInputLike): GapResultLike;
}

// ---------------------------------------------------------------------------
// gapItem — 화면(S4)용 역공학 갭 (resources.yaml gapItem 필드와 1:1)
// ---------------------------------------------------------------------------

/** S4 actionTier — P2-R5 action 4분류 연결의 토대. */
export type GapActionTier = "self_fix" | "snippet" | "vendor" | "ongoing";

/** 사장님 언어 갭 묶음 카테고리(엔진 코드값 비노출 — 노출/소개/리뷰/속도). */
export type GapCategoryLabel = "노출" | "소개" | "리뷰" | "속도";

/**
 * 화면(S4)용 역공학 갭 — resources.yaml gapItem 필드와 1:1.
 * 룰 코드값/점수는 이 객체에 절대 담지 않는다(07 §4). label 은 사장님 언어만.
 */
export interface GapItem {
  /** UUID v4(런타임 화면 식별자 — 영속화 전). */
  id: string;
  /** 사장님 언어 한 줄("영업시간이 안 적혀 있어요"). 룰 코드값 노출 0. */
  label: string;
  /** 경쟁사 보유 여부(gap>0 → 경쟁사가 갖춤). */
  competitorHas: boolean;
  /** 내 보유 여부(selfPassed). */
  iHave: boolean;
  /** 갭 묶음(사장님 언어 — 노출/소개/리뷰/속도). */
  category: GapCategoryLabel;
  /** self_fix | snippet | vendor | ongoing (→ action 4분류 연결). */
  actionTier: GapActionTier;
  /** 1-5 (1=가장 급함, Top3 컷오프 기준). */
  priority: 1 | 2 | 3 | 4 | 5;
  /** true = 유료 실행팩에서만 전체 노출(Top3 밖 경계). */
  isPaid: boolean;
  source?: "naver_serp" | "gpt_grounded" | "manual" | "unavailable";
  collectedAt?: string;
  evidence?: unknown;
  measurementLabel?: "measured" | "estimated" | "unavailable";
}

// ---------------------------------------------------------------------------
// 옵션
// ---------------------------------------------------------------------------

/** GapResult → gapItem 번역 옵션. */
export interface GapItemOptions {
  /** true=유료(전체 매트릭스 노출) / false=무료(Top3 컷오프). 기본 false. */
  isPaid?: boolean;
}

/** GapAnalyzer 실배선 옵션 — 분석기 주입 + 노출 경계. */
export interface DeriveGapOptions extends GapItemOptions {
  /** 주입 분석기. 기본은 선언된 엔진 배럴 lazy import([OPEN])이나, 동기 경로는 주입 필수. */
  analyzer: GapAnalyzerPort;
}

/** GapAnalyzer 실배선 입력 — 자기 진단 + 경쟁사 + 수동 competitorUrls(자동발견 0). */
export interface DeriveGapInput {
  selfReport: SelfReportLike;
  competitors: CompetitorReportLike[];
  /** 수동/mock competitorUrls(실 SERP 자동발견 키 0 — FR-012 MVP). 비면 갭 0. */
  competitorUrls: string[];
}

// ---------------------------------------------------------------------------
// 핵심 배선: competitorUrls(수동) → GapAnalyzer.analyze() → gapItem (FR-012)
// ---------------------------------------------------------------------------

/**
 * x-sag GapAnalyzer 를 실제로 호출해 역공학 갭(gapItem)을 산출한다(FR-012 배선).
 *
 * 동작(FR-012 §3 목표):
 *   1. competitorUrls(수동/mock)가 비면 → 갭 0(자동발견 SERP 호출 0, MVP 키 불필요).
 *   2. 주입된 analyzer.analyze({ selfReport, competitors }) 실제 호출 → GapResult.
 *   3. GapResult.matrix(경쟁사 우위 gap>0) → priority 정렬 → Top3(무료)/전체(유료) gapItem.
 *
 * 정직성: 룰 코드값→사장님 label, 인과 단정 0, competitorTop(실측)과 구분(룰 역공학).
 */
export function deriveGapItems(input: DeriveGapInput, options: DeriveGapOptions): GapItem[] {
  // FR-012 MVP: 수동 competitorUrls 가 없으면 자동발견(SERP) 하지 않고 갭 0(키 불필요).
  if (input.competitorUrls.length === 0 || input.competitors.length === 0) {
    return [];
  }

  // 잠든 GapAnalyzer 실제 호출(배선) — competitorUrls 기반 경쟁사 진단 요약 → GapResult.
  const result = options.analyzer.analyze({
    selfReport: input.selfReport,
    competitors: input.competitors,
  });

  return deriveGapItemsFromResult(result, { isPaid: options.isPaid });
}

/**
 * 산출된 GapResult 를 S4 gapItem 으로 번역한다(GapAnalyzer 호출 후 단계 / 영속화 후 경로).
 *
 * 번역:
 *   - 경쟁사 우위(gap>0) 항목만(filterCompetitorAdvantage 동형) — "걔는 갖췄고 나는 없음".
 *   - GapMatrixRow.ruleId → 사장님 언어 label(코드값 노출 0).
 *   - priority(엔진 high/medium/low) + gap 크기 → 1~5 rank(1=급함) 오름차순 정렬.
 *   - 무료: Top3 컷오프(isPaid=false) / 유료: 전체(Top3 밖은 isPaid=true 경계).
 *   - actionType → actionTier(P2-R5 4분류 토대).
 */
export function deriveGapItemsFromResult(
  result: GapResultLike,
  options: GapItemOptions = {},
): GapItem[] {
  const isPaid = options.isPaid === true;

  // 경쟁사 우위 항목만(gap>0). 자기 우위(gap<=0)는 갭 아님(selfStrengths 영역).
  const advantage = result.matrix.filter((r) => r.gap > 0);

  // 정렬: priority(high>medium>low) 우선, 동률은 gap 큰 순(경쟁사 우위 폭). 안정 정렬.
  const sorted = [...advantage].sort((a, b) => {
    const pw = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (pw !== 0) return pw;
    return b.gap - a.gap;
  });

  // 무료는 Top3 까지만 노출(컷오프). 유료는 전체.
  const visible = isPaid ? sorted : sorted.slice(0, FREE_TOP_N);

  return visible.map((row, idx) => {
    const rank = clampRank(idx + 1); // 1-based, 1~5 clamp.
    const beyondFree = idx >= FREE_TOP_N; // Top3 밖 = 유료 경계.
    return {
      id: makeUuidV4(),
      label: ruleToBossLabel(row.ruleId, row.category),
      competitorHas: row.competitorPassedCount > 0 || row.gap > 0,
      iHave: row.selfPassed,
      category: categoryToLabel(row.category),
      actionTier: actionTypeToTier(row.actionType),
      priority: rank,
      // Top3 안은 무료 노출 가능(isPaid=false). Top3 밖(유료 전체)은 경계 표기(isPaid=true).
      isPaid: beyondFree,
    };
  });
}

// ---------------------------------------------------------------------------
// gap_intro 헤드라인 (응원 톤 — 손실 단정·인과·비방 0)
// ---------------------------------------------------------------------------

/**
 * S4 gap_intro — 갭 개수로 정직 한 문장(응원 톤). 보장 아님·격차 안내.
 * 정직성: 인과 단정 0(점수↔실인용 무상관), 전문용어/룰 코드값 0, 경쟁사 비방 0.
 */
export function buildGapIntro(gapCount: number): string {
  if (gapCount <= 0) {
    return "옆집보다 빠진 게 안 보여요. 기본은 잘 갖추고 계세요!";
  }
  return "옆집은 갖췄고 우리는 아직인 것들이에요. 하나씩 채우면 손님 만나는 데 도움이 돼요.";
}

// ---------------------------------------------------------------------------
// route(view) 경로용: 전체 GapResult 영속화 전(v1) 정직 폴백
// ---------------------------------------------------------------------------
//
// v1 DB(04 스키마)는 진단 원자료(competitorUrls·경쟁사 진단·GapResult)를 영속화하지 않는다
// (FR-012 §5 영속화는 [OPEN] — contracts CompetitorGap Zod + jsonb 컬럼은 오케스트레이터 몫,
// db 스키마/잡 수정 금지). 전체 GapResult 가 손에 없는 read 경로(route)는 "역공학 갭 없음"을
// 정직하게 노출한다 — 추측 갭 0(빈 배열) + 응원 인트로. 자동발견 SERP 호출도 0(FR-012 MVP).
//
// 전체 GapResult(또는 영속화)이 있는 경로는 deriveGapItems / deriveGapItemsFromResult 를 쓴다.

export interface GapViewResult {
  items: GapItem[];
  /** S4 gap_intro 한 문장(빈 배열이면 응원). */
  intro: string;
  /** true=유료(전체) / false=무료(Top3). 화면 잠금 카드 분기용. */
  isPaid: boolean;
  source?: "naver_serp" | "gpt_grounded" | "manual" | "unavailable";
  collectedAt?: string;
  evidence?: unknown;
  measurementLabel?: "measured" | "estimated" | "unavailable";
}

/**
 * 전체 원자료 없이(view 만으로) 역공학 갭을 산출한다(v1 정직 폴백).
 *
 * 정직성: GapResult 원자료가 없으므로 추측 갭을 만들지 않는다(빈 배열 = 카드 생략).
 * 인트로는 손실 단정 금지 → 응원("기본은 잘 갖추고 계세요"). 코드값/전문용어/인과 0.
 * 원자료 영속화(FR-012 §5 [OPEN]) 후 deriveGapItems 로 승급.
 */
export function deriveGapViewFromView(options: GapItemOptions = {}): GapViewResult {
  const items: GapItem[] = [];
  return {
    items,
    intro: buildGapIntro(items.length),
    isPaid: options.isPaid === true,
    source: "unavailable",
    evidence: { reason: "gap_not_measured" },
    measurementLabel: "unavailable",
  };
}

// ---------------------------------------------------------------------------
// route(view) 경로용: 영속화된 gap_rows → S4 gapItem (실데이터 경로)
// ---------------------------------------------------------------------------
//
// 04 §4 영속화 이후: gap_rows(competitor 보유/내 갭 + 사장님 언어 label + action_tier)가 DB 에
// 기록되므로, route 는 추측 폴백 대신 실데이터로 갭 매트릭스를 렌더한다. gap_rows 는 이미 번역된
// label 만 담는다(룰 코드값/점수 비노출 — 07 §4). actionTier 는 이제 영속화 컬럼(gap_action_tier)
// 으로 보존되므로 저장값을 그대로 복원한다 — 모든 행동이 green 으로 수렴하던 버그(#1) 해소.
// category 는 화면이 "노출" 고정 기본으로 충분(코드값/점수는 어떤 경로로도 노출 0).

/** 영속화된 gap_row 한 줄(앱層 — persistence-repository 가 반환). */
export interface PersistedGapRowLike {
  /** 사장님 언어 label(룰 코드값 비노출). */
  /** gap_row id (있으면 actionId deep-link / completion 기준으로 그대로 사용). */
  id?: string;
  item: string;
  competitorHas: boolean;
  isMyGap: boolean;
  /**
   * ★ 영속화된 action 4분류 tier(self_fix/snippet/vendor/ongoing). 4분류(🟢🟡🔴⏳) 복원의 핵심.
   *
   * 선택적(레거시/테스트 stub 하위호환): 미지정이면 self_fix(직접건)로 본다 — 컬럼이 추가되기
   * 전 데이터나 actionTier 를 주지 않는 호출자도 안전. 실 읽기 경로(getPersistedGapRows)는
   * 항상 저장값을 채워 4분류가 정확히 복원된다.
   */
  actionTier?: GapActionTier;
  source?: "naver_serp" | "gpt_grounded" | "manual";
  collectedAt?: string;
  competitorName?: string | null;
}

/**
 * 영속화된 gap_rows → S4 gapItem(실데이터 경로 — 추측 0).
 *
 * 정직성: gap_rows 는 사장님 언어 label 만 담는다(코드값/점수 0). actionTier 는 영속화 컬럼
 * (gap_action_tier)에서 복원해 S5 4분류가 green 으로 수렴하지 않게 한다(#1 수정 — 미지정이면
 * self_fix 폴백). category 는 화면 묶음 "노출" 기본(코드값 노출 0 보장).
 * priority 는 저장 순서(영속화 시 priority 정렬)대로 1~5 clamp. 무료는 Top3, 유료는 전체.
 */
export function deriveGapViewFromPersisted(
  rows: PersistedGapRowLike[],
  options: GapItemOptions = {},
): GapViewResult {
  const isPaid = options.isPaid === true;
  const myGaps = rows.filter((r) => r.isMyGap === true);
  const visible = isPaid ? myGaps : myGaps.slice(0, FREE_TOP_N);
  const items: GapItem[] = visible.map((r, idx) => ({
    id: r.id ?? makeUuidV4(),
    label: r.item,
    competitorHas: r.competitorHas,
    iHave: !r.isMyGap,
    category: "노출",
    actionTier: r.actionTier ?? "self_fix",
    priority: clampRank(idx + 1),
    isPaid: idx >= FREE_TOP_N,
    source: r.source,
    collectedAt: r.collectedAt,
    evidence: {
      competitorName: r.competitorName ?? null,
      competitorHas: r.competitorHas,
    },
    measurementLabel: "measured",
  }));
  return {
    items,
    intro: buildGapIntro(items.length),
    isPaid,
    source: visible[0]?.source,
    collectedAt: visible[0]?.collectedAt,
    evidence: items.map((item) => item.evidence),
    measurementLabel: items.length > 0 ? "measured" : "unavailable",
  };
}

// ---------------------------------------------------------------------------
// 룰 코드값 → 사장님 언어 번역 (REFACTOR: 번역 사전 분리)
// ---------------------------------------------------------------------------

/**
 * 룰 코드값(엔진 ruleId)을 사장님 언어 label 한 줄로 번역한다(07 §4 — 코드값 노출 0).
 *
 * 정직성: 등록 룰은 구체 label, 미등록 룰도 카테고리 기반 폴백으로 번역한다 —
 * ruleId(코드값)는 어떤 경로로도 UI 에 노출되지 않는다(폴백조차 사장님 언어).
 * 인과 단정·전문용어·점수 0("~이 안 적혀 있어요" 류 사실 묘사).
 */
export function ruleToBossLabel(ruleId: string, category: EngineCategory): string {
  const exact = GAP_LABEL_DICT[ruleId];
  if (exact) return exact;
  // 미등록 룰 — 코드값 노출 금지. 카테고리 기반 사장님 언어 폴백.
  return GAP_CATEGORY_FALLBACK[category];
}

/**
 * 룰 코드값 → 사장님 언어 label 사전(번역 레이어).
 * 키는 엔진 내부 식별자, 값은 사장님 언어("~이 안 적혀 있어요"). 코드값은 값에 절대 노출 0.
 * 미등록 룰은 GAP_CATEGORY_FALLBACK 으로 처리 — 신규 룰이 추가돼도 코드값 노출 0 보장.
 */
const GAP_LABEL_DICT: Record<string, string> = {
  // 노출(GEO/검색에 보이기)
  "GEO-OPENING-HOURS-001": "영업시간이 안 적혀 있어요",
  "GEO-BUSINESS-HOURS-DETAIL-001": "영업시간이 자세히 안 적혀 있어요",
  "GEO-BUSINESS-NAME-001": "가게 이름이 또렷하게 안 적혀 있어요",
  "GEO-NAP-CONSISTENCY-001": "가게 이름·주소·전화가 페이지마다 달라요",
  "GEO-REGION-001": "어느 동네 가게인지 안 적혀 있어요",
  "GEO-LOCAL-BUSINESS-SCHEMA-001": "검색이 가게 정보를 알아보기 어려워요",
  "GEO-INDUSTRY-001": "무슨 업종인지 또렷하게 안 적혀 있어요",
  "GEO-LLMS-TXT-001": "AI가 읽을 안내 파일이 없어요",
  "SEO-REGION-001": "지역 이름이 안 들어가 있어요",
  "SEO-ROBOTS-001": "검색이 가게 페이지를 못 들어와요",
  "SEO-MOBILE-001": "휴대폰에서 보기 불편해요",
  "SEO-HTTPS-001": "주소창에 자물쇠(보안) 표시가 없어요",

  // 소개(가게가 뭘 하는지 알리기)
  "SEO-TITLE-001": "가게 이름표가 빠져 있어요",
  "SEO-META-001": "검색에 뜨는 소개 문구가 없어요",
  "SEO-H1-001": "페이지에 큰 제목(가게 소개)이 없어요",
  "SEO-KEYWORD-001": "손님이 검색하는 말이 안 들어가 있어요",
  "SEO-OG-001": "링크 공유할 때 미리보기가 안 떠요",
  "SEO-STRUCTURED-DATA-001": "검색이 가게 정보를 정리해 못 읽어요",
  "AEO-SERVICE-DESC-001": "무슨 서비스를 하는지 설명이 부족해요",
  "AEO-TARGET-CUSTOMER-001": "누구를 위한 가게인지 안 적혀 있어요",
  "AEO-PRICE-INFO-001": "가격 안내가 안 적혀 있어요",
  "AEO-PROCESS-INFO-001": "이용 방법(순서) 안내가 없어요",
  "AEO-LOCAL-SERVICE-001": "어느 지역까지 해주는지 안 적혀 있어요",
  "AEO-CONTACT-DIRECT-001": "연락처가 바로 안 보여요",
  "GEO-SERVICE-001": "어떤 서비스를 하는지 또렷하지 않아요",

  // 묻고 답하기(AI가 답하기 좋게)
  "AEO-FAQ-001": "자주 묻는 질문 안내가 없어요",
  "AEO-FAQ-SCHEMA-001": "자주 묻는 질문이 AI가 읽기 어렵게 돼 있어요",
  "AEO-QUESTION-FORMAT-001": "손님 질문 형태의 안내가 없어요",
  "AEO-DIRECT-ANSWER-001": "질문에 바로 답하는 문장이 없어요",
  "AEO-DIRECT-ANSWER-PARAGRAPH-001": "핵심 답을 먼저 적은 문단이 없어요",

  // 리뷰·신뢰
  "GEO-REVIEW-AGGREGATE-001": "후기 모음 안내가 없어요",
  "NLP-EEAT-TRUST-001": "믿음을 주는 정보(이력·자격)가 부족해요",
  "NLP-EEAT-AUTHOR-001": "누가 쓴 글인지 안 적혀 있어요",
  "NLP-EEAT-EXPERTISE-001": "전문성을 보여주는 내용이 부족해요",

  // 속도·편의
  "PERF-LCP-001": "첫 화면이 늦게 떠요",
  "PERF-FCP-001": "화면이 처음 뜨기까지 오래 걸려요",
  "PERF-CLS-001": "화면이 로딩 중에 덜컹거려요",
  "MOBILE-VIEWPORT-OK-001": "휴대폰 화면에 안 맞춰져 있어요",
  "MOBILE-TAP-TARGET-001": "휴대폰에서 버튼 누르기 불편해요",
  "MOBILE-FONT-SIZE-001": "휴대폰에서 글씨가 작아 읽기 불편해요",
  "A11Y-IMAGE-ALT-001": "사진 설명이 없어 일부 손님이 못 알아봐요",
};

/**
 * 카테고리 기반 폴백 label — 미등록 룰도 코드값 노출 없이 사장님 언어로.
 * 엔진 카테고리(seo/aeo/geo/perf)를 사장님 언어 한 줄로 번역.
 */
const GAP_CATEGORY_FALLBACK: Record<EngineCategory, string> = {
  seo: "검색에 잘 보이게 하는 정보가 빠져 있어요",
  aeo: "손님 질문에 답해줄 안내가 부족해요",
  geo: "내 가게 정보(위치·연락)가 또렷하지 않아요",
  perf: "화면이 빠르고 편하게 뜨도록 손볼 곳이 있어요",
};

/**
 * 엔진 카테고리 → 사장님 언어 갭 묶음(노출/소개/리뷰/속도). 코드값 비노출.
 */
function categoryToLabel(category: EngineCategory): GapCategoryLabel {
  switch (category) {
    case "geo":
      return "노출";
    case "seo":
      return "소개";
    case "aeo":
      return "소개";
    case "perf":
      return "속도";
  }
}

/**
 * 엔진 actionType → S4 actionTier(P2-R5 4분류 토대).
 * self_fix→self_fix(직접), snippet_action→snippet(복붙), vendor_action→vendor(업체),
 * si_action→ongoing(꾸준히).
 */
function actionTypeToTier(actionType: EngineActionType): GapActionTier {
  switch (actionType) {
    case "self_fix":
      return "self_fix";
    case "snippet_action":
      return "snippet";
    case "vendor_action":
      return "vendor";
    case "si_action":
      return "ongoing";
  }
}

/**
 * 도메인 actionTier(self_fix|snippet|vendor|ongoing) → UI 4분류(green_self 등).
 *
 * gapItem.actionTier 는 도메인값(self_fix 등)이고, 화면(S4)이 라벨을 얻는
 * ui-labels.actionTierToLabel 은 UI enum(green_self/yellow_copy/red_vendor/gray_ongoing)을
 * 기대한다. 이 둘을 정합시키는 단일 변환 — action-service.actionTypeToClass 와 동일한 매핑이다
 * (S4 /gap·S5 /actions 가 같은 actionTier 를 같은 4분류로 보이도록 일관성 유지).
 *
 * 이 함수가 돌려주는 값은 항상 actionTierToLabel 이 라벨을 갖는 enum 멤버다(undefined 0).
 */
export function gapActionTierToClass(tier: GapActionTier): ActionTier {
  switch (tier) {
    case "self_fix":
      return "green_self";
    case "snippet":
      return "yellow_copy";
    case "vendor":
      return "red_vendor";
    case "ongoing":
      return "gray_ongoing";
  }
}

// ---------------------------------------------------------------------------
// 내부 상수·헬퍼
// ---------------------------------------------------------------------------

/** [무료] priority 상위 노출 개수(Top3 컷오프). */
const FREE_TOP_N = 3;

/** 엔진 priority → 정렬 가중치(high 가장 급함). */
const PRIORITY_WEIGHT: Record<EnginePriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** 1-based 순번을 1~5 priority 로 clamp(엔진 PriorityGap rank 와 동형 범위). */
function clampRank(n: number): 1 | 2 | 3 | 4 | 5 {
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return n as 2 | 3 | 4;
}

/**
 * UUID v4 생성(런타임 화면 식별자). crypto.randomUUID 우선, 미지원 환경 폴백.
 * 영속화 ID 가 아니다(원자료 미영속화 — id 는 화면 키 용도). competitor-service 와 동형.
 */
function makeUuidV4(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[(Math.floor(Math.random() * 16) & 0x3) | 0x8] as string;
    else out += hex[Math.floor(Math.random() * 16)] as string;
  }
  return out;
}
