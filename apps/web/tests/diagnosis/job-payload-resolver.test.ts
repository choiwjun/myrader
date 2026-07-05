// @TASK 수정R2-A-1 - cross-process 페이로드 복원 테스트 (diagnoses+businesses → 잡 payload)
// @SPEC apps/web/lib/diagnosis/job-payload-resolver.ts
// @TEST apps/web/tests/diagnosis/job-payload-resolver.test.ts
//
// docker PG 로 실 행을 만들고 복원 payload 가 businesses 실데이터로 구성되는지 검증한다.

import { createDb } from "@boina/db/client";
import { accounts, businesses, diagnoses } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveDiagnosisJobPayload } from "../../lib/diagnosis/job-payload-resolver.js";

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
    region?: string;
    homepageUrl?: string;
  }): Promise<string> {
    const biz = firstOrThrow(
      await db
        .insert(businesses)
        .values({ accountId, ...bizValues })
        .returning({ id: businesses.id }),
      "business",
    );
    const diag = firstOrThrow(
      await db.insert(diagnoses).values({ businessId: biz.id, status: "queued" }).returning({
        id: diagnoses.id,
      }),
      "diagnosis",
    );
    return diag.id;
  }

  it("homepageUrl 있으면 website target 으로 복원한다", async () => {
    const id = await makeDiagnosis({
      name: "홈피가게",
      region: "서울 마포구",
      homepageUrl: "https://myshop.example",
    });
    const resolved = await resolveDiagnosisJobPayload(db, id, "diagnosis");
    expect(resolved).not.toBeNull();
    expect(resolved?.type).toBe("diagnosis");
    expect(resolved?.payload.diagnosisId).toBe(id);
    expect(resolved?.payload.target).toBe("https://myshop.example");
    expect(resolved?.payload.sourceType).toBe("website");
    expect(resolved?.payload.businessProfile.businessName).toBe("홈피가게");
    expect(resolved?.payload.businessProfile.region).toBe("서울 마포구");
  });

  it("homepageUrl 없으면 이름 기반 네이버 검색 target(naver_place)으로 복원한다", async () => {
    const id = await makeDiagnosis({ name: "검색가게" });
    const resolved = await resolveDiagnosisJobPayload(db, id, "diagnosis");
    expect(resolved?.payload.sourceType).toBe("naver_place");
    expect(resolved?.payload.target).toContain("search.naver.com");
    // region 미설정 → 보수적 기본 "전국".
    expect(resolved?.payload.businessProfile.region).toBe("전국");
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
