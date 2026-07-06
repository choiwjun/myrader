// @TASK P2-R5 / P3-R1 - action 조회/완료 진입점 (Next.js Route Handler) + 페이월 서버 강제
// @SPEC specs/screens/actions.yaml (S5: action filters.diagnosisId, needs id/title/tier/isTodayOne/deeplink/doneable/isPaid + paywall_gate)
// @SPEC specs/domain/resources.yaml (action 리소스)
// @SPEC docs/planning/07-coding-convention.md §4 (누가-하나 부착·인과 단정 0·추측 행동 금지·경계 일관)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러 / 비민감)
// @SPEC x-sag-FR012-competitor-gap-wiring-spec.md (GapResult 영속화 [OPEN])
// @TEST apps/web/tests/diagnosis/action-route.test.ts
//
// 리소스 중심(REST):
//   GET   /api/action?diagnosisId=[&tier=] → 4분류 행동 + "오늘 딱 하나" + 페이월 메타
//   PATCH /api/action                  → 행동 완료 상태 토글
//
// S5 의 행동 카드 데이터. 룰 코드값 비노출 — 사장님 언어 title 만. 4분류 누가-하나 부착.

import {
  deriveActionViewFromGapItems,
  deriveActionViewFromView,
} from "@/lib/diagnosis/action-service";
import { getDefaultDiagnosisRepository } from "@/lib/diagnosis/diagnosis-repository";
import { getDiagnosisView } from "@/lib/diagnosis/diagnosis-service";
import { deriveGapViewFromPersisted } from "@/lib/diagnosis/gap-service";
import {
  getDefaultDb,
  getPersistedActions,
  getPersistedGapRows,
  setPersistedActionCompletion,
} from "@/lib/diagnosis/persistence-repository";
import { computePaywallMeta, resolveRequestPlanTier } from "@/lib/diagnosis/plan-tier";
import { NextResponse } from "next/server";
import { z } from "zod";

// DB/세션(plan)에 의존하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
export const dynamic = "force-dynamic";

const ActionTierSchema = z.enum(["green_self", "yellow_copy", "red_vendor", "gray_ongoing"]);
const UpdateActionCompletionSchema = z.object({
  diagnosisId: z.string().uuid(),
  actionId: z.string().min(1),
  completed: z.boolean(),
});

type ActionRecord = ReturnType<typeof decorateAction>;

function decorateAction(
  action: {
    id: string;
    title: string;
    tier: "green_self" | "yellow_copy" | "red_vendor" | "gray_ongoing";
    isTodayOne: boolean;
    deeplink?: string;
    doneable: boolean;
    isPaid: boolean;
  },
  completionMap: Map<string, { isCompleted: boolean; completedAt: string | null }>,
) {
  const completion = completionMap.get(action.id);
  return {
    ...action,
    isCompleted: completion?.isCompleted ?? false,
    completedAt: completion?.completedAt ?? null,
  };
}

function filterActionsByTier(actions: ActionRecord[], tier?: z.infer<typeof ActionTierSchema>) {
  return tier ? actions.filter((action) => action.tier === tier) : actions;
}

// GET ?diagnosisId=[&tier=] — 4분류 행동 + 오늘 딱 하나 + 인트로 + 페이월 메타. 공개(S5; 경계는 세션 plan).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const diagnosisId = z.string().uuid().parse(searchParams.get("diagnosisId"));
    const rawTier = searchParams.get("tier");
    const tier = rawTier === null ? undefined : ActionTierSchema.parse(rawTier);

    // ★ 유료(실행팩) 경계 — 서버 세션 account.plan 으로만 결정(클라 ?paid=1 무시). 익명=free.
    const { isPaid } = await resolveRequestPlanTier();

    const view = await getDiagnosisView(getDefaultDiagnosisRepository(), diagnosisId);
    if (!view) {
      return NextResponse.json(
        { error: "Diagnosis not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    }

    const db = getDefaultDb();
    const gapRows = await getPersistedGapRows(db, diagnosisId);
    const persistedActions =
      typeof getPersistedActions === "function" ? await getPersistedActions(db, diagnosisId) : [];

    const completionMap = new Map(
      persistedActions.map((action) => [
        action.actionRef,
        {
          isCompleted: action.isCompleted === true,
          completedAt: action.completedAt?.toISOString() ?? null,
        },
      ]),
    );

    const allGapItems = gapRows.length > 0 ? deriveGapViewFromPersisted(gapRows, { isPaid: true }).items : [];
    const allActionView =
      allGapItems.length > 0
        ? deriveActionViewFromGapItems(allGapItems, { isPaid: true })
        : deriveActionViewFromView({ isPaid: true });
    const visibleActionView =
      allGapItems.length > 0
        ? deriveActionViewFromGapItems(allGapItems, { isPaid })
        : deriveActionViewFromView({ isPaid });

    const actions = filterActionsByTier(
      visibleActionView.actions
        .map((action) => decorateAction(action, completionMap))
        .filter((action) => visibleActionView.isPaid || !action.isPaid),
      tier,
    );
    const totalActions = filterActionsByTier(
      allActionView.actions.map((action) => decorateAction(action, completionMap)),
      tier,
    );
    const todayOne = visibleActionView.todayOne
      ? decorateAction(visibleActionView.todayOne, completionMap)
      : null;
    const paywall = computePaywallMeta(totalActions.length, actions.length, visibleActionView.isPaid);

    return NextResponse.json({
      data: {
        actions,
        todayOne,
        intro: visibleActionView.intro,
        isPaid: visibleActionView.isPaid,
        paywall,
      },
      success: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameter", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("GET /api/action error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}

// PATCH body { diagnosisId, actionId, completed } — 행동 완료 상태 토글.
export async function PATCH(request: Request) {
  try {
    const input = UpdateActionCompletionSchema.parse(await request.json());
    const view = await getDiagnosisView(getDefaultDiagnosisRepository(), input.diagnosisId);
    if (!view) {
      return NextResponse.json(
        { error: "Diagnosis not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    }

    const updated = await setPersistedActionCompletion(
      getDefaultDb(),
      input.diagnosisId,
      input.actionId,
      input.completed,
    );
    if (!updated) {
      return NextResponse.json(
        { error: "Action not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        actionId: updated.actionRef,
        isCompleted: updated.isCompleted === true,
        completedAt: updated.completedAt?.toISOString() ?? null,
      },
      success: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("PATCH /api/action error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
