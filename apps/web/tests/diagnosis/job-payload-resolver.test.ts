// @TASK 수정R2-A-1 - cross-process 페이로드 복원 테스트 (diagnoses+businesses → 잡 payload)
// @SPEC apps/web/lib/diagnosis/job-payload-resolver.ts
// @TEST apps/web/tests/diagnosis/job-payload-resolver.test.ts
//
// docker PG 로 실 행을 만들고 복원 payload 가 저장 원문 우선 / legacy fallback 순으로 구성되는지 검증한다.

import { createDb } from "@boina/db/client";
import { accounts, businesses, diagnoses } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveDiagnosisJobPayload } from "../../lib/diagnosis/job-payload-resolver.js";
import { buildDiagnosisJobPayload } from "../../lib/diagnosis/job-payload.js";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

function firstOrThrow<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (!row) throw new Error(`expected at least one ${label} row`);
  return row;
}

describeDb("resolveDiagnosisJobPayload (수정R2-A-1 cross-process 복구)", () => {
  let db: ReturnType<typeof createDb>;
  let accountId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const acc = firstOrThrow(
      await db
        .insert(accounts)
        .values({ email: `resolver-${Date.now()}@example.com`, passwordHash: "x" })
        .returning({ id: accounts.id }),
      "account",
    );
    accountId = acc.id;
  });

  afterAll(async () => {
    if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  async function makeDiagnosis(bizValues: {
    name: string;
    category?: string;
    region?: string;
    homepageUrl?: string;
    naverPlaceId?: string;
    jobPayload?: Record<string, unknown>;
    jobType?: string;
  }): Promise<{ diagnosisId: string; businessId: string }> {
    const biz = firstOrThrow(
      await db
        .insert(businesses)
        .values({
          accountId,
          name: bizValues.name,
          ...(bizValues.category ? { category: bizValues.category } : {}),
          ...(bizValues.region ? { region: bizValues.region } : {}),
          ...(bizValues.homepageUrl ? { homepageUrl: bizValues.homepageUrl } : {}),
          ...(bizValues.naverPlaceId ? { naverPlaceId: bizValues.naverPlaceId } : {}),
        })
        .returning({ id: businesses.id }),
      "business",
    );
    const diag = firstOrThrow(
      await db
        .insert(diagnoses)
        .values({
          businessId: biz.id,
          status: "queued",
          ...(bizValues.jobPayload ? { jobPayload: bizValues.jobPayload } : {}),
          ...(bizValues.jobType ? { jobType: bizValues.jobType } : {}),
        })
        .returning({ id: diagnoses.id }),
      "diagnosis",
    );
    return { diagnosisId: diag.id, businessId: biz.id };
  }

  it("stored job_payload 가 있으면 원문을 그대로 복원한다", async () => {
    const created = await makeDiagnosis({
      name: "저장우선가게",
      category: "카페",
      region: "서울 마포구",
      homepageUrl: "https://saved.example.com",
      naverPlaceId: "7654321",
    });
    const storedPayload = buildDiagnosisJobPayload({
      diagnosisId: created.diagnosisId,
      business: {
        id: created.businessId,
        homepageUrl: "https://saved.example.com",
        naverPlaceId: "7654321",
      },
      businessProfile: {
        businessName: "저장우선가게",
        industry: "카페",
        region: "서울 마포구",
        mainServices: ["브런치", "커피"],
        targetKeywords: ["합정 카페"],
      },
      modules: ["seo", "geo"],
      requestLlmValidation: true,
      competitorUrls: ["https://competitor.example.com"],
      fallbackTarget: "https://place.naver.com/restaurant/7654321",
      fallbackSourceType: "naver_place",
    });

    await db
      .update(diagnoses)
      .set({ jobType: "diagnosis", jobPayload: storedPayload })
      .where(eq(diagnoses.id, created.diagnosisId));

    const resolved = await resolveDiagnosisJobPayload(db, created.diagnosisId, "diagnosis");
    expect(resolved).toEqual({ type: "diagnosis", payload: storedPayload });
  });

  it("legacy 행: homepageUrl 있으면 website target 으로 fallback 복원한다", async () => {
    const created = await makeDiagnosis({
      name: "홈피가게",
      category: "베이커리",
      region: "서울 마포구",
      homepageUrl: "https://myshop.example",
    });
    const resolved = await resolveDiagnosisJobPayload(db, created.diagnosisId, "diagnosis");
    expect(resolved).not.toBeNull();
    expect(resolved?.type).toBe("diagnosis");
    expect(resolved?.payload.diagnosisId).toBe(created.diagnosisId);
    expect(resolved?.payload.target).toBe("https://myshop.example");
    expect(resolved?.payload.sourceType).toBe("website");
    expect(resolved?.payload.businessProfile.businessName).toBe("홈피가게");
    expect(resolved?.payload.businessProfile.region).toBe("서울 마포구");
    expect(resolved?.payload.businessProfile.industry).toBe("베이커리");
  });

  it("legacy 행: homepageUrl 없고 naverPlaceId 있으면 place target 으로 fallback 복원한다", async () => {
    const created = await makeDiagnosis({ name: "플레이스가게", naverPlaceId: "7654321" });
    const resolved = await resolveDiagnosisJobPayload(db, created.diagnosisId, "diagnosis");
    expect(resolved?.payload.sourceType).toBe("naver_place");
    expect(resolved?.payload.target).toBe("https://place.naver.com/restaurant/7654321");
  });

  it("legacy 행: homepageUrl/placeId 모두 없으면 이름 기반 네이버 검색 target 으로 fallback 복원한다", async () => {
    const created = await makeDiagnosis({ name: "검색가게" });
    const resolved = await resolveDiagnosisJobPayload(db, created.diagnosisId, "diagnosis");
    expect(resolved?.payload.sourceType).toBe("naver_place");
    expect(resolved?.payload.target).toContain("search.naver.com");
    expect(resolved?.payload.businessProfile.region).toBe("전국");
    expect(resolved?.payload.requestLlmValidation).toBe(false);
  });

  it("존재하지 않는 diagnosisId → null(복원 불가)", async () => {
    const resolved = await resolveDiagnosisJobPayload(
      db,
      "00000000-0000-4000-8000-000000000000",
      "diagnosis",
    );
    expect(resolved).toBeNull();
  });
});
