"use client";

import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function LoginForm() {
  const params = useSearchParams();
  const dest = safeRedirectPath(params.get("next") ?? params.get("returnTo"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devEnabled, setDevEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/login")
      .then((response) => response.json())
      .then((json) => {
        if (alive && json?.data?.devLoginEnabled === true) setDevEnabled(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function submitCredentials() {
    await submit("/api/auth/login", { mode: "credentials", email, password }, true);
  }

  async function submitMagicLink() {
    await submit("/api/auth/magic-link", { email, redirectTo: dest }, false);
  }

  async function submitDevLogin() {
    await submit("/api/auth/login", { mode: "dev", email }, true);
  }

  async function submit(path: string, body: Record<string, string>, redirectOnOk: boolean) {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        if (redirectOnOk) {
          window.location.assign(dest);
          return;
        }
        setMessage("매직링크를 보냈습니다. 메일함을 확인해 주세요.");
        return;
      }
      setError(
        response.status === 501
          ? "외부 인증 환경변수 설정이 필요합니다."
          : "입력값을 확인해 주세요.",
      );
    } catch {
      setError("연결이 원활하지 않습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-[460px] space-y-8">
        <div className="space-y-2 text-center md:text-left">
          <h1
            className="text-[28px] font-bold tracking-tight text-[#0F172A]"
            style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
          >
            보이나에 로그인
          </h1>
          <p className="text-[16px] leading-relaxed text-[#64748B]">
            가격 둘러보기는 로그인 없이 가능하고, 내 정보 관리는 로그인 후 사용할 수 있습니다.
          </p>
        </div>
        <div
          className="rounded-2xl border border-[#E2E8F0] bg-white p-6 md:p-8"
          style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.03)" }}
        >
          <div className="space-y-3">
            <a
              href={`/api/auth/oauth/google?returnTo=${encodeURIComponent(dest)}`}
              className="flex min-h-[52px] w-full items-center justify-center rounded-xl border border-[#CBD5E1] bg-white text-base font-bold text-[#0F172A]"
            >
              Google로 계속
            </a>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!loading) submitMagicLink();
              }}
            >
              <label htmlFor="login-email" className="text-sm font-medium text-[#434654]">
                이메일
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-[56px] w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-base transition-all focus:border-[#4F46E5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
                placeholder="email@example.com"
              />
              <button
                type="submit"
                disabled={loading}
                className="h-[52px] w-full rounded-xl bg-[#4F46E5] text-base font-bold text-white transition-all hover:bg-[#4338CA] active:scale-[0.98] disabled:opacity-50"
              >
                매직링크 받기
              </button>
            </form>
          </div>
          <form
            className="mt-6 border-t border-[#E2E8F0] pt-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!loading) submitCredentials();
            }}
          >
            <label htmlFor="login-password" className="text-sm font-medium text-[#434654]">
              비밀번호 로그인
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-[56px] w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-base transition-all focus:border-[#4F46E5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
              placeholder="기존 계정 비밀번호"
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-3 h-[52px] w-full rounded-xl border border-[#CBD5E1] bg-white text-base font-bold text-[#434654] transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "잠시만요" : "비밀번호로 로그인"}
            </button>
          </form>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-[#DC2626]">
              {error}
            </p>
          ) : null}
          {message ? <p className="mt-4 text-sm text-[#16A34A]">{message}</p> : null}
          {devEnabled ? (
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-4">
              <p className="text-xs font-medium text-[#94A3B8]">개발용 빠른 로그인</p>
              <button
                type="button"
                disabled={loading || email.trim() === ""}
                onClick={submitDevLogin}
                className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-white text-base font-medium text-[#434654] transition-all active:scale-[0.98] disabled:opacity-50"
              >
                이 이메일로 바로 로그인
              </button>
            </div>
          ) : null}
          <p className="mt-6 text-center text-sm text-[#64748B]">
            계정이 없으면 매직링크 인증 뒤 계정 생성을 안내합니다.
          </p>
        </div>
        <div className="flex flex-col items-center gap-1.5 opacity-70">
          <span className="material-symbols-outlined text-[24px] text-[#94A3B8]">
            verified_user
          </span>
          <p className="text-center text-xs leading-relaxed text-[#64748B]">
            보이나는 사장님의 매장 정보와 개인정보를 안전하게 보호합니다.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
