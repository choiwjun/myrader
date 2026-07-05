// @TASK BIZ-FIX - business 재확정 멱등 (같은 naver_place_id 재진단 시 500 금지)
// @SPEC packages/db/src/schema/business.ts (naver_place_id UNIQUE — 스키마 유지)
// @SPEC docs/planning/07-coding-convention.md §2 (앱 레이어 멱등 처리)
// @TEST apps/web/tests/business/business-idempotent.test.ts
//
// 버그 2 회귀 가드: 같은 가게(같은 naver_place_id)로 confirmBusiness 를 다시 호출하면
// UNIQUE 제약(businesses_naver_place_id_unique) 위반으로 500 이 났다.
// 근본 수정(앱 레이어 멱등): findByNaverPlaceId → 있으면 기존 행 재사용, 없으면 insert.
// DB 스키마(UNIQUE)는 유지한다. 익명(account_id null) 행도 안전.

import { describe, expect, it } from "vitest";
import {
  type BusinessRecord,
  type BusinessRepository,
  type CreateBusinessInput,
  confirmBusiness,
} from "../../lib/business/business-service.js";

/**
 * UNIQUE(naver_place_id) 를 흉내내는 인메모리 repo.
 * create 가 멱등이 아니면 같은 naverPlaceId 두 번째 insert 에서 throw → RED.
 */
function makeUniqueFakeRepo(): BusinessRepository & {
  rows: Map<string, BusinessRecord>;
  createCalls: number;
} {
  const rows = new Map<string, BusinessRecord>();
  let seq = 0;
  const repo = {
    rows,
    createCalls: 0,
    async create(input: CreateBusinessInput): Promise<BusinessRecord> {
      repo.createCalls += 1;
      // UNIQUE(naver_place_id) 모사 — 동일 placeId 이미 있으면 insert 거부(실 DB 동형).
      if (input.naverPlaceId) {
        for (const r of rows.values()) {
          if (r.naverPlaceId === input.naverPlaceId) {
            throw new Error(
              'duplicate key value violates unique constraint "businesses_naver_place_id_unique"',
            );
          }
        }
      }
      const id = `00000000-0000-4000-8000-${String(seq++).padStart(12, "0")}`;
      const now = new Date();
      const rec: BusinessRecord = {
        id,
        accountId: input.accountId ?? null,
        name: input.name,
        category: input.category ?? null,
        region: input.region ?? null,
        naverPlaceId: input.naverPlaceId ?? null,
        homepageUrl: input.homepageUrl ?? null,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(id, rec);
      return rec;
    },
    async findById(id: string): Promise<BusinessRecord | null> {
      return rows.get(id) ?? null;
    },
    async findByNaverPlaceId(naverPlaceId: string): Promise<BusinessRecord | null> {
      for (const r of rows.values()) {
        if (r.naverPlaceId === naverPlaceId) return r;
      }
      return null;
    },
    async findLatestByAccountId(accountId: string): Promise<BusinessRecord | null> {
      let latest: BusinessRecord | null = null;
      for (const r of rows.values()) {
        if (r.accountId !== accountId) continue;
        if (!latest || r.createdAt >= latest.createdAt) latest = r;
      }
      return latest;
    },
  };
  return repo;
}

const PLACE = "https://place.naver.com/restaurant/1234567";

describe("confirmBusiness — 재확정 멱등(같은 naver_place_id 500 금지)", () => {
  it("같은 가게를 두 번 확정해도 throw 하지 않고 같은 business 를 돌려준다", async () => {
    const repo = makeUniqueFakeRepo();
    const input = {
      candidate: {
        placeUrl: PLACE,
        name: "한신포차 마포점",
        address: "서울 마포구 양화로 100",
        category: "한식",
      },
      region: "서울 마포구",
    };

    const first = await confirmBusiness(repo, input);
    // 재진단/더블서밋 — 두 번째 호출이 500 없이 같은 business 를 돌려줘야 한다.
    const second = await confirmBusiness(repo, input);

    expect(first.id).toBeTruthy();
    expect(second.id).toBe(first.id); // 기존 행 재사용(중복 행 생성 0).
    expect(repo.rows.size).toBe(1); // businesses 행은 하나뿐(멱등).
  });

  it("익명(account_id null) 행도 재확정 멱등 — 500 없이 기존 행 반환", async () => {
    const repo = makeUniqueFakeRepo();
    const input = {
      accountId: null,
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/9090909",
        name: "익명가게",
        address: "서울 강남구 1",
        category: "카페",
      },
      region: "서울 강남구",
    };
    const a = await confirmBusiness(repo, input);
    const b = await confirmBusiness(repo, input);
    expect(b.id).toBe(a.id);
    expect(repo.rows.size).toBe(1);
  });

  it("placeId 가 다른 가게는 별도 행으로 생성된다(멱등이 신규 생성을 막지 않음)", async () => {
    const repo = makeUniqueFakeRepo();
    const a = await confirmBusiness(repo, {
      candidate: { placeUrl: PLACE, name: "가게A", address: "주소", category: "한식" },
      region: "서울",
    });
    const b = await confirmBusiness(repo, {
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/7777777",
        name: "가게B",
        address: "주소",
        category: "분식",
      },
      region: "서울",
    });
    expect(a.id).not.toBe(b.id);
    expect(repo.rows.size).toBe(2);
  });
});
