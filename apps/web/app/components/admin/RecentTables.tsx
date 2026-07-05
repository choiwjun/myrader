import type { RecentAccount, RecentDiagnosis } from "@/lib/admin/metrics";
// @SPEC docs/superpowers/plans/2026-06-17-admin-dashboard.md (Task 6 — RecentTables 컴포넌트)
import type { ReactNode } from "react";

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  // KST 고정 표기(운영자 혼동 방지). 서버 타임존 비의존.
  const s = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(d));
  return `${s} KST`;
}

function Empty() {
  return <p className="py-4 text-center text-sm text-slate-500">아직 데이터가 없어요.</p>;
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-slate-300">{children}</h2>;
}

function TableWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full text-sm text-slate-300">{children}</table>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">{children}</th>;
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>;
}

// ─── 최근 가입 ────────────────────────────────────────────────────────────────

function RecentAccountsTable({ rows }: { rows: RecentAccount[] }) {
  return (
    <div className="mb-6">
      <SectionHeading>최근 가입 (최근 20건)</SectionHeading>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-slate-700">
          <Empty />
        </div>
      ) : (
        <TableWrapper>
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800">
              <Th>이메일</Th>
              <Th>이름</Th>
              <Th>플랜</Th>
              <Th>가입일시</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr
                key={a.id}
                className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50"
              >
                <Td>{a.email}</Td>
                <Td>{a.name ?? "—"}</Td>
                <Td>{a.plan}</Td>
                <Td className="whitespace-nowrap font-mono text-xs text-slate-400">
                  {fmt(a.createdAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </div>
  );
}

// ─── 최근 진단 ────────────────────────────────────────────────────────────────

function RecentDiagnosesTable({ rows }: { rows: RecentDiagnosis[] }) {
  return (
    <div className="mb-6">
      <SectionHeading>최근 진단 (최근 20건)</SectionHeading>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-slate-700">
          <Empty />
        </div>
      ) : (
        <TableWrapper>
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800">
              <Th>업체명</Th>
              <Th>상태</Th>
              <Th>실패 사유</Th>
              <Th>생성일시</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr
                key={d.id}
                className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50"
              >
                <Td>{d.businessName ?? "—"}</Td>
                <Td>{d.status}</Td>
                <Td className="text-xs text-slate-500">{d.crawlFailureReason ?? ""}</Td>
                <Td className="whitespace-nowrap font-mono text-xs text-slate-400">
                  {fmt(d.createdAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </div>
  );
}

// ─── 실패·지연 잡 ─────────────────────────────────────────────────────────────

function FailedJobsTable({ rows }: { rows: RecentDiagnosis[] }) {
  return (
    <div>
      <SectionHeading>실패·지연 잡 (사유 표시 — 재시도는 키 연동 단계) (최근 20건)</SectionHeading>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-slate-700">
          <Empty />
        </div>
      ) : (
        <TableWrapper>
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800">
              <Th>업체명</Th>
              <Th>상태</Th>
              <Th>실패 사유</Th>
              <Th>생성일시</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr
                key={d.id}
                className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50"
              >
                <Td>{d.businessName ?? "—"}</Td>
                <Td>{d.status}</Td>
                <Td className="text-xs text-red-400">{d.crawlFailureReason ?? "(사유 미기록)"}</Td>
                <Td className="whitespace-nowrap font-mono text-xs text-slate-400">
                  {fmt(d.createdAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </div>
  );
}

// ─── 공개 컴포넌트 ─────────────────────────────────────────────────────────────

export function RecentTables({
  recentAccounts,
  recentDiagnoses,
  failedJobs,
}: {
  recentAccounts: RecentAccount[];
  recentDiagnoses: RecentDiagnosis[];
  failedJobs: RecentDiagnosis[];
}) {
  return (
    <div>
      <RecentAccountsTable rows={recentAccounts} />
      <RecentDiagnosesTable rows={recentDiagnoses} />
      <FailedJobsTable rows={failedJobs} />
    </div>
  );
}
