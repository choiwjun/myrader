# 관리자 대시보드 (Admin Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영자가 `/admin` 한 화면에서 가입·진단·전환·잡상태를 보는 읽기 전용 관리자 대시보드를, 환경변수 비밀번호 게이트 뒤에 추가한다.

**Architecture:** Next.js 15 App Router. 신규 라우트그룹 `(admin)`. 접근은 `ADMIN_PASSWORD` 비교 후 기존 `SESSION_SECRET` HMAC 인프라를 재사용한 별도 서명 쿠키(`boina_admin`)로 게이팅(미들웨어 1차 + 서버 컴포넌트 2차, 기존 defense-in-depth 패턴 동형). 데이터는 기존 `accounts/businesses/diagnoses` 테이블을 서버에서 직접 집계 — 신규 마이그레이션 0.

**Tech Stack:** TypeScript, Next.js 15, Drizzle ORM(Postgres), node:crypto, Vitest, biome. 패키지매니저 bun.

**Spec:** `docs/superpowers/specs/2026-06-17-admin-dashboard-design.md`

**Conventions (기존 코드 준수):**
- 테이블 import: `import { accounts, businesses, diagnoses } from "@boina/db/schema";`
- DB 클라이언트: `import { type DbClient, createDb } from "@boina/db/client";`
- drizzle 헬퍼: `import { and, count, desc, eq, gte, ne, sql } from "drizzle-orm";`
- 쿠키 발급 route 는 `export const dynamic = "force-dynamic";` (env 없는 build 통과).
- 응답 형식: `{ data?, error?, code?, success }`.
- 테스트는 `apps/web/tests/...` 에 vitest. DB 통합 테스트는 `const describeDb = process.env.DATABASE_URL ? describe : describe.skip;` 패턴.
- 테스트 실행: `cd "apps/web" && bun run test -- <경로>` 또는 루트에서 `bun run test`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `apps/web/lib/auth/cookie-constants.ts` (수정) | `ADMIN_COOKIE`, `ADMIN_MAX_AGE_SEC` 추가 (Edge-safe) |
| `apps/web/lib/admin/auth.ts` (생성) | admin 토큰 서명/검증, 비번 timing-safe 비교, 설정 여부 판정 |
| `apps/web/lib/admin/require-admin.ts` (생성) | 서버 컴포넌트용 권위 검증 가드(next/headers cookies) |
| `apps/web/lib/admin/metrics.ts` (생성) | 순수 집계 쿼리 함수 (DbClient 주입) |
| `apps/web/lib/auth/config.ts` (수정) | `/admin` 보호 정책 + 리다이렉트 대상 분기 |
| `apps/web/middleware.ts` (수정) | `/admin/*` 게이팅 + matcher 추가 |
| `apps/web/app/api/admin/login/route.ts` (생성) | 비번 검증 → 쿠키 발급 |
| `apps/web/app/api/admin/logout/route.ts` (생성) | 쿠키 만료 |
| `apps/web/app/(admin)/layout.tsx` (생성) | admin 셸 |
| `apps/web/app/(admin)/admin/login/page.tsx` (생성) | 로그인 폼 |
| `apps/web/app/(admin)/admin/page.tsx` (생성) | 대시보드 조립(서버 컴포넌트) |
| `apps/web/app/components/admin/*.tsx` (생성) | KPI 카드 / 추이 / 퍼널 / 테이블 표시 |
| `.env.example` (수정) | `ADMIN_PASSWORD` 문서화 |

**보안 규칙 확정(설계 §4.2 구체화):** `ADMIN_PASSWORD` 미설정(trim 후 빈 값)이면 **환경 무관 항상 admin 차단(403)** — 비교할 비번이 없으므로 dev/test 도 동일. test 는 `process.env.ADMIN_PASSWORD` 를 명시 주입해 골격 검증.

---

## Task 1: Admin 인증 라이브러리 (쿠키 상수 + auth.ts)

**Files:**
- Modify: `apps/web/lib/auth/cookie-constants.ts`
- Create: `apps/web/lib/admin/auth.ts`
- Test: `apps/web/tests/admin/auth.test.ts`

- [ ] **Step 1: 쿠키 상수 추가**

`apps/web/lib/auth/cookie-constants.ts` 끝에 추가:

```ts
/** 관리자 세션 쿠키 이름 (고객 세션과 격리). */
export const ADMIN_COOKIE = "boina_admin";

/** 관리자 세션 유효기간(초). 기본 12시간(운영 도구, 짧게). */
export const ADMIN_MAX_AGE_SEC = 60 * 60 * 12;
```

- [ ] **Step 2: 실패 테스트 작성**

Create `apps/web/tests/admin/auth.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  adminCookieOptions,
  isAdminConfigured,
  signAdminToken,
  verifyAdminPassword,
  verifyAdminToken,
} from "../../lib/admin/auth";

const SECRET = "test-session-secret-32bytes-minimum-len";

describe("admin 인증 (auth.ts)", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
    process.env.ADMIN_PASSWORD = "s3cret-admin-pw";
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("올바른 비밀번호는 통과한다", () => {
    expect(verifyAdminPassword("s3cret-admin-pw")).toBe(true);
  });

  it("틀린 비밀번호는 거부된다", () => {
    expect(verifyAdminPassword("wrong")).toBe(false);
  });

  it("ADMIN_PASSWORD 미설정이면 어떤 입력도 거부(설정 안됨)", () => {
    process.env.ADMIN_PASSWORD = "   ";
    expect(isAdminConfigured()).toBe(false);
    expect(verifyAdminPassword("anything")).toBe(false);
  });

  it("발급한 토큰은 검증을 통과한다", () => {
    expect(verifyAdminToken(signAdminToken())).toBe(true);
  });

  it("변조된 토큰은 거부된다", () => {
    expect(verifyAdminToken(`${signAdminToken()}x`)).toBe(false);
    expect(verifyAdminToken(undefined)).toBe(false);
    expect(verifyAdminToken("garbage")).toBe(false);
  });

  it("쿠키 옵션은 httpOnly + lax", () => {
    const opt = adminCookieOptions();
    expect(opt.httpOnly).toBe(true);
    expect(opt.sameSite).toBe("lax");
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd "apps/web" && bun run test -- tests/admin/auth.test.ts`
Expected: FAIL — `Cannot find module '../../lib/admin/auth'`

