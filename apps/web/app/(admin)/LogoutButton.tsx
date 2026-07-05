// @SPEC docs/superpowers/plans/2026-06-17-admin-dashboard.md (Task 5 — admin 로그아웃)
"use client";

export function LogoutButton() {
  async function onLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.assign("/admin/login");
  }
  return (
    <button
      type="button"
      onClick={onLogout}
      className="text-sm font-normal text-slate-400 transition-colors hover:text-slate-200"
    >
      로그아웃
    </button>
  );
}
