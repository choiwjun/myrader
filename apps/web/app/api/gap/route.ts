// @TASK P2-R4 / P3-R1 - gapItem 조회 진입점 (Next.js Route Handler) + 페이월 서버 강제
// @SPEC specs/screens/reverse-gap.yaml (S4: gapItem filters.diagnosisId, needs id/label/competitorHas/iHave/category/actionTier/priority/isPaid + paywall_gate)
// @SPEC specs/domain/resources.yaml (gapItem 리소스)
// @SPEC docs/planning/07-coding-convention.md §4 (룰 코드값 노출 0·인과 단정 0·추측 갭 금지·경계 일관)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러 / 비민감)
// @SPEC x-sag-FR012-competitor-gap-wiring-spec.md (GapResult 영속화 [OPEN])
// @TEST apps/web/tests/diagnosis/gap-route.test.ts
//
// 리소스 중심(REST): GET /api/gap?diagnosisId= → 역공학 갭(어떻게) + 인트로 + 페이월 메타.
// S4 의 갭 매트릭스 카드 데이터. 룰 코드값 비노출 — 사장님 언어 label 만.
//
// ★ 보안(P3-R1): 무료/유료 경계는 서버 세션 account.plan 으로만 결정한다(resolveRequestPlanTier).
// 클라이언트의 `?paid=1`·요청 변조는 무시한다 — 무료가 유료 content(Top3 밖 전체 갭)에 접근 불가.
// 무료 응답엔 잠긴 갭의 실제 content 가 없고(서비스가 Top3 슬라이스), 잠금 개수(lockedCount)만 메타로 싣는다.
//
// v1 정직성: 자동발견 SERP 호출은 여전히 0(FR-012 MVP — 수동/파이프라인 저장 결과만 사용).
// route 는 먼저 저장된 gap_rows/competitors 를 읽고, gap_rows 가 없으면 경쟁사 측정은 있었지만
// GapResult 가 없다는 measured-unavailable 상태를 반환한다. 추측 갭 생성은 하지 않는다.

import { getDefaultDiagnosisRepository } from "@/lib/diagnosis/diagnosis-repository";
import { getDiagnosisView } from "@/lib/diagnosis/diagnosis-service";
import { deriveGapViewFromPersisted, deriveGapViewFromView } from "@/lib/diagnosis/gap-service";
import { normalizeEvidenceItems } from "@/lib/diagnosis/measurement";
import {
  getDefaultDb,
  getPersistedCompetitors,
  getPersistedGapRows,
} from "@/lib/diagnosis/persistence-repository";
import { computePaywallMeta, resolveRequestPlanTier } from "@/lib/diagnosis/plan-tier";
import { NextResponse } from "next/server";
import { z } from "zod";

// DB/세션(plan)에 의존하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
export const dynamic = "force-dynamic";

// GET ?diagnosisId= — 역공학 갭(어떻게) + 인트로 + 페이월 메타. 공개(S4 auth:false; 경계는 세션 plan).
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

    // 실데이터 경로: 영속화된 gap_rows(GapAnalyzer 산출) → gapItem. 없으면 정직 빈 상태(추측 0).
    const db = getDefaultDb();
    const [gapRows, competitors] = await Promise.all([
      getPersistedGapRows(db, diagnosisId),
      getPersistedCompetitors(db, diagnosisId),
    ]);
    const gapView =
      gapRows.length > 0
        ? deriveGapViewFromPersisted(gapRows, { isPaid })
        : deriveGapViewFromView({ isPaid });

    const totalMyGaps = gapRows.filter((r) => r.isMyGap === true).length;
    const paywall = computePaywallMeta(totalMyGaps, gapView.items.length, gapView.isPaid);
    const unavailableEvidence =
      gapRows.length === 0 && competitors.length > 0
        ? {
            source: competitors[0]?.source ?? "unavailable",
            collectedAt: competitors[0]?.collectedAt,
            evidence: normalizeEvidenceItems({
              reason: "competitor_reports_unavailable",
              source: competitors[0]?.source ?? "unavailable",
              collectedAt: competitors[0]?.collectedAt,
            }),
            measurementLabel: "unavailable" as const,
          }
        : null;

    return NextResponse.json({
      data: {
        items: gapView.items,
        intro: gapView.intro,
        isPaid: gapView.isPaid,
        paywall,
        source: unavailableEvidence?.source ?? gapView.source,
        collectedAt: unavailableEvidence?.collectedAt ?? gapView.collectedAt,
        evidence: unavailableEvidence?.evidence ?? gapView.evidence,
        measurementLabel: unavailableEvidence?.measurementLabel ?? gapView.measurementLabel,
      },
      success: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid diagnosisId", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("GET /api/gap error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
