// @TASK login-screen - 로그인 화면 (보호 라우트 진입점) — Stitch 반응형 디자인 통합
// @SPEC .claude/constitutions/nextjs/auth.md (단일 인증 / POST /api/auth/login)
// @SPEC design/mockups/login.html (중앙 카드 + 아이콘 인풋 + 신뢰 푸터)
// @SPEC docs/planning/05-design-system.md §2 (큰 버튼·응원 톤·전문용어 0)
// @TEST apps/web/tests/screens/login-page.test.ts
//
"use client";

import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function LoginForm() {
  const params = useSearchParams();
  const dest = safeRedirectPath(params.get("next") ?? params.get("returnTo"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devEnabled, setDevEnabled] = useState(false);

  // 개발용 빠른 로그인 노출 여부 — 프로덕션에서는 서버가 false 를 반환.
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/login")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.data?.devLoginEnabled === true) setDevEnabled(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function submit(body: Record<string, string>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // 세션 쿠키가 막 설정됨 — 하드 내비게이션으로 서버가 인증 상태로 재렌더.
        window.location.assign(dest);
        return;
      }
      setError(
        res.status === 400
          ? "이메일 형식을 확인해 주세요."
          : "이메일 또는 비밀번호를 확인해 주세요.",
      );
    } catch {
      setError("연결이 잠깐 끊겼어요. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-[460px] space-y-8">
        {/* 제목 + 안내(정직: 진단은 로그인 불필요) */}
        <div className="space-y-2 text-center md:text-left">
          <h1
            className="text-[28px] font-bold tracking-tight text-[#0F172A]"
            style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
          >
            보이나에 로그인
          </h1>
          <p className="text-[16px] leading-relaxed text-[#64748B]">
            내 정보 관리에 필요해요. 가게 살펴보기는 로그인 없이도 할 수 있어요.
          </p>
        </div>

        {/* 자격증명 로그인 카드 */}
        <div
          className="rounded-2xl border border-[#E2E8F0] bg-white p-6 md:p-8"
          style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.03)" }}
        >
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!loading) submit({ mode: "credentials", email, password });
            }}
          >
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-sm font-medium text-[#434654]">
                이메일
              </label>
              <div className="group relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[#94A3B8] transition-colors group-focus-within:text-[#4F46E5]">
                  mail
                </span>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-[56px] w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-12 pr-4 text-base transition-all focus:border-[#4F46E5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="login-password" className="text-sm font-medium text-[#434654]">
                비밀번호
              </label>
              <div className="group relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[#94A3B8] transition-colors group-focus-within:text-[#4F46E5]">
                  lock
                </span>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-[56px] w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] pl-12 pr-4 text-base transition-all focus:border-[#4F46E5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20"
                  placeholder="비밀번호"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-[#DC2626]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-[56px] w-full rounded-xl bg-[#4F46E5] text-lg font-bold text-white transition-all hover:bg-[#4338CA] active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "잠시만요…" : "로그인"}
            </button>
          </form>

          {/* 개발용 빠른 로그인 (프로덕션 비노출) */}
          {devEnabled && (
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-4">
              <p className="text-xs font-medium text-[#94A3B8]">개발용 빠른 로그인</p>
              <button
                type="button"
                disabled={loading || email.trim() === ""}
                onClick={() => submit({ mode: "dev", email })}
                className="min-h-[48px] w-full rounded-xl border border-[#CBD5E1] bg-white text-base font-medium text-[#434654] transition-all active:scale-[0.98] disabled:opacity-50"
              >
                이 이메일로 바로 로그인
              </button>
            </div>
          )}

          {/* 계정 안내(정직: 가입 플로우 미정 — 가짜 링크 없음) */}
          <p className="mt-6 text-center text-sm text-[#64748B]">
            아직 계정이 없으시면 <span className="font-semibold text-[#4F46E5]">정식 오픈 때</span>{" "}
            가입을 안내해 드릴게요.
          </p>
        </div>

        {/* 신뢰 푸터 */}
        <div className="flex flex-col items-center gap-1.5 opacity-70">
          <span className="material-symbols-outlined text-[24px] text-[#94A3B8]">
            verified_user
          </span>
          <p className="text-center text-xs leading-relaxed text-[#64748B]">
            보이나는 사장님의 소중한 개인정보를 안전하게 보호합니다.
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
