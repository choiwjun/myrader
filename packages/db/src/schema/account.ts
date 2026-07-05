/**
 * @TASK P0-T2 - Account 테이블 정의
 * @SPEC docs/planning/04-database-design.md#users-table
 *
 * account table — User account (단일 인증, 07 헌법 UUID 식별자)
 *
 * REQ-001 기반: 셀프서비스 사용자(사장님) 계정 관리.
 * 식별자는 UUID v4 (07-coding-convention.md 헌법).
 */

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { planEnum } from "../enums.js";

export const accounts = pgTable(
  "accounts",
  {
    /** UUID v4 primary key */
    id: uuid("id").primaryKey().defaultRandom(),

    /** Email address (unique) */
    email: text("email").notNull().unique(),

    /** Encrypted password hash */
    passwordHash: text("password_hash").notNull(),

    /** Display name / business owner name */
    name: text("name"),

    /** Phone number (E.164 format, optional) */
    phone: text("phone"),

    /** Current plan tier */
    plan: planEnum("plan").notNull().default("free"),

    /** Account created timestamp */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    /** Last account update timestamp */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    /** Soft delete support */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    /** 차단 시각(설정되면 차단 상태). 해제 = null. */
    blockedAt: timestamp("blocked_at", { withTimezone: true }),

    /** 강제 로그아웃 기준 시각 — 이 시각 이전 발급 세션 토큰 거부. null이면 미적용. */
    sessionsRevokedAt: timestamp("sessions_revoked_at", { withTimezone: true }),
  },
  (t) => [
    /** Index for email lookups (auth) */
    index("accounts_email_idx").on(t.email),
    /** Index for plan-based queries */
    index("accounts_plan_idx").on(t.plan),
    /** Index for active accounts (soft delete) */
    index("accounts_deleted_at_idx").on(t.deletedAt),
    /** 차단 회원 필터용 */
    index("accounts_blocked_at_idx").on(t.blockedAt),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
