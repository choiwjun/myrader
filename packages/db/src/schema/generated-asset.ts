/**
 * @TASK P0-T2 - GeneratedAsset 테이블 정의
 * @SPEC docs/planning/04-database-design.md#generated-asset-table
 *
 * generated_asset table — 생성물 (스니펫/소개글/리뷰문구/처방전 이메일)
 *
 * 개념: x-sag snippets 저장 방식을 차용하되, DB `type` 컬럼은 엔진 enum
 * (LOCAL_BUSINESS/ORGANIZATION/SERVICE/FAQ_HTML...)을 그대로 저장한다.
 * 앱 레이어가 이를 snippet/place_intro/review_request/vendor_prescription으로 복원한다.
 *
 * REQ-006: 생성물 타입과 액션 클래스(🟢🟡🔴⏳) 저장.
 */

import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  actionTierEnum,
  codeFormatEnum,
  generatedAssetStatusEnum,
  generatedAssetTypeEnum,
  generatedByEnum,
} from "../enums.js";
import { diagnoses } from "./diagnosis.js";

interface UserEdits {
  [key: string]: unknown;
}

export const generatedAssets = pgTable(
  "generated_assets",
  {
    /** UUID v4 primary key */
    id: uuid("id").primaryKey().defaultRandom(),

    /** Diagnosis reference */
    diagnosisId: uuid("diagnosis_id")
      .notNull()
      .references(() => diagnoses.id, { onDelete: "cascade" }),

    /**
     * Engine-level stored type: LOCAL_BUSINESS, ORGANIZATION, SERVICE, FAQ_SCHEMA,
     * BREADCRUMB, LLMS_TXT, FAQ_HTML. Product-facing asset names are restored in app code.
     */
    type: generatedAssetTypeEnum("type").notNull(),

    /**
     * Generated code/content
     * 길이는 가변적이지만, 일반적으로 JSON-LD는 1KB~10KB 범위
     */
    code: text("code").notNull(),

    /** Code format: json-ld, html, text, other */
    codeFormat: codeFormatEnum("code_format").notNull().default("json-ld"),

    /**
     * User's manual edits (JSON diff or override map)
     * 재생성 시 사용자 수정사항을 병합
     */
    userEdits: jsonb("user_edits").$type<UserEdits>(),

    /**
     * Generation method: rule, ai, hybrid
     * rule = 규칙 기반 생성
     * ai = AI 생성
     * hybrid = 규칙 + AI 조합
     */
    generatedBy: generatedByEnum("generated_by").notNull().default("rule"),

    /** AI model name (if generatedBy = 'ai' or 'hybrid') */
    aiModel: text("ai_model"),

    /**
     * Asset status: draft, published, archived
     * draft = 아직 확인 안 함
     * published = 사용자 승인 후 실제 적용 대기
     * archived = 폐기/버전 업데이트로 인해 더 이상 사용 안 함
     */
    status: generatedAssetStatusEnum("status").notNull().default("draft"),

    /**
     * 같은 (diagnosisId, type)에 대해 최신 버전만 true
     * 이전 버전은 false로 유지 (감사 추적)
     */
    isLatest: boolean("is_latest").notNull().default(true),

    /**
     * Action tier / urgency (from diagnosis action classification)
     * high=🔴 urgent, medium=🟡 moderate, low=🟢 optional, waiting=⏳ pending
     */
    actionTier: actionTierEnum("action_tier"),

    /** Created timestamp */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    /** Last update timestamp */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Index for diagnosis-based asset queries */
    index("generated_assets_diagnosis_id_idx").on(t.diagnosisId),
    /** Index for type-based filtering */
    index("generated_assets_type_idx").on(t.type),
    /** Composite index for finding latest assets per type */
    index("generated_assets_diagnosis_type_is_latest_idx").on(t.diagnosisId, t.type, t.isLatest),
    /** Index for status filtering */
    index("generated_assets_status_idx").on(t.status),
  ],
);

export type GeneratedAsset = typeof generatedAssets.$inferSelect;
export type NewGeneratedAsset = typeof generatedAssets.$inferInsert;
