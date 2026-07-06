// @TASK P2-R1 - business 저장소 (Drizzle/@boina/db 구현)
// @SPEC docs/planning/07-coding-convention.md §2 (앱↔DB 서비스 레이어 경유)
// @SPEC packages/db/src/schema/business.ts (businesses 테이블 — 구조 변경 금지, import만)
//
// BusinessRepository 의 Postgres 구현. 모든 쿼리는 eq() 파라미터 바인딩 —
// 문자열 보간 쿼리 금지(SQL Injection 방지, Guardrails). id 는 DB defaultRandom()
// (UUID v4) 가 생성 — 앱에서 만들지 않는다(.claude/constitutions/common/uuid.md).

import { type DbClient, createDb } from "@boina/db/client";
import { businesses } from "@boina/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { BusinessRecord, BusinessRepository } from "./business-service.js";

/** businesses 행(Drizzle select) → 앱 BusinessRecord 매핑. */
function toRecord(row: {
  id: string;
  accountId: string | null;
  name: string;
  category: string | null;
  region: string | null;
  naverPlaceId: string | null;
  homepageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}): BusinessRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    category: row.category,
    region: row.region,
    naverPlaceId: row.naverPlaceId,
    homepageUrl: row.homepageUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** @boina/db(Drizzle/Postgres) 기반 BusinessRepository 구현. */
export function createDbBusinessRepository(db: DbClient): BusinessRepository {
  return {
    async create({ accountId, name, category, region, naverPlaceId, homepageUrl }) {
      const [row] = await db
        .insert(businesses)
        .values({
          // 익명 진단(S1 auth:false) — accountId 없으면 null(account_id 컬럼 nullable).
          accountId: accountId ?? null,
          name,
          category: category ?? null, // 업종(네이버 후보 — 있으면 저장)(#4).
          region: region ?? null,
          naverPlaceId: naverPlaceId ?? null,
          homepageUrl: homepageUrl ?? null,
        })
        .returning();
      if (!row) throw new Error("business insert failed");
      return toRecord(row);
    },

    async update(id, patch) {
      const [row] = await db
        .update(businesses)
        .set({
          ...(patch.name !== undefined ? { name: patch.name ?? "" } : {}),
          ...(patch.category !== undefined ? { category: patch.category } : {}),
          ...(patch.region !== undefined ? { region: patch.region } : {}),
          ...(patch.naverPlaceId !== undefined ? { naverPlaceId: patch.naverPlaceId } : {}),
          ...(patch.homepageUrl !== undefined ? { homepageUrl: patch.homepageUrl } : {}),
          updatedAt: new Date(),
        })
        .where(eq(businesses.id, id))
        .returning();
      if (!row || row.deletedAt) throw new Error("business update failed");
      return toRecord(row);
    },

    async findById(id) {
      const [row] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
      if (!row || row.deletedAt) return null;
      return toRecord(row);
    },

    async findByNaverPlaceId(naverPlaceId) {
      // 재확정 멱등용 — naver_place_id 는 UNIQUE 라 최대 1행. eq() 파라미터 바인딩(SQL Injection 0).
      const [row] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.naverPlaceId, naverPlaceId))
        .limit(1);
      if (!row || row.deletedAt) return null;
      return toRecord(row);
    },

    async findLatestByAccountId(accountId) {
      // 헤더 가게명(#2) — 계정의 활성 가게 중 가장 최근 1건. and()/eq()/isNull() 파라미터 바인딩.
      const [row] = await db
        .select()
        .from(businesses)
        .where(and(eq(businesses.accountId, accountId), isNull(businesses.deletedAt)))
        .orderBy(desc(businesses.createdAt))
        .limit(1);
      if (!row) return null;
      return toRecord(row);
    },
  };
}

/** 기본 repository 를 DATABASE_URL 로 생성한다(route 진입점에서 사용). */
export function getDefaultBusinessRepository(): BusinessRepository {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db: DbClient = createDb(url);
  return createDbBusinessRepository(db);
}
