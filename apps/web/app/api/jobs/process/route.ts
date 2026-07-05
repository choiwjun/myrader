// @TASK 수정R2-A-1 - 잡 처리 트리거 route (내부/cron 전용, 시크릿 가드)
// @SPEC docs/planning/02-trd.md §3 (잡 상태 → diagnosis)
// @SPEC docs/planning/DECISION_LOG.md (OQ-5 경량 잡 — 워커/스케줄러 최소화)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / 일관 응답 / 비-200 에러 / 비민감)
// @SPEC apps/web/lib/diagnosis/README.md (잡 워커 운영 가이드)
// @TEST apps/web/tests/diagnosis/jobs-process-route.test.ts
//
// 진단 잡 처리(drain) 트리거. 두 가지 호출자를 가정한다:
//   1) Vercel Cron(vercel.json) — 주기적으로 GET 호출(Authorization: Bearer ${CRON_SECRET}).
//   2) 외부 스케줄러/운영자 — POST 호출(x-jobs-secret: ${JOBS_PROCESS_SECRET}).
// enqueue 직후 백그라운드 drain 이 1차 경로지만, 인스턴스 사망 등으로 남은 고아 잡을 이 route 가
// 주기 호출로 복구한다(2차 경로). 멱등·동시성 안전(DbBacked claim) — 같은 잡 2회 처리 0.
//
// 시크릿 가드: 공개 호출(임의 trigger)을 막는다. 시크릿 미설정 환경(로컬/dev)에서는 개방하되,
// production 에서는 반드시 시크릿 일치를 요구한다(무단 drain·자원 남용 차단).

import { processJobQueue } from "@/lib/jobs";
import { isProduction } from "@/lib/shared/runtime-env";
import { NextResponse } from "next/server";

// DB/잡 큐에 의존하는 동적 route — 빌드타임 prerender 제외(env 없이 build 성공).
export const dynamic = "force-dynamic";

/** 길이 누설을 줄인 상수시간 비교(타이밍 공격 완화). 빈 값은 항상 불일치. */
function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  let mismatch = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

/**
 * 요청이 잡 처리 권한을 갖는지 판정한다.
 *  - JOBS_PROCESS_SECRET 과 x-jobs-secret 헤더 일치, 또는
 *  - CRON_SECRET 과 Authorization: Bearer 일치(Vercel Cron 규약).
 * production 에서 시크릿이 하나도 설정되지 않았으면 거부한다(개방 금지).
 * 비-production 에서 시크릿 미설정이면 개방한다(로컬 dev 편의).
 */
function isAuthorized(request: Request): boolean {
  const jobsSecret = process.env.JOBS_PROCESS_SECRET ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";

  if (!jobsSecret && !cronSecret) {
    // 시크릿 미설정: production 은 거부(무단 trigger 차단), dev/test 는 개방.
    return !isProduction();
  }

  const headerSecret = request.headers.get("x-jobs-secret") ?? "";
  if (jobsSecret && timingSafeEqual(headerSecret, jobsSecret)) return true;

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (cronSecret && timingSafeEqual(bearer, cronSecret)) return true;

  return false;
}

/** 잡을 drain 하고 처리 건수를 반환한다(공통). */
async function handle(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN", success: false },
      { status: 403 },
    );
  }
  try {
    const processed = await processJobQueue();
    return NextResponse.json({ data: { processed }, success: true });
  } catch (error) {
    console.error("POST /api/jobs/process error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}

/** POST — 외부 스케줄러/운영자 트리거(x-jobs-secret). */
export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}

/** GET — Vercel Cron 트리거(Authorization: Bearer ${CRON_SECRET}). */
export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}
