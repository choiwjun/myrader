// @TASK P2-R1 - business 리소스 서비스 (후보 확정 → 진단 대상 가게, 앱↔DB 경계)
// @SPEC specs/domain/resources.yaml#business (id, name, category, region, placeUrl, websiteUrl)
// @SPEC docs/planning/04-database-design.md#business-table (name/category/region/naverPlaceId/homepageUrl)
// @SPEC docs/planning/07-coding-convention.md §2 (앱은 서비스 레이어 경유, DB 직접접근 금지)
// @TEST apps/web/tests/business/business-service.test.ts
//
// placeCandidate 확정 → businesses 행 생성. 순수 로직 + 저장소 추상화(Drizzle 미import,
// 단방향 의존: route → service(인터페이스) → repository(DB 구현)). 구체 구현은
// ./business-repository.ts.
//
// [필드 매핑 — businesses 스키마]
//   resources.yaml          ↔  businesses 컬럼
//   ----------------------------------------------
//   id (UUID v4)            ↔  id (DB defaultRandom)
//   name                    ↔  name
//   category                ↔  category
//   region                  ↔  region
//   placeUrl                ↔  naver_place_id (URL → id 파싱 저장, 조회 시 URL 복원)
//   websiteUrl              ↔  homepage_url

import { z } from "zod";
import type { PlaceCandidate } from "./place-search.js";

/**
 * businesses 행의 앱層 레코드(저장소 반환). DB 컬럼과 1:1.
 * placeUrl 은 여기 없다(컬럼 없음) — 뷰에서 naverPlaceId 로 복원. category 는 이제 DB 컬럼.
 */
