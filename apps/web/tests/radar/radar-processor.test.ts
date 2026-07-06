import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEnvRadarSignalClient } from "../../lib/radar/radar-processor.js";

const KEYWORD = { text: "성수동 비건빵집", clusterId: "성수동", hop: 0 };

describe("createEnvRadarSignalClient", () => {
  beforeEach(() => {
    vi.stubEnv("RADAR_NAVER_CLIENT_ID", "");
    vi.stubEnv("RADAR_NAVER_CLIENT_SECRET", "");
    vi.stubEnv("NAVER_CLIENT_ID", "");
    vi.stubEnv("NAVER_CLIENT_SECRET", "");
    vi.stubEnv("RADAR_NAVER_SEARCHAD_API_KEY", "");
    vi.stubEnv("RADAR_NAVER_SEARCHAD_SECRET_KEY", "");
    vi.stubEnv("RADAR_NAVER_SEARCHAD_CUSTOMER_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails honestly when Naver OpenAPI credentials are missing", async () => {
    const client = createEnvRadarSignalClient();

    await expect(client.fetchBlog(KEYWORD)).rejects.toThrow(
      /RADAR_SIGNAL_ADAPTER_UNAVAILABLE: Naver OpenAPI credentials are not configured/,
    );
  });

  it("does not activate Radar OpenAPI with generic Naver credentials only", async () => {
    vi.stubEnv("NAVER_CLIENT_ID", "generic-client-id");
    vi.stubEnv("NAVER_CLIENT_SECRET", "generic-client-secret");

    const client = createEnvRadarSignalClient();

    await expect(client.fetchBlog(KEYWORD)).rejects.toThrow(
      /RADAR_SIGNAL_ADAPTER_UNAVAILABLE: Naver OpenAPI credentials are not configured/,
    );
  });

  it("uses Naver OpenAPI credentials for blog and datalab signals", async () => {
    vi.stubEnv("RADAR_NAVER_CLIENT_ID", "client-id");
    vi.stubEnv("RADAR_NAVER_CLIENT_SECRET", "client-secret");
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = input instanceof URL ? input.toString() : String(input);
      if (url.includes("/v1/search/blog.json")) {
        expect(init?.headers).toMatchObject({
          "X-Naver-Client-Id": "client-id",
          "X-Naver-Client-Secret": "client-secret",
        });
        return Response.json({ total: 37 });
      }
      if (url.includes("/v1/datalab/search")) {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
          "X-Naver-Client-Id": "client-id",
          "X-Naver-Client-Secret": "client-secret",
        });
        return Response.json({
          results: [{ data: [{ ratio: 12 }, { ratio: 18 }, { ratio: 21 }] }],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createEnvRadarSignalClient();

    await expect(client.fetchBlog(KEYWORD)).resolves.toMatchObject({ docs: 37 });
    await expect(client.fetchDatalab(KEYWORD)).resolves.toMatchObject({ trend7d: 9 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps SearchAd unavailable unless SearchAd credentials are explicitly configured", async () => {
    vi.stubEnv("RADAR_NAVER_CLIENT_ID", "client-id");
    vi.stubEnv("RADAR_NAVER_CLIENT_SECRET", "client-secret");

    const client = createEnvRadarSignalClient();

    await expect(client.fetchSearchAd(KEYWORD)).rejects.toThrow(
      /RADAR_SIGNAL_ADAPTER_UNAVAILABLE: Naver SearchAd credentials are not configured/,
    );
  });

  it("uses SearchAd credentials without leaking them into the query", async () => {
    vi.stubEnv("RADAR_NAVER_SEARCHAD_API_KEY", "api-key");
    vi.stubEnv("RADAR_NAVER_SEARCHAD_SECRET_KEY", "secret-key");
    vi.stubEnv("RADAR_NAVER_SEARCHAD_CUSTOMER_ID", "customer-id");
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = input instanceof URL ? input : new URL(String(input));
      expect(url.hostname).toBe("api.searchad.naver.com");
      expect(url.searchParams.get("hintKeywords")).toBe(KEYWORD.text);
      expect(url.searchParams.has("api-key")).toBe(false);
      expect(init?.headers).toMatchObject({
        "X-API-KEY": "api-key",
        "X-Customer": "customer-id",
      });
      expect(
        String((init?.headers as Record<string, string>)["X-Signature"] ?? ""),
      ).not.toHaveLength(0);
      return Response.json({
        keywordList: [
          {
            relKeyword: KEYWORD.text,
            monthlyPcQcCnt: "< 10",
            monthlyMobileQcCnt: 40,
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createEnvRadarSignalClient();

    await expect(client.fetchSearchAd(KEYWORD)).resolves.toMatchObject({ monthlySearches: 50 });
  });
});
