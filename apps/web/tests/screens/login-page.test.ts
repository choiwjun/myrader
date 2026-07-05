// @TASK login-screen - 로그인 화면 계약 테스트 (누락 화면 복구)
// @SPEC apps/web/app/login/page.tsx
// @SPEC docs/planning/05-design-system.md §2 (전문용어 0 / 응원 톤) §5 (정직: 가짜 링크 0)
//
// 인증 백엔드(/api/auth/login)는 완성됐으나 /login 화면이 누락되어 보호 라우트
// 접근 시 404 가 발생했다. 이 테스트는 복구된 화면의 핵심 계약을 고정한다.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = resolve(__dirname, "../..");
const LOGIN_TSX = resolve(WEB_ROOT, "app/(app)/login/page.tsx");
const source = readFileSync(LOGIN_TSX, "utf-8");

describe("로그인 화면 — 존재 및 기본 계약", () => {
  it("default export 컴포넌트가 있다", () => {
    expect(source).toMatch(/export\s+default\s+function\s+\w+/);
  });

  it("이메일/비밀번호 입력을 제공한다", () => {
    expect(source).toMatch(/type="email"/);
    expect(source).toMatch(/type="password"/);
  });

  it("POST /api/auth/login 으로 자격증명 로그인한다", () => {
    expect(source).toMatch(/\/api\/auth\/login/);
    expect(source).toMatch(/"credentials"|'credentials'/);
    expect(source).toMatch(/method:\s*"POST"/);
  });
});

describe("로그인 화면 — 복귀 경로 안전 처리", () => {
  it("next 와 returnTo 파라미터를 모두 읽는다", () => {
    expect(source).toMatch(/["']next["']/);
    expect(source).toMatch(/["']returnTo["']/);
  });

  it("safeRedirectPath 로 오픈 리다이렉트를 방지한다", () => {
    expect(source).toMatch(/safeRedirectPath/);
  });

  it("useSearchParams 를 Suspense 로 감싼다(빌드 deopt 방지)", () => {
    expect(source).toMatch(/Suspense/);
    expect(source).toMatch(/useSearchParams/);
  });
});

describe("로그인 화면 — dev 로그인 조건부 노출", () => {
  it("devLoginEnabled 일 때만 dev 모드 버튼을 노출한다", () => {
    expect(source).toMatch(/devLoginEnabled/);
    expect(source).toMatch(/"dev"|'dev'/);
  });
});

describe("로그인 화면 — 디자인 시스템·정직성", () => {
  it("전문용어(SEO/AEO/GEO/SERP)가 없다", () => {
    expect(source).not.toMatch(/SEO|AEO|GEO|SERP/);
  });

  it("진단은 로그인 불필요라는 정직한 안내가 있다", () => {
    expect(source).toMatch(/로그인 없이도/);
  });

  it("존재하지 않는 회원가입 경로(/signup, /register)로 가는 가짜 링크가 없다", () => {
    expect(source).not.toMatch(/\/signup|\/register/);
  });
});
