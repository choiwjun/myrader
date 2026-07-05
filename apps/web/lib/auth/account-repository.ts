// @TASK P1-R1 - account 저장소 (Drizzle/@boina/db 구현)
// @SPEC docs/planning/07-coding-convention.md §2 (앱↔DB 서비스 레이어 경유)
// @SPEC packages/db/src/schema/account.ts (accounts 테이블 — 구조 변경 금지, import만)
//
// AccountRepository 의 Postgres 구현. 모든 쿼리는 eq() 파라미터 바인딩 —
// 문자열 보간 쿼리 금지(SQL Injection 방지, Guardrails). id 는 DB defaultRandom()
// (UUID v4) 가 생성 — 앱에서 만들지 않는다.

import { type DbClient, createDb } from "@boina/db/client";
import { accounts } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import type { AccountRepository, PublicAccount } from "./account-service";
import { hashPassword } from "./password";

/** @boina/db(Drizzle/Postgres) 기반 AccountRepository 구현. */
export function createDbAccountRepository(db: DbClient): AccountRepository {
  return {
    async findByEmail(email) {
      // 인증 검증용 — passwordHash 필요(서버 전용, 렌더 미노출). 컬럼 명시(SELECT * 금지).
      const [row] = await db
        .select({
          id: accounts.id,
          email: accounts.email,
          plan: accounts.plan,
          passwordHash: accounts.passwordHash,
          deletedAt: accounts.deletedAt,
          blockedAt: accounts.blockedAt,
        })
        .from(accounts)
        .where(eq(accounts.email, email))
        .limit(1);
      // blockedAt 포함 — 차단 계정은 자격증명이 맞아도 로그인 거부(차단 우회 방지).
      if (!row || row.deletedAt || row.blockedAt) return null;
      return { id: row.id, email: row.email, plan: row.plan, passwordHash: row.passwordHash };
    },

    async findById(id) {
      // [보안] 컬럼 명시 선택 — passwordHash 를 쿼리 자체에서 가져오지 않는다(읽기/렌더 경로).
      // SELECT * 는 raw row 에 password_hash 가 버퍼링되어 dev RSC 직렬화 등으로 노출될 수 있다.
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

    async create({ email, password }) {
      const passwordHash = await hashPassword(password);
      const [row] = await db
        .insert(accounts)
        .values({ email, passwordHash })
        .returning({ id: accounts.id, email: accounts.email, plan: accounts.plan });
      if (!row) throw new Error("account insert failed");
      return { id: row.id, email: row.email, plan: row.plan } satisfies PublicAccount;
    },

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
  };
}

/** 기본 repository 를 DATABASE_URL 로 생성한다(route 진입점에서 사용). */
export function getDefaultAccountRepository(): AccountRepository {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db: DbClient = createDb(url);
  return createDbAccountRepository(db);
}
