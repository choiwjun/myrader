// @SPEC docs/superpowers/plans/2026-06-17-admin-member-management.md (Task 6 — 회원 목록)
import { type MemberStatus, listMembers } from "@/lib/admin/members";
import { isAdminAuthenticated } from "@/lib/admin/require-admin";
import { createDb } from "@boina/db/client";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const url = process.env.DATABASE_URL;
  if (!url) return <p className="text-red-400">DATABASE_URL 미설정.</p>;
  const sp = await searchParams;
  const q = sp.q ?? "";
  const status = (["active", "blocked", "deleted"] as const).includes(sp.status as MemberStatus)
    ? (sp.status as MemberStatus)
    : undefined;
  const limit = 20;
  const page = Math.max(Number(sp.page ?? "1") || 1, 1);
  const { rows, total } = await listMembers(createDb(url), {
    q,
    status,
    limit,
    offset: (page - 1) * limit,
  });
  const pages = Math.max(Math.ceil(total / limit), 1);
  const statusParam = status ? `&status=${status}` : "";
  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short" }).format(
      new Date(d),
    );

  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold text-slate-100">회원 관리 ({total})</h1>
      <form className="flex flex-wrap gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="이메일 검색"
          aria-label="이메일 검색"
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
          aria-label="상태 필터"
        >
          <option value="">전체 상태</option>
          <option value="active">활성</option>
          <option value="blocked">차단</option>
          <option value="deleted">삭제</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          검색
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="text-slate-500">해당하는 회원이 없어요.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800 text-left text-xs text-slate-400">
                <th scope="col" className="px-3 py-2 font-medium">
                  이메일
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  이름
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  플랜
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  상태
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  가입
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t border-slate-800 hover:bg-slate-800/50">
                  <td className="px-3 py-2">
                    <Link href={`/admin/members/${m.id}`} className="text-blue-400 hover:underline">
                      {m.email}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{m.name ?? "—"}</td>
                  <td className="px-3 py-2">{m.plan}</td>
                  <td className="px-3 py-2">{m.status}</td>
                  <td className="px-3 py-2">{fmtDate(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-3 text-sm text-slate-400">
        {page > 1 && (
          <Link
            href={`/admin/members?q=${encodeURIComponent(q)}${statusParam}&page=${page - 1}`}
            className="hover:text-slate-200"
          >
            ← 이전
          </Link>
        )}
        <span>
          {page} / {pages}
        </span>
        {page < pages && (
          <Link
            href={`/admin/members?q=${encodeURIComponent(q)}${statusParam}&page=${page + 1}`}
            className="hover:text-slate-200"
          >
            다음 →
          </Link>
        )}
      </div>
    </div>
  );
}
