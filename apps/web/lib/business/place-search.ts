// @TASK P2-R1 - placeCandidate 검색 서비스 (네이버 플레이스 검색 → 후보 목록)
// @SPEC specs/domain/resources.yaml#placeCandidate (placeUrl, name, address, category)
// @SPEC specs/screens/store-finder.yaml#store_search_form (이름 필수 + 지역 선택 → 후보, 입력 최소화)
// @SPEC docs/planning/07-coding-convention.md §2 (앱↔엔진은 contracts 타입 경계, deep import 금지)
// @TEST apps/web/tests/business/place-search.test.ts
//
// 사장님이 가게 이름을 입력하고, 지역은 선택으로 더 좁히면 네이버 플레이스 검색 후보(placeCandidate)를
// 돌려준다. 동명 가게는 address 로 구분한다.
//
// [네이버 연동 — Phase 1 diagnosis 와 동일 게이팅 패턴]
//  - 실 네이버 API 키(NAVER_CLIENT_ID/SECRET)가 .env 에 있으면 실 검색 provider 를 쓴다.
//  - 키가 없으면(개발/CI/테스트) deterministic mock/fixture provider 로 완주한다.
//    파이프라인 골격(검색→후보→확정)이 핵심이며, 실 API 는 키 있을 때만 게이팅 통과.
//  - provider 는 주입 가능(테스트는 항상 mock) → 실 네이버 호출 0.
//
// [경계] placeCandidate 타입은 contracts 가 아직 정의하지 않은 화면 입구 리소스다.
//        엔진 deep import 없이 이 앱 레이어에서 후보 형상을 소유한다(07 §2 위반 아님 —
//        엔진을 import 하지 않는다). 실 provider 구현은 fetch 주입형으로 격리한다.

import { assertMockAllowedOrThrow } from "@/lib/shared/runtime-env";
import { z } from "zod";

/**
 * placeCandidate — 네이버 플레이스 검색 후보 (resources.yaml 4필드).
 * 동명 가게는 address 로 구분한다.
 */
export interface PlaceCandidate {
  /** 후보의 네이버 플레이스 URL (https://place.naver.com/...). */
  placeUrl: string;
  /** 후보 가게 이름. */
  name: string;
  /** 후보 주소(동명 가게 구분용). */
  address: string;
  /** 후보 업종. */
  category: string;
}

/** 검색 입력 — 가게 이름 필수 + 지역 선택 (store-finder.yaml 필터). */
export interface PlaceSearchInput {
  /** 가게 이름(검색어). */
  query: string;
  /** 지역(예: "서울 마포구"). 비면 전국 범위로 검색한다. */
  region?: string | null;
}

/** 검색 입력 검증 — 빈 검색어/과도한 길이 거부, 지역은 선택. */
const PlaceSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(50),
  region: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : "전국")),
});

/**
 * 후보 검색 provider 시그니처 — 주입 가능(테스트/실키 분리).
 * 실 네이버 호출은 이 경계 뒤에서만 일어난다(주입 시 외부호출 0).
 */
export type PlaceSearchProvider = (input: PlaceSearchInput) => Promise<PlaceCandidate[]>;

/** 검색 서비스 옵션 — provider 주입(미주입 시 키 유무로 mock/실 선택). */
export interface PlaceSearchOptions {
  provider?: PlaceSearchProvider;
}

/**
 * 실 네이버 검색 API 키가 .env 에 설정되어 있는지 (Phase 1 diagnosis 게이팅과 동일).
 * 키가 없으면 mock/fixture provider 로 완주한다(실 호출 0).
 */
