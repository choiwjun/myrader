// @SPEC docs/superpowers/specs/2026-06-17-admin-dashboard-design.md §5
// 관리자 대시보드용 순수 집계 함수. DbClient 주입(테스트 가능). 읽기 전용.

import type { DbClient } from "@boina/db/client";
import { accounts, businesses, diagnoses } from "@boina/db/schema";
import {
  type SQL,
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  lt,
  ne,
  sql,
} from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;
const STUCK_AFTER_MS = 10 * 60 * 1000;

function startOfTodayUtc(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface KpiSummary {
  totalAccounts: number;
  accountsToday: number;
  accounts7d: number;
  paidAccounts: number;
  conversionRate: number;
  totalDiagnoses: number;
  diagnosesToday: number;
  completedCount: number;
  failedCount: number;
  stuckJobs: number;
}

export interface TrendPoint {
  date: string;
  signups: number;
  diagnoses: number;
}
export interface Funnel {
  signups: number;
  diagnosed: number;
  completed: number;
  paid: number;
}
export interface RecentAccount {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  createdAt: Date;
}
export interface RecentDiagnosis {
  id: string;
  businessName: string | null;
  status: string;
  crawlFailureReason: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

async function countWhere(
  db: DbClient,
  table: typeof accounts | typeof diagnoses,
  where?: SQL,
): Promise<number> {
  const rows = where
    ? await db.select({ c: count() }).from(table).where(where)
    : await db.select({ c: count() }).from(table);
  return Number(rows[0]?.c ?? 0);
}

export async function getKpiSummary(db: DbClient, now = new Date()): Promise<KpiSummary> {
  const today = startOfTodayUtc(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS);
  const totalAccounts = await countWhere(db, accounts);
  const accountsToday = await countWhere(db, accounts, gte(accounts.createdAt, today));
  const accounts7d = await countWhere(db, accounts, gte(accounts.createdAt, sevenDaysAgo));
  const paidAccounts = await countWhere(db, accounts, ne(accounts.plan, "free"));
  const totalDiagnoses = await countWhere(db, diagnoses);
  const diagnosesToday = await countWhere(db, diagnoses, gte(diagnoses.createdAt, today));
  const completedCount = await countWhere(db, diagnoses, eq(diagnoses.status, "completed"));
  const failedCount = await countWhere(db, diagnoses, eq(diagnoses.status, "failed"));
  const stuckJobs = await countWhere(
    db,
    diagnoses,
    and(inArray(diagnoses.status, ["queued", "running"]), lt(diagnoses.createdAt, stuckBefore)),
  );
  return {
    totalAccounts,
    accountsToday,
    accounts7d,
    paidAccounts,
    conversionRate: totalAccounts > 0 ? paidAccounts / totalAccounts : 0,
    totalDiagnoses,
    diagnosesToday,
    completedCount,
    failedCount,
    stuckJobs,
  };
}

export async function getDailyTrend(
  db: DbClient,
  days = 14,
  now = new Date(),
): Promise<TrendPoint[]> {
  const since = startOfTodayUtc(new Date(now.getTime() - (days - 1) * DAY_MS));
  // UTC 고정: createdAt 은 timestamptz. AT TIME ZONE 'UTC' 로 UTC wall-clock(plain timestamp)을
  // 얻은 뒤 date_trunc/to_char 로 버킷팅하면 DB 세션 tz 와 무관하게 JS toISOString 키와 일치한다.
  const day = sql<string>`to_char(date_trunc('day', ${accounts.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
  const signupRows = await db
    .select({ d: day, c: count() })
    .from(accounts)
    .where(gte(accounts.createdAt, since))
    .groupBy(day);
  const diagDay = sql<string>`to_char(date_trunc('day', ${diagnoses.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
  const diagRows = await db
    .select({ d: diagDay, c: count() })
    .from(diagnoses)
    .where(gte(diagnoses.createdAt, since))
    .groupBy(diagDay);
  const signupMap = new Map(signupRows.map((r) => [r.d, Number(r.c)]));
  const diagMap = new Map(diagRows.map((r) => [r.d, Number(r.c)]));
  const out: TrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const dt = new Date(since.getTime() + i * DAY_MS);
    const key = dt.toISOString().slice(0, 10);
    out.push({ date: key, signups: signupMap.get(key) ?? 0, diagnoses: diagMap.get(key) ?? 0 });
  }
  return out;
}

export async function getFunnel(db: DbClient): Promise<Funnel> {
  const signups = await countWhere(db, accounts);
  const paid = await countWhere(db, accounts, ne(accounts.plan, "free"));
  // 진단 시작/완료는 행 수가 아니라 distinct 가게 수로 집계한다(가게가 여러 번 진단해도 1로).
  // → completed <= diagnosed 가 항상 성립하고, diagnosed > signups 같은 비정상 퍼널을 방지.
  const [diagRow] = await db.select({ c: countDistinct(diagnoses.businessId) }).from(diagnoses);
  const diagnosed = Number(diagRow?.c ?? 0);
  const [compRow] = await db
    .select({ c: countDistinct(diagnoses.businessId) })
    .from(diagnoses)
    .where(eq(diagnoses.status, "completed"));
  const completed = Number(compRow?.c ?? 0);
  return { signups, diagnosed, completed, paid };
}

export async function getRecentAccounts(db: DbClient, limit = 20): Promise<RecentAccount[]> {
  return db
    .select({
      id: accounts.id,
      email: accounts.email,
      name: accounts.name,
      plan: accounts.plan,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .orderBy(desc(accounts.createdAt))
    .limit(limit);
}

export async function getRecentDiagnoses(db: DbClient, limit = 20): Promise<RecentDiagnosis[]> {
  return db
    .select({
      id: diagnoses.id,
      businessName: businesses.name,
      status: diagnoses.status,
      crawlFailureReason: diagnoses.crawlFailureReason,
      createdAt: diagnoses.createdAt,
      completedAt: diagnoses.completedAt,
    })
    .from(diagnoses)
    .leftJoin(businesses, eq(diagnoses.businessId, businesses.id))
    .orderBy(desc(diagnoses.createdAt))
    .limit(limit);
}

export async function getFailedJobs(db: DbClient, limit = 20): Promise<RecentDiagnosis[]> {
  // 의도적으로 failed/timeout/partial 모두 포함 — KPI failedCount('failed'만)와 다르다(운영 점검용 광의).
  return db
    .select({
      id: diagnoses.id,
      businessName: businesses.name,
      status: diagnoses.status,
      crawlFailureReason: diagnoses.crawlFailureReason,
      createdAt: diagnoses.createdAt,
      completedAt: diagnoses.completedAt,
    })
    .from(diagnoses)
    .leftJoin(businesses, eq(diagnoses.businessId, businesses.id))
    .where(inArray(diagnoses.status, ["failed", "timeout", "partial"]))
    .orderBy(desc(diagnoses.createdAt))
    .limit(limit);
}
