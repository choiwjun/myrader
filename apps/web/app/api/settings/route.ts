// @TASK P2-S7 - 설정 (/settings) 데이터 진입점 (Next.js Route Handler)
// @SPEC specs/screens/settings.yaml (S7: REQ-001/007 — auth:true, account+businessSettings)
// @SPEC .claude/constitutions/nextjs/auth.md (단일 Auth 레이어 — getCurrentUser/requireAuth)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러 / 비민감)
//
// 리소스 중심(REST):
//   GET  /api/settings — 현재 계정 + 최신 business 정보 반환 (인증 필요).
//   PUT  /api/settings — business 정보 수정 (이름·지역·홈페이지). 인증 필요.
//
// auth:true(S7) — getCurrentUser null이면 401. 비민감: 이메일·가게 정보만.
// 가게 정보 수정: PUT으로 businesses.name/region/homepageUrl 업데이트.
// [OPEN] REQ-007 재진단 v1.5 placeholder — 이 route에서 재진단 동작 없음.

import { getCurrentUser } from "@/lib/auth";
import { toBusinessView } from "@/lib/business";
import { createDb } from "@boina/db/client";
import { businesses } from "@boina/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

// DB/세션에 의존하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
export const dynamic = "force-dynamic";

// PUT 수정 입력 검증 — 이름·업종·지역·홈페이지. placeUrl은 변경 불가(가게 재선택으로만).
// category(#4): 사장님이 업종을 직접 확인/수정할 수 있도록 자유 텍스트로 수용.
const UpdateBusinessSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().max(50).nullable().optional(),
  region: z.string().trim().max(50).nullable().optional(),
  websiteUrl: z.string().trim().url().max(2048).nullable().optional(),
});

// GET — 계정 + 가게 정보 조회 (인증 필요).
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED", success: false },
        { status: 401 },
      );
    }

    // 계정 정보 (민감정보 최소 — id,email 만)
    const account = { id: user.id, email: user.email };

    // 최신 business 조회 (accountId 기준, 없으면 null)
    // repo.findByAccountId 가 없으므로 직접 DB 조회
    const url = process.env.DATABASE_URL;
    if (!url) {
      return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
    }
    const db = createDb(url);
    const rows = await db
      .select()
      .from(businesses)
      .where(and(eq(businesses.accountId, user.id), isNull(businesses.deletedAt)))
      .limit(1);

    const firstRow = rows[0];
    const businessSettings =
      firstRow !== undefined
        ? {
            businessId: firstRow.id,
            name: firstRow.name,
            category: firstRow.category, // 업종(자유 텍스트 — 저장값 복원)(#4).
            region: firstRow.region,
            placeUrl: firstRow.naverPlaceId
              ? `https://place.naver.com/restaurant/${firstRow.naverPlaceId}`
              : null,
            websiteUrl: firstRow.homepageUrl,
          }
        : null;

    return NextResponse.json({
      data: { account, businessSettings },
      success: true,
    });
  } catch (error) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}

// PUT — 가게 정보 수정 (인증 필요).
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED", success: false },
        { status: 401 },
      );
    }

    const body = await request.json();
    const input = UpdateBusinessSchema.parse(body);

    const url = process.env.DATABASE_URL;
    if (!url) {
      return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
    }
    const db = createDb(url);

    // 소유권 확인 — 해당 business가 이 계정 소유인지
    const rows = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, input.businessId))
      .limit(1);

    const targetRow = rows[0];
    if (targetRow === undefined || targetRow.accountId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN", success: false },
        { status: 403 },
      );
    }

    // 업데이트 — 변경된 필드만
    const updateData: {
      name?: string;
      category?: string | null;
      region?: string | null;
      homepageUrl?: string | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.category !== undefined) updateData.category = input.category; // 업종 수정(#4).
    if (input.region !== undefined) updateData.region = input.region;
    if (input.websiteUrl !== undefined) updateData.homepageUrl = input.websiteUrl;

    const [updated] = await db
      .update(businesses)
      .set(updateData)
      .where(eq(businesses.id, input.businessId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Update failed", success: false }, { status: 500 });
    }

    const businessView = toBusinessView({
      id: updated.id,
      accountId: updated.accountId,
      name: updated.name,
      category: updated.category ?? null,
      region: updated.region ?? null,
      naverPlaceId: updated.naverPlaceId ?? null,
      homepageUrl: updated.homepageUrl ?? null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });

    return NextResponse.json({ data: { business: businessView }, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("PUT /api/settings error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
