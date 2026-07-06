// @TASK P2-R3 - competitor 조회 진입점 (Next.js Route Handler)
// @SPEC specs/screens/vs-competitor.yaml (S3: competitor filters.diagnosisId, needs id/name/channel/beatsMe/rank/source)
// @SPEC specs/domain/resources.yaml (competitor 리소스)
// @SPEC docs/planning/07-coding-convention.md §4 (점수 비노출·추측 경쟁사 금지)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러 / 비민감)
// @TEST apps/web/tests/diagnosis/competitor-route.test.ts
//
// 리소스 중심(REST): GET /api/competitor?diagnosisId= → 실측 라이벌 + 손실 헤드라인.
// S3 의 비교 카드(누가) 데이터. 점수 비노출 — source 로 출처 정직 표기.
//
// v1 한계(정직): DB(04 스키마)는 진단 원자료(naverPresence.competitorTop /
// llmValidation.competitors)를 영속화하지 않으므로(competitors 테이블은 P0-T2 로 존재하나
// 잡 파이프라인이 아직 채우지 않음 — [OPEN], 스키마/잡 수정 금지), route 는 신뢰 경쟁사
// 원자료 없이 정직 폴백을 산출한다(deriveCompetitorViewFromView): 추측 경쟁사 0(빈 배열) +
// 응원 헤드라인. 원자료 영속화 후 deriveCompetitorsFromDiagnosis 로 승급([OPEN]).

import {
  deriveCompetitorViewFromPersisted,
  deriveCompetitorViewFromView,
} from "@/lib/diagnosis/competitor-service";
import { getDefaultDiagnosisRepository } from "@/lib/diagnosis/diagnosis-repository";
import { getDiagnosisView } from "@/lib/diagnosis/diagnosis-service";
import { getLlmValidationMeasurement } from "@/lib/diagnosis/measurement";
import {
  getDefaultDb,
  getPersistedCompetitors,
  getPersistedEngineResults,
} from "@/lib/diagnosis/persistence-repository";
import { NextResponse } from "next/server";
import { z } from "zod";

// DB 에 의존하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
export const dynamic = "force-dynamic";

// GET ?diagnosisId= — 실측 라이벌 + 손실/응원 헤드라인. 공개(S3 auth:false).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const diagnosisId = z.string().uuid().parse(searchParams.get("diagnosisId"));

    const view = await getDiagnosisView(getDefaultDiagnosisRepository(), diagnosisId);
    if (!view) {
      return NextResponse.json(
        { error: "Diagnosis not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    }

    // 실데이터 경로: 영속화된 competitors(신뢰 소스만) → 라이벌 카드. 없으면 정직 빈 상태(추측 0).
    const db = getDefaultDb();
    const [persisted, engineResults] = await Promise.all([
      getPersistedCompetitors(db, diagnosisId),
      getPersistedEngineResults(db, diagnosisId),
    ]);
    const llmMeasurement = getLlmValidationMeasurement(engineResults)?.payload;
    const { competitors, headline } =
      persisted.length > 0
        ? deriveCompetitorViewFromPersisted(persisted, { llmMeasurement })
        : deriveCompetitorViewFromView();

    return NextResponse.json({ data: { competitors, headline }, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid diagnosisId", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("GET /api/competitor error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
