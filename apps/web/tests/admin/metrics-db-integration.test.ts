import { createDb } from "@boina/db/client";
import { accounts, businesses, diagnoses } from "@boina/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getDailyTrend,
  getFunnel,
  getKpiSummary,
  getRecentDiagnoses,
} from "../../lib/admin/metrics";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb("admin metrics ↔ DB 통합", () => {
  let db: ReturnType<typeof createDb>;
  const ids: { accounts: string[]; businesses: string[] } = { accounts: [], businesses: [] };

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const accRows = await db
      .insert(accounts)
      .values([
        { email: `adm-free-${suffix}@example.com`, passwordHash: "x", plan: "free" },
        { email: `adm-paid-${suffix}@example.com`, passwordHash: "x", plan: "pro" },
      ])
      .returning({ id: accounts.id });
    ids.accounts = accRows.map((r) => r.id);
    const bizRows = await db
      .insert(businesses)
      .values([{ name: `adm-biz-${suffix}` }])
      .returning({ id: businesses.id });
    ids.businesses = bizRows.map((r) => r.id);
    const businessId = ids.businesses[0] as string;
    // 같은 가게에 진단 3건(completed 2 + failed 1) — distinct 가게 집계 검증용.
    // 퍼널 diagnosed/completed 는 행 수가 아니라 distinct businessId 로 1로 세어야 한다.
    await db.insert(diagnoses).values([
      { businessId, status: "completed" },
      { businessId, status: "failed", crawlFailureReason: "TIMEOUT" },
      { businessId, status: "completed" },
    ]);
  });

  afterAll(async () => {
    const { inArray } = await import("drizzle-orm");
    if (ids.businesses.length)
      await db.delete(diagnoses).where(inArray(diagnoses.businessId, ids.businesses));
    if (ids.businesses.length)
      await db.delete(businesses).where(inArray(businesses.id, ids.businesses));
    if (ids.accounts.length) await db.delete(accounts).where(inArray(accounts.id, ids.accounts));
  });

  it("KPI: 총계·유료·진단 수가 양수이고 유료>=1", async () => {
    const kpi = await getKpiSummary(db);
    expect(kpi.totalAccounts).toBeGreaterThanOrEqual(2);
    expect(kpi.paidAccounts).toBeGreaterThanOrEqual(1);
    expect(kpi.totalDiagnoses).toBeGreaterThanOrEqual(2);
    expect(kpi.failedCount).toBeGreaterThanOrEqual(1);
    expect(kpi.conversionRate).toBeGreaterThan(0);
  });

  it("퍼널: 단계별 수 반환", async () => {
    const f = await getFunnel(db);
    expect(f.signups).toBeGreaterThanOrEqual(2);
    expect(f.completed).toBeGreaterThanOrEqual(1);
    expect(f.paid).toBeGreaterThanOrEqual(1);
    // distinct 집계이므로 항상 완료 <= 진단시작 이 성립해야 한다(행 수 집계였다면 깨질 수 있음).
    expect(f.completed).toBeLessThanOrEqual(f.diagnosed);
  });

  it("퍼널: diagnosed/completed 는 행 수가 아니라 distinct 가게 수로 센다", async () => {
    // 시드 가게는 진단 3건(completed 2 + failed 1)을 가지지만 diagnosed/completed 에 각 1만 기여해야 한다.
    const before = await getFunnel(db);

    // 새 가게 1개에 진단 2건(completed 2)을 추가 → 행 수 집계라면 +2, distinct 집계라면 +1 이어야 함.
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const [biz] = await db
      .insert(businesses)
      .values([{ name: `adm-distinct-${suffix}` }])
      .returning({ id: businesses.id });
    const newBizId = (biz as { id: string }).id;
    ids.businesses.push(newBizId);
    await db.insert(diagnoses).values([
      { businessId: newBizId, status: "completed" },
      { businessId: newBizId, status: "completed" },
    ]);

    const after = await getFunnel(db);
    // 가게 1개 추가 → 정확히 +1 (행 +2 이지만 distinct 집계라 +1).
    expect(after.diagnosed - before.diagnosed).toBe(1);
    expect(after.completed - before.completed).toBe(1);
  });

  it("일자별 추이: 정확히 days개 포인트 + 오늘(UTC) 버킷에 시드 반영", async () => {
    const days = 14;
    const trend = await getDailyTrend(db, days);
    expect(trend).toHaveLength(days);
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = trend.find((p) => p.date === todayKey);
    expect(today).toBeTruthy();
    expect(today?.signups).toBeGreaterThanOrEqual(2); // 시드 계정 2개
    expect(today?.diagnoses).toBeGreaterThanOrEqual(2); // 시드 진단 2개
    // 키는 오름차순, 마지막이 오늘
    expect(trend[trend.length - 1]?.date).toBe(todayKey);
  });

  it("최근 진단: failed 행에 실패 사유가 실린다", async () => {
    const recent = await getRecentDiagnoses(db, 50);
    const failed = recent.find((r) => r.status === "failed" && r.crawlFailureReason === "TIMEOUT");
    expect(failed).toBeTruthy();
    expect(typeof failed?.businessName).toBe("string");
  });
});
