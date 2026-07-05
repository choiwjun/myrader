// @SPEC docs/superpowers/plans/2026-06-17-admin-dashboard.md (Task 6 — FunnelView 컴포넌트)
import type { Funnel } from "@/lib/admin/metrics";

function rate(a: number, b: number): string {
  return b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—";
}

interface RowProps {
  label: string;
  value: number;
  rateStr: string;
}

function FunnelRow({ label, value, rateStr }: RowProps) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 py-2 last:border-0">
      <span className="text-sm text-slate-300">{label}</span>
      <span className="text-sm font-semibold text-slate-100">
        {value} <span className="text-xs font-normal text-slate-500">({rateStr})</span>
      </span>
    </div>
  );
}

export function FunnelView({ funnel }: { funnel: Funnel }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-slate-300">퍼널</h2>
      <div className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-1">
        <FunnelRow
          label="가입"
          value={funnel.signups}
          rateStr={rate(funnel.signups, funnel.signups)}
        />
        <FunnelRow
          label="진단 시작"
          value={funnel.diagnosed}
          rateStr={rate(funnel.diagnosed, funnel.signups)}
        />
        <FunnelRow
          label="진단 완료"
          value={funnel.completed}
          rateStr={rate(funnel.completed, funnel.diagnosed)}
        />
        <FunnelRow
          label="유료 전환"
          value={funnel.paid}
          rateStr={rate(funnel.paid, funnel.signups)}
        />
      </div>
    </div>
  );
}
