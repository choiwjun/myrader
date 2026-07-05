// @TASK P0-T3 / P1-R2 - 진단 enqueue 진입점 (Next.js Route Handler)
// @SPEC docs/planning/02-trd.md#3-백그라운드-잡
// @SPEC .claude/constitutions/nextjs/api-routes.md
// @TEST apps/web/tests/diagnosis-enqueue.test.ts
//
// 리소스 중심(REST): POST /api/diagnosis → 진단 행 생성 + 잡 enqueue
// (즉답 불가한 느린 분석을 백그라운드로 → 202 Accepted + diagnosisId/jobId).
// GET ?id= → 진단 상태/신호등 조회 (화면 진행 표시: queued/running/done/failed).
//
// P1-R2: businessId + businessProfile 이 오면 diagnoses 행을 만들고(파이프라인 대상),
// 완전한 payload 로 enqueue 한다. (target-only 골격 잡은 하위호환 유지.)
// 헌법(api-routes.md): try-catch / Zod 검증 / 일관 응답 / 비-200 에러 / 민감정보 비노출.
//
// ★ 접근 모델(capability token — 의도된 설계, lib/diagnosis/README.md):
//   diagnosisId/businessId 는 *추측 불가능한 UUID v4 capability token* 이다(DB gen_random_uuid).
//   S1~S6 는 익명(auth:false, AC-1)이라 세션 소유권 검증이 성립하지 않으므로, "토큰 보유 =
//   접근 권한" 모델을 쓴다(열거·추측 불가 + 응답은 비민감 데이터만). 결제·설정·페이월 등
//   쓰기·권한·계정 데이터는 별도로 세션 인증·소유권 검증을 강제한다(README 경계표 참조).
//   남용(무한 생성)은 rate limit 으로 완화한다(lib/shared/rate-limit.ts).

import { getDefaultBusinessRepository } from "@/lib/business";
import { findActiveDiagnosisForBusiness } from "@/lib/diagnosis/diagnosis-dedup";
import { getDefaultDiagnosisRepository } from "@/lib/diagnosis/diagnosis-repository";
import { getDiagnosisView } from "@/lib/diagnosis/diagnosis-service";
import { DIAGNOSIS_JOB_TYPE, getJobQueue, kickBackgroundDrain } from "@/lib/jobs";
import { diagnosisCreateLimiter, enforceRateLimit } from "@/lib/shared/api-rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";

// DB/잡 큐에 의존하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
export const dynamic = "force-dynamic";

// 진단 대상 비즈니스 프로파일 (엔진 입력에 필요).
const BusinessProfileSchema = z.object({
  businessName: z.string().min(1).max(50),
  industry: z.string().min(1),
  region: z.string().min(1),
  mainServices: z.array(z.string().max(50)).min(1).max(5),
  targetKeywords: z.array(z.string().max(30)).min(1).max(10),
});

// 입력 검증 (헌법 §3 Zod).
const EnqueueDiagnosisSchema = z.object({
  target: z.string().min(1).max(2048),
  /** 진단 대상 가게 id — 있으면 diagnoses 행을 만들고 파이프라인을 배선한다. */
  businessId: z.string().uuid().optional(),
  businessProfile: BusinessProfileSchema.optional(),
  modules: z.array(z.enum(["seo", "aeo", "geo", "a11y", "backlink", "perf"])).optional(),
  sourceType: z
    .enum([
      "website",
      "naver_place",
      "naver_blog",
      "instagram",
      "kakao_place",
      "youtube",
      "facebook",
      "other_platform",
    ])
    .optional(),
  /** grounded LLM 가시성 검증 요청(게이트 통과 시에만 실제 활성). */
  requestLlmValidation: z.boolean().optional(),
});

