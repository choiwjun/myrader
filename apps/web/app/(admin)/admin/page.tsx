import { FunnelView } from "@/app/components/admin/FunnelView";
import { KpiCards } from "@/app/components/admin/KpiCards";
import { RecentTables } from "@/app/components/admin/RecentTables";
import { TrendTable } from "@/app/components/admin/TrendTable";
import {
  getDailyTrend,
  getFailedJobs,
  getFunnel,
  getKpiSummary,
  getRecentAccounts,
  getRecentDiagnoses,
} from "@/lib/admin/metrics";
// @SPEC docs/superpowers/plans/2026-06-17-admin-dashboard.md (Task 6 — /admin 대시보드)
import { isAdminAuthenticated } from "@/lib/admin/require-admin";
import { createDb } from "@boina/db/client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    return (
      <p className="text-red-400">DATABASE_URL 이 설정되지 않아 데이터를 불러올 수 없습니다.</p>
    );
  }
  const db = createDb(url);
  // 섹션별 graceful degradation: 한 쿼리가 실패해도 전체 페이지가 500 나지 않도록
  // Promise.allSettled 로 독립 처리하고, rejected 섹션만 인라인 에러 상태로 렌더한다. (design §7)
  const [kpiR, trendR, funnelR, accR, diagR, failR] = await Promise.allSettled([
    getKpiSummary(db),
    getDailyTrend(db, 14),
    getFunnel(db),
    getRecentAccounts(db, 20),
    getRecentDiagnoses(db, 20),
    getFailedJobs(db, 20),
  ]);
  for (const r of [kpiR, trendR, funnelR, accR, diagR, failR]) {
    if (r.status === "rejected") console.error("[admin dashboard] 섹션 로드 실패:", r.reason);
  }
  return (
    <div className="grid gap-6">
      {kpiR.status === "fulfilled" ? <KpiCards kpi={kpiR.value} /> : <SectionError />}
      {funnelR.status === "fulfilled" ? <FunnelView funnel={funnelR.value} /> : <SectionError />}
      {trendR.status === "fulfilled" ? <TrendTable points={trendR.value} /> : <SectionError />}
      {accR.status === "fulfilled" &&
      diagR.status === "fulfilled" &&
      failR.status === "fulfilled" ? (
        <RecentTables
          recentAccounts={accR.value}
          recentDiagnoses={diagR.value}
          failedJobs={failR.value}
        />
      ) : (
        <SectionError />
      )}
    </div>
  );
}

function SectionError() {
  return (
    <p className="text-red-400 text-sm">이 섹션을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
  );
}
