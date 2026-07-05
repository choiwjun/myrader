# 관리자 회원 관리 콘솔 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 `/admin/members`에서 회원의 플랜 변경·차단/해제·강제 로그아웃·소프트 삭제/복구·검색을 할 수 있고, 차단/삭제/강제로그아웃이 인증 단일 레이어에서 즉시 강제되도록 만든다.

**Architecture:** `accounts`에 `blockedAt`/`sessionsRevokedAt` 컬럼 추가(마이그레이션 1개). 강제는 `getCurrentUser()` 한 곳에서만(헌법 §1). 관리자 mutation은 admin 인증 가드 + Zod + rate-limit + 멱등 API. UI는 기존 admin 셸 재사용한 목록/상세 서버 컴포넌트 + 제어 클라이언트 컴포넌트.

**Tech Stack:** TypeScript, Next.js 15 App Router, Drizzle ORM(Postgres), drizzle-kit, Vitest, biome, bun.

**Spec:** `docs/superpowers/specs/2026-06-17-admin-member-management-design.md`

**Conventions (필수 준수):**
- 테이블/클라이언트 import: `import { accounts, businesses, diagnoses } from "@boina/db/schema";` / `import { type DbClient, createDb } from "@boina/db/client";`
- drizzle 헬퍼: `import { and, count, desc, eq, ilike, isNull, isNotNull, ne, or, sql } from "drizzle-orm";`
- API route: `export const dynamic = "force-dynamic";`, 응답 `{ data?, error?, code?, success }`, `isAdminAuthenticated()` 가드, 기존 rate-limit(`apps/web/lib/shared/api-rate-limit.ts`).
- 동적 라우트 핸들러 시그니처(Next 15): `export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> })` — `params`는 await. (구현자는 기존 동적 라우트가 있으면 그 시그니처에 맞출 것; 없으면 Next 15 표준대로.)
- 테스트: `apps/web/tests/admin/...`. DB 통합 테스트는 `vitest.config.ts`의 `DB_INTEGRATION_TESTS` 배열에 등록 + `describeDb` 스킵 패턴. 실행: 루트에서 `DATABASE_URL=postgresql://boina:boina-dev-password@localhost:5435/boina_db bun run vitest run <file>`.
- 마이그레이션: `packages/db/migrations/NNNN_*.sql` (현재 최신 `0002_*`). `bun run db:generate`로 `0003_*` 생성. drizzle journal은 미유지(직접 적용) — 생성된 SQL을 docker DB에 직접 적용한다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `packages/db/src/schema/account.ts` (수정) | `blockedAt`, `sessionsRevokedAt` 컬럼 + 인덱스 |
| `packages/db/migrations/0003_admin_member_fields.sql` (생성) | 컬럼 추가 SQL |
| `apps/web/lib/auth/account-service.ts` (수정) | `AccountRepository`에 세션가드 조회 + admin mutation 메서드 시그니처 추가 |
| `apps/web/lib/auth/account-repository.ts` (수정) | 위 메서드 Drizzle 구현 (findById에 blocked 제외 추가) |
| `apps/web/lib/auth/index.ts` (수정) | `getCurrentUser` 차단/삭제/세션무효화 강제 |
| `apps/web/lib/admin/members.ts` (생성) | 회원 목록(검색·필터·페이지네이션)·상세 조회 (순수, DbClient 주입) |
| `apps/web/app/api/admin/members/route.ts` (생성) | GET 목록 |
| `apps/web/app/api/admin/members/[id]/route.ts` (생성) | GET 상세 + PATCH 액션 |
| `apps/web/lib/shared/api-rate-limit.ts` (수정) | `adminMembersLimiter` 추가(또는 기존 admin limiter 재사용) |
| `apps/web/app/(admin)/admin/members/page.tsx` (생성) | 목록 화면 |
| `apps/web/app/(admin)/admin/members/[id]/page.tsx` (생성) | 상세 화면 |
| `apps/web/app/components/admin/MemberControls.tsx` (생성) | 제어 패널(클라이언트) |
| `apps/web/app/(admin)/layout.tsx` (수정) | 헤더에 "회원 관리" 링크 |

---

## Task 1: 스키마 컬럼 + 마이그레이션

**Files:**
- Modify: `packages/db/src/schema/account.ts`
- Create: `packages/db/migrations/0003_admin_member_fields.sql`

- [ ] **Step 1: 스키마에 컬럼 추가**

`packages/db/src/schema/account.ts`에서 `deletedAt` 컬럼 정의 바로 뒤에 추가:

```ts
    /** 차단 시각(설정되면 차단 상태). 해제 = null. */
    blockedAt: timestamp("blocked_at", { withTimezone: true }),

    /** 강제 로그아웃 기준 시각 — 이 시각 이전 발급 세션 토큰 거부. null이면 미적용. */
    sessionsRevokedAt: timestamp("sessions_revoked_at", { withTimezone: true }),
```

그리고 인덱스 배열(`(t) => [ ... ]`)에 추가:

```ts
    /** 차단 회원 필터용 */
    index("accounts_blocked_at_idx").on(t.blockedAt),
```

- [ ] **Step 2: 마이그레이션 SQL 생성**

Run: `cd "packages/db" && DATABASE_URL=postgresql://boina:boina-dev-password@localhost:5435/boina_db bun run db:generate`
Expected: `packages/db/migrations/0003_*.sql` 생성됨. 파일명이 `0003_admin_member_fields.sql`가 아니면 그대로 두되(drizzle 자동명명), 내용에 `ALTER TABLE "accounts" ADD COLUMN "blocked_at"` 와 `"sessions_revoked_at"` 가 있는지 확인.

