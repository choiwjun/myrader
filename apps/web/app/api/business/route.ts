// @TASK P2-R1 - business / placeCandidate 진입점 (Next.js Route Handler)
// @SPEC specs/screens/store-finder.yaml (S1: 이름+지역 검색 → 후보 확정)
// @SPEC specs/screens/settings.yaml (S7: 가게 정보의 출처)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러 / 비민감)
// @TEST apps/web/tests/business/business-route.test.ts
//
// 리소스 중심(REST):
//   GET  /api/business?name=&region=  → placeCandidate 후보 목록(검색). 공개(S1 auth:false).
//   POST /api/business                → 후보 확정 → business 생성(201). 익명 허용(S1 auth:false).
//
// 검색은 키 유무로 mock/실 provider 자동 선택(Phase 1 게이팅 패턴) — 키 없으면 실 호출 0.
// 확정(POST): S1 은 auth:false(01-prd AC-1 "이름 한 칸으로 진단 시작") — 미인증이면
// account_id 를 null 로 둔 익명 business 를 만든다(account_id 컬럼 nullable). 인증 세션이
// 있으면 그 account 를 소유자로 귀속한다(결제 P3·설정 S7 에서 익명 진단을 계정에 연결).
// 헌법: try-catch / Zod 검증 / 일관 응답 / 비-200 에러 / 민감정보 비노출.

import { getCurrentUser } from "@/lib/auth";
import {
  confirmBusiness,
  getDefaultBusinessRepository,
  searchPlaceCandidates,
} from "@/lib/business";
import {
  businessConfirmLimiter,
  businessSearchLimiter,
  enforceRateLimit,
} from "@/lib/shared/api-rate-limit";
import { MockNotAllowedInProductionError } from "@/lib/shared/runtime-env";
import { NextResponse } from "next/server";
import { z } from "zod";

// DB/외부키에 의존하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
export const dynamic = "force-dynamic";

/** 외부 연동(네이버) 운영 비활성 503 — 가짜 사업장 노출 차단. */
function searchUnavailable(): NextResponse {
  return NextResponse.json(
    { error: "Search is temporarily unavailable", code: "SEARCH_UNAVAILABLE", success: false },
    { status: 503 },
  );
}

// GET 검색 쿼리 검증 (이름 필수, 지역 선택 — 비면 전국 범위로 검색).
const SearchQuerySchema = z.object({
  name: z.string().trim().min(1).max(50),
  region: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : "전국")),
});

// POST 확정 본문 검증 — placeCandidate(확정 후보) 또는 직접 입력 후보 + 선택 websiteUrl.
const ConfirmBodySchema = z.object({
  candidate: z.object({
    placeUrl: z.string().url().max(2048).nullable().optional(),
    name: z.string().trim().min(1).max(100),
    address: z.string().trim().max(200).optional().default(""),
    category: z.string().trim().max(50).optional().default(""),
  }),
  websiteUrl: z.string().trim().url().max(2048).optional(),
  region: z.string().trim().max(50).optional(),
});

// GET — 이름+지역으로 placeCandidate 후보 검색 (공개).
export async function GET(request: Request) {
  // 남용 완화: 공개 검색에 IP/세션 rate limit(429). 정상 탐색은 넉넉히 통과.
  const limited = enforceRateLimit(request, businessSearchLimiter);
  if (limited) return limited;
  try {
    const { searchParams } = new URL(request.url);
    const input = SearchQuerySchema.parse({
      name: searchParams.get("name") ?? "",
      region: searchParams.get("region") ?? "",
    });

    const candidates = await searchPlaceCandidates({ query: input.name, region: input.region });

    return NextResponse.json({ data: { candidates }, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    // ★ 운영에서 네이버 실키 미설정 → mock 검색 차단(503). 가짜 사업장 노출 방지.
    if (error instanceof MockNotAllowedInProductionError) {
      return searchUnavailable();
    }
    console.error("GET /api/business error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}

// POST — 후보 확정 → business 생성 (익명 허용 — S1 auth:false).
export async function POST(request: Request) {
  // 남용 완화: 공개 확정에 rate limit(business 행 무한 생성 차단).
  const limited = enforceRateLimit(request, businessConfirmLimiter);
  if (limited) return limited;
  try {
    // 1. 세션 조회(선택) — S1 은 익명 진단 허용(AC-1). 미인증이면 account_id null.
    //    인증 세션이 있으면 그 account 를 소유자로 귀속한다(차단하지 않는다).
    const user = await getCurrentUser();

    // 2. 입력 검증.
    const body = await request.json();
    const input = ConfirmBodySchema.parse(body);

    // 3. 확정 → businesses 행 생성(UUID v4 = DB defaultRandom). 익명이면 accountId null.
    const repo = getDefaultBusinessRepository();
    const business = await confirmBusiness(repo, {
      accountId: user?.id ?? null,
      candidate: input.candidate,
      websiteUrl: input.websiteUrl ?? null,
      region: input.region ?? null,
    });

    // 201 Created — 확정된 진단 대상 business.
    return NextResponse.json({ data: { business }, success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("POST /api/business error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
