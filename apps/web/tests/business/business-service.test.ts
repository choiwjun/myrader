// @TASK P2-R1 - business 리소스 서비스 단위 테스트 (RED→GREEN)
// @SPEC specs/domain/resources.yaml#business (id, name, category, region, placeUrl, websiteUrl)
// @SPEC docs/planning/04-database-design.md#business-table (불변 스키마: naverPlaceId/homepageUrl)
// @SPEC specs/screens/store-finder.yaml#candidate_list (후보 확정 → business)
//
// 후보 확정 → businesses 행 생성(UUID v4). DB-agnostic 코어 + fake repo (실 DB·외부호출 0).
// placeUrl ↔ naverPlaceId, websiteUrl ↔ homepageUrl 매핑(스키마 불변).

import { describe, expect, it } from "vitest";
import {
  type BusinessRecord,
  type BusinessRepository,
  confirmBusiness,
  extractNaverPlaceId,
  getBusinessView,
  placeUrlFromNaverPlaceId,
} from "../../lib/business/business-service.js";

/** 테스트용 인메모리 BusinessRepository (실 DB 미접근, UUID v4 id 생성). */
function makeFakeRepo(): BusinessRepository & { rows: Map<string, BusinessRecord> } {
  const rows = new Map<string, BusinessRecord>();
  let seq = 0;
  return {
    rows,
    async create(input) {
      const id = `00000000-0000-4000-8000-${String(seq++).padStart(12, "0")}`;
      const now = new Date();
      const rec: BusinessRecord = {
        id,
        // 익명 진단(accountId 미전달/null) → null 로 정규화(실 repo 와 동형).
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
    async update(id, patch) {
      const current = rows.get(id);
      if (!current) throw new Error("missing business");
      const next: BusinessRecord = {
        ...current,
        ...(patch.name !== undefined ? { name: patch.name ?? "" } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.region !== undefined ? { region: patch.region } : {}),
        ...(patch.naverPlaceId !== undefined ? { naverPlaceId: patch.naverPlaceId } : {}),
        ...(patch.homepageUrl !== undefined ? { homepageUrl: patch.homepageUrl } : {}),
        updatedAt: new Date(),
      };
      rows.set(id, next);
      return next;
    },

    async findById(id) {
      return rows.get(id) ?? null;
    },
    async findByNaverPlaceId(naverPlaceId) {
      for (const r of rows.values()) {
        if (r.naverPlaceId === naverPlaceId) return r;
      }
      return null;
    },
    async findLatestByAccountId(accountId) {
      let latest: BusinessRecord | null = null;
      for (const r of rows.values()) {
        if (r.accountId !== accountId) continue;
        if (!latest || r.createdAt >= latest.createdAt) latest = r;
      }
      return latest;
    },
  };
}

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

describe("business 서비스 (P2-R1)", () => {
  it("extractNaverPlaceId: placeUrl 에서 네이버 place id 를 뽑는다", () => {
    expect(extractNaverPlaceId("https://place.naver.com/restaurant/1234567")).toBe("1234567");
    expect(extractNaverPlaceId("https://place.naver.com/place/98765?x=1")).toBe("98765");
    expect(extractNaverPlaceId("https://example.com/no-id")).toBeNull();
  });

  it("placeUrlFromNaverPlaceId: naverPlaceId → 표준 place URL 복원 (왕복)", () => {
    const url = "https://place.naver.com/restaurant/1234567";
    const id = extractNaverPlaceId(url);
    expect(id).toBe("1234567");
    expect(placeUrlFromNaverPlaceId(id)).toBe("https://place.naver.com/restaurant/1234567");
    expect(placeUrlFromNaverPlaceId(null)).toBeNull();
  });

  it("confirmBusiness: 후보 확정 → businesses 행 생성 (UUID v4 id, DB 가 생성)", async () => {
    const repo = makeFakeRepo();
    const view = await confirmBusiness(repo, {
      accountId: ACCOUNT_ID,
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/1234567",
        name: "한신포차 마포점",
        address: "서울 마포구 양화로 100",
        category: "한식",
      },
      websiteUrl: "https://hansin.example.com",
      region: "서울 마포구",
    });

    // UUID v4 형식 (앱이 아닌 DB defaultRandom 이 생성).
    expect(view.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    // resources.yaml#business 6필드 노출.
    expect(view.name).toBe("한신포차 마포점");
    expect(view.region).toBe("서울 마포구");
    expect(view.placeUrl).toBe("https://place.naver.com/restaurant/1234567");
    expect(view.websiteUrl).toBe("https://hansin.example.com");
    expect(view.category).toBe("한식");

    // 실제 저장은 스키마 컬럼만 (naverPlaceId/homepageUrl 매핑).
    const stored = repo.rows.get(view.id);
    expect(stored?.naverPlaceId).toBe("1234567");
    expect(stored?.homepageUrl).toBe("https://hansin.example.com");
  });

  it("websiteUrl 없이도 확정된다 (홈페이지는 선택 — store-finder.yaml)", async () => {
    const repo = makeFakeRepo();
    const view = await confirmBusiness(repo, {
      accountId: ACCOUNT_ID,
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/222",
        name: "동네분식",
        address: "서울 은평구 통일로 5",
        category: "분식",
      },
      region: "서울 은평구",
    });
    expect(view.id).toBeTruthy();
    expect(view.websiteUrl).toBeNull();
    expect(repo.rows.get(view.id)?.homepageUrl).toBeNull();
  });

  it("confirmBusiness: 기존 네이버 가게 재확정 시 새 홈페이지를 저장한다", async () => {
    const repo = makeFakeRepo();
    const first = await confirmBusiness(repo, {
      accountId: ACCOUNT_ID,
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/5551111",
        name: "기존가게",
        address: "서울",
        category: "한식",
      },
      region: "서울",
    });
    const second = await confirmBusiness(repo, {
      accountId: ACCOUNT_ID,
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/5551111",
        name: "기존가게",
        address: "서울",
        category: "한식",
      },
      websiteUrl: "https://owned.example.com",
      region: "서울 강남구",
    });

    expect(second.id).toBe(first.id);
    expect(second.websiteUrl).toBe("https://owned.example.com");
    expect(repo.rows.get(first.id)?.homepageUrl).toBe("https://owned.example.com");
    expect(repo.rows.get(first.id)?.region).toBe("서울 강남구");
  });

  it("getBusinessView: 저장 행 → 화면 뷰 (placeUrl 복원, 없으면 null)", async () => {
    const repo = makeFakeRepo();
    const created = await confirmBusiness(repo, {
      accountId: ACCOUNT_ID,
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/333",
        name: "카페모카",
        address: "서울 종로구 1",
        category: "카페",
      },
      region: "서울 종로구",
    });
    const view = await getBusinessView(repo, created.id);
    expect(view).not.toBeNull();
    expect(view?.placeUrl).toBe("https://place.naver.com/restaurant/333");
    // category 는 이제 DB 컬럼(#4) — confirm 시 후보 업종이 저장되어 round-trip 시 복원된다.
    expect(view?.category).toBe("카페");
    expect(await getBusinessView(repo, "44444444-4444-4444-4444-444444444444")).toBeNull();
  });

  it("익명 진단: accountId 없이도 확정된다 (S1 auth:false, account_id null)", async () => {
    // Phase2: 미인증 사장님이 가게를 확정해 진단을 시작할 수 있어야 한다(AC-1).
    const repo = makeFakeRepo();
    const view = await confirmBusiness(repo, {
      // accountId 미전달 — 익명 진단.
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/9090909",
        name: "익명가게",
        address: "서울 강남구 1",
        category: "카페",
      },
      region: "서울 강남구",
    });
    expect(view.id).toBeTruthy();
    expect(view.name).toBe("익명가게");
    // 저장 행의 account_id 는 null(익명).
    expect(repo.rows.get(view.id)?.accountId).toBeNull();
  });

  it("익명 진단: accountId null 을 명시 전달해도 확정된다", async () => {
    const repo = makeFakeRepo();
    const view = await confirmBusiness(repo, {
      accountId: null,
      candidate: {
        placeUrl: "https://place.naver.com/restaurant/8080808",
        name: "널계정가게",
        address: "서울 송파구 1",
        category: "분식",
      },
      region: "서울 송파구",
    });
    expect(repo.rows.get(view.id)?.accountId).toBeNull();
  });

  it("confirmBusiness: 잘못된 placeUrl(네이버 place 아님)은 거부한다", async () => {
    const repo = makeFakeRepo();
    await expect(
      confirmBusiness(repo, {
        accountId: ACCOUNT_ID,
        candidate: {
          placeUrl: "https://evil.example.com/x",
          name: "가짜",
          address: "서울",
          category: "기타",
        },
        region: "서울",
      }),
    ).rejects.toThrow();
  });
});
