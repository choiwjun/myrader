import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchPlaceCandidates } from "../../lib/business/place-search.js";
import { MockNotAllowedInProductionError } from "../../lib/shared/runtime-env.js";

beforeEach(() => {
  vi.stubEnv("NAVER_CLIENT_ID", "");
  vi.stubEnv("NAVER_CLIENT_SECRET", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("place-search — production fail-fast (가짜 사업장 차단)", () => {
  it("production + 네이버 실키 없음 + provider 미주입 → throw (mock fixture 금지)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(
      searchPlaceCandidates({ query: "스타벅스", region: "서울 마포구" }),
    ).rejects.toThrow(MockNotAllowedInProductionError);
  });

  it("production 이어도 provider 주입이면 통과(테스트/명시 경로 — 외부호출 0)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const provider = vi.fn().mockResolvedValue([
      {
        placeUrl: "https://place.naver.com/restaurant/1",
        name: "주입가게",
        address: "서울 강남구 1",
        category: "한식",
      },
    ]);
    const out = await searchPlaceCandidates(
      { query: "주입가게", region: "서울 강남구" },
      { provider },
    );
    expect(out).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("development + 실키 없음 → mock fixture(기존 동작 유지)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const out = await searchPlaceCandidates({ query: "스타벅스", region: "서울 마포구" });
    expect(out.length).toBeGreaterThan(0);
  });
});