- [ ] **Step 4: 구현 작성**

Create `apps/web/lib/admin/auth.ts`:

```ts
// @SPEC docs/superpowers/specs/2026-06-17-admin-dashboard-design.md §4.2
// 관리자 인증: ADMIN_PASSWORD 비교 + SESSION_SECRET HMAC 서명 쿠키(boina_admin).
// 고객 세션(session.ts)과 동형이나 payload 가 {admin:true} 로 격리된다.

import { createHmac, timingSafeEqual } from "node:crypto";
import { ADMIN_MAX_AGE_SEC } from "@/lib/auth/cookie-constants";

interface AdminPayload {
  admin: true;
  iat: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is not set (or too short). Define a strong secret in .env (>=16 chars).");
  }
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** 설정된 관리자 비밀번호(trim). 미설정/빈 값이면 null. */
function getAdminPassword(): string | null {
  const pw = process.env.ADMIN_PASSWORD?.trim();
  return pw && pw.length > 0 ? pw : null;
}

/** ADMIN_PASSWORD 가 설정되어 admin 기능이 가용한가. */
export function isAdminConfigured(): boolean {
  return getAdminPassword() !== null;
}

/** 입력 비밀번호를 상수시간 비교한다. 미설정이면 항상 false(차단). */
export function verifyAdminPassword(input: string): boolean {
  const expected = getAdminPassword();
  if (expected === null) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** HMAC 서명된 관리자 토큰 발급. */
export function signAdminToken(): string {
  const payload: AdminPayload = { admin: true, iat: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** 관리자 토큰 검증. 형식 오류·서명 불일치·만료 시 false. */
export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return false;
  if (!safeEqualHex(sig, sign(encoded))) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AdminPayload;
    if (payload.admin !== true || typeof payload.iat !== "number") return false;
    if (Date.now() - payload.iat > ADMIN_MAX_AGE_SEC * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

/** httpOnly 관리자 쿠키 옵션(프로덕션 secure). */
export function adminCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MAX_AGE_SEC,
  };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd "apps/web" && bun run test -- tests/admin/auth.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: 커밋**

```bash
git add apps/web/lib/auth/cookie-constants.ts apps/web/lib/admin/auth.ts apps/web/tests/admin/auth.test.ts
git commit -m "feat(admin): 관리자 인증 라이브러리(비번 비교 + HMAC 쿠키)"
```

---

## Task 2: 라우트 보호 정책 + 미들웨어 게이팅

**Files:**
- Modify: `apps/web/lib/auth/config.ts`
- Modify: `apps/web/middleware.ts`
- Test: `apps/web/tests/admin/route-guard.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `apps/web/tests/admin/route-guard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideRouteAccess } from "../../lib/auth/config";

describe("admin 라우트 가드 (config.ts)", () => {
  it("미인증 admin 라우트는 /admin/login 으로 차단", () => {
    const d = decideRouteAccess({ pathname: "/admin", authenticated: false, adminAuthenticated: false });
    expect(d.allowed).toBe(false);
    expect(d.redirectTo).toBe("/admin/login");
  });

  it("admin 인증되면 admin 라우트 허용", () => {
    const d = decideRouteAccess({ pathname: "/admin", authenticated: false, adminAuthenticated: true });
    expect(d.allowed).toBe(true);
  });

  it("/admin/login 은 공개(미인증도 허용)", () => {
    const d = decideRouteAccess({ pathname: "/admin/login", authenticated: false, adminAuthenticated: false });
    expect(d.allowed).toBe(true);
  });

  it("고객 보호 라우트(/settings)는 기존대로 /login 으로 차단", () => {
    const d = decideRouteAccess({ pathname: "/settings", authenticated: false, adminAuthenticated: false });
    expect(d.allowed).toBe(false);
    expect(d.redirectTo).toBe("/login");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd "apps/web" && bun run test -- tests/admin/route-guard.test.ts`
Expected: FAIL — `adminAuthenticated` 미지원 / `/admin` 차단 안 됨

- [ ] **Step 3: config.ts 수정**

`apps/web/lib/auth/config.ts` 를 아래로 갱신(기존 export 유지 + admin 추가):