export function isNaverApiConfigured(): boolean {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  return Boolean(id && id.trim().length > 0 && secret && secret.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Mock/fixture provider (키 없을 때 — deterministic, 실 네이버 호출 0)
// ---------------------------------------------------------------------------

/**
 * deterministic 한 fixture 후보를 생성한다.
 * - 같은 입력 → 같은 후보(테스트 안정 + 캐싱 경계 단순화).
 * - place id 는 query+region+index 해시로 안정 생성(충돌 무해, RFC 형식 아님 — 외부 id).
 * - 동명 케이스(예: 김밥천국)는 서로 다른 address 의 여러 후보를 만들어 구분 가능하게 한다.
 */
function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const FIXTURE_DISTRICTS = ["마포구", "강남구", "종로구", "은평구", "송파구"] as const;
const FIXTURE_CATEGORIES = ["한식", "카페", "분식", "미용실", "음식점"] as const;

const mockPlaceSearchProvider: PlaceSearchProvider = async ({ query, region }) => {
  const safeRegion = region?.trim() || "전국";
  const baseRegion = safeRegion.split(/\s+/)[0] ?? safeRegion;
  const seed = stableHash(`${query}::${safeRegion}`);
  // 동명 가게가 흔한 프랜차이즈류는 여러 지점(다른 주소)을 노출 → address 로 구분.
  const count = 3;
  const candidates: PlaceCandidate[] = [];
  for (let i = 0; i < count; i++) {
    const idNum = (stableHash(`${query}::${safeRegion}::${i}`) % 9_000_000) + 1_000_000;
    const district = FIXTURE_DISTRICTS[(seed + i) % FIXTURE_DISTRICTS.length] ?? "마포구";
    const category = FIXTURE_CATEGORIES[(seed + i) % FIXTURE_CATEGORIES.length] ?? "음식점";
    candidates.push({
      placeUrl: `https://place.naver.com/restaurant/${idNum}`,
      name: query,
      address: `${baseRegion} ${district} ${((seed + i * 7) % 200) + 1}-${(i % 9) + 1}`,
      category,
    });
  }
  return candidates;
};

// ---------------------------------------------------------------------------
// Real provider (키 있을 때만 — 게이팅 통과 시) — fetch 주입형으로 격리
// ---------------------------------------------------------------------------

/**
 * 실 네이버 지역 검색 provider (키 존재 + 게이팅 통과 시에만 호출).
 * fetchImpl 주입형(x-sag platform-presence 패턴 차용) — 테스트는 항상 mock 경로.
 * Phase 1 과 동일: 실 키가 없으면 이 함수는 도달하지 않는다.
 */
export function createNaverPlaceSearchProvider(
  fetchImpl: typeof fetch = fetch,
): PlaceSearchProvider {
  return async ({ query, region }) => {
    const clientId = process.env.NAVER_CLIENT_ID ?? "";
    const clientSecret = process.env.NAVER_CLIENT_SECRET ?? "";
    const safeRegion = region?.trim() || "전국";
    const keyword = `${safeRegion} ${query}`.trim();
    const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(keyword)}&display=5`;
    const res = await fetchImpl(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });
    if (!res.ok) {
      throw new Error(`Naver local search failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      items?: Array<{
        title?: string;
        address?: string;
        roadAddress?: string;
        category?: string;
        link?: string;
      }>;
    };
    const items = json.items ?? [];
    return items.map((item) => ({
      // 네이버 local API 는 place URL 을 직접 주지 않으므로 검색 링크로 안전 대체.
      placeUrl: item.link?.startsWith("https://place.naver.com/")
        ? item.link
        : `https://place.naver.com/search/${encodeURIComponent(stripTags(item.title ?? query))}`,
      name: stripTags(item.title ?? query),
      address: item.roadAddress || item.address || safeRegion,
      category: item.category ?? "기타",
    }));
  };
}

/** 네이버 title 의 <b> 등 태그 제거 (출력 안전). */
function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * 이름+지역으로 네이버 플레이스 후보(placeCandidate)를 검색한다.
 *
 * provider 선택 우선순위:
 *   1) options.provider 주입(테스트/명시) → 실 네이버 호출 0.
 *   2) 실 키 설정됨(isNaverApiConfigured) → 실 검색 provider.
 *   3) 그 외(개발/CI) → deterministic mock/fixture provider.
 *
 * ★ 운영 안전(수정라운드A-2, 보안): production 에서 실 네이버 키가 없으면 mock 으로
 *   *조용히* fallback 하지 않고 throw 한다(MockNotAllowedInProductionError). 운영에서
 *   가짜(fixture) 사업장이 검색 결과로 노출되는 것을 차단한다(가짜 사업장 확정 방지).
 *   주입 provider(테스트/명시)는 운영 판정 이전에 우선 적용된다(외부호출 0 보장).
 */
export async function searchPlaceCandidates(
  input: PlaceSearchInput,
  options: PlaceSearchOptions = {},
): Promise<PlaceCandidate[]> {
  const parsed = PlaceSearchInputSchema.parse(input);
  // 1) 명시 주입이 최우선(테스트/특정 provider). 운영/모크 판정을 거치지 않는다.
  if (options.provider) return options.provider(parsed);
  // 2) 실 키 설정됨 → 실 네이버 검색.
  if (isNaverApiConfigured()) return createNaverPlaceSearchProvider()(parsed);
  // 3) 실키 없음 → 운영이면 fail-fast(가짜 사업장 차단), 그 외에만 mock fixture.
  assertMockAllowedOrThrow("place-search(Naver)");
  return mockPlaceSearchProvider(parsed);
}
