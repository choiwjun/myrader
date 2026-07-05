// @SPEC docs/superpowers/plans/2026-06-17-admin-dashboard.md (Task 6 — TrendTable 컴포넌트)
import type { TrendPoint } from "@/lib/admin/metrics";

export function TrendTable({ points }: { points: TrendPoint[] }) {
  const maxV = Math.max(1, ...points.map((p) => Math.max(p.signups, p.diagnoses)));

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-slate-300">최근 {points.length}일 추이</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-sm text-slate-300">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800 text-xs text-slate-400">
              <th className="px-3 py-2 text-left">날짜</th>
              <th className="px-3 py-2 text-right">가입</th>
              <th className="px-3 py-2 text-right">진단</th>
              <th className="px-3 py-2 text-left">막대</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => {
              const signupWidth = Math.round((p.signups / maxV) * 100);
              const diagWidth = Math.round((p.diagnoses / maxV) * 100);
              return (
                <tr
                  key={p.date}
                  className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50"
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-400">
                    {p.date}
                  </td>
                  <td className="px-3 py-2 text-right">{p.signups}</td>
                  <td className="px-3 py-2 text-right">{p.diagnoses}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <div
                        className="h-1.5 rounded-full bg-blue-500"
                        style={{ width: `${signupWidth}%` }}
                      />
                      <div
                        className="h-1.5 rounded-full bg-emerald-500"
                        style={{ width: `${diagWidth}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-xs text-slate-600">파란 막대 = 가입, 초록 막대 = 진단</p>
    </div>
  );
}