```ts
/** 로그인이 필요한 보호 라우트 prefix (S7 설정 등). */
export const PROTECTED_PREFIXES = ["/settings"] as const;

/** 인증 진입점·공개 자원 — 보호 대상에서 명시적으로 제외한다. */
export const PUBLIC_PREFIXES = ["/login", "/api/auth"] as const;

/** 관리자 보호 prefix. */
export const ADMIN_PREFIX = "/admin";

/** 관리자 공개 진입점(로그인 페이지/로그인 API). */
export const ADMIN_PUBLIC_PREFIXES = ["/admin/login", "/api/admin/login"] as const;

/** 미인증 사용자를 보낼 로그인 경로. */
export const LOGIN_PATH = "/login";

/** 미인증 관리자를 보낼 경로. */
export const ADMIN_LOGIN_PATH = "/admin/login";

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** 주어진 경로가 로그인 필요한 (고객) 보호 라우트인지 판정한다. */
export function isProtectedRoute(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => matchesPrefix(pathname, p))) return false;
  return PROTECTED_PREFIXES.some((p) => matchesPrefix(pathname, p));
}

/** 주어진 경로가 관리자 보호 라우트인지(공개 진입점 제외). */
export function isAdminProtectedRoute(pathname: string): boolean {
  if (ADMIN_PUBLIC_PREFIXES.some((p) => matchesPrefix(pathname, p))) return false;
  return matchesPrefix(pathname, ADMIN_PREFIX);
}

export interface RouteAccessInput {
  pathname: string;
  authenticated: boolean;
  adminAuthenticated?: boolean;
}

export interface RouteAccessDecision {
  allowed: boolean;
  redirectTo?: string;
}

/**
 * 인증 상태 × 라우트 → 접근 허용/차단 결정.
 * - 미인증 + 관리자 보호 라우트 → 차단(redirect ADMIN_LOGIN_PATH)
 * - 미인증 + (고객) 보호 라우트 → 차단(redirect LOGIN_PATH)
 * - 그 외 → 허용
 */
export function decideRouteAccess(input: RouteAccessInput): RouteAccessDecision {
  if (isAdminProtectedRoute(input.pathname) && !input.adminAuthenticated) {
    return { allowed: false, redirectTo: ADMIN_LOGIN_PATH };
  }
  if (isProtectedRoute(input.pathname) && !input.authenticated) {
    return { allowed: false, redirectTo: LOGIN_PATH };
  }
  return { allowed: true };
}
```

- [ ] **Step 4: middleware.ts 수정**

`apps/web/middleware.ts` 를 아래로 갱신:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decideRouteAccess } from "./lib/auth/config";
import { ADMIN_COOKIE, SESSION_COOKIE } from "./lib/auth/cookie-constants";

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const hasAdmin = Boolean(request.cookies.get(ADMIN_COOKIE)?.value);

  const decision = decideRouteAccess({
    pathname,
    authenticated: hasSession,
    adminAuthenticated: hasAdmin,
  });
  if (!decision.allowed && decision.redirectTo) {
    const url = request.nextUrl.clone();
    url.pathname = decision.redirectTo;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// 보호 prefix(S7 + admin)만 미들웨어를 태운다.
export const config = {
  matcher: ["/settings/:path*", "/admin/:path*"],
};
```

> 참고: 미들웨어는 쿠키 *존재*만 검사(Edge 런타임 node:crypto 불가). 서명·만료의 권위 검증은 Task 5 의 `requireAdmin()`(서버 컴포넌트)이 수행 — 기존 defense-in-depth 패턴 동형.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd "apps/web" && bun run test -- tests/admin/route-guard.test.ts`
Expected: PASS (4 tests). 기존 `tests/auth/route-guard.test.ts` 도 회귀 0:
Run: `cd "apps/web" && bun run test -- tests/auth/route-guard.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add apps/web/lib/auth/config.ts apps/web/middleware.ts apps/web/tests/admin/route-guard.test.ts
git commit -m "feat(admin): /admin 라우트 보호 정책 + 미들웨어 게이팅"
```

---

## Task 3: Admin 로그인/로그아웃 API

**Files:**
- Create: `apps/web/app/api/admin/login/route.ts`
- Create: `apps/web/app/api/admin/logout/route.ts`
- Test: `apps/web/tests/admin/login-route.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `apps/web/tests/admin/login-route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next/headers cookies() 모킹 — set 호출만 검증.
const setSpy = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: setSpy }),
}));

import { POST } from "../../app/api/admin/login/route";

const SECRET = "test-session-secret-32bytes-minimum-len";

