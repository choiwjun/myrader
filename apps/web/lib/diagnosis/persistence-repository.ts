// @TASK P2-PERSIST - 진단 영속화 저장소 (Drizzle/@boina/db — 5종 테이블 insert/read)
// @SPEC docs/planning/04-database-design.md §3·§4 (engine_result/competitor/gap_row/snippet/action)
// @SPEC docs/planning/07-coding-convention.md §2 (앱↔DB 서비스 레이어 경유, 단방향 의존)
// @SPEC packages/db/src/schema/* (테이블 구조 변경 금지 — import + insert/select 만)
// @TEST apps/web/tests/diagnosis/diagnosis-persistence-integration.test.ts
//
// PersistencePlan(순수 매퍼 산출) → 실제 DB insert. 모든 쿼리는 eq() 파라미터 바인딩
// (문자열 보간 0 — SQL Injection 방지, Guardrails). id 는 DB defaultRandom(UUID v4).
//
// 04 §4 일관 기록: competitor insert → 그 competitor_id 로 gap_rows insert(FK 보존).
// gap_rows 는 competitor 1:N — 영속화 단계에선 첫 competitor 에 갭을 연결한다(룰 역공학은
// 경쟁사 집합 기준 산출이므로 대표 competitor 에 귀속; competitor 0 이면 gap_rows 생략).

import { type DbClient, createDb } from "@boina/db/client";
import {
  actions as actionsTable,
  competitors as competitorsTable,
  engineResults as engineResultsTable,
  gapRows as gapRowsTable,
  generatedAssets as generatedAssetsTable,
} from "@boina/db/schema";
import { eq } from "drizzle-orm";
import type { PersistencePlan } from "./diagnosis-persistence.js";
import type { GapActionTier } from "./gap-service.js";

// ---------------------------------------------------------------------------
// 영속화(insert) — PersistencePlan → 5종 테이블
// ---------------------------------------------------------------------------

/** 영속화 결과 카운트(검증·로깅용). */
export interface PersistResult {
  engineResults: number;
  competitors: number;
  gapRows: number;
  generatedAssets: number;
  actions: number;
}

/**
 * PersistencePlan 을 5종 테이블에 insert 한다(04 §4 일관 기록).
 *
 * 순서: engine_results → competitors → (첫 competitor_id 로) gap_rows → generated_assets → actions.
 * gap_rows 는 competitor FK 필수 — competitor 가 없으면 gap_rows 는 저장하지 않는다(정직: 비교 대상 0).
 * 모든 insert 는 빈 배열이면 건너뛴다(불필요 쿼리 0).
 */
