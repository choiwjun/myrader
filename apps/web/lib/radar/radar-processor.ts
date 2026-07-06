import { createHmac } from "node:crypto";
import { createRadarRepository } from "@boina/db";
import { type DbClient, createDb } from "@boina/db/client";
import type { KeywordCandidate, KeywordSignalClient } from "@radar/keyword-pipeline";
import { type RadarScanJobResult, processDueRadarScans } from "./radar-scan-job.js";

let singletonDb: DbClient | null = null;

const NAVER_OPEN_API_BASE = "https://openapi.naver.com";
const NAVER_SEARCHAD_BASE = "https://api.searchad.naver.com";
const SEARCHAD_KEYWORD_TOOL_PATH = "/keywordstool";

interface NaverBlogResponse {
  readonly total?: number;
}

interface NaverDatalabResponse {
  readonly results?: readonly {
    readonly data?: readonly {
      readonly period?: string;
      readonly ratio?: number;
    }[];
  }[];
}

interface NaverSearchAdResponse {
  readonly keywordList?: readonly {
    readonly relKeyword?: string;
    readonly monthlyPcQcCnt?: number | string;
    readonly monthlyMobileQcCnt?: number | string;
  }[];
}

function getDb(): DbClient {
  if (singletonDb) return singletonDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  singletonDb = createDb(url);
  return singletonDb;
}

export const RADAR_SIGNAL_ADAPTER_UNAVAILABLE = "RADAR_SIGNAL_ADAPTER_UNAVAILABLE";

function radarSignalAdapterUnavailable(detail: string): never {
  throw new Error(`${RADAR_SIGNAL_ADAPTER_UNAVAILABLE}: ${detail}`);
}

function requireOpenApiCredentials(): { readonly clientId: string; readonly clientSecret: string } {
  const clientId = process.env.RADAR_NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.RADAR_NAVER_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    radarSignalAdapterUnavailable("Naver OpenAPI credentials are not configured");
  }

  return { clientId, clientSecret };
}

function requireSearchAdCredentials(): {
  readonly apiKey: string;
  readonly secretKey: string;
  readonly customerId: string;
} {
  const apiKey = process.env.RADAR_NAVER_SEARCHAD_API_KEY?.trim();
  const secretKey = process.env.RADAR_NAVER_SEARCHAD_SECRET_KEY?.trim();
  const customerId = process.env.RADAR_NAVER_SEARCHAD_CUSTOMER_ID?.trim();

  if (!apiKey || !secretKey || !customerId) {
    radarSignalAdapterUnavailable("Naver SearchAd credentials are not configured");
  }

  return { apiKey, secretKey, customerId };
}

async function readJsonResponse<T>(response: Response, surface: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`RADAR_SIGNAL_HTTP_${response.status}: ${surface}`);
  }
  return (await response.json()) as T;
}

function checkedAt(): string {
  return new Date().toISOString();
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function datalabWindow(now = new Date()): { readonly startDate: string; readonly endDate: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  return { startDate: formatYmd(start), endDate: formatYmd(end) };
}

function parseSearchAdCount(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Number(value.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function searchAdSignature(
  timestamp: string,
  method: string,
  path: string,
  secretKey: string,
): string {
  return createHmac("sha256", secretKey).update(`${timestamp}.${method}.${path}`).digest("base64");
}

function normalizeKeyword(value: string | undefined): string {
  return value?.replace(/\s+/g, "").toLowerCase() ?? "";
}

export function createEnvRadarSignalClient(): KeywordSignalClient {
  return {
    async fetchBlog(keyword: KeywordCandidate) {
      const credentials = requireOpenApiCredentials();
      const url = new URL("/v1/search/blog.json", NAVER_OPEN_API_BASE);
      url.searchParams.set("query", keyword.text);
      url.searchParams.set("display", "1");

      const response = await fetch(url, {
        headers: {
          "X-Naver-Client-Id": credentials.clientId,
          "X-Naver-Client-Secret": credentials.clientSecret,
        },
      });
      const json = await readJsonResponse<NaverBlogResponse>(response, "naver-blog");

      return { docs: typeof json.total === "number" ? json.total : null, checkedAt: checkedAt() };
    },

    async fetchSearchAd(keyword: KeywordCandidate) {
      const credentials = requireSearchAdCredentials();
      const timestamp = Date.now().toString();
      const url = new URL(SEARCHAD_KEYWORD_TOOL_PATH, NAVER_SEARCHAD_BASE);
      url.searchParams.set("hintKeywords", keyword.text);
      url.searchParams.set("showDetail", "1");

      const response = await fetch(url, {
        headers: {
          "X-Timestamp": timestamp,
          "X-API-KEY": credentials.apiKey,
          "X-Customer": credentials.customerId,
          "X-Signature": searchAdSignature(
            timestamp,
            "GET",
            SEARCHAD_KEYWORD_TOOL_PATH,
            credentials.secretKey,
          ),
        },
      });
      const json = await readJsonResponse<NaverSearchAdResponse>(response, "naver-searchad");
      const normalized = normalizeKeyword(keyword.text);
      const row =
        json.keywordList?.find(
          (candidate) => normalizeKeyword(candidate.relKeyword) === normalized,
        ) ?? json.keywordList?.[0];

      return {
        monthlySearches: row
          ? parseSearchAdCount(row.monthlyPcQcCnt) + parseSearchAdCount(row.monthlyMobileQcCnt)
          : null,
        checkedAt: checkedAt(),
      };
    },

    async fetchDatalab(keyword: KeywordCandidate) {
      const credentials = requireOpenApiCredentials();
      const { startDate, endDate } = datalabWindow();
      const response = await fetch(`${NAVER_OPEN_API_BASE}/v1/datalab/search`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Naver-Client-Id": credentials.clientId,
          "X-Naver-Client-Secret": credentials.clientSecret,
        },
        body: JSON.stringify({
          startDate,
          endDate,
          timeUnit: "date",
          keywordGroups: [{ groupName: keyword.text, keywords: [keyword.text] }],
        }),
      });
      const json = await readJsonResponse<NaverDatalabResponse>(response, "naver-datalab");
      const series = json.results?.[0]?.data ?? [];
      const firstRatio = series[0]?.ratio;
      const lastRatio = series.at(-1)?.ratio;
      const trend7d =
        typeof firstRatio === "number" && typeof lastRatio === "number"
          ? lastRatio - firstRatio
          : null;

      return { trend7d, checkedAt: checkedAt() };
    },
  };
}

export async function processRadarScanQueue(now = new Date()): Promise<RadarScanJobResult> {
  const db = getDb();
  const repository = createRadarRepository(db);
  return processDueRadarScans(repository, {
    now,
    signalOptions: { client: createEnvRadarSignalClient() },
  });
}