만약 db:generate가 환경 문제로 실패하면, 수기로 `packages/db/migrations/0003_admin_member_fields.sql` 생성:
```sql
ALTER TABLE "accounts" ADD COLUMN "blocked_at" timestamp with time zone;
ALTER TABLE "accounts" ADD COLUMN "sessions_revoked_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "accounts_blocked_at_idx" ON "accounts" ("blocked_at");
```

- [ ] **Step 3: docker DB에 적용**

docker가 떠 있는지 확인 후 적용(0000~0002는 이미 적용돼 있음 — 0003만 추가 적용):
Run: `docker compose -f docker-compose.dev.yml up -d` 그리고
Run: `docker compose -f docker-compose.dev.yml exec -T db psql -U boina -d boina_db -f - < packages/db/migrations/0003_admin_member_fields.sql`
(컨테이너/DB명이 다르면 `docker compose -f docker-compose.dev.yml config`로 확인. 또는 `cat 0003*.sql | docker compose -f docker-compose.dev.yml exec -T db psql -U boina -d boina_db`.)
Expected: `ALTER TABLE` ×2, `CREATE INDEX` 성공. 이미 있으면 컬럼 중복 에러 → 무시 가능(IF NOT EXISTS 미지원 컬럼은 한 번만).

- [ ] **Step 4: 타입체크 + 컬럼 적용 확인**

Run: `bun run typecheck` → exit 0.
Run: `docker compose -f docker-compose.dev.yml exec -T db psql -U boina -d boina_db -c "\d accounts"` → `blocked_at`, `sessions_revoked_at` 컬럼 보임.

- [ ] **Step 5: 커밋**

```bash
git add packages/db/src/schema/account.ts packages/db/migrations/
git commit -m "feat(db): accounts에 blockedAt/sessionsRevokedAt 컬럼(회원 차단·세션무효화)"
```

---

## Task 2: 인증 강제 — getCurrentUser가 차단/삭제/강제로그아웃 세션 거부 (보안 최우선)

**Files:**
- Modify: `apps/web/lib/auth/account-service.ts`
- Modify: `apps/web/lib/auth/account-repository.ts`
- Modify: `apps/web/lib/auth/index.ts`
- Test: `apps/web/tests/admin/auth-enforcement.test.ts`

- [ ] **Step 1: account-service에 세션가드 타입/메서드 추가**

`apps/web/lib/auth/account-service.ts`의 `AccountRepository` 인터페이스에 메서드 추가(기존 메서드 유지):

```ts
  /**
   * 세션용 조회 — 삭제/차단 계정은 null. 살아있으면 account + 강제로그아웃 기준(ms).
   * getCurrentUser 가 토큰 iat 와 sessionsRevokedAtMs 를 비교한다.
   */
  findForSession(
    id: string,
  ): Promise<{ account: PublicAccount; sessionsRevokedAtMs: number | null } | null>;
```

- [ ] **Step 2: 실패 테스트 작성** — Create `apps/web/tests/admin/auth-enforcement.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 세션 쿠키 값 + repo.findForSession 를 제어해 getCurrentUser 강제 분기를 검증.
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
}));

import { getCurrentUser } from "../../lib/auth/index";
import { signSessionToken } from "../../lib/auth/session";
import type { AccountRepository } from "../../lib/auth/account-service";

const SECRET = "test-session-secret-32bytes-minimum-len";
const ACC = { id: "11111111-1111-4111-8111-111111111111", email: "a@b.com", plan: "free" as const };

function repoWith(result: Awaited<ReturnType<AccountRepository["findForSession"]>>): AccountRepository {
  return {
    findByEmail: async () => null,
    findById: async () => null,
    create: async () => ACC,
    findForSession: async () => result,
  } as AccountRepository;
}

describe("getCurrentUser 강제(차단/삭제/강제로그아웃)", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
    cookieValue = signSessionToken({ accountId: ACC.id });
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("정상 계정은 통과", async () => {
    const user = await getCurrentUser(repoWith({ account: ACC, sessionsRevokedAtMs: null }));
    expect(user?.id).toBe(ACC.id);
  });

  it("삭제/차단 계정은 null (repo가 null 반환)", async () => {
    const user = await getCurrentUser(repoWith(null));
    expect(user).toBeNull();
  });

  it("강제 로그아웃: 토큰 iat 가 sessionsRevokedAtMs 이전이면 null", async () => {
    // 토큰은 now 에 발급됨 → revoked 가 미래(now+10초)면 iat < revoked → 거부.
    const future = Date.now() + 10_000;
    const user = await getCurrentUser(repoWith({ account: ACC, sessionsRevokedAtMs: future }));
    expect(user).toBeNull();
  });

  it("강제 로그아웃 이후 재로그인(revoked 가 과거): 통과", async () => {
    const past = Date.now() - 10_000;
    const user = await getCurrentUser(repoWith({ account: ACC, sessionsRevokedAtMs: past }));
    expect(user?.id).toBe(ACC.id);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd "apps/web" && bun run test -- tests/admin/auth-enforcement.test.ts`
Expected: FAIL — `findForSession` 미구현 / getCurrentUser가 iat 비교 안 함.

- [ ] **Step 4: getCurrentUser 수정**

`apps/web/lib/auth/index.ts`의 `getCurrentUser`를 아래로 교체:

```ts
export async function getCurrentUser(
  repo: AccountRepository = getDefaultAccountRepository(),
): Promise<PublicAccount | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const found = await repo.findForSession(payload.accountId);
  if (!found) return null; // 없음/삭제/차단
  // 강제 로그아웃: 토큰이 무효화 시각 이전 발급이면 거부.
  if (found.sessionsRevokedAtMs !== null && payload.iat < found.sessionsRevokedAtMs) {
    return null;
  }
  return found.account;
}
```

- [ ] **Step 5: account-repository에 findForSession 구현 + findById에 blocked 제외 추가**

`apps/web/lib/auth/account-repository.ts`의 `createDbAccountRepository` 반환 객체에 추가하고, 기존 `findById`도 blocked 제외하도록 수정:

