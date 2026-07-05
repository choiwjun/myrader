// @TASK P1-R1 - account 리소스 서비스 (앱↔DB 경계, DB-agnostic 코어)
// @SPEC specs/domain/resources.yaml (account: id, email)
// @SPEC docs/planning/07-coding-convention.md §2 (앱은 서비스 레이어 경유, DB 직접접근 금지)
// @SPEC .claude/constitutions/common/uuid.md (id = UUID v4)
//
// account 인증의 순수 로직과 저장소 추상화만 둔다(Drizzle 미import — 테스트 용이 +
// 07 단방향 의존: route → service(인터페이스) → repository(DB 구현)).
// 구체 Drizzle 구현은 ./account-repository.ts.

/** 세션·화면에 노출하는 account 뷰(민감정보 제외 — passwordHash 미포함). */
export interface PublicAccount {
  id: string;
  email: string;
  plan: "free" | "basic" | "pro" | "business";
}

/** 인증 검증에 필요한 내부 account 레코드(passwordHash 포함). */
export interface AccountRecord extends PublicAccount {
  passwordHash: string;
}

/**
 * account 저장소 추상화 — DB 구현을 주입 가능하게 분리한다(07 경계 + 테스트 용이).
 * route/서비스는 이 인터페이스에만 의존한다.
 */
export interface AccountRepository {
  findByEmail(email: string): Promise<AccountRecord | null>;
  findById(id: string): Promise<PublicAccount | null>;
  create(input: { email: string; password: string }): Promise<PublicAccount>;
  /**
   * 세션용 조회 — 삭제/차단 계정은 null. 살아있으면 account + 강제로그아웃 기준(ms).
   * getCurrentUser 가 토큰 iat 와 sessionsRevokedAtMs 를 비교한다.
   */
  findForSession(
    id: string,
  ): Promise<{ account: PublicAccount; sessionsRevokedAtMs: number | null } | null>;
  /** 관리자 액션 — 대상 id 의 상태 변경. 대상 없으면 false, 변경되면 true(멱등). */
  setPlan(id: string, plan: PublicAccount["plan"]): Promise<boolean>;
  setBlocked(id: string, blocked: boolean): Promise<boolean>;
  revokeSessions(id: string): Promise<boolean>;
  setDeleted(id: string, deleted: boolean): Promise<boolean>;
}

/** PublicAccount 로 좁히는 헬퍼(passwordHash 노출 방지). */
export function toPublicAccount(rec: PublicAccount): PublicAccount {
  return { id: rec.id, email: rec.email, plan: rec.plan };
}

/**
 * 이메일+비밀번호로 account 를 인증한다.
 * 성공 시 PublicAccount, 실패(없는 계정/틀린 비번) 시 null.
 * 계정 존재 여부를 응답으로 구분 노출하지 않는다(둘 다 null).
 */
export async function authenticateAccount(
  repo: AccountRepository,
  email: string,
  password: string,
): Promise<PublicAccount | null> {
  const rec = await repo.findByEmail(email);
  if (!rec) return null;
  const { verifyPassword } = await import("./password");
  const ok = await verifyPassword(password, rec.passwordHash);
  if (!ok) return null;
  return toPublicAccount(rec);
}
