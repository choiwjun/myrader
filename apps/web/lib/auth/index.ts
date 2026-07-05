// @TASK P1-R1 - 단일 Auth 레이어 (getCurrentUser / requireAuth)
// @SPEC .claude/constitutions/nextjs/auth.md §1 (단일 Auth 레이어 — 프로젝트 전체 이것만 사용)
// @SPEC specs/screens/settings.yaml (S7 현재 세션 → account 조회)
//
// 헌법 §1: 프로젝트 전체에서 인증 확인은 이 모듈만 사용한다(API마다 다른 체크 금지).
// 서버 컴포넌트 / Route Handler 공통 진입점. 세션 쿠키 → account 조회.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDefaultAccountRepository } from "./account-repository";
import type { AccountRepository, PublicAccount } from "./account-service";
import { LOGIN_PATH } from "./config";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * 현재 세션의 account 를 반환한다(미인증이면 null).
 * 헌법 §1 의 getCurrentUser 에 해당 — 모든 보호 로직의 단일 출처.
 *
 * @param repo 테스트용 주입(미지정 시 DATABASE_URL 기반 기본 repository).
 */
export async function getCurrentUser(
  repo: AccountRepository = getDefaultAccountRepository(),
): Promise<PublicAccount | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const found = await repo.findForSession(payload.accountId);
  if (!found) return null; // 없음/삭제/차단
  // 강제 로그아웃: 토큰이 무효화 시각 이전 발급이면 거부.
  // iat === revokedMs 는 통과(취소와 동시 발급 = 새 세션으로 취급). 그 이전(<)만 거부.
  if (found.sessionsRevokedAtMs !== null && payload.iat < found.sessionsRevokedAtMs) {
    return null;
  }
  return found.account;
}

/**
 * 인증을 강제한다 — 미인증이면 로그인으로 리다이렉트(서버 컴포넌트 보호 패턴).
 * 헌법 §requireAuth.
 */
export async function requireAuth(repo?: AccountRepository): Promise<PublicAccount> {
  const user = repo ? await getCurrentUser(repo) : await getCurrentUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }
  return user;
}

export { LOGIN_PATH } from "./config";
export type { PublicAccount } from "./account-service";
