/**
 * @TASK P0-T2 - Action 테이블 정의
 * @SPEC docs/planning/04-database-design.md#action-table
 *
 * action table — 행동 완료 기록 (4분류·"오늘 딱 하나" 실행 추적)
 *
 * 개념: x-sag의 action_completions를 차용하되, boina에서는
 * 행동 실행률 추적 및 "오늘 딱 하나" 성공지표 관리.
 *
 * REQ-005 + 성공지표: 사용자가 진단 후 실제로 액션 수행했는지 기록.
 * action_class (🟢🟡🔴⏳) + is_today_one으로 우선순위 추적.
 */

import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { actionTierEnum } from "../enums.js";
import { diagnoses } from "./diagnosis.js";

export const actions = pgTable(
  "actions",
  {
    /** UUID v4 primary key */
    id: uuid("id").primaryKey().defaultRandom(),

    /** Diagnosis reference */
    diagnosisId: uuid("diagnosis_id")
      .notNull()
      .references(() => diagnoses.id, { onDelete: "cascade" }),

    /**
     * Action reference (link to engine_result.id or generated_asset.id)
     * 유연성을 위해 text로 저장 (UUID format, but flexible reference)
     */
    actionRef: text("action_ref").notNull(),

    /**
     * Action tier / urgency: high(🔴), medium(🟡), low(🟢), waiting(⏳)
     * 화면에서 신호등으로 표현 (07 정직성 원칙)
     */
    actionTier: actionTierEnum("action_tier").notNull().default("low"),

    /**
     * Whether this is the "오늘 딱 하나" (today's one action)
     * true = 오늘의 추천 액션
     * false = 나머지 백로그
     *
     * 성공지표: 사용자가 is_today_one=true인 액션을 실제로 수행했는지 추적
     */
    isTodayOne: boolean("is_today_one").notNull().default(false),

    /**
     * Completion status: null = pending, true = completed, false = not needed/abandoned
     */
    isCompleted: boolean("is_completed"),

    /** When the action was completed (if isCompleted = true) */
    completedAt: timestamp("completed_at", { withTimezone: true }),

    /** Action created timestamp */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    /** Last update timestamp */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Index for diagnosis-based action queries */
    index("actions_diagnosis_id_idx").on(t.diagnosisId),
    /** Index for filtering today's one action */
    index("actions_is_today_one_idx").on(t.isTodayOne),
    /** Index for filtering pending/completed actions */
    index("actions_is_completed_idx").on(t.isCompleted),
    /** Composite index for diagnosis + tier */
    index("actions_diagnosis_tier_idx").on(t.diagnosisId, t.actionTier),
  ],
);

export type Action = typeof actions.$inferSelect;
export type NewAction = typeof actions.$inferInsert;
