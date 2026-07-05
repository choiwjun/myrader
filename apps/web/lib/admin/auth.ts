// @SPEC docs/superpowers/specs/2026-06-17-admin-dashboard-design.md §4.2
// 관리자 인증: ADMIN_PASSWORD 비교 + SESSION_SECRET HMAC 서명 쿠키(boina_admin).
// 고객 세션(session.ts)과 동형이나 payload 가 {admin:true} 로 격리된다.

import { createHmac, timingSafeEqual } from "node:crypto";
import { ADMIN_MAX_AGE_SEC } from "@/lib/auth/cookie-constants";

interface AdminPayload {
  admin: true;
  iat: number;
}

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

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** 설정된 관리자 비밀번호(trim). 미설정/빈 값이면 null. */
function getAdminPassword(): string | null {
  const pw = process.env.ADMIN_PASSWORD?.trim();
  return pw && pw.length > 0 ? pw : null;
}

/** ADMIN_PASSWORD 가 설정되어 admin 기능이 가용한가. */
export function isAdminConfigured(): boolean {
  return getAdminPassword() !== null;
}

/** 입력 비밀번호를 상수시간 비교한다. 미설정이면 항상 false(차단). */
export function verifyAdminPassword(input: string): boolean {
  const expected = getAdminPassword();
  if (expected === null) return false;
  // 길이 누출 방지: 양쪽을 고정 길이(32B) HMAC 다이제스트로 정규화 후 상수시간 비교.
  const key = getSecret();
  const a = createHmac("sha256", key).update(Buffer.from(input)).digest();
  const b = createHmac("sha256", key).update(Buffer.from(expected)).digest();
  return timingSafeEqual(a, b);
}

/** HMAC 서명된 관리자 토큰 발급. */
export function signAdminToken(): string {
  const payload: AdminPayload = { admin: true, iat: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** 관리자 토큰 검증. 형식 오류·서명 불일치·만료 시 false. */
export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return false;
  if (!safeEqualHex(sig, sign(encoded))) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AdminPayload;
    if (payload.admin !== true || typeof payload.iat !== "number") return false;
    if (Date.now() - payload.iat > ADMIN_MAX_AGE_SEC * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

/** httpOnly 관리자 쿠키 옵션(프로덕션 secure). */
export function adminCookieOptions(): {
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
    maxAge: ADMIN_MAX_AGE_SEC,
  };
}
