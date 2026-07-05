// @TASK 수정라운드A-3 - 공개 API rate limit 배선 (검색/확정/진단 생성 — 남용 완화)
// @SPEC docs/planning/DECISION_LOG.md (OQ-5: 인프라 미결정 — 경량/추상화 뒤)
// @SPEC .claude/constitutions/nextjs/api-routes.md (429 일관 응답 / 비민감)
// @TEST apps/web/tests/shared/rate-limit.test.ts
//
// 공개(익명) API 진입점에 IP/세션 기반 rate limit 을 적용한다. 한도는 경량 기본값으로
// 두되(과도한 자동 진단 생성·검색 남용 완화), 정상 사용자(검색→확정→진단 1회 흐름)는
// 절대 막지 않는 넉넉한 윈도를 쓴다. 인터페이스는 rate-limit.ts 추상화 뒤 — 추후 분산 교체.

import { SESSION_COOKIE } from "@/lib/auth/cookie-constants";
import { NextResponse } from "next/server";
import { InMemoryRateLimiter, rateLimitKeyFromRequest } from "./rate-limit";

// 분(60s) 윈도. 정상 흐름(검색 몇 번 + 확정 1 + 진단 1)은 충분히 통과하되,
// 스크립트성 무한 호출은 분 단위로 차단된다(인스턴스 단위 — OQ-5 경량 한계 명시).

/** 가게 검색(GET /api/business) — 후보 탐색은 몇 번 반복할 수 있어 넉넉히. */
export const businessSearchLimiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 30 });

/** 가게 확정(POST /api/business) — 확정은 드문 행위. business 행 무한 생성 완화. */
export const businessConfirmLimiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 10 });

/** 진단 생성(POST /api/diagnosis) — 잡 enqueue 남용(무한 진단) 완화. */
export const diagnosisCreateLimiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 10 });

/**
 * 일반 로그인(POST /api/auth/login) — 비밀번호 brute-force·이메일 enumeration 완화.
 * 관리자 로그인과 동일하게 분당 10회(클라이언트 key 단위). 정상 사용자(몇 번 재시도)는 충분,
 * 자동 추측 폭주는 차단. scrypt 해시가 1차 방어지만 rate-limit 으로 시도 자체를 막는다.
 */
export const authLoginLimiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 10 });

/**
 * 관리자 로그인(POST /api/admin/login) — ADMIN_PASSWORD 단일 공유 비밀 brute-force 완화.
 * 공개 API 보다 빡빡하게: 분당 10회(클라이언트 key 단위). 정상 관리자는 충분, 자동 추측은 차단.
 */
export const adminLoginLimiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 10 });

/**
 * 관리자 회원 API(GET 목록·상세 / PATCH 액션) — 인증된 관리자만 접근하므로 한도는 넉넉히.
 * 분당 60회: 정상 운영(목록 페이징 + 상세 + 액션)은 충분, 스크립트성 폭주만 완화.
 */
export const adminMembersLimiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 60 });

/**
 * Request 의 Cookie 헤더에서 세션 토큰 값만 뽑는다(검증 없음 — rate-limit key 용).
 * 검증(서명/만료)은 인증 레이어 몫. 여기서는 동일 세션을 한 key 로 묶기만 한다.
 */
function readSessionTokenFromRequest(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}

/**
 * 주어진 limiter 로 이 요청을 검사한다. 차단이면 429 NextResponse 를, 통과면 null 을 반환한다.
 * 호출부: `const limited = enforceRateLimit(req, limiter); if (limited) return limited;`
 */
export function enforceRateLimit(
  request: Request,
  limiter: InMemoryRateLimiter,
): NextResponse | null {
  const key = rateLimitKeyFromRequest(request, readSessionTokenFromRequest(request));
  const result = limiter.check(key);
  if (result.allowed) return null;
  const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
  return NextResponse.json(
    { error: "Too many requests", code: "RATE_LIMITED", success: false },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