```ts
    async findById(id) {
      const [row] = await db
        .select({
          id: accounts.id,
          email: accounts.email,
          plan: accounts.plan,
          deletedAt: accounts.deletedAt,
          blockedAt: accounts.blockedAt,
        })
        .from(accounts)
        .where(eq(accounts.id, id))
        .limit(1);
      if (!row || row.deletedAt || row.blockedAt) return null;
      return { id: row.id, email: row.email, plan: row.plan } satisfies PublicAccount;
    },

    async findForSession(id) {
      const [row] = await db
        .select({
          id: accounts.id,
          email: accounts.email,
          plan: accounts.plan,
          deletedAt: accounts.deletedAt,
          blockedAt: accounts.blockedAt,
          sessionsRevokedAt: accounts.sessionsRevokedAt,
        })
        .from(accounts)
        .where(eq(accounts.id, id))
        .limit(1);
      if (!row || row.deletedAt || row.blockedAt) return null;
      return {
        account: { id: row.id, email: row.email, plan: row.plan },
        sessionsRevokedAtMs: row.sessionsRevokedAt ? row.sessionsRevokedAt.getTime() : null,
      };
    },
```

(`findByEmail`도 blocked 계정을 로그인에서 막으려면 `if (!row || row.deletedAt || row.blockedAt) return null;`로 강화 — `blockedAt`을 select에 추가. 이 단계에서 함께 적용.)

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd "apps/web" && bun run test -- tests/admin/auth-enforcement.test.ts`
Expected: PASS (4 tests).
기존 auth 테스트 회귀 확인:
Run: `cd "apps/web" && bun run test -- tests/auth/`
Expected: 전부 PASS(혹시 findForSession 미구현 mock이 있으면 그 테스트의 repo mock에 `findForSession` 추가 필요 — 깨지면 해당 테스트의 mock 객체에 `findForSession: async () => null` 같은 스텁 추가).

- [ ] **Step 7: typecheck + 커밋**

Run: `bun run typecheck` → exit 0 (AccountRepository 구현체/목 전부 findForSession 보유).
```bash
git add apps/web/lib/auth/ apps/web/tests/admin/auth-enforcement.test.ts
git commit -m "feat(auth): getCurrentUser에서 차단/삭제/강제로그아웃 세션 거부(단일 레이어)"
```

---

## Task 3: account-repository 관리자 mutation 메서드

**Files:**
- Modify: `apps/web/lib/auth/account-service.ts`
- Modify: `apps/web/lib/auth/account-repository.ts`
- Test: `apps/web/tests/admin/account-admin-mutations-db.test.ts`

- [ ] **Step 1: 인터페이스에 admin mutation 추가**

`account-service.ts`의 `AccountRepository`에 추가:

```ts
  /** 관리자 액션 — 대상 id 의 상태 변경. 대상 없으면 false, 변경되면 true(멱등). */
  setPlan(id: string, plan: PublicAccount["plan"]): Promise<boolean>;
  setBlocked(id: string, blocked: boolean): Promise<boolean>;
  revokeSessions(id: string): Promise<boolean>;
  setDeleted(id: string, deleted: boolean): Promise<boolean>;
