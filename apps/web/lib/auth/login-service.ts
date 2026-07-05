// @TASK P1-R1 - 로그인 서비스 (자격증명 + dev-login 스텁)
// @SPEC .claude/constitutions/nextjs/auth.md (단일 인증)
// @SPEC docs/planning/DECISION_LOG.md ([OPEN] 외부 IdP 미확정 — dev-login 골격)
//
// 외부 IdP(Kakao 등) 실연동은 [OPEN](ADR). Phase 1 토대의 핵심인 세션·account 가
// 실제 동작하도록, 이메일/비번 자격증명 로그인과 개발용 dev-login(스텁)을 제공한다.
// 두 경로 모두 동일한 세션 토큰을 발급한다(단일 세션 체계).

import type { AccountRepository, PublicAccount } from "./account-service";
import { authenticateAccount } from "./account-service";
import { signSessionToken } from "./session";

export interface LoginResult {
  account: PublicAccount;
  /** 발급된 서명 세션 토큰(쿠키에 httpOnly 로 설정). */
  token: string;
}

/**
 * 이메일+비밀번호 자격증명으로 로그인한다.
 * 실패 시 null(계정 존재 여부 비노출).
 */
export async function loginWithCredentials(
  repo: AccountRepository,
  email: string,
  password: string,
): Promise<LoginResult | null> {
  const account = await authenticateAccount(repo, email, password);
  if (!account) return null;
  return { account, token: signSessionToken({ accountId: account.id }) };
}

/**
 * 개발용 dev-login — 외부 IdP 미연동 상태에서 골격 검증용.
 * 이메일로 계정을 찾고 없으면 생성(개발 환경 전용). 비밀번호는 무작위 placeholder.
 *
 * [SECURITY] 프로덕션에서는 절대 활성화하지 않는다(NODE_ENV=production → 거부).
 * 활성화 조건: NODE_ENV !== "production" AND DEV_LOGIN_ENABLED === "true".
 */
export function isDevLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_ENABLED === "true";
}

export async function devLogin(
  repo: AccountRepository,
  email: string,
): Promise<LoginResult | null> {
  if (!isDevLoginEnabled()) return null;
  const existing = await repo.findByEmail(email);
  const account: PublicAccount = existing
    ? { id: existing.id, email: existing.email, plan: existing.plan }
    : await repo.create({ email, password: cryptoRandomPlaceholder() });
  return { account, token: signSessionToken({ accountId: account.id }) };
}

/** dev-login 더미 계정용 무작위 비밀번호(저장은 scrypt 해시). */
function cryptoRandomPlaceholder(): string {
  // node:crypto 는 런타임에서만 import (edge/test 안전).
  return `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
