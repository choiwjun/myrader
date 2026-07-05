// @TASK P2-R5 / P3-R1 - action 조회 진입점 (Next.js Route Handler) + 페이월 서버 강제
// @SPEC specs/screens/actions.yaml (S5: action filters.diagnosisId, needs id/title/tier/isTodayOne/deeplink/doneable/isPaid + paywall_gate)
// @SPEC specs/domain/resources.yaml (action 리소스)
// @SPEC docs/planning/07-coding-convention.md §4 (누가-하나 부착·인과 단정 0·추측 행동 금지·경계 일관)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러 / 비민감)
// @SPEC x-sag-FR012-competitor-gap-wiring-spec.md (GapResult 영속화 [OPEN])
// @TEST apps/web/tests/diagnosis/action-route.test.ts
//
// 리소스 중심(REST): GET /api/action?diagnosisId= → 4분류 행동 + "오늘 딱 하나" + 인트로 + 페이월 메타.
// S5 의 행동 카드 데이터. 룰 코드값 비노출 — 사장님 언어 title 만. 4분류 누가-하나 부착.
//
// ★ 보안(P3-R1): 무료/유료 경계는 서버 세션 account.plan 으로만 결정한다(resolveRequestPlanTier).
// 클라 `?paid=1` 무시 — 무료는 오늘 딱 하나 + 일부만(유료 행동 content 미노출). "오늘 딱 하나"는
// 무료 보장(절대 잠금 뒤 아님). 잠긴 행동의 content(title)는 무료 응답에 없고 lockedCount 만 메타.
//
// v1 한계(정직): DB(04 스키마)는 진단 원자료(GapResult/gapItem)를 영속화하지 않으므로
// (FR-012 §5 영속화 [OPEN], 스키마/잡 수정 금지), route 는 진단 view(완료 여부)만으로 정직
// 폴백을 산출한다(deriveActionViewFromView): 추측 행동 0(빈 배열) + 오늘 딱 하나 null + 응원
// 인트로. 원자료 영속화 후 deriveActions(gapItem → 4분류 + 오늘딱하나)로 승급([OPEN]).

import {
  deriveActionViewFromGapItems,
  deriveActionViewFromView,
} from "@/lib/diagnosis/action-service";
import { getDefaultDiagnosisRepository } from "@/lib/diagnosis/diagnosis-repository";
import { getDiagnosisView } from "@/lib/diagnosis/diagnosis-service";
import { deriveGapViewFromPersisted } from "@/lib/diagnosis/gap-service";
import { getDefaultDb, getPersistedGapRows } from "@/lib/diagnosis/persistence-repository";
import { computePaywallMeta, resolveRequestPlanTier } from "@/lib/diagnosis/plan-tier";
import { NextResponse } from "next/server";
import { z } from "zod";

// DB/세션(plan)에 의존하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
export const dynamic = "force-dynamic";

// GET ?diagnosisId= — 4분류 행동 + 오늘 딱 하나 + 인트로 + 페이월 메타. 공개(S5; 경계는 세션 plan).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const diagnosisId = z.string().uuid().parse(searchParams.get("diagnosisId"));

    // ★ 유료(실행팩) 경계 — 서버 세션 account.plan 으로만 결정(클라 ?paid=1 무시). 익명=free.
    const { isPaid } = await resolveRequestPlanTier();

    const view = await getDiagnosisView(getDefaultDiagnosisRepository(), diagnosisId);
    if (!view) {
      return NextResponse.json(
        { error: "Diagnosis not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    }

    // 실데이터 경로: 영속화된 gap_rows → gapItem → deriveActions(4분류 + 오늘 딱 하나).
    // 없으면 정직 빈 상태(추측 행동 0 + 오늘 딱 하나 null + 응원 인트로).
    const gapRows = await getPersistedGapRows(getDefaultDb(), diagnosisId);
    const {
      actions,
      todayOne,
      intro,
      isPaid: paid,
    } = gapRows.length > 0
      ? deriveActionViewFromGapItems(deriveGapViewFromPersisted(gapRows, { isPaid }).items, {
          isPaid,
        })
      : deriveActionViewFromView({ isPaid });

    // 잠금 메타(★ content 0): 내 갭 전체 - 무료 노출 행동 = 잠긴 개수. 잠긴 행동 content 는 응답에 없음.
    const totalMyGaps = gapRows.filter((r) => r.isMyGap === true).length;
    const paywall = computePaywallMeta(totalMyGaps, actions.length, paid);

    return NextResponse.json({
      data: { actions, todayOne, intro, isPaid: paid, paywall },
      success: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid diagnosisId", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("GET /api/action error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
