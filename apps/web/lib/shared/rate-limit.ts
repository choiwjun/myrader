// @TASK 수정라운드A-3 - 공개 API rate limit (IP/세션 기반 in-memory 토큰버킷)
// @SPEC docs/planning/DECISION_LOG.md (OQ-5: 인프라 미결정 — 경량 원칙, 인프라 추상화 뒤)
// @SPEC .claude/constitutions/nextjs/api-routes.md (남용 완화 — 비민감 429)
// @TEST apps/web/tests/shared/rate-limit.test.ts
//
// 외부 QA 보안 지적(소유권 검증 없는 공개 API 남용 완화): 익명 공개 API(검색/진단 생성)에
// IP 또는 세션 기반 rate limit 을 건다. v1 은 OQ-5(인프라 미결정) 경량 원칙에 따라
// *in-memory 토큰버킷*으로 구현하되, 인터페이스를 추상화해 추후 Redis 등으로 교체 가능하게 둔다.
//
// [한계 명시] 단일 프로세스 in-memory — 다중 인스턴스/서버리스에서는 인스턴스별로 카운트된다.
//   완전한 분산 rate limit 은 OQ-5 인프라 확정(Redis 등) 후 동일 인터페이스로 교체한다(발명 금지).
//   그래도 "무한 진단 생성·검색" 류 단순 남용은 인스턴스 단위로도 유의미하게 완화된다.

/** rate limit 판정 결과. */
export interface RateLimitResult {
  /** 허용 여부(false 면 호출부가 429 로 거부). */
  allowed: boolean;
  /** 이 윈도에서 남은 허용 횟수(0 이상). */
  remaining: number;
  /** 윈도 리셋까지 남은 밀리초(429 응답 Retry-After 계산용). */
  retryAfterMs: number;
}

/** rate limiter 추상 인터페이스 — in-memory / 분산(추후) 교체 경계. */
export interface RateLimiter {
  /** key(IP/세션 등) 단위로 1회 소비를 시도한다. */
  check(key: string): RateLimitResult;
}

export interface FixedWindowOptions {
  /** 윈도 길이(ms). 예: 60_000(1분). */
  windowMs: number;
  /** 윈도당 최대 허용 횟수. */
  max: number;
}

interface Bucket {
  /** 현재 윈도 시작 시각(ms epoch). */
  windowStart: number;
  /** 현재 윈도에서 소비한 횟수. */
  count: number;
}

/**
 * 고정 윈도(fixed-window) in-memory rate limiter.
 * - key 별로 windowMs 동안 최대 max 회 허용. 윈도가 지나면 카운트 리셋.
 * - 메모리 누수 방지: 만료된 버킷은 check 시점에 lazy 하게 정리한다.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly buckets = new Map<string, Bucket>();
  /** lazy 정리 트리거 간격(호출 횟수 기준) — Map 무한 증가 방지. */
  private opsSinceSweep = 0;
  private static readonly SWEEP_EVERY = 500;

  constructor(options: FixedWindowOptions) {
    if (options.windowMs <= 0 || options.max <= 0) {
      throw new Error("rate-limit: windowMs and max must be positive");
    }
    this.windowMs = options.windowMs;
    this.max = options.max;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    this.maybeSweep(now);

    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      // 새 윈도 시작(첫 호출 또는 이전 윈도 만료) — 1회 소비.
      this.buckets.set(key, { windowStart: now, count: 1 });
      return { allowed: true, remaining: this.max - 1, retryAfterMs: 0 };
    }

    if (bucket.count >= this.max) {
      // 윈도 한도 초과 → 거부. 리셋까지 남은 시간 안내.
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: this.windowMs - (now - bucket.windowStart),
      };
    }

    bucket.count += 1;
    return { allowed: true, remaining: this.max - bucket.count, retryAfterMs: 0 };
  }

  /** 만료 버킷 lazy 정리(메모리 상한 — 주기적 스윕). */
  private maybeSweep(now: number): void {
    this.opsSinceSweep += 1;
    if (this.opsSinceSweep < InMemoryRateLimiter.SWEEP_EVERY) return;
    this.opsSinceSweep = 0;
    for (const [key, b] of this.buckets) {
      if (now - b.windowStart >= this.windowMs) this.buckets.delete(key);
    }
  }
}

/**
 * Request 에서 rate limit key 를 뽑는다(우선순위: 세션 쿠키 → 클라 IP).
 * - 세션이 있으면 세션 토큰을 키로(로그인 사용자 단위).
 * - 없으면(익명) X-Forwarded-For 의 첫 IP, 그것도 없으면 "anon" 고정 버킷.
 * IP 헤더는 프록시 신뢰 경계에 따라 위조 가능하나, 단순 남용 완화엔 충분하다(OQ-5 경량).
 */
export function rateLimitKeyFromRequest(request: Request, sessionToken?: string | null): string {
  if (sessionToken && sessionToken.length > 0) {
    return `s:${sessionToken}`;
  }
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim();
  const real = ip || request.headers.get("x-real-ip")?.trim();
  return `ip:${real || "anon"}`;
}
