// @TASK P2-R1 - placeCandidate 검색 서비스 단위 테스트 (RED→GREEN)
// @SPEC specs/domain/resources.yaml#placeCandidate (placeUrl, name, address, category)
// @SPEC specs/screens/store-finder.yaml#store_search_form (이름+지역 → 후보)
//
// 이름+지역 입력 → 네이버 플레이스 검색 후보 목록(placeCandidate) 검증.
// 동명 가게는 address 로 구분된다. 실 네이버 호출 0 — provider 주입(mock/fixture).
//
// RED: 미구현 시 후보 0(또는 export 없음) → 실패.
// GREEN: 후보 목록(주소 포함) 반환 + provider 주입으로 외부호출 0.

import { describe, expect, it, vi } from "vitest";
import {
  type PlaceSearchProvider,
  isNaverApiConfigured,
  searchPlaceCandidates,
} from "../../lib/business/place-search.js";

describe("placeCandidate 검색 서비스 (P2-R1)", () => {
  it("이름+지역 → 네이버 플레이스 후보 목록을 반환한다 (resources.yaml 4필드)", async () => {
    const candidates = await searchPlaceCandidates({ query: "스타벅스", region: "서울 마포구" });
    expect(candidates.length).toBeGreaterThan(0);
    const first = candidates[0];
    expect(first).toBeDefined();
    // resources.yaml#placeCandidate: placeUrl, name, address, category.
    expect(first).toHaveProperty("placeUrl");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("address");
    expect(first).toHaveProperty("category");
    expect(typeof first?.placeUrl).toBe("string");
    expect(first?.placeUrl).toMatch(/^https:\/\/place\.naver\.com\/.+/);
  });

  it("동명 가게는 address 로 구분된다 (같은 name, 다른 address)", async () => {
    const candidates = await searchPlaceCandidates({ query: "김밥천국", region: "서울" });
    const sameName = candidates.filter((c) => c.name === "김밥천국");
    expect(sameName.length).toBeGreaterThanOrEqual(2);
    const addresses = new Set(sameName.map((c) => c.address));
    // 주소가 서로 달라 사장님이 내 가게를 고를 수 있다.
    expect(addresses.size).toBe(sameName.length);
  });

  it("빈 검색어는 거부한다 (입력 검증)", async () => {
    await expect(searchPlaceCandidates({ query: "", region: "서울" })).rejects.toThrow();
  });

  it("provider 를 주입하면 실 네이버 호출 없이 그 결과를 쓴다 (외부호출 0)", async () => {
    const provider: PlaceSearchProvider = vi.fn().mockResolvedValue([
      {
        placeUrl: "https://place.naver.com/restaurant/111",
        name: "테스트가게",
        address: "서울 강남구 테스트로 1",
        category: "한식",
      },
    ]);
    const candidates = await searchPlaceCandidates(
      { query: "테스트가게", region: "서울 강남구" },
      { provider },
    );
    expect(provider).toHaveBeenCalledTimes(1);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.name).toBe("테스트가게");
  });

  it("isNaverApiConfigured: 실 키 없으면 false (mock 게이팅 — Phase 1 패턴)", () => {
    const prev = process.env.NAVER_CLIENT_ID;
    process.env.NAVER_CLIENT_ID = undefined;
    expect(isNaverApiConfigured()).toBe(false);
    if (prev === undefined) {
      process.env.NAVER_CLIENT_ID = undefined;
    } else {
      process.env.NAVER_CLIENT_ID = prev;
    }
  });

  it("후보 결과는 결정적이다 (같은 입력 → 같은 후보, 캐싱/테스트 안정)", async () => {
    const a = await searchPlaceCandidates({ query: "스타벅스", region: "서울 마포구" });
    const b = await searchPlaceCandidates({ query: "스타벅스", region: "서울 마포구" });
    expect(a.map((c) => c.placeUrl)).toEqual(b.map((c) => c.placeUrl));
  });
});
