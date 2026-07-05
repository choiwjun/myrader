// @TASK P2-R1 - business 확정 ↔ DB 통합 (실 Postgres, 외부호출 0)
// @SPEC docs/planning/04-database-design.md#business-table
// @SPEC specs/screens/store-finder.yaml (후보 확정 → businesses 행)
//
// confirmBusiness → businesses 행이 실제 Postgres 에 생성되는지(UUID v4 id, placeUrl↔
// naverPlaceId, websiteUrl↔homepageUrl 매핑)를 검증한다. DATABASE_URL 없으면 스킵.
// 네이버 검색은 호출하지 않는다(확정 경로만) — 실 외부호출 0.

import { createDb } from "@boina/db/client";
import { accounts, businesses } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbBusinessRepository } from "../../lib/business/business-repository.js";
import { confirmBusiness, getBusinessView } from "../../lib/business/business-service.js";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstOrThrow<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (!row) throw new Error(`expected at least one ${label} row`);
  return row;
}

describeDb("business 확정 ↔ DB 통합 (P2-R1, 실 Postgres)", () => {
  let db: ReturnType<typeof createDb>;
  let accountId: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const acc = firstOrThrow(
      await db
        .insert(accounts)
        .values({ email: `p2r1-${suffix}@example.com`, passwordHash: "x" })
        .returning({ id: accounts.id }),
      "account",
    );
    accountId = acc.id;
  });

  afterAll(async () => {
    if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it("confirmBusiness → businesses 행 생성 (UUID v4 + placeUrl/websiteUrl 매핑)", async () => {
    const repo = createDbBusinessRepository(db);
    const view = await confirmBusiness(repo, {
      accountId,
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/7654321",
        name: "통합테스트 가게",
        address: "서울 마포구 양화로 200",
        category: "한식",
      },
      websiteUrl: "https://itest.example.com",
      region: "서울 마포구",
    });

    // id 는 DB defaultRandom 이 생성한 RFC 4122 UUID v4.
    expect(view.id).toMatch(UUID_V4);
    expect(view.placeUrl).toBe("https://place.naver.com/restaurant/7654321");
    expect(view.websiteUrl).toBe("https://itest.example.com");

    // 실제 행 컬럼 매핑 확인.
    const row = firstOrThrow(
      await db
        .select({
          name: businesses.name,
          region: businesses.region,
          naverPlaceId: businesses.naverPlaceId,
          homepageUrl: businesses.homepageUrl,
          accountId: businesses.accountId,
        })
        .from(businesses)
        .where(eq(businesses.id, view.id)),
      "business",
    );
    expect(row.name).toBe("통합테스트 가게");
    expect(row.region).toBe("서울 마포구");
    expect(row.naverPlaceId).toBe("7654321");
    expect(row.homepageUrl).toBe("https://itest.example.com");
    expect(row.accountId).toBe(accountId);

    // 조회 뷰: placeUrl 복원(저장 행 기반).
    const reloaded = await getBusinessView(repo, view.id);
    expect(reloaded?.placeUrl).toBe("https://place.naver.com/restaurant/7654321");
  });

  it("익명 진단: accountId 없이 확정 → account_id NULL 행 생성 (S1 auth:false, AC-1)", async () => {
    // Phase2 핵심: 미인증 사장님이 가게를 확정해 진단을 시작할 수 있어야 한다.
    // account_id 가 NOT NULL 이면 여기서 FK/NOT NULL 위반으로 throw → RED.
    const repo = createDbBusinessRepository(db);
    const view = await confirmBusiness(repo, {
      // accountId 미전달 — 익명.
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/9119119",
        name: "익명진단가게",
        address: "서울 강남구 테헤란로 1",
        category: "카페",
      },
      region: "서울 강남구",
    });
    expect(view.id).toMatch(UUID_V4);

    const row = firstOrThrow(
      await db
        .select({ accountId: businesses.accountId, name: businesses.name })
        .from(businesses)
        .where(eq(businesses.id, view.id)),
      "business",
    );
    expect(row.name).toBe("익명진단가게");
    // 익명 — account 에 귀속되지 않음.
    expect(row.accountId).toBeNull();

    // 정리(afterAll 의 account cascade 와 무관한 익명 행 — 명시 삭제).
    await db.delete(businesses).where(eq(businesses.id, view.id));
  });

  it("websiteUrl 없이 확정 → homepage_url NULL (홈페이지 선택)", async () => {
    const repo = createDbBusinessRepository(db);
    const view = await confirmBusiness(repo, {
      accountId,
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/5550000",
        name: "노홈페이지 가게",
        address: "서울 은평구 1",
        category: "분식",
      },
      region: "서울 은평구",
    });
    expect(view.id).toMatch(UUID_V4);
    expect(view.websiteUrl).toBeNull();

    const row = firstOrThrow(
      await db
        .select({ homepageUrl: businesses.homepageUrl })
        .from(businesses)
        .where(eq(businesses.id, view.id)),
      "business",
    );
    expect(row.homepageUrl).toBeNull();
  });
});
