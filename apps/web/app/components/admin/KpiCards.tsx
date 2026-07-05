// @SPEC docs/superpowers/plans/2026-06-17-admin-dashboard.md (Task 6 — KpiCards 컴포넌트)
import type { KpiSummary } from "@/lib/admin/metrics";

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

interface CardProps {
  label: string;
  value: number | string;
  hint?: string;
}

function Card({ label, value, hint }: CardProps) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function KpiCards({ kpi }: { kpi: KpiSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Card
        label="총 가입"
        value={kpi.totalAccounts}
        hint={`오늘 +${kpi.accountsToday} · 7일 +${kpi.accounts7d}`}
      />
      <Card label="유료 계정" value={kpi.paidAccounts} hint={`전환율 ${pct(kpi.conversionRate)}`} />
      <Card label="총 진단" value={kpi.totalDiagnoses} hint={`오늘 +${kpi.diagnosesToday}`} />
      <Card label="진단 완료" value={kpi.completedCount} />
      <Card label="진단 실패" value={kpi.failedCount} />
      <Card label="막힌 잡" value={kpi.stuckJobs} hint="queued/running 10분+" />
    </div>
  );
}