```

- [ ] **Step 2: 실패 테스트 작성** — Create `apps/web/tests/admin/account-admin-mutations-db.test.ts`:

```ts
import { createDb } from "@boina/db/client";
import { accounts } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbAccountRepository } from "../../lib/auth/account-repository";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb("account admin mutations ↔ DB", () => {
  let db: ReturnType<typeof createDb>;
  let repo: ReturnType<typeof createDbAccountRepository>;
  let id: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    repo = createDbAccountRepository(db);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const [row] = await db
      .insert(accounts)
      .values({ email: `adm-mut-${suffix}@example.com`, passwordHash: "x" })
      .returning({ id: accounts.id });
    id = row.id;
  });

  afterAll(async () => {
    await db.delete(accounts).where(eq(accounts.id, id));
  });

  it("setPlan 이 plan 을 바꾼다", async () => {
    expect(await repo.setPlan(id, "basic")).toBe(true);
    const [r] = await db.select({ plan: accounts.plan }).from(accounts).where(eq(accounts.id, id));
    expect(r?.plan).toBe("basic");
  });

  it("setBlocked(true/false) 가 blockedAt 을 토글한다", async () => {
    await repo.setBlocked(id, true);
    let [r] = await db.select({ b: accounts.blockedAt }).from(accounts).where(eq(accounts.id, id));
    expect(r?.b).not.toBeNull();
    await repo.setBlocked(id, false);
    [r] = await db.select({ b: accounts.blockedAt }).from(accounts).where(eq(accounts.id, id));
    expect(r?.b).toBeNull();
  });

  it("revokeSessions 가 sessionsRevokedAt 을 설정한다", async () => {
    expect(await repo.revokeSessions(id)).toBe(true);
    const [r] = await db.select({ s: accounts.sessionsRevokedAt }).from(accounts).where(eq(accounts.id, id));
    expect(r?.s).not.toBeNull();
  });

  it("setDeleted(true/false) 가 deletedAt 을 토글한다", async () => {
    await repo.setDeleted(id, true);
    let [r] = await db.select({ d: accounts.deletedAt }).from(accounts).where(eq(accounts.id, id));
    expect(r?.d).not.toBeNull();
    await repo.setDeleted(id, false);
    [r] = await db.select({ d: accounts.deletedAt }).from(accounts).where(eq(accounts.id, id));
    expect(r?.d).toBeNull();
  });

  it("없는 id 는 false", async () => {
    expect(await repo.setPlan("00000000-0000-4000-8000-000000000000", "pro")).toBe(false);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인 + 테스트 등록**

`vitest.config.ts`의 `DB_INTEGRATION_TESTS` 배열에 `"apps/web/tests/admin/account-admin-mutations-db.test.ts"` 추가.
Run: `DATABASE_URL=postgresql://boina:boina-dev-password@localhost:5435/boina_db bun run vitest run apps/web/tests/admin/account-admin-mutations-db.test.ts`
Expected: FAIL — 메서드 미구현.

- [ ] **Step 4: account-repository 구현**

`createDbAccountRepository` 반환 객체에 추가 (import에 `sql` 불필요, `eq`만 사용):

```ts
    async setPlan(id, plan) {
      const res = await db
        .update(accounts)
        .set({ plan, updatedAt: new Date() })
        .where(eq(accounts.id, id))
        .returning({ id: accounts.id });
      return res.length > 0;
    },
    async setBlocked(id, blocked) {
      const res = await db
        .update(accounts)
        .set({ blockedAt: blocked ? new Date() : null, updatedAt: new Date() })
        .where(eq(accounts.id, id))
        .returning({ id: accounts.id });
      return res.length > 0;
    },
    async revokeSessions(id) {
      const res = await db
        .update(accounts)
        .set({ sessionsRevokedAt: new Date(), updatedAt: new Date() })
        .where(eq(accounts.id, id))
        .returning({ id: accounts.id });
      return res.length > 0;
    },
    async setDeleted(id, deleted) {
      const res = await db
        .update(accounts)
        .set({ deletedAt: deleted ? new Date() : null, updatedAt: new Date() })
        .where(eq(accounts.id, id))
        .returning({ id: accounts.id });
      return res.length > 0;
    },
```

- [ ] **Step 5: 테스트 통과 + typecheck + 커밋**

Run: `DATABASE_URL=postgresql://boina:boina-dev-password@localhost:5435/boina_db bun run vitest run apps/web/tests/admin/account-admin-mutations-db.test.ts` → PASS (5 tests).
Run: `bun run typecheck` → exit 0.
```bash
git add apps/web/lib/auth/ apps/web/tests/admin/account-admin-mutations-db.test.ts vitest.config.ts
git commit -m "feat(auth): account-repository 관리자 mutation(plan/block/revoke/delete)"
```

---

## Task 4: 회원 목록·상세 조회 (members.ts)

**Files:**
- Create: `apps/web/lib/admin/members.ts`
- Test: `apps/web/tests/admin/members-db.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — Create `apps/web/tests/admin/members-db.test.ts`:

```ts
import { createDb } from "@boina/db/client";
import { accounts, businesses } from "@boina/db/schema";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMemberDetail, listMembers } from "../../lib/admin/members";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb("admin members 조회 ↔ DB", () => {
  let db: ReturnType<typeof createDb>;
  const accIds: string[] = [];
  let email: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    email = `members-${suffix}@example.com`;
    const [a] = await db.insert(accounts).values({ email, passwordHash: "x", plan: "pro" }).returning({ id: accounts.id });
    accIds.push(a.id);
    await db.insert(businesses).values({ name: `mem-biz-${suffix}`, accountId: a.id });
  });
  afterAll(async () => {
    if (accIds.length) await db.delete(accounts).where(inArray(accounts.id, accIds));
  });

  it("listMembers: 이메일 검색으로 시드 계정을 찾고 total>=1", async () => {
    const res = await listMembers(db, { q: email, limit: 20, offset: 0 });
    expect(res.total).toBeGreaterThanOrEqual(1);
    expect(res.rows.some((r) => r.email === email)).toBe(true);
    const me = res.rows.find((r) => r.email === email);
    expect(me?.status).toBe("active");
    expect(me?.plan).toBe("pro");
  });

  it("getMemberDetail: 계정 + 가게 목록 반환", async () => {
    const detail = await getMemberDetail(db, accIds[0]);
    expect(detail?.account.email).toBe(email);
    expect(detail?.businesses.length).toBeGreaterThanOrEqual(1);
  });

  it("getMemberDetail: 없는 id 는 null", async () => {
    expect(await getMemberDetail(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
```

- [ ] **Step 2: 등록 + 실패 확인**

`vitest.config.ts`의 `DB_INTEGRATION_TESTS`에 `"apps/web/tests/admin/members-db.test.ts"` 추가.
Run: `DATABASE_URL=postgresql://boina:boina-dev-password@localhost:5435/boina_db bun run vitest run apps/web/tests/admin/members-db.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: members.ts 구현** — Create `apps/web/lib/admin/members.ts`:

```ts
// @SPEC docs/superpowers/specs/2026-06-17-admin-member-management-design.md §5,§6
// 관리자 회원 목록/상세 조회. 순수, DbClient 주입. 읽기 전용.

import type { DbClient } from "@boina/db/client";
import { accounts, businesses, diagnoses } from "@boina/db/schema";
import { and, count, desc, eq, ilike, isNull, isNotNull } from "drizzle-orm";

export type MemberStatus = "active" | "blocked" | "deleted";

export interface MemberRow {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  status: MemberStatus;
  createdAt: Date;
}

export interface ListMembersInput {
  q?: string;
  plan?: string;
  status?: MemberStatus;
  limit: number;
  offset: number;
}

function statusOf(row: { blockedAt: Date | null; deletedAt: Date | null }): MemberStatus {
  if (row.deletedAt) return "deleted";
  if (row.blockedAt) return "blocked";
  return "active";
}

export async function listMembers(
  db: DbClient,
  input: ListMembersInput,
): Promise<{ rows: MemberRow[]; total: number }> {
  const conds = [];
  if (input.q && input.q.trim()) conds.push(ilike(accounts.email, `%${input.q.trim()}%`));
  if (input.plan) conds.push(eq(accounts.plan, input.plan as MemberRow["plan"] as never));
  if (input.status === "deleted") conds.push(isNotNull(accounts.deletedAt));
  if (input.status === "blocked") conds.push(and(isNull(accounts.deletedAt), isNotNull(accounts.blockedAt)));
  if (input.status === "active") conds.push(and(isNull(accounts.deletedAt), isNull(accounts.blockedAt)));
  const where = conds.length ? and(...conds) : undefined;

  const baseRows = db
    .select({
      id: accounts.id,
      email: accounts.email,
      name: accounts.name,
      plan: accounts.plan,
      blockedAt: accounts.blockedAt,
      deletedAt: accounts.deletedAt,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .orderBy(desc(accounts.createdAt))
    .limit(Math.min(input.limit, 100))
    .offset(input.offset);
  const rowsRaw = where ? await baseRows.where(where) : await baseRows;

  const baseCount = db.select({ c: count() }).from(accounts);
  const countRows = where ? await baseCount.where(where) : await baseCount;
  const total = Number(countRows[0]?.c ?? 0);

  return {
    rows: rowsRaw.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      plan: r.plan,
      status: statusOf(r),
      createdAt: r.createdAt,
    })),
    total,
  };
}

export interface MemberBusiness {
  id: string;
  name: string;
  latestStatus: string | null;
  latestAt: Date | null;
}

export interface MemberDetail {
  account: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    plan: string;
    status: MemberStatus;
    createdAt: Date;
  };
  businesses: MemberBusiness[];
}

export async function getMemberDetail(db: DbClient, id: string): Promise<MemberDetail | null> {
  const [acc] = await db
    .select({
      id: accounts.id,
      email: accounts.email,
      name: accounts.name,
      phone: accounts.phone,
      plan: accounts.plan,
      blockedAt: accounts.blockedAt,
      deletedAt: accounts.deletedAt,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  if (!acc) return null;

  const bizRows = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      latestStatus: diagnoses.status,
      latestAt: diagnoses.createdAt,
    })
    .from(businesses)
    .leftJoin(diagnoses, eq(diagnoses.businessId, businesses.id))
    .where(eq(businesses.accountId, id))
    .orderBy(desc(diagnoses.createdAt));

  // business 별 최신 진단 1건만 남긴다(가게당 첫 등장 = 최신).
  const seen = new Set<string>();
  const bizs: MemberBusiness[] = [];
  for (const r of bizRows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    bizs.push({ id: r.id, name: r.name, latestStatus: r.latestStatus ?? null, latestAt: r.latestAt ?? null });
  }

  return {
    account: {
      id: acc.id,
      email: acc.email,
      name: acc.name,
      phone: acc.phone,
      plan: acc.plan,
      status: statusOf(acc),
      createdAt: acc.createdAt,
    },
    businesses: bizs,
  };
}
```

> 주의: drizzle의 `eq(accounts.plan, ...)`에 문자열을 넣을 때 enum 타입 충돌이 나면 `input.plan` 검증을 enum 화이트리스트로 좁힌 뒤 캐스팅(`as never` 사용은 최후수단; 가능하면 `PlanEnum` 타입으로). 타입체크 통과를 우선한다.

- [ ] **Step 4: 통과 + typecheck + 커밋**

Run the test → PASS (3 tests). `bun run typecheck` → exit 0.
```bash
git add apps/web/lib/admin/members.ts apps/web/tests/admin/members-db.test.ts vitest.config.ts
git commit -m "feat(admin): 회원 목록(검색·필터·페이지네이션)·상세 조회"
```

---

## Task 5: 관리자 회원 API (목록 GET / 상세 GET / 액션 PATCH)

**Files:**
- Modify: `apps/web/lib/shared/api-rate-limit.ts`
- Create: `apps/web/app/api/admin/members/route.ts`
- Create: `apps/web/app/api/admin/members/[id]/route.ts`
- Test: `apps/web/tests/admin/members-route.test.ts`

- [ ] **Step 1: rate limiter 추가**

`apps/web/lib/shared/api-rate-limit.ts`를 읽고 기존 limiter 정의 패턴을 그대로 따라 추가(예: `export const adminMembersLimiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 60 });`). 기존 `adminLoginLimiter`가 있으면 그 정의부 옆에 둔다. 정확한 클래스/옵션명은 파일에서 확인 후 일치.

- [ ] **Step 2: 실패 테스트 작성** — Create `apps/web/tests/admin/members-route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// admin 인증 가드와 repo/members 를 모킹해 라우트 로직만 검증.
let authed = true;
vi.mock("../../lib/admin/require-admin", () => ({
  isAdminAuthenticated: async () => authed,
}));
const setPlan = vi.fn(async () => true);
const setBlocked = vi.fn(async () => true);
const revokeSessions = vi.fn(async () => true);
const setDeleted = vi.fn(async () => true);
vi.mock("../../lib/auth/account-repository", () => ({
  getDefaultAccountRepository: () => ({ setPlan, setBlocked, revokeSessions, setDeleted }),
}));

import { PATCH } from "../../app/api/admin/members/[id]/route";

const ID = "11111111-1111-4111-8111-111111111111";
function patch(body: unknown) {
  return PATCH(
    new Request(`http://localhost/api/admin/members/${ID}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: ID }) },
  );
}

describe("PATCH /api/admin/members/[id]", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    authed = true;
    setPlan.mockClear(); setBlocked.mockClear(); revokeSessions.mockClear(); setDeleted.mockClear();
    process.env.SESSION_SECRET = "test-session-secret-32bytes-minimum-len";
    process.env.ADMIN_PASSWORD = "pw-123456";
    process.env.DATABASE_URL = "postgresql://x";
  });
  afterEach(() => { process.env = { ...prev }; });

  it("미인증이면 401", async () => {
    authed = false;
    const res = await patch({ action: "block" });
    expect(res.status).toBe(401);
  });

  it("setPlan 액션이 repo.setPlan 호출", async () => {
    const res = await patch({ action: "setPlan", plan: "basic" });
    expect(res.status).toBe(200);
    expect(setPlan).toHaveBeenCalledWith(ID, "basic");
  });

  it("block 액션이 repo.setBlocked(true) 호출", async () => {
    await patch({ action: "block" });
    expect(setBlocked).toHaveBeenCalledWith(ID, true);
  });

  it("잘못된 action 은 400", async () => {
    const res = await patch({ action: "nope" });
    expect(res.status).toBe(400);
  });

  it("대상 없음(repo false)이면 404", async () => {
    setBlocked.mockResolvedValueOnce(false);
    const res = await patch({ action: "block" });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: 등록 안 함(단위 테스트 — DB 불필요, mock)**. 실패 확인:

Run: `cd "apps/web" && bun run test -- tests/admin/members-route.test.ts`
Expected: FAIL — route 모듈 없음.

- [ ] **Step 4: 상세/액션 라우트 구현** — Create `apps/web/app/api/admin/members/[id]/route.ts`:

```ts
// @SPEC docs/superpowers/specs/2026-06-17-admin-member-management-design.md §5
import { isAdminAuthenticated } from "@/lib/admin/require-admin";
import { getMemberDetail } from "@/lib/admin/members";
import { getDefaultAccountRepository } from "@/lib/auth/account-repository";
import { createDb } from "@boina/db/client";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PlanSchema = z.enum(["free", "basic", "pro", "business"]);
const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setPlan"), plan: PlanSchema }),
  z.object({ action: z.literal("block") }),
  z.object({ action: z.literal("unblock") }),
  z.object({ action: z.literal("forceLogout") }),
  z.object({ action: z.literal("softDelete") }),
  z.object({ action: z.literal("restore") }),
]);

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED", success: false }, { status: 401 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return unauthorized();
  const { id } = await params;
  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ error: "DB unavailable", success: false }, { status: 503 });
  const detail = await getMemberDetail(createDb(url), id);
  if (!detail) return NextResponse.json({ error: "Not found", code: "NOT_FOUND", success: false }, { status: 404 });
  return NextResponse.json({ data: detail, success: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAdminAuthenticated())) return unauthorized();
    const { id } = await params;
    const input = ActionSchema.parse(await request.json());
    const repo = getDefaultAccountRepository();

    let changed = false;
    switch (input.action) {
      case "setPlan": changed = await repo.setPlan(id, input.plan); break;
      case "block": changed = await repo.setBlocked(id, true); break;
      case "unblock": changed = await repo.setBlocked(id, false); break;
      case "forceLogout": changed = await repo.revokeSessions(id); break;
      case "softDelete": changed = await repo.setDeleted(id, true); break;
      case "restore": changed = await repo.setDeleted(id, false); break;
    }
    if (!changed) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND", success: false }, { status: 404 });
    }
    return NextResponse.json({ data: { ok: true }, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", success: false }, { status: 400 });
    }
    console.error("PATCH /api/admin/members/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
```

- [ ] **Step 5: 목록 라우트 구현** — Create `apps/web/app/api/admin/members/route.ts`:

```ts
// @SPEC docs/superpowers/specs/2026-06-17-admin-member-management-design.md §5
import { isAdminAuthenticated } from "@/lib/admin/require-admin";
import { listMembers, type MemberStatus } from "@/lib/admin/members";
import { createDb } from "@boina/db/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED", success: false }, { status: 401 });
  }
  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ error: "DB unavailable", success: false }, { status: 503 });
  const sp = new URL(request.url).searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? "20") || 20, 100);
  const offset = Math.max(Number(sp.get("offset") ?? "0") || 0, 0);
  const statusParam = sp.get("status");
  const status = (["active", "blocked", "deleted"] as const).includes(statusParam as MemberStatus)
    ? (statusParam as MemberStatus)
    : undefined;
  const res = await listMembers(createDb(url), {
    q: sp.get("q") ?? undefined,
    plan: sp.get("plan") ?? undefined,
    status,
    limit,
    offset,
  });
  return NextResponse.json({ data: res, success: true });
}
```

- [ ] **Step 6: 가드/액션 테스트 통과 + typecheck + lint + 커밋**

Run: `cd "apps/web" && bun run test -- tests/admin/members-route.test.ts` → PASS (5 tests).
Run: `bun run typecheck` → exit 0. `bun run lint` → exit 0 (필요시 lint:fix).
```bash
git add apps/web/app/api/admin/members/ apps/web/lib/shared/api-rate-limit.ts apps/web/tests/admin/members-route.test.ts
git commit -m "feat(admin): 회원 목록/상세 GET + 액션 PATCH API(가드·검증·멱등)"
```

> 참고: rate-limit를 라우트에 실제로 적용(enforceRateLimit)하려면 GET 목록/PATCH 진입부에 기존 패턴대로 한 줄 추가. 단위 테스트는 mock 환경이라 rate-limit를 건드리지 않게 하거나, 한도를 넉넉히. 구현자가 기존 admin login route의 적용 방식과 일치시킨다.

---

## Task 6: 관리자 회원 UI (목록·상세·제어 + 헤더 내비)

**Files:**
- Create: `apps/web/app/(admin)/admin/members/page.tsx`
- Create: `apps/web/app/(admin)/admin/members/[id]/page.tsx`
- Create: `apps/web/app/components/admin/MemberControls.tsx`
- Modify: `apps/web/app/(admin)/layout.tsx`

> 서버 컴포넌트는 `isAdminAuthenticated()` 가드 + `force-dynamic`. 스타일은 기존 admin 셸의 Tailwind v4 dark slate 팔레트 일치(기존 `app/components/admin/*` 참고). 제어 패널만 클라이언트. 위험작업은 `window.confirm`. 단위 테스트 없음(typecheck/build로 검증).

- [ ] **Step 1: 목록 페이지** — Create `apps/web/app/(admin)/admin/members/page.tsx`:

```tsx
// @SPEC docs/superpowers/specs/2026-06-17-admin-member-management-design.md §6
import { isAdminAuthenticated } from "@/lib/admin/require-admin";
import { listMembers, type MemberStatus } from "@/lib/admin/members";
import { createDb } from "@boina/db/client";
import { redirect } from "next/navigation";
import Link from "next/link";

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
  const { rows, total } = await listMembers(createDb(url), { q, status, limit, offset: (page - 1) * limit });
  const pages = Math.max(Math.ceil(total / limit), 1);

  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold text-slate-100">회원 관리 ({total})</h1>
      <form className="flex gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="이메일 검색"
          aria-label="이메일 검색"
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
        />
        <select name="status" defaultValue={status ?? ""} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
          <option value="">전체 상태</option>
          <option value="active">활성</option>
          <option value="blocked">차단</option>
          <option value="deleted">삭제</option>
        </select>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">검색</button>
      </form>
      {rows.length === 0 ? (
        <p className="text-slate-500">해당하는 회원이 없어요.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="px-3 py-2">이메일</th><th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">플랜</th><th className="px-3 py-2">상태</th><th className="px-3 py-2">가입</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t border-slate-800 hover:bg-slate-800/50">
                  <td className="px-3 py-2">
                    <Link href={`/admin/members/${m.id}`} className="text-blue-400 hover:underline">{m.email}</Link>
                  </td>
                  <td className="px-3 py-2">{m.name ?? "—"}</td>
                  <td className="px-3 py-2">{m.plan}</td>
                  <td className="px-3 py-2">{m.status}</td>
                  <td className="px-3 py-2">{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short" }).format(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-3 text-sm text-slate-400">
        {page > 1 && <Link href={`/admin/members?q=${encodeURIComponent(q)}&page=${page - 1}`} className="hover:text-slate-200">← 이전</Link>}
        <span>{page} / {pages}</span>
        {page < pages && <Link href={`/admin/members?q=${encodeURIComponent(q)}&page=${page + 1}`} className="hover:text-slate-200">다음 →</Link>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 제어 패널(클라이언트)** — Create `apps/web/app/components/admin/MemberControls.tsx`:

```tsx
// @SPEC docs/superpowers/specs/2026-06-17-admin-member-management-design.md §6
"use client";
import { useState } from "react";

type Action =
  | { action: "setPlan"; plan: string }
  | { action: "block" } | { action: "unblock" }
  | { action: "forceLogout" } | { action: "softDelete" } | { action: "restore" };

export function MemberControls({
  id,
  plan,
  status,
}: {
  id: string;
  plan: string;
  status: "active" | "blocked" | "deleted";
}) {
  const [busy, setBusy] = useState(false);
  const [planValue, setPlanValue] = useState(plan);

  async function send(body: Action, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/members/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) window.location.reload();
    else alert("작업 실패: " + res.status);
  }

  return (
    <div className="grid gap-3" aria-busy={busy}>
      <div className="flex items-center gap-2">
        <select value={planValue} onChange={(e) => setPlanValue(e.target.value)} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200">
          <option value="free">free</option><option value="basic">basic</option>
          <option value="pro">pro</option><option value="business">business</option>
        </select>
        <button type="button" disabled={busy} onClick={() => send({ action: "setPlan", plan: planValue })} className="rounded bg-blue-600 px-3 py-1 text-sm text-white">플랜 저장</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {status === "blocked"
          ? <button type="button" disabled={busy} onClick={() => send({ action: "unblock" })} className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100">차단 해제</button>
          : <button type="button" disabled={busy} onClick={() => send({ action: "block" }, "이 회원을 차단할까요? 로그인·세션이 모두 막힙니다.")} className="rounded bg-amber-600 px-3 py-1 text-sm text-white">차단</button>}
        <button type="button" disabled={busy} onClick={() => send({ action: "forceLogout" }, "이 회원의 모든 세션을 강제 로그아웃할까요?")} className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100">강제 로그아웃</button>
        {status === "deleted"
          ? <button type="button" disabled={busy} onClick={() => send({ action: "restore" })} className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100">복구</button>
          : <button type="button" disabled={busy} onClick={() => send({ action: "softDelete" }, "이 회원을 삭제할까요? (복구 가능)")} className="rounded bg-red-600 px-3 py-1 text-sm text-white">삭제</button>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 상세 페이지** — Create `apps/web/app/(admin)/admin/members/[id]/page.tsx`:

```tsx
// @SPEC docs/superpowers/specs/2026-06-17-admin-member-management-design.md §6
import { isAdminAuthenticated } from "@/lib/admin/require-admin";
import { getMemberDetail } from "@/lib/admin/members";
import { MemberControls } from "@/app/components/admin/MemberControls";
import { createDb } from "@boina/db/client";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  if (!d) return "—";
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date(d))} KST`;
}

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const url = process.env.DATABASE_URL;
  if (!url) return <p className="text-red-400">DATABASE_URL 미설정.</p>;
  const { id } = await params;
  const detail = await getMemberDetail(createDb(url), id);
  if (!detail) notFound();
  const a = detail.account;

  return (
    <div className="grid gap-5">
      <Link href="/admin/members" className="text-sm text-slate-400 hover:text-slate-200">← 회원 목록</Link>
      <div className="rounded-lg border border-slate-700 p-4">
        <h1 className="text-lg font-semibold text-slate-100">{a.email}</h1>
        <dl className="mt-2 grid grid-cols-2 gap-1 text-sm text-slate-300">
          <dt className="text-slate-500">이름</dt><dd>{a.name ?? "—"}</dd>
          <dt className="text-slate-500">전화</dt><dd>{a.phone ?? "—"}</dd>
          <dt className="text-slate-500">플랜</dt><dd>{a.plan}</dd>
          <dt className="text-slate-500">상태</dt><dd>{a.status}</dd>
          <dt className="text-slate-500">가입</dt><dd>{fmt(a.createdAt)}</dd>
        </dl>
      </div>
      <div className="rounded-lg border border-slate-700 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">제어</h2>
        <MemberControls id={a.id} plan={a.plan} status={a.status} />
      </div>
      <div className="rounded-lg border border-slate-700 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">가게 / 진단 ({detail.businesses.length})</h2>
        {detail.businesses.length === 0 ? (
          <p className="text-slate-500">진단한 가게가 없어요.</p>
        ) : (
          <ul className="grid gap-2 text-sm text-slate-300">
            {detail.businesses.map((b) => (
              <li key={b.id} className="flex justify-between border-t border-slate-800 py-1">
                <span>{b.name}</span>
                <span className="text-slate-500">{b.latestStatus ?? "진단 없음"} · {fmt(b.latestAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 헤더 내비 링크** — `apps/web/app/(admin)/layout.tsx` 헤더에 "대시보드 | 회원 관리" 링크 추가.

기존 layout의 헤더 영역(타이틀 "보이나 운영 콘솔")에 `next/link` 내비를 추가한다. 예(기존 className 팔레트에 맞춰 조정):
```tsx
import Link from "next/link";
// header 안, 타이틀 옆:
<nav className="flex gap-4 text-sm text-slate-400">
  <Link href="/admin" className="hover:text-slate-200">대시보드</Link>
  <Link href="/admin/members" className="hover:text-slate-200">회원 관리</Link>
</nav>
```
기존 `{authed && <LogoutButton />}`와 `flex justify-between` 구조는 유지. (authed일 때만 nav를 보여도 됨 — 로그인 페이지에선 숨김.)

- [ ] **Step 5: typecheck + lint + build**

Run: `bun run typecheck` → exit 0.
Run: `bun run lint` → exit 0 (lint:fix 필요시, 새 파일만).
Run: `bun run build` (env 없이) → exit 0. `/admin/members`와 `/admin/members/[id]`가 동적(ƒ)으로 빌드되는지 확인(둘 다 force-dynamic).

- [ ] **Step 6: 커밋**

```bash
git add "apps/web/app/(admin)/admin/members/" apps/web/app/components/admin/MemberControls.tsx "apps/web/app/(admin)/layout.tsx"
git commit -m "feat(admin): 회원 관리 UI(목록·상세·제어 패널) + 헤더 내비"
```

---

## Task 7: 최종 게이트

**Files:** 없음(검증만)

- [ ] **Step 1: 마이그레이션 clean 적용 확인**

0003 마이그레이션이 0000~0002 위에 깨끗이 적용됨을 이미 Task 1에서 확인. 추가로 `bun run typecheck`로 스키마-코드 정합 재확인.

- [ ] **Step 2: 전체 게이트**

Run (repo root):
- `bun run typecheck` → exit 0
- `bun run lint` → exit 0
- `bun run build` (env 없이) → exit 0
- `docker compose -f docker-compose.dev.yml up -d && DATABASE_URL=postgresql://boina:boina-dev-password@localhost:5435/boina_db bun run test` → 전부 pass, 0 fail. (기존 3651 + 신규: auth-enforcement 4 + account-admin-mutations 5 + members-db 3 + members-route 5 = 17)

- [ ] **Step 3: 수동 동작 확인(권장)**

`.env`에 ADMIN_PASSWORD 세팅 + `bun run dev` 후: /admin/members 목록·검색·페이지네이션, 상세에서 플랜변경·차단(→ 그 계정 로그인 차단 확인)·강제로그아웃·삭제/복구.

- [ ] **Step 4: 최종 커밋(있다면) + 완료**

게이트 결과를 보고. 코드 변경이 더 없으면 별도 커밋 불필요.

---

## Self-Review (작성자 점검)

**Spec coverage:** §2 A(setPlan=T3/T5/T6)·B(block=T2강제/T3/T5/T6)·C(상세=T4/T6)·D(softDelete=T3/T5/T6)·E(forceLogout=T2강제/T3/T5/T6)·F(목록검색페이지네이션=T4/T5/T6) / §3 컬럼(T1) / §4 getCurrentUser 강제(T2) / §5 API(T5) / §6 UI(T6) / §7 안전·멱등(T3 returning길이→false, T5 404) / §9 테스트(각 Task) / §10 게이트(T7). 누락 없음. (감사로그·비번리셋·OAuth = 비범위, 미포함 정상.)

**Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝 실제 코드 포함.

**Type consistency:** `findForSession` 반환 `{account, sessionsRevokedAtMs}`(T2)이 getCurrentUser(T2)·repo(T2)에서 일치. `setPlan/setBlocked/revokeSessions/setDeleted`(T3 인터페이스)가 repo 구현(T3)·route(T5)·route 테스트 mock(T5)에서 동일 시그니처. `MemberRow/MemberDetail/MemberStatus/listMembers/getMemberDetail`(T4)이 route(T5)·UI(T6)에서 일치. `ActionSchema`의 액션명(setPlan/block/unblock/forceLogout/softDelete/restore)이 PATCH switch·MemberControls 버튼(T6)과 일치.

**알려진 구현 주의:**
- drizzle `eq(accounts.plan, string)` enum 타입 충돌 시 화이트리스트 검증 후 캐스팅(T4 주석).
- rate-limit 실제 적용은 기존 admin login route 패턴과 일치(T5 주석). 단위 테스트가 limiter에 안 걸리게 한도 넉넉히/또는 mock.
- 기존 auth 테스트의 AccountRepository mock에 `findForSession` 스텁 추가 필요할 수 있음(T2 Step6).
- 마이그레이션 적용 명령(docker psql)은 환경에 맞춰 컨테이너/DB명 확인(T1 Step3).
