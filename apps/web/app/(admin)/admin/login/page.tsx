// @SPEC docs/superpowers/plans/2026-06-17-admin-dashboard.md (Task 5 — admin 로그인 페이지)
"use client";
import { useState } from "react";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      window.location.assign("/admin");
      return;
    }
    if (res.status === 403) setError("관리자 기능이 설정되지 않았습니다 (ADMIN_PASSWORD).");
    else setError("비밀번호가 올바르지 않습니다.");
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-20 grid max-w-xs gap-3">
      <h1 className="text-xl font-bold">운영 콘솔 로그인</h1>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="관리자 비밀번호"
        aria-label="관리자 비밀번호"
        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      />
      <button
        type="submit"
        disabled={loading || password.length === 0}
        aria-busy={loading}
        className="rounded-lg bg-blue-600 px-3 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "확인 중…" : "로그인"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