// POST — 진단 행 생성 + 잡 enqueue (느린 분석 → 백그라운드)
export async function POST(request: Request) {
  // 남용 완화: 공개 진단 생성에 rate limit(무한 진단 enqueue 차단).
  const limited = enforceRateLimit(request, diagnosisCreateLimiter);
  if (limited) return limited;
  try {
    const body = await request.json();
    const input = EnqueueDiagnosisSchema.parse(body);

    // 실 진단 경로: businessId 가 있으면 diagnoses 행을 만들고 diagnosisId 를 항상 발급한다.
    // (S1→S2 전파 보장: /status?diagnosisId= 로 넘어가려면 diagnosisId 가 반드시 필요.)
    // businessProfile 이 함께 오면 엔진 파이프라인을 완주하고, 없으면(placeUrl-only 등)
    // 후보 정보로 최소 프로파일을 구성해 enqueue 한다(diagnosisId 누락 방지).
    if (input.businessId) {
      // ★ businessId 검증(수정라운드A-3c): 존재하지 않는(또는 삭제된) business 로는
      //   진단을 만들지 않는다. capability token(비추측 UUID)이 유효한 자원을 가리키는지
      //   확인 — 없으면 404(FK 위반/고아 진단행 방지).
      const business = await getDefaultBusinessRepository().findById(input.businessId);
      if (!business) {
        return NextResponse.json(
          { error: "Business not found", code: "NOT_FOUND", success: false },
          { status: 404 },
        );
      }

      const repo = getDefaultDiagnosisRepository();

      // ★ dedup(수정R2-A-3): 같은 businessId 의 queued/running 진단이 이미 있으면 새로 만들지 않고
      //   기존 diagnosisId 를 반환한다(중복 크롤·LLM 비용 차단). 진단은 수십초라 폴링 중 재요청·
      //   더블클릭이 흔하다 — 같은 가게에 진단이 동시에 여러 개 생기지 않게 한다.
      const active = await findActiveDiagnosisForBusiness(repo, input.businessId);
      if (active) {
        return NextResponse.json(
          {
            data: { diagnosisId: active.id, jobId: active.id, status: active.status },
            success: true,
          },
          { status: 202 },
        );
      }

      const diagnosis = await repo.create({ businessId: input.businessId });

      const queue = getJobQueue();
      const job = await queue.enqueue({
        type: DIAGNOSIS_JOB_TYPE,
        diagnosisId: diagnosis.id,
        payload: {
          diagnosisId: diagnosis.id,
          target: input.target,
          sourceType: input.sourceType ?? "website",
          // 프로파일 없으면 파이프라인은 건너뛰되(핸들러 가드), diagnosisId 는 발급된다.
          businessProfile: input.businessProfile,
          modules: input.modules ?? ["seo", "aeo", "geo"],
          requestLlmValidation: input.requestLlmValidation ?? false,
        },
      });

      // ★ 워커 트리거(수정R2-A-1): enqueue 직후 백그라운드 drain 을 띄운다(응답을 막지 않음).
      //   표준 배포에서 워커·스케줄러 없이도 진단이 자동 완주하게 하는 1차 경로(같은 프로세스 →
      //   full fidelity). 미완 잡은 cron 트리거(/api/jobs/process)가 복구한다(2차 경로).
      kickBackgroundDrain();

      // 202 Accepted: 백그라운드 진행. 화면은 diagnosisId 로 폴링.
      return NextResponse.json(
        {
          data: { diagnosisId: diagnosis.id, jobId: job.id, status: diagnosis.status },
          success: true,
        },
        { status: 202 },
      );
    }

    // 하위호환(골격) 경로: businessId 도 없는 target-only.
    // 정상 흐름은 항상 business 를 먼저 확정해 businessId 를 전달한다(diagnosisId 보장). DbBacked
    // 큐는 반영 대상 diagnoses 행(diagnosisId)이 없으면 enqueue 할 수 없으므로(스키마상 잡=진단행),
    // 이 경로는 DB/큐를 건드리지 않고 즉시 안내만 반환한다(고아 잡 0). 진단을 실제로 시작하려면
    // businessId 와 함께 호출해야 한다(클라이언트 /find 는 항상 그렇게 한다).
    return NextResponse.json(
      {
        error: "businessId is required to start a diagnosis",
        code: "BUSINESS_ID_REQUIRED",
        success: false,
      },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("POST /api/diagnosis error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}

// GET ?id= (진단 상태/신호등) 또는 ?jobId= (잡 상태) — 화면 진행 표시용.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const diagnosisId = searchParams.get("id");

    // 진단 행 조회: status(queued/running/completed/failed) + overallSignal(신호등, 07 §4).
    if (diagnosisId) {
      const id = z.string().uuid().parse(diagnosisId);
      const view = await getDiagnosisView(getDefaultDiagnosisRepository(), id);
      if (!view) {
        return NextResponse.json(
          { error: "Diagnosis not found", code: "NOT_FOUND", success: false },
          { status: 404 },
        );
      }
      return NextResponse.json({ data: view, success: true });
    }

    // 잡 상태 조회(하위호환).
    const jobId = z.string().min(1).parse(searchParams.get("jobId"));
    const status = await getJobQueue().getStatus(jobId);
    if (!status) {
      return NextResponse.json(
        { error: "Job not found", code: "NOT_FOUND", success: false },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: { jobId, status }, success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid id", code: "VALIDATION_ERROR", success: false },
        { status: 400 },
      );
    }
    console.error("GET /api/diagnosis error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}