export async function persistDiagnosisArtifacts(
  db: DbClient,
  plan: PersistencePlan,
): Promise<PersistResult> {
  const result: PersistResult = {
    engineResults: 0,
    competitors: 0,
    gapRows: 0,
    generatedAssets: 0,
    actions: 0,
  };

  // 1. engine_results (채널별·카테고리별 + 점수 내부 저장).
  if (plan.engineResults.length > 0) {
    const rows = await db.insert(engineResultsTable).values(plan.engineResults).returning({
      id: engineResultsTable.id,
    });
    result.engineResults = rows.length;
  }

  // 2. competitors (신뢰 소스만). 반환 id 로 gap_rows FK 를 연결한다.
  let firstCompetitorId: string | null = null;
  if (plan.competitors.length > 0) {
    const rows = await db.insert(competitorsTable).values(plan.competitors).returning({
      id: competitorsTable.id,
    });
    result.competitors = rows.length;
    firstCompetitorId = rows[0]?.id ?? null;
  }

  // 3. gap_rows (competitor FK 필수 — 대표 competitor 에 귀속). competitor 0 이면 생략.
  if (firstCompetitorId && plan.gapRows.length > 0) {
    const rows = await db
      .insert(gapRowsTable)
      .values(
        plan.gapRows.map((g) => ({
          competitorId: firstCompetitorId as string,
          item: g.item,
          competitorHas: g.competitorHas,
          isMyGap: g.isMyGap,
          description: g.description,
          actionTier: g.actionTier, // ★ 4분류 보존(#1) — 영속화→읽기 왕복에서 tier 유지.
        })),
      )
      .returning({ id: gapRowsTable.id });
    result.gapRows = rows.length;
  }

  // 4. generated_assets (복붙 생성물 — code/text).
  if (plan.generatedAssets.length > 0) {
    const rows = await db.insert(generatedAssetsTable).values(plan.generatedAssets).returning({
      id: generatedAssetsTable.id,
    });
    result.generatedAssets = rows.length;
  }

  // 5. actions (4분류 + 오늘 딱 하나).
  if (plan.actions.length > 0) {
    const rows = await db.insert(actionsTable).values(plan.actions).returning({
      id: actionsTable.id,
    });
    result.actions = rows.length;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 읽기(select) — route 가 실데이터로 채널/경쟁/갭/행동/생성물 렌더
// ---------------------------------------------------------------------------

/** route 가 신뢰 경쟁사를 읽는 행 형태(점수 비노출 — name/source/serpRank + 측정 메타만). */
export interface PersistedCompetitor {
  name: string;
  source: "naver_serp" | "gpt_grounded" | "manual";
  serpRank: number | null;
  collectedAt: string;
}

/** diagnosisId 의 신뢰 경쟁사 목록(추측 0 — 저장된 것만). */
export async function getPersistedCompetitors(
  db: DbClient,
  diagnosisId: string,
): Promise<PersistedCompetitor[]> {
  const rows = await db
    .select({
      name: competitorsTable.name,
      source: competitorsTable.source,
      serpRank: competitorsTable.serpRank,
      discoveredAt: competitorsTable.discoveredAt,
    })
    .from(competitorsTable)
    .where(eq(competitorsTable.diagnosisId, diagnosisId));
  return rows.map((r) => ({
    name: r.name ?? "",
    source: r.source,
    serpRank: r.serpRank,
    collectedAt: r.discoveredAt.toISOString(),
  }));
}

/** route 가 갭을 읽는 행 형태(사장님 언어 label + 경쟁사보유/내갭 + 4분류 tier + 근거 메타). */
export interface PersistedGapRow {
  item: string;
  competitorHas: boolean;
  isMyGap: boolean;
  /** ★ action 4분류(🟢🟡🔴⏳) 복원용 — 저장된 도메인 tier(self_fix/snippet/vendor/ongoing). */
  actionTier: GapActionTier;
  source: "naver_serp" | "gpt_grounded" | "manual";
  collectedAt: string;
  competitorName: string | null;
}

/** diagnosisId 의 gap_rows(competitor join — 진단 단위 조회). */
export async function getPersistedGapRows(
  db: DbClient,
  diagnosisId: string,
): Promise<PersistedGapRow[]> {
  const rows = await db
    .select({
      item: gapRowsTable.item,
      competitorHas: gapRowsTable.competitorHas,
      isMyGap: gapRowsTable.isMyGap,
      actionTier: gapRowsTable.actionTier,
      source: competitorsTable.source,
      collectedAt: competitorsTable.discoveredAt,
      competitorName: competitorsTable.name,
    })
    .from(gapRowsTable)
    .innerJoin(competitorsTable, eq(gapRowsTable.competitorId, competitorsTable.id))
    .where(eq(competitorsTable.diagnosisId, diagnosisId));
  return rows.map((r) => ({
    item: r.item,
    competitorHas: r.competitorHas,
    isMyGap: r.isMyGap,
    actionTier: r.actionTier,
    source: r.source,
    collectedAt: r.collectedAt.toISOString(),
    competitorName: r.competitorName ?? null,
  }));
}

/** route 가 행동을 읽는 행 형태(4분류 tier + 오늘딱하나 — 점수/코드값 0). */
export interface PersistedAction {
  actionRef: string;
  actionTier: "high" | "medium" | "low" | "waiting";
  isTodayOne: boolean;
}

/** diagnosisId 의 actions(4분류 + 오늘 딱 하나). */
export async function getPersistedActions(
  db: DbClient,
  diagnosisId: string,
): Promise<PersistedAction[]> {
  const rows = await db
    .select({
      actionRef: actionsTable.actionRef,
      actionTier: actionsTable.actionTier,
      isTodayOne: actionsTable.isTodayOne,
    })
    .from(actionsTable)
    .where(eq(actionsTable.diagnosisId, diagnosisId));
  return rows.map((r) => ({
    actionRef: r.actionRef,
    actionTier: r.actionTier,
    isTodayOne: r.isTodayOne,
  }));
}

/** route 가 생성물을 읽는 행 형태(DB type + 복붙 본문 — 코드값/전문용어는 가드가 차단). */
export interface PersistedGeneratedAsset {
  type: string;
  code: string;
}

/** diagnosisId 의 generated_assets(최신만 — isLatest=true). */
export async function getPersistedGeneratedAssets(
  db: DbClient,
  diagnosisId: string,
): Promise<PersistedGeneratedAsset[]> {
  const rows = await db
    .select({
      type: generatedAssetsTable.type,
      code: generatedAssetsTable.code,
      isLatest: generatedAssetsTable.isLatest,
    })
    .from(generatedAssetsTable)
    .where(eq(generatedAssetsTable.diagnosisId, diagnosisId));
  return rows.filter((r) => r.isLatest === true).map((r) => ({ type: r.type, code: r.code }));
}

/** route 가 채널 신호를 위해 읽는 engine_result 행 형태(채널·점수·원근거·수집시각). */
export interface PersistedEngineResult {
  channel: string;
  category: string;
  code: string;
  /** 내부 점수(impactScore) — route 가 signal 판단에만 쓰고 응답엔 절대 노출 0(07 §4). */
  impactScore: number | null;
  priority: "high" | "medium" | "low";
  evidence: Record<string, unknown> | null;
  collectedAt: string;
}

/** diagnosisId 의 engine_results(채널 신호 산출용 원자료). */
export async function getPersistedEngineResults(
  db: DbClient,
  diagnosisId: string,
): Promise<PersistedEngineResult[]> {
  const rows = await db
    .select({
      channel: engineResultsTable.channel,
      category: engineResultsTable.category,
      code: engineResultsTable.code,
      impactScore: engineResultsTable.impactScore,
      priority: engineResultsTable.priority,
      evidence: engineResultsTable.evidence,
      createdAt: engineResultsTable.createdAt,
    })
    .from(engineResultsTable)
    .where(eq(engineResultsTable.diagnosisId, diagnosisId));
  return rows.map((r) => ({
    channel: r.channel,
    category: r.category,
    code: r.code,
    impactScore: r.impactScore,
    priority: r.priority,
    evidence: r.evidence ?? null,
    collectedAt: r.createdAt.toISOString(),
  }));
}

/** DATABASE_URL 로 DbClient 생성(route 진입점에서 사용 — diagnosis-repository 와 동형). */
export function getDefaultDb(): DbClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return createDb(url);
}
