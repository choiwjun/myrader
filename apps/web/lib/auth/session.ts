// @TASK P1-R1 - 쿠키 세션 (HMAC 서명, 외부 의존성 0)
// @SPEC .claude/constitutions/nextjs/auth.md (단일 Auth 레이어 — 세션)
// @SPEC docs/planning/07-coding-convention.md (시크릿 .env, 하드코딩 금지)
//
// 세션 전략: NextAuth 등 외부 IdP 미확정([OPEN]) 상태에서 골격이 실제 동작하도록
// node:crypto HMAC-SHA256 으로 서명한 stateless 쿠키 토큰을 사용한다.
// 토큰 = base64url(payload).hex(hmac). 변조 시 timingSafeEqual 로 거부.
//
// [SECURITY]
//  - 시크릿은 SESSION_SECRET(.env). 하드코딩 금지. 미설정 시 명시적 throw.
//  - 서명 비교는 timingSafeEqual(타이밍 공격 방지).
//  - 쿠키는 httpOnly + sameSite=lax + secure(prod) 로 설정(아래 cookieOptions).

import { createHmac, timingSafeEqual } from "node:crypto";
// 쿠키 상수는 Edge-safe 모듈에서 단일 정의 → 재노출(미들웨어는 그 모듈만 import).
// SESSION_MAX_AGE_SEC 는 만료 판정에 내부 사용, SESSION_COOKIE 는 재노출만.
import { SESSION_MAX_AGE_SEC } from "./cookie-constants";

export { SESSION_COOKIE, SESSION_MAX_AGE_SEC } from "./cookie-constants";

export interface SessionPayload {
  /** 인증된 account UUID (accounts.id). */
  accountId: string;
  /** 발급 시각(ms epoch). 만료 판정용. */
  iat: number;
}

/**
 * 세션 서명 시크릿을 .env(SESSION_SECRET)에서 읽는다.
 * 미설정이면 명시적으로 throw — 안전하지 않은 기본값으로 빠지지 않는다.
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is not set (or too short). Define a strong secret in .env (>=16 chars).",
    );
  }
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("hex");
}

/** HMAC 서명된 세션 토큰을 발급한다. */
export function signSessionToken(input: { accountId: string }): string {
  const payload: SessionPayload = { accountId: input.accountId, iat: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** 두 hex 서명을 상수시간 비교한다(타이밍 공격 방지). */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * 세션 토큰을 검증하고 페이로드를 복원한다.
 * 형식 오류·서명 불일치·만료 시 null 을 반환한다(예외를 던지지 않음).
 */
export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  if (!safeEqualHex(sig, sign(encoded))) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (typeof payload.accountId !== "string" || typeof payload.iat !== "number") {
      return null;
    }
    if (Date.now() - payload.iat > SESSION_MAX_AGE_SEC * 1000) {
      return null; // 만료
    }
    return payload;
  } catch {
    return null;
  }
}

/** httpOnly 세션 쿠키 옵션(프로덕션에서 secure). */
export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}
