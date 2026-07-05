import { MemberControls } from "@/app/components/admin/MemberControls";
// @SPEC docs/superpowers/plans/2026-06-17-admin-member-management.md (Task 6 — 회원 상세)
import { getMemberDetail } from "@/lib/admin/members";
import { isAdminAuthenticated } from "@/lib/admin/require-admin";
import { createDb } from "@boina/db/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  if (!d) return "—";
  return `${new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(d))} KST`;
}

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const url = process.env.DATABASE_URL;
  if (!url) return <p className="text-red-400">DATABASE_URL 미설정.</p>;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const detail = await getMemberDetail(createDb(url), id);
  if (!detail) notFound();
  const a = detail.account;

  return (
    <div className="grid gap-5">
      <Link href="/admin/members" className="text-sm text-slate-400 hover:text-slate-200">
        ← 회원 목록
      </Link>
      <div className="rounded-lg border border-slate-700 p-4">
        <h1 className="text-lg font-semibold text-slate-100">{a.email}</h1>
        <dl className="mt-2 grid grid-cols-2 gap-1 text-sm text-slate-300">
          <dt className="text-slate-500">이름</dt>
          <dd>{a.name ?? "—"}</dd>
          <dt className="text-slate-500">전화</dt>
          <dd>{a.phone ?? "—"}</dd>
          <dt className="text-slate-500">플랜</dt>
          <dd>{a.plan}</dd>
          <dt className="text-slate-500">상태</dt>
          <dd>{a.status}</dd>
          <dt className="text-slate-500">가입</dt>
          <dd>{fmt(a.createdAt)}</dd>
        </dl>
      </div>
      <div className="rounded-lg border border-slate-700 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">제어</h2>
        <MemberControls id={a.id} plan={a.plan} status={a.status} />
      </div>
      <div className="rounded-lg border border-slate-700 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          가게 / 진단 ({detail.businesses.length})
        </h2>
        {detail.businesses.length === 0 ? (
          <p className="text-slate-500">진단한 가게가 없어요.</p>
        ) : (
          <ul className="grid gap-2 text-sm text-slate-300">
            {detail.businesses.map((b) => (
              <li key={b.id} className="flex justify-between border-t border-slate-800 py-1">
                <span>{b.name}</span>
                <span className="text-slate-500">
                  {b.latestStatus ?? "진단 없음"} · {fmt(b.latestAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
