// @TASK P2-R6 / P3-R1 - generatedAsset 조회 진입점 (Next.js Route Handler) + 페이월 서버 강제
// @SPEC specs/screens/generated.yaml (S6: generatedAsset filters.diagnosisId/type, needs id/type/title/content/copyable + paywall_gate)
// @SPEC specs/domain/resources.yaml (generatedAsset 리소스)
// @SPEC docs/planning/07-coding-convention.md §4 (생성물 가드·전문용어 0·경계 일관) / §5 (대행연결 금지)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러 / 비민감)
// @TEST apps/web/tests/diagnosis/generated-asset-route.test.ts
//
// 리소스 중심(REST): GET /api/generated-asset?diagnosisId=[&type=]
//   → 4종 복붙 생성물 + assets_intro + 유료 경계 + 페이월 메타. S6 의 생성물 카드 데이터.
//   생성물 본문은 카피 가드(07 §4)를 통과한 사장님 언어만. 큰 복사 버튼 대상(copyable=true).
//
// ★ 보안(P3-R1): 무료/유료 경계는 서버 세션 account.plan 으로만 결정한다(resolveRequestPlanTier).
// 클라 `?paid=1` 무시 — 무료는 미리보기 일부만(유료 생성물 본문 미노출). 잠긴 생성물의 content
// (본문)는 무료 응답에 없고 lockedCount 만 메타로 싣는다. (?type 은 보기 필터일 뿐 경계 우회 아님.)
//
// v1 정직성: route 는 저장된 generated_assets 를 우선 사용한다.
// 저장된 생성물이 없으면 진단 view(완료 여부)만으로 정직 폴백
// (deriveGeneratedAssetViewFromView)을 산출한다: 추측 생성물 0(빈 배열) + 응원 인트로.

import { dbToAssetType } from "@/lib/diagnosis/diagnosis-persistence";
import { getDefaultDiagnosisRepository } from "@/lib/diagnosis/diagnosis-repository";
import { getDiagnosisView } from "@/lib/diagnosis/diagnosis-service";
import {
  deriveGeneratedAssetViewFromPersisted,
  deriveGeneratedAssetViewFromView,
} from "@/lib/diagnosis/generated-asset-service";
import {
  getDefaultDb,
  getPersistedGapRows,
  getPersistedGeneratedAssets,
} from "@/lib/diagnosis/persistence-repository";
import { computePaywallMeta, resolveRequestPlanTier } from "@/lib/diagnosis/plan-tier";
import { NextResponse } from "next/server";
import { z } from "zod";

// DB/세션(plan)에 의존하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
export const dynamic = "force-dynamic";

// 생성물 type 4종(resources.yaml) — ?type 필터 검증(발명 금지).
const AssetTypeSchema = z.enum(["snippet", "place_intro", "review_request", "vendor_prescription"]);

// GET ?diagnosisId=[&type=] — 4종 생성물 + 인트로 + 유료 경계 + 페이월 메타. 공개(S6; 경계는 세션 plan).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const diagnosisId = z.string().uuid().parse(searchParams.get("diagnosisId"));
    // ?type — 특정 생성물만 보기(S5에서 연결). 미지정이면 전부. (경계 우회 아님 — 보기 필터)
    const rawType = searchParams.get("type");
    const type = rawType === null ? undefined : AssetTypeSchema.parse(rawType);
    const actionId = searchParams.get("actionId");
    const keyword = searchParams.get("keyword");

    // ★ 유료(실행팩) 경계 — 서버 세션 account.plan 으로만 결정(클라 ?paid=1 무시). 익명=free.
    const { isPaid } = await resolveRequestPlanTier();

    const view = await getDiagnosisView(getDefaultDiagnosisRepository(), diagnosisId);
    if (!view) {
      return NextResponse.json(
        { error: "Diagnosis not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    }

    // 실데이터 경로: 영속화된 generated_assets → 복붙 생성물(카피 가드 재검증). 없으면 정직 빈 상태.
    const db = getDefaultDb();
    const [persisted, gapRows] = await Promise.all([
      getPersistedGeneratedAssets(db, diagnosisId),
      actionId ? getPersistedGapRows(db, diagnosisId) : Promise.resolve([]),
    ]);
    const selectedGap = actionId ? gapRows.find((row) => row.id === actionId) : undefined;
    const evidence = selectedGap
      ? [
          { label: "연결된 할 일", detail: selectedGap.item },
          {
            label: "측정 근거",
            detail: `${selectedGap.competitorName ?? "경쟁사"} ${selectedGap.competitorHas ? "보유" : "미보유"}`,
          },
        ]
      : [];
    const {
      assets,
      intro,
      isPaid: paid,
    } = persisted.length > 0
      ? deriveGeneratedAssetViewFromPersisted(persisted, dbToAssetType, {
          isPaid,
          type,
          ...(keyword ? { sourceKeywords: [keyword] } : {}),
          evidence,
        })
      : deriveGeneratedAssetViewFromView({ isPaid });

    // 잠금 메타(★ content 0): 전체 목록은 persisted 전체 - 무료 노출, type 직접 요청은 해당 type 존재 여부 - 노출.
    // 무료 사용자가 유료 type(snippet/vendor_prescription)을 직접 요청해도 본문 없이 lockedCount 만 받는다.
    const totalAssets = type
      ? persisted.filter((row) => dbToAssetType(row.type) === type).length
      : persisted.length;
    const paywall = computePaywallMeta(totalAssets, assets.length, paid);

    return NextResponse.json({ data: { assets, intro, isPaid: paid, paywall }, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameter", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("GET /api/generated-asset error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