function req(body: unknown): Request {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/admin/login", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    setSpy.mockReset();
    process.env.SESSION_SECRET = SECRET;
    process.env.ADMIN_PASSWORD = "s3cret-admin-pw";
    process.env.NODE_ENV = "test";
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("올바른 비번이면 200 + 쿠키 발급", async () => {
    const res = await POST(req({ password: "s3cret-admin-pw" }));
    expect(res.status).toBe(200);
    expect(setSpy).toHaveBeenCalledWith("boina_admin", expect.any(String), expect.any(Object));
  });

  it("틀린 비번이면 401, 쿠키 없음", async () => {
    const res = await POST(req({ password: "nope" }));
    expect(res.status).toBe(401);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("ADMIN_PASSWORD 미설정이면 403(ADMIN_DISABLED)", async () => {
    process.env.ADMIN_PASSWORD = "";
    const res = await POST(req({ password: "anything" }));
    expect(res.status).toBe(403);
  });

  it("body 형식 오류면 400", async () => {
    const res = await POST(req({ nope: 1 }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd "apps/web" && bun run test -- tests/admin/login-route.test.ts`
Expected: FAIL — route 모듈 없음

- [ ] **Step 3: login route 구현**

Create `apps/web/app/api/admin/login/route.ts`:

```ts
// @SPEC docs/superpowers/specs/2026-06-17-admin-dashboard-design.md §4.2
// POST /api/admin/login — ADMIN_PASSWORD 검증 후 서명 쿠키 발급.
// 미설정 시 403(ADMIN_DISABLED), 틀린 비번 401, 검증 통과 200.

import { ADMIN_COOKIE } from "@/lib/auth/cookie-constants";
import { adminCookieOptions, isAdminConfigured, signAdminToken, verifyAdminPassword } from "@/lib/admin/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const LoginSchema = z.object({ password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  try {
    if (!isAdminConfigured()) {
      return NextResponse.json(
        { error: "Admin is not configured", code: "ADMIN_DISABLED", success: false },
        { status: 403 },
      );
    }
    const body = await request.json();
    const { password } = LoginSchema.parse(body);

    if (!verifyAdminPassword(password)) {
      return NextResponse.json(
        { error: "Invalid credentials", code: "UNAUTHORIZED", success: false },
        { status: 401 },
      );
    }

    const store = await cookies();
    store.set(ADMIN_COOKIE, signAdminToken(), adminCookieOptions());
    return NextResponse.json({ data: { ok: true }, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/login error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
```

- [ ] **Step 4: logout route 구현**

Create `apps/web/app/api/admin/logout/route.ts`:

```ts
// POST /api/admin/logout — 관리자 쿠키 만료.
import { ADMIN_COOKIE } from "@/lib/auth/cookie-constants";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  store.set(ADMIN_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return NextResponse.json({ data: { ok: true }, success: true });
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd "apps/web" && bun run test -- tests/admin/login-route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: 커밋**

```bash
git add apps/web/app/api/admin/login/route.ts apps/web/app/api/admin/logout/route.ts apps/web/tests/admin/login-route.test.ts
git commit -m "feat(admin): 로그인/로그아웃 API"
```

---

## Task 4: 집계 쿼리 라이브러리 (metrics.ts)

**Files:**
- Create: `apps/web/lib/admin/metrics.ts`
- Test: `apps/web/tests/admin/metrics-db-integration.test.ts`

> 집계는 실 Postgres 가 필요하므로 DB 통합 테스트로 검증한다(기존 `describeDb` 패턴). `DATABASE_URL` 없으면 스킵.

- [ ] **Step 1: 실패 테스트 작성**

Create `apps/web/tests/admin/metrics-db-integration.test.ts`:

```ts
import { createDb } from "@boina/db/client";
import { accounts, businesses, diagnoses } from "@boina/db/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFunnel, getKpiSummary, getRecentDiagnoses } from "../../lib/admin/metrics";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb("admin metrics ↔ DB 통합", () => {
  let db: ReturnType<typeof createDb>;
  const ids: { accounts: string[]; businesses: string[] } = { accounts: [], businesses: [] };

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    // 무료 1 + 유료 1 계정
    const accRows = await db
      .insert(accounts)
      .values([
        { email: `adm-free-${suffix}@example.com`, passwordHash: "x", plan: "free" },
        { email: `adm-paid-${suffix}@example.com`, passwordHash: "x", plan: "pro" },
      ])
      .returning({ id: accounts.id });
    ids.accounts = accRows.map((r) => r.id);
    const bizRows = await db
      .insert(businesses)
      .values([{ name: `adm-biz-${suffix}` }])
      .returning({ id: businesses.id });
    ids.businesses = bizRows.map((r) => r.id);
    // 진단: completed 1 + failed 1
    await db.insert(diagnoses).values([
      { businessId: ids.businesses[0], status: "completed" },
      { businessId: ids.businesses[0], status: "failed", crawlFailureReason: "TIMEOUT" },
    ]);
  });

  afterAll(async () => {
    // 정리: 본 테스트가 만든 행만 제거(다른 데이터 보존).
    const { inArray } = await import("drizzle-orm");
    if (ids.businesses.length) await db.delete(diagnoses).where(inArray(diagnoses.businessId, ids.businesses));
    if (ids.businesses.length) await db.delete(businesses).where(inArray(businesses.id, ids.businesses));
    if (ids.accounts.length) await db.delete(accounts).where(inArray(accounts.id, ids.accounts));
  });

  it("KPI: 총계·유료·진단 수가 양수이고 유료>=1", async () => {
    const kpi = await getKpiSummary(db);
    expect(kpi.totalAccounts).toBeGreaterThanOrEqual(2);
    expect(kpi.paidAccounts).toBeGreaterThanOrEqual(1);
    expect(kpi.totalDiagnoses).toBeGreaterThanOrEqual(2);
    expect(kpi.failedCount).toBeGreaterThanOrEqual(1);
    expect(kpi.conversionRate).toBeGreaterThan(0);
  });

  it("퍼널: 단계별 수가 단조 비증가 관계의 입력을 반환", async () => {
    const f = await getFunnel(db);
    expect(f.signups).toBeGreaterThanOrEqual(2);
    expect(f.completed).toBeGreaterThanOrEqual(1);
    expect(f.paid).toBeGreaterThanOrEqual(1);
  });

  it("최근 진단: failed 행에 실패 사유가 실린다", async () => {
    const recent = await getRecentDiagnoses(db, 50);
    const failed = recent.find((r) => r.status === "failed" && r.crawlFailureReason === "TIMEOUT");
    expect(failed).toBeTruthy();
    expect(typeof failed?.businessName).toBe("string");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd "apps/web" && bun run test -- tests/admin/metrics-db-integration.test.ts`
Expected: FAIL — `lib/admin/metrics` 없음 (또는 DATABASE_URL 없으면 SKIP — 그 경우 Step 4 후 docker PG 띄워 재확인)

- [ ] **Step 3: metrics.ts 구현**

Create `apps/web/lib/admin/metrics.ts`:

```ts
// @SPEC docs/superpowers/specs/2026-06-17-admin-dashboard-design.md §5
// 관리자 대시보드용 순수 집계 함수. DbClient 주입(테스트 가능). 읽기 전용.

import type { DbClient } from "@boina/db/client";
import { accounts, businesses, diagnoses } from "@boina/db/schema";
import { and, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 막힌 잡 기준: queued/running 상태로 이 시간 이상 경과. */
const STUCK_AFTER_MS = 10 * 60 * 1000;

function startOfTodayUtc(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface KpiSummary {
  totalAccounts: number;
  accountsToday: number;
  accounts7d: number;
  paidAccounts: number;
  conversionRate: number; // 0~1
  totalDiagnoses: number;
  diagnosesToday: number;
  completedCount: number;
  failedCount: number;
  stuckJobs: number;
}

async function countRows(db: DbClient, table: typeof accounts | typeof diagnoses, where?: ReturnType<typeof and>): Promise<number> {
  const q = db.select({ c: count() }).from(table);
  const rows = where ? await q.where(where) : await q;
  return Number(rows[0]?.c ?? 0);
}

export async function getKpiSummary(db: DbClient, now = new Date()): Promise<KpiSummary> {
  const today = startOfTodayUtc(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS);

  const totalAccounts = await countRows(db, accounts);
  const accountsToday = await countRows(db, accounts, and(gte(accounts.createdAt, today)));
  const accounts7d = await countRows(db, accounts, and(gte(accounts.createdAt, sevenDaysAgo)));
  const paidAccounts = await countRows(db, accounts, and(ne(accounts.plan, "free")));

  const totalDiagnoses = await countRows(db, diagnoses);
  const diagnosesToday = await countRows(db, diagnoses, and(gte(diagnoses.createdAt, today)));
  const completedCount = await countRows(db, diagnoses, and(eq(diagnoses.status, "completed")));
  const failedCount = await countRows(db, diagnoses, and(eq(diagnoses.status, "failed")));
  const stuckJobs = await countRows(
    db,
    diagnoses,
    and(inArray(diagnoses.status, ["queued", "running"]), sql`${diagnoses.createdAt} < ${stuckBefore}`),
  );

  return {
    totalAccounts,
    accountsToday,
    accounts7d,
    paidAccounts,
    conversionRate: totalAccounts > 0 ? paidAccounts / totalAccounts : 0,
    totalDiagnoses,
    diagnosesToday,
    completedCount,
    failedCount,
    stuckJobs,
  };
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD (UTC)
  signups: number;
  diagnoses: number;
}

export async function getDailyTrend(db: DbClient, days = 14, now = new Date()): Promise<TrendPoint[]> {
  const since = startOfTodayUtc(new Date(now.getTime() - (days - 1) * DAY_MS));
  const day = sql<string>`to_char(date_trunc('day', ${accounts.createdAt}), 'YYYY-MM-DD')`;
  const signupRows = await db
    .select({ d: day, c: count() })
    .from(accounts)
    .where(gte(accounts.createdAt, since))
    .groupBy(day);
  const diagDay = sql<string>`to_char(date_trunc('day', ${diagnoses.createdAt}), 'YYYY-MM-DD')`;
  const diagRows = await db
    .select({ d: diagDay, c: count() })
    .from(diagnoses)
    .where(gte(diagnoses.createdAt, since))
    .groupBy(diagDay);

  const signupMap = new Map(signupRows.map((r) => [r.d, Number(r.c)]));
  const diagMap = new Map(diagRows.map((r) => [r.d, Number(r.c)]));
  const out: TrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, signups: signupMap.get(key) ?? 0, diagnoses: diagMap.get(key) ?? 0 });
  }
  return out;
}

export interface Funnel {
  signups: number;
  diagnosed: number; // 진단 1건 이상 발생한 가게 수(=진단 시작)
  completed: number;
  paid: number;
}

export async function getFunnel(db: DbClient): Promise<Funnel> {
  const signups = await countRows(db, accounts);
  const paid = await countRows(db, accounts, and(ne(accounts.plan, "free")));
  const diagnosed = await countRows(db, diagnoses);
  const completed = await countRows(db, diagnoses, and(eq(diagnoses.status, "completed")));
  return { signups, diagnosed, completed, paid };
}

export interface RecentAccount {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  createdAt: Date;
}

export async function getRecentAccounts(db: DbClient, limit = 20): Promise<RecentAccount[]> {
  return db
    .select({
      id: accounts.id,
      email: accounts.email,
      name: accounts.name,
      plan: accounts.plan,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .orderBy(desc(accounts.createdAt))
    .limit(limit);
}

export interface RecentDiagnosis {
  id: string;
  businessName: string | null;
  status: string;
  crawlFailureReason: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export async function getRecentDiagnoses(db: DbClient, limit = 20): Promise<RecentDiagnosis[]> {
  return db
    .select({
      id: diagnoses.id,
      businessName: businesses.name,
      status: diagnoses.status,
      crawlFailureReason: diagnoses.crawlFailureReason,
      createdAt: diagnoses.createdAt,
      completedAt: diagnoses.completedAt,
    })
    .from(diagnoses)
    .leftJoin(businesses, eq(diagnoses.businessId, businesses.id))
    .orderBy(desc(diagnoses.createdAt))
    .limit(limit);
}

export async function getFailedJobs(db: DbClient, limit = 20): Promise<RecentDiagnosis[]> {
  return db
    .select({
      id: diagnoses.id,
      businessName: businesses.name,
      status: diagnoses.status,
      crawlFailureReason: diagnoses.crawlFailureReason,
      createdAt: diagnoses.createdAt,
      completedAt: diagnoses.completedAt,
    })
    .from(diagnoses)
    .leftJoin(businesses, eq(diagnoses.businessId, businesses.id))
    .where(inArray(diagnoses.status, ["failed", "timeout", "partial"]))
    .orderBy(desc(diagnoses.createdAt))
    .limit(limit);
}
```

> 구현 주의: `countRows` 의 `where` 가 `undefined` 일 때 분기 처리됨. `and(x)` 단일 인자 사용은 drizzle 에서 정상(불필요한 래핑이지만 타입 안정). 만약 `count(table, where)` 타입 충돌 시 `db.select({c: count()}).from(table).where(where)` 직접 인라인으로 대체.

- [ ] **Step 4: docker PG 띄우고 통합 테스트 통과 확인**

Run:
```bash
docker compose -f docker-compose.dev.yml up -d
cd "apps/web" && bun run test -- tests/admin/metrics-db-integration.test.ts
```
Expected: PASS (3 tests). (DATABASE_URL 은 `.env` 의 dev URL 사용 — `bun run test` 가 dotenv 로드하는지 vitest.config 확인; 미로드 시 `DATABASE_URL=postgresql://boina:boina-dev-password@localhost:5432/boina_db bun run test -- ...`)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/lib/admin/metrics.ts apps/web/tests/admin/metrics-db-integration.test.ts
git commit -m "feat(admin): 집계 쿼리 라이브러리(KPI/추이/퍼널/최근)"
```

---

## Task 5: requireAdmin 가드 + admin 셸 + 로그인 페이지

**Files:**
- Create: `apps/web/lib/admin/require-admin.ts`
- Create: `apps/web/app/(admin)/layout.tsx`
- Create: `apps/web/app/(admin)/admin/login/page.tsx`
- Test: `apps/web/tests/admin/require-admin.test.ts`

- [ ] **Step 1: 실패 테스트 작성 (requireAdmin 로직)**

Create `apps/web/tests/admin/require-admin.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (_n: string) => (cookieValue ? { value: cookieValue } : undefined) }),
}));

import { signAdminToken } from "../../lib/admin/auth";
import { isAdminAuthenticated } from "../../lib/admin/require-admin";

const SECRET = "test-session-secret-32bytes-minimum-len";

describe("isAdminAuthenticated (서버 가드)", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
    process.env.ADMIN_PASSWORD = "pw-123456";
    cookieValue = undefined;
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("유효한 admin 쿠키면 true", async () => {
    cookieValue = signAdminToken();
    expect(await isAdminAuthenticated()).toBe(true);
  });

  it("쿠키 없으면 false", async () => {
    cookieValue = undefined;
    expect(await isAdminAuthenticated()).toBe(false);
  });

  it("ADMIN_PASSWORD 미설정이면 유효 쿠키여도 false(prod fail-fast 동형)", async () => {
    cookieValue = signAdminToken();
    process.env.ADMIN_PASSWORD = "";
    expect(await isAdminAuthenticated()).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd "apps/web" && bun run test -- tests/admin/require-admin.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: require-admin.ts 구현**

Create `apps/web/lib/admin/require-admin.ts`:

```ts
// 서버 컴포넌트/route 용 권위 검증 가드(2차 레이어). 쿠키 서명 + 설정 여부를 검증.
import { ADMIN_COOKIE } from "@/lib/auth/cookie-constants";
import { isAdminConfigured, verifyAdminToken } from "@/lib/admin/auth";
import { cookies } from "next/headers";

/** 현재 요청이 인증된 관리자인가. ADMIN_PASSWORD 미설정이면 항상 false(차단). */
export async function isAdminAuthenticated(): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const store = await cookies();
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd "apps/web" && bun run test -- tests/admin/require-admin.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: admin 레이아웃 작성**

Create `apps/web/app/(admin)/layout.tsx`:

```tsx
// 관리자 전용 레이아웃 — 고객용 (app) 셸/브랜딩을 상속하지 않는다.
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#e2e8f0" }}>
      <header style={{ padding: "12px 20px", borderBottom: "1px solid #1e293b", fontWeight: 600 }}>
        보이나 운영 콘솔
      </header>
      <main style={{ padding: "20px", maxWidth: 1100, margin: "0 auto" }}>{children}</main>
    </div>
  );
}
```

> 참고: 기존 프로젝트는 Tailwind v4 를 쓴다. 인라인 style 대신 Tailwind 클래스 사용이 컨벤션에 더 맞으면(예: `className="min-h-screen bg-slate-900 text-slate-200"`) 그쪽으로 작성. 구현자는 `apps/web/app/(app)/layout.tsx` 의 스타일 방식을 먼저 확인해 일치시킬 것.

- [ ] **Step 6: 로그인 페이지 작성**

Create `apps/web/app/(admin)/admin/login/page.tsx`:

```tsx
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
      window.location.href = "/admin";
      return;
    }
    if (res.status === 403) setError("관리자 기능이 설정되지 않았습니다 (ADMIN_PASSWORD).");
    else setError("비밀번호가 올바르지 않습니다.");
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 320, margin: "80px auto", display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>운영 콘솔 로그인</h1>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="관리자 비밀번호"
        aria-label="관리자 비밀번호"
        style={{ padding: 10, borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0" }}
      />
      <button type="submit" disabled={loading || password.length === 0} style={{ padding: 10, borderRadius: 8, background: "#2563eb", color: "#fff", fontWeight: 600 }}>
        {loading ? "확인 중…" : "로그인"}
      </button>
      {error && <p role="alert" style={{ color: "#f87171" }}>{error}</p>}
    </form>
  );
}
```

- [ ] **Step 7: 커밋**

```bash
git add apps/web/lib/admin/require-admin.ts "apps/web/app/(admin)/layout.tsx" "apps/web/app/(admin)/admin/login/page.tsx" apps/web/tests/admin/require-admin.test.ts
git commit -m "feat(admin): requireAdmin 가드 + admin 셸 + 로그인 페이지"
```

---

## Task 6: 대시보드 페이지 + 표시 컴포넌트

**Files:**
- Create: `apps/web/app/components/admin/KpiCards.tsx`
- Create: `apps/web/app/components/admin/TrendTable.tsx`
- Create: `apps/web/app/components/admin/FunnelView.tsx`
- Create: `apps/web/app/components/admin/RecentTables.tsx`
- Create: `apps/web/app/(admin)/admin/page.tsx`

> 표시 컴포넌트는 props 로 데이터만 받는 순수 함수형(서버 컴포넌트). 별도 단위 테스트 없이 페이지 렌더 + Task 7 build 게이트로 검증(로직은 metrics.ts 에 있고 이미 테스트됨).

- [ ] **Step 1: KpiCards 컴포넌트**

Create `apps/web/app/components/admin/KpiCards.tsx`:

```tsx
import type { KpiSummary } from "@/lib/admin/metrics";

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 12, padding: 16, minWidth: 160 }}>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function KpiCards({ kpi }: { kpi: KpiSummary }) {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return (
    <section style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <Card label="총 가입" value={String(kpi.totalAccounts)} hint={`오늘 +${kpi.accountsToday} · 7일 +${kpi.accounts7d}`} />
      <Card label="유료 계정" value={String(kpi.paidAccounts)} hint={`전환율 ${pct(kpi.conversionRate)}`} />
      <Card label="총 진단" value={String(kpi.totalDiagnoses)} hint={`오늘 +${kpi.diagnosesToday}`} />
      <Card label="진단 완료" value={String(kpi.completedCount)} />
      <Card label="진단 실패" value={String(kpi.failedCount)} />
      <Card label="막힌 잡" value={String(kpi.stuckJobs)} hint="queued/running 10분+" />
    </section>
  );
}
```

- [ ] **Step 2: TrendTable 컴포넌트**

Create `apps/web/app/components/admin/TrendTable.tsx`:

```tsx
import type { TrendPoint } from "@/lib/admin/metrics";

export function TrendTable({ points }: { points: TrendPoint[] }) {
  const maxV = Math.max(1, ...points.map((p) => Math.max(p.signups, p.diagnoses)));
  return (
    <section>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "8px 0" }}>최근 {points.length}일 추이</h2>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "#94a3b8", textAlign: "left" }}>
            <th>날짜</th><th>가입</th><th>진단</th><th />
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date} style={{ borderTop: "1px solid #1e293b" }}>
              <td>{p.date}</td>
              <td>{p.signups}</td>
              <td>{p.diagnoses}</td>
              <td>
                <span style={{ display: "inline-block", height: 8, width: `${(p.signups / maxV) * 100}px`, background: "#3b82f6", borderRadius: 4 }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: FunnelView 컴포넌트**

Create `apps/web/app/components/admin/FunnelView.tsx`:

```tsx
import type { Funnel } from "@/lib/admin/metrics";

export function FunnelView({ funnel }: { funnel: Funnel }) {
  const rate = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
  const rows: { label: string; value: number; of: number }[] = [
    { label: "가입", value: funnel.signups, of: funnel.signups },
    { label: "진단 시작", value: funnel.diagnosed, of: funnel.signups },
    { label: "진단 완료", value: funnel.completed, of: funnel.diagnosed },
    { label: "유료 전환", value: funnel.paid, of: funnel.signups },
  ];
  return (
    <section>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "8px 0" }}>퍼널</h2>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
        {rows.map((r) => (
          <li key={r.label} style={{ display: "flex", justifyContent: "space-between", background: "#1e293b", padding: "8px 12px", borderRadius: 8 }}>
            <span>{r.label}</span>
            <span>{r.value} <span style={{ color: "#64748b" }}>({rate(r.value, r.of)})</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: RecentTables 컴포넌트**

Create `apps/web/app/components/admin/RecentTables.tsx`:

```tsx
import type { RecentAccount, RecentDiagnosis } from "@/lib/admin/metrics";

function fmt(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "—";
}

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
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>최근 가입</h2>
        {recentAccounts.length === 0 ? <Empty /> : (
          <table style={tableStyle}>
            <tbody>
              {recentAccounts.map((a) => (
                <tr key={a.id} style={rowStyle}>
                  <td>{a.email}</td><td>{a.name ?? "—"}</td><td>{a.plan}</td><td>{fmt(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>최근 진단</h2>
        {recentDiagnoses.length === 0 ? <Empty /> : (
          <table style={tableStyle}>
            <tbody>
              {recentDiagnoses.map((d) => (
                <tr key={d.id} style={rowStyle}>
                  <td>{d.businessName ?? "—"}</td><td>{d.status}</td><td>{d.crawlFailureReason ?? ""}</td><td>{fmt(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>실패·지연 잡 (사유 표시 — 재시도는 키 연동 단계)</h2>
        {failedJobs.length === 0 ? <Empty /> : (
          <table style={tableStyle}>
            <tbody>
              {failedJobs.map((d) => (
                <tr key={d.id} style={rowStyle}>
                  <td>{d.businessName ?? "—"}</td><td>{d.status}</td><td style={{ color: "#f87171" }}>{d.crawlFailureReason ?? "(사유 미기록)"}</td><td>{fmt(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Empty() {
  return <p style={{ color: "#64748b" }}>아직 데이터가 없어요.</p>;
}

const tableStyle = { width: "100%", fontSize: 13, borderCollapse: "collapse" as const };
const rowStyle = { borderTop: "1px solid #1e293b" };
```

- [ ] **Step 5: 대시보드 페이지 (서버 컴포넌트 + 가드)**

Create `apps/web/app/(admin)/admin/page.tsx`:

```tsx
// /admin 대시보드 — 서버 컴포넌트. 권위 가드 + DB 집계 → 표시 컴포넌트 조립. 읽기 전용.
import { isAdminAuthenticated } from "@/lib/admin/require-admin";
import {
  getDailyTrend,
  getFailedJobs,
  getFunnel,
  getKpiSummary,
  getRecentAccounts,
  getRecentDiagnoses,
} from "@/lib/admin/metrics";
import { createDb } from "@boina/db/client";
import { redirect } from "next/navigation";
import { KpiCards } from "@/app/components/admin/KpiCards";
import { TrendTable } from "@/app/components/admin/TrendTable";
import { FunnelView } from "@/app/components/admin/FunnelView";
import { RecentTables } from "@/app/components/admin/RecentTables";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    return <p style={{ color: "#f87171" }}>DATABASE_URL 이 설정되지 않아 데이터를 불러올 수 없습니다.</p>;
  }
  const db = createDb(url);

  const [kpi, trend, funnel, recentAccounts, recentDiagnoses, failedJobs] = await Promise.all([
    getKpiSummary(db),
    getDailyTrend(db, 14),
    getFunnel(db),
    getRecentAccounts(db, 20),
    getRecentDiagnoses(db, 20),
    getFailedJobs(db, 20),
  ]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <KpiCards kpi={kpi} />
      <FunnelView funnel={funnel} />
      <TrendTable points={trend} />
      <RecentTables recentAccounts={recentAccounts} recentDiagnoses={recentDiagnoses} failedJobs={failedJobs} />
    </div>
  );
}
```

- [ ] **Step 6: 타입체크 + 빌드로 페이지 검증**

Run: `cd "apps/web" && bun run typecheck`
Expected: exit 0 (타입 오류 0). 오류 시 import 경로(`@/...` alias)·컴포넌트 props 타입 수정.

- [ ] **Step 7: 커밋**

```bash
git add "apps/web/app/(admin)/admin/page.tsx" apps/web/app/components/admin/
git commit -m "feat(admin): 대시보드 페이지 + KPI/추이/퍼널/최근 컴포넌트"
```

---

## Task 7: .env.example 문서화 + 최종 게이트

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: .env.example 에 ADMIN_PASSWORD 추가**

`.env.example` 의 "인증 / 세션" 섹션 아래에 추가:

```
# ── 관리자 대시보드 ───────────────────────────────────────────
# [운영필수] 관리자 페이지(/admin) 접근 비밀번호. trim 후 비면 미설정으로 본다.
#   미설정이면 /admin·/api/admin/login 이 403(ADMIN_DISABLED) — 빈 비번 무방비 노출 0.
#   강한 무작위 값 권장. 생성 예: openssl rand -hex 24
ADMIN_PASSWORD=""
```

- [ ] **Step 2: 출시 게이트 — env 없이 build exit 0**

Run: `bun run build`
Expected: exit 0. admin 페이지/route 가 모두 `force-dynamic` 이라 prerender 시도 없음. 실패 시 해당 파일에 `export const dynamic = "force-dynamic";` 누락 확인.

- [ ] **Step 3: typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: 둘 다 exit 0. lint 실패 시 `bun run lint:fix`.

- [ ] **Step 4: 전체 테스트 (회귀 0)**

Run: `docker compose -f docker-compose.dev.yml up -d && bun run test`
Expected: 기존 3552 + 신규(auth 6 + route-guard 4 + login-route 4 + require-admin 3 + metrics 3 = 20) 전부 pass, 0 fail.

- [ ] **Step 5: 수동 동작 확인(권장)**

```bash
# .env 에 ADMIN_PASSWORD 세팅 후
bun run dev
# 1) http://localhost:3000/admin → /admin/login 으로 리다이렉트 확인
# 2) 틀린 비번 → 에러 표시 / 맞는 비번 → /admin 대시보드 진입
# 3) ADMIN_PASSWORD 지우고 prod 빌드 기동 → /admin 403/리다이렉트 확인
```

- [ ] **Step 6: 최종 커밋**

```bash
git add .env.example
git commit -m "docs(admin): .env.example 에 ADMIN_PASSWORD 문서화 + 출시 게이트 통과"
```

---

## Self-Review 결과 (작성자 점검)

**Spec coverage:** §2 범위(접근 게이트=Task1·3·5, KPI/추이/퍼널/최근=Task4·6, prod fail-fast=Task1·3·5) / §3 데이터출처(Task4, 신규 마이그레이션 0) / §4 아키텍처(라우트그룹·쿠키·미들웨어=Task2·5·6) / §5 코드구조(파일맵 일치) / §6 재시도 컷(Task6 사유표시만) / §7 엣지(빈 데이터 Empty, DB throw graceful) / §8 테스트(각 Task TDD) / §9 게이트(Task7) / §10 env(Task7). 누락 없음.

**Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝에 실제 코드 포함.

**Type consistency:** `KpiSummary/TrendPoint/Funnel/RecentAccount/RecentDiagnosis` 가 metrics.ts(Task4)에서 정의되고 컴포넌트(Task6)·테스트(Task4)에서 동일 이름으로 import. `signAdminToken/verifyAdminToken/verifyAdminPassword/isAdminConfigured/adminCookieOptions`(Task1) → require-admin(Task5)·login route(Task3)에서 동일 시그니처 사용. `decideRouteAccess` 의 `adminAuthenticated` 필드(Task2) → middleware(Task2)에서 주입. 일치 확인.

**알려진 구현 주의(구현자 판단 필요):**
- 스타일: 플랜은 인라인 style 로 작성했으나 프로젝트는 Tailwind v4 사용 — 구현자는 기존 `(app)` 페이지 스타일 방식에 맞춰 Tailwind 클래스로 전환 권장(기능 동일).
- `countRows` 의 drizzle `count()`/`and(single)` 타입이 버전에 따라 충돌하면 인라인 쿼리로 대체(Task4 Step3 주석).
- `bun run test` 의 DATABASE_URL 로드 방식은 vitest.config.ts 확인 후 필요 시 환경변수 명시 주입.
