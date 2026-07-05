// @SPEC docs/superpowers/plans/2026-06-17-admin-dashboard.md (Task 5 — admin 셸 레이아웃)
// 관리자 전용 레이아웃 — 고객용 (app) 셸/브랜딩을 상속하지 않는다.
// 루트 layout.tsx 가 <html>/<body>를 이미 제공하므로 div 래퍼만 렌더한다.
import { isAdminAuthenticated } from "@/lib/admin/require-admin";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "./LogoutButton";

// 셸이 추후 쿠키를 읽더라도 env-less 빌드 보장이 유지되도록 동적 렌더로 고정.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const authed = await isAdminAuthenticated();
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3 font-semibold">
        <div className="flex items-center gap-6">
          <span>보이나 운영 콘솔</span>
          {authed && (
            <nav className="flex gap-4 text-sm font-normal text-slate-400">
              <Link href="/admin" className="hover:text-slate-200">
                대시보드
              </Link>
              <Link href="/admin/members" className="hover:text-slate-200">
                회원 관리
              </Link>
            </nav>
          )}
        </div>
        {authed && <LogoutButton />}
      </header>
      <main className="mx-auto max-w-[1100px] p-5">{children}</main>
    </div>
  );
}
