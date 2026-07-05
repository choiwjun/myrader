// @TASK P2-R2 - channelStatus 조회 진입점 (Next.js Route Handler)
// @SPEC specs/screens/my-status.yaml (S2: channelStatus filters.diagnosisId, needs channel/signal/summaryLine/found/note)
// @SPEC specs/domain/resources.yaml (channelStatus 리소스)
// @SPEC docs/planning/02-trd.md §2 (데이터소스·게이팅) / 07 §4 (점수 비노출)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러 / 비민감)
// @TEST apps/web/tests/diagnosis/channel-status-route.test.ts
//
// 리소스 중심(REST): GET /api/channel-status?diagnosisId= → 채널 신호등 3종(naver/google/ai).
// S2 의 채널 카드(연료) 데이터. 점수 비노출 — signal + 사장님 언어만.
//
// 04 §4 영속화 이후(실데이터 경로): DB engine_results(채널별 진단 항목 + 내부 점수)로 채널
// 신호등을 산출한다(deriveChannelStatusesFromPersisted). 점수 비노출(07 §4) — 응답엔 signal 만.
// ai 는 grounded 실인용 근거 없이 green 불가(게이팅 유지). engine_results 가 없으면(미진단/구진단)
// 진단 view(전체 신호등)만으로 정직 폴백(deriveChannelStatusesFromView) — 추측 단정 0.

import {
  deriveChannelStatusesFromPersisted,
  deriveChannelStatusesFromView,
} from "@/lib/diagnosis/channel-status-service";
import { getDefaultDiagnosisRepository } from "@/lib/diagnosis/diagnosis-repository";
import { getDiagnosisView } from "@/lib/diagnosis/diagnosis-service";
import { getDefaultDb, getPersistedEngineResults } from "@/lib/diagnosis/persistence-repository";
import { NextResponse } from "next/server";
import { z } from "zod";

// DB 에 의존하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
export const dynamic = "force-dynamic";

// 진단 완료로 보는 상태(채널 신호 산출 가능). 그 외는 "준비 중" 폴백.
const COMPLETED_STATUSES = new Set(["completed", "partial"]);

// GET ?diagnosisId= — 채널 신호등 3종(naver/google/ai). 공개(S2 auth:false).
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

    // 실데이터 경로: 영속화된 engine_results 로 채널 신호등 산출(점수 비노출).
    const engineResults = await getPersistedEngineResults(getDefaultDb(), diagnosisId);
    const channels =
      engineResults.length > 0
        ? deriveChannelStatusesFromPersisted(engineResults)
        : // 미진단/구진단: engine_results 없음 → 진단 view 만으로 정직 폴백(추측 0).
          deriveChannelStatusesFromView({
            overallSignal: view.overallSignal,
            completed: COMPLETED_STATUSES.has(view.status),
          });

    return NextResponse.json({ data: { channels }, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid diagnosisId", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("GET /api/channel-status error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