export interface BusinessRecord {
  id: string;
  /** 소유 account UUID — 익명 진단 시 null(인증 세션 있으면 귀속). */
  accountId: string | null;
  name: string;
  /** 업종(자유 텍스트 — 네이버 후보 업종). 없으면 null. */
  category: string | null;
  region: string | null;
  naverPlaceId: string | null;
  homepageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 화면(S1/S7)용 business 뷰 — resources.yaml#business 6필드.
 * placeUrl 은 naverPlaceId 로 복원, websiteUrl 은 homepageUrl 별칭.
 * category 는 businesses.category 에 저장되어 round-trip 된다.
 */
export interface BusinessView {
  id: string;
  name: string;
  category: string | null;
  region: string | null;
  placeUrl: string | null;
  websiteUrl: string | null;
}

/** create 입력 — 저장소가 받는 스키마 컬럼만(id 는 DB defaultRandom = UUID v4). */
export interface CreateBusinessInput {
  /** 소유 account — 익명 진단이면 null/생략(인증 세션 있으면 전달). */
  accountId?: string | null;
  name: string;
  /** 업종(네이버 후보 업종 — 있으면 저장, 없으면 null). */
  category?: string | null;
  region?: string | null;
  naverPlaceId?: string | null;
  homepageUrl?: string | null;
}
export interface UpdateBusinessInput {
  name?: string | null;
  category?: string | null;
  region?: string | null;
  naverPlaceId?: string | null;
  homepageUrl?: string | null;
}

/**
 * business 저장소 추상화 — DB 구현 주입 가능(07 경계 + 테스트 용이).
 * route/service 는 이 인터페이스에만 의존한다.
 */
export interface BusinessRepository {
  create(input: CreateBusinessInput): Promise<BusinessRecord>;
  update?(id: string, input: UpdateBusinessInput): Promise<BusinessRecord>;
  findById(id: string): Promise<BusinessRecord | null>;
  /**
   * naver_place_id 로 기존 행을 조회한다(재확정 멱등용). 없으면 null.
   * businesses.naver_place_id 는 UNIQUE 라 최대 1행 — 재진단/더블서밋 시 이 행을 재사용한다.
   */
  findByNaverPlaceId(naverPlaceId: string): Promise<BusinessRecord | null>;
  /**
   * 계정의 최신(가장 최근 생성) 가게 1건을 조회한다(헤더 가게명·설정 진입용). 없으면 null.
   * soft-delete(deletedAt) 행은 제외. 헤더가 이메일 대신 가게명을 보이게 한다(#2).
   */
  findLatestByAccountId(accountId: string): Promise<BusinessRecord | null>;
}

const NAVER_PLACE_HOST = "place.naver.com";

/** 네이버 플레이스 URL 검증 — place.naver.com 만 허용(임의 URL 거부, 보안 경계). */
const NaverPlaceUrlSchema = z
  .string()
  .url()
  .refine((u) => {
    try {
      const host = new URL(u).hostname.toLowerCase();
      return host === NAVER_PLACE_HOST || host.endsWith(`.${NAVER_PLACE_HOST}`);
    } catch {
      return false;
    }
  }, "placeUrl must be a naver place URL (place.naver.com)");

/**
 * 네이버 플레이스 URL 에서 place id(숫자 세그먼트)를 추출한다.
 * 예) https://place.naver.com/restaurant/1234567 → "1234567".
 * 못 찾으면 null.
 */
export function extractNaverPlaceId(placeUrl: string): string | null {
  try {
    const url = new URL(placeUrl);
    const host = url.hostname.toLowerCase();
    if (host !== NAVER_PLACE_HOST && !host.endsWith(`.${NAVER_PLACE_HOST}`)) return null;
    const match = url.pathname.match(/(\d{3,})/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * naverPlaceId → 표준 place URL 복원(조회 경로). null 이면 null.
 * 저장 시 restaurant 세그먼트로 정규화했으므로 동일 형식으로 복원한다.
 */
export function placeUrlFromNaverPlaceId(naverPlaceId: string | null): string | null {
  if (!naverPlaceId) return null;
  return `https://place.naver.com/restaurant/${naverPlaceId}`;
}

/** 홈페이지 URL 검증(선택) — 빈 문자열/공백은 null 로 정규화. */
const WebsiteUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .nullable()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

/** confirmBusiness 입력 — placeCandidate + 선택 websiteUrl + region. */
export interface ConfirmBusinessInput {
  /** 소유 account — 익명 진단이면 null/생략(인증 세션 있으면 전달). */
  accountId?: string | null;
  candidate: PlaceCandidate;
  websiteUrl?: string | null;
  region?: string | null;
}

const ConfirmBusinessSchema = z.object({
  // 익명 진단(S1 auth:false) 허용 — accountId 없으면 null 로 정규화(account_id 컬럼 nullable).
  accountId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  candidate: z.object({
    placeUrl: NaverPlaceUrlSchema,
    name: z.string().trim().min(1).max(100),
    address: z.string().trim().max(200).optional().default(""),
    category: z.string().trim().max(50).optional().default(""),
  }),
  websiteUrl: WebsiteUrlSchema,
  region: z.string().trim().max(50).nullable().optional(),
});

/** BusinessRecord → 화면 BusinessView (placeUrl 복원, category 는 DB 컬럼에서 round-trip). */
export function toBusinessView(rec: BusinessRecord): BusinessView {
  return {
    id: rec.id,
    name: rec.name,
    category: rec.category, // DB 컬럼(자유 텍스트) — 저장값 그대로 복원(#4).
    region: rec.region,
    placeUrl: placeUrlFromNaverPlaceId(rec.naverPlaceId),
    websiteUrl: rec.homepageUrl,
  };
}

/**
 * 후보(placeCandidate)를 확정해 businesses 행을 만들고 화면 뷰로 돌려준다.
 *
 * - placeUrl → naverPlaceId 파싱 후 저장(스키마 컬럼). 조회 시 URL 복원.
 * - websiteUrl(선택) → homepageUrl. 없으면 null(홈페이지 없이도 확정 — store-finder.yaml).
 * - category(네이버 후보 업종, 있으면) → businesses.category 저장(#4). 없으면 null.
 * - id 는 DB defaultRandom(UUID v4) — 앱이 만들지 않는다(uuid 헌법).
 */
export async function confirmBusiness(
  repo: BusinessRepository,
  input: ConfirmBusinessInput,
): Promise<BusinessView> {
  const parsed = ConfirmBusinessSchema.parse(input);
  const naverPlaceId = extractNaverPlaceId(parsed.candidate.placeUrl);
  // 네이버 후보 업종 — 있으면 저장(자유 텍스트), 비면 null(발명 0).
  const category = parsed.candidate.category.length > 0 ? parsed.candidate.category : null;

  // ★ 재확정 멱등(naver_place_id UNIQUE): 같은 가게로 재진단/더블서밋 시 새 insert 가 아니라
  // 기존 행을 재사용한다(중복 키 위반 500 방지). 단, 이번 확정에서 홈페이지/업종/지역을 새로
  // 제공하면 기존 행도 갱신한다. 그래야 /find 가 방금 입력한 홈페이지를 진단 대상으로 쓴다.
  let rec: BusinessRecord;
  if (naverPlaceId) {
    const existing = await repo.findByNaverPlaceId(naverPlaceId);
    if (existing) {
      rec = (await repo.update?.(existing.id, {
        name: parsed.candidate.name,
        ...(category ? { category } : {}),
        ...(parsed.region ? { region: parsed.region } : {}),
        ...(parsed.websiteUrl ? { homepageUrl: parsed.websiteUrl } : {}),
      })) ?? {
        ...existing,
        name: parsed.candidate.name,
        category: category ?? existing.category,
        region: parsed.region ?? existing.region,
        homepageUrl: parsed.websiteUrl ?? existing.homepageUrl,
      };
    } else {
      rec = await repo.create({
        // 익명 진단이면 null — 인증 세션 있으면 route 가 accountId 를 채워 귀속.
        accountId: parsed.accountId ?? null,
        name: parsed.candidate.name,
        category,
        region: parsed.region ?? null,
        naverPlaceId,
        homepageUrl: parsed.websiteUrl ?? null,
      });
    }
  } else {
    rec = await repo.create({
      // naver_place_id 없으면(파싱 실패) UNIQUE 충돌 없음 — 평소대로 생성.
      accountId: parsed.accountId ?? null,
      name: parsed.candidate.name,
      category,
      region: parsed.region ?? null,
      naverPlaceId,
      homepageUrl: parsed.websiteUrl ?? null,
    });
  }

  // 응답 뷰: 저장 행 기반(category 포함). 기존 행 재사용 시 그 행의 저장 category 를 노출하되,
  // 비어 있고 이번 후보에 업종이 있으면 후보값을 노출(저장은 create 시점에만 — 멱등 유지).
  const view = toBusinessView(rec);
  return {
    ...view,
    category: view.category ?? category,
  };
}

/** businesses 행을 화면 뷰로 조회한다(없으면 null). */
export async function getBusinessView(
  repo: BusinessRepository,
  id: string,
): Promise<BusinessView | null> {
  const rec = await repo.findById(id);
  return rec ? toBusinessView(rec) : null;
}
