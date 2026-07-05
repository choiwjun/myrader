/**
 * @TASK P0-T2 - GapRow 테이블 정의
 * @SPEC docs/planning/04-database-design.md#gap-row-table
 *
 * gap_row table — 역공학 갭 분석 한 줄 (경쟁사 보유 vs 내 갭)
 *
 * 개념: x-sag의 gap 분석 구조를 차용하되, boina에서는
 * 각 갭을 독립적인 액션으로 저장하여 우선순위 관리 용이하게.
 *
 * REQ-004 매트릭스: 행(항목) × 열(경쟁사 보유/내갭) 표현,
 * DB에는 각 셀을 개별 row로 저장 (정규화).
 */

import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { gapActionTierEnum } from "../enums.js";
import { competitors } from "./competitor.js";

export const gapRows = pgTable(
  "gap_rows",
  {
    /** UUID v4 primary key */
    id: uuid("id").primaryKey().defaultRandom(),

    /** Competitor reference (이 갭의 대상 경쟁사) */
    competitorId: uuid("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),

    /** Gap item / aspect name (e.g., "FAQpage schema") */
    item: text("item").notNull(),

    /**
     * Whether competitor has this item (경쟁사 보유 여부)
     * true = 경쟁사는 이미 갖고 있음 (내가 구현하면 따라잡음)
     */
    competitorHas: boolean("competitor_has").notNull().default(false),

    /**
     * Whether this is a gap for me (내 갭 여부)
     * true = 나는 아직 이것을 구현하지 않음 (해야 할 일)
     */
    isMyGap: boolean("is_my_gap").notNull().default(false),

    /** Description / recommendation */
    description: text("description"),

    /**
     * Action tier (도메인 GapActionTier) — 영속화→읽기 왕복에서 action 4분류(🟢🟡🔴⏳) 보존.
     *
     * gap-service 가 엔진 actionType 으로부터 도출한 actionTier(self_fix/snippet/vendor/ongoing)를
     * 그대로 저장한다. 읽기 경로(deriveGapViewFromPersisted)가 이 값을 복원해 S4 갭 배지와
     * S5 행동 4분류가 모두 정상화된다(default self_fix — 미지정 레거시 행은 직접건으로 본다).
     */
    actionTier: gapActionTierEnum("action_tier").notNull().default("self_fix"),

    /** Created timestamp */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Index for competitor-based gap queries */
    index("gap_rows_competitor_id_idx").on(t.competitorId),
    /** Index for filtering my gaps (isMyGap = true) */
    index("gap_rows_is_my_gap_idx").on(t.isMyGap),
  ],
);

export type GapRow = typeof gapRows.$inferSelect;
export type NewGapRow = typeof gapRows.$inferInsert;
