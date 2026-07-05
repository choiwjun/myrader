/**
 * @TASK P0-T2 - Business 테이블 정의
 * @SPEC docs/planning/04-database-design.md#business-table
 *
 * business table — Account 내 진단 대상 가게/사업체
 *
 * REQ-001 기반: 네이버 플레이스로 식별하되, homepage_url은 선택사항.
 * account와 1:N 관계 (한 사용자 여러 가게 진단 가능).
 */

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accounts } from "./account.js";

export const businesses = pgTable(
  "businesses",
  {
    /** UUID v4 primary key */
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Account (owner) reference — NULLABLE (익명 진단 허용).
     *
     * [ADR] 익명 진단 정합(S1 auth:false / 01-prd AC-1 "이름 한 칸으로 진단 시작"):
     * 미인증 사장님이 가게를 확정해 진단을 시작할 수 있어야 하므로 account_id 를
     * nullable 로 둔다. 진단 시작은 익명, 결제(P3)·설정(S7)에서 세션 account 로 귀속한다.
     * 04-database-design 은 business 가 user 에 귀속되나, "진단 시작 = 익명"이 03-user-flow
     * (S1 공개)·AC-1 의 요구이므로 본 nullable 화는 발명이 아닌 흐름 정합 구현이다.
     * (다른 컬럼/테이블 구조 변경 없음 — account_id nullable 단일 변경.)
     */
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),

    /** Business/store name */
    name: text("name").notNull(),

    /**
     * 업종(자유 텍스트) — 네이버 후보의 업종 문자열(예: "한식", "카페").
     *
     * ⚠️ 엔진 categoryEnum(seo/aeo/geo/a11y/backlink/perf)과 무관 — 그 enum 절대 사용 금지.
     * S7 설정에서 사장님이 업종을 확인/수정할 수 있도록 자유 텍스트로 둔다(없으면 null).
     */
    category: text("category"),

    /** Region/area (e.g., "서울 강남구") */
    region: text("region"),

    /**
     * Naver Place ID — unique identifier for this business location
     * e.g., "23456789" from naver.com/place/23456789
     */
    naverPlaceId: text("naver_place_id").unique(),

    /** Homepage URL (optional) */
    homepageUrl: text("homepage_url"),

    /** Business created timestamp */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    /** Last update timestamp */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    /** Soft delete support */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    /** Index for account-based queries */
    index("businesses_account_id_idx").on(t.accountId),
    /** Index for Naver Place lookups */
    index("businesses_naver_place_id_idx").on(t.naverPlaceId),
    /** Index for active businesses */
    index("businesses_deleted_at_idx").on(t.deletedAt),
  ],
);

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
