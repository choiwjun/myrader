# 인증 / 세션 / 가드 (P1-R1, REQ-001)

단일 인증 체계 + 쿠키 세션 + 보호 라우트 가드 + `account` 리소스 서비스의 토대.
S7(`/settings`, `auth:true`)와 페이월 결제 귀속의 기반이 된다.

## 구성 (단방향 의존: route/UI → service → repository → @boina/db)

| 파일 | 역할 |
|------|------|
| `config.ts` | 라우트 보호 정책. `isProtectedRoute` / `decideRouteAccess`. 공개(S1~S6)·보호(S7) 분리 |
| `session.ts` | HMAC-SHA256 서명 쿠키 세션. `signSessionToken` / `verifySessionToken` / `sessionCookieOptions` |
| `password.ts` | `node:crypto` scrypt 비밀번호 해시/검증 (salt·상수시간 비교) |
| `account-service.ts` | DB-agnostic 인증 코어 + `AccountRepository` 인터페이스 (`authenticateAccount`) |
| `account-repository.ts` | `@boina/db`(Drizzle) 기반 `AccountRepository` 구현 (eq 파라미터 바인딩) |
| `login-service.ts` | 자격증명 로그인 + 개발용 `dev-login` 스텁 (세션 발급) |
| `index.ts` | **단일 Auth 레이어** — `getCurrentUser` / `requireAuth` (헌법 §1, 프로젝트 전체 이것만 사용) |
| `../../app/api/auth/{login,logout,session}/route.ts` | 로그인/로그아웃/현재 세션 조회 엔드포인트 |
| `../../middleware.ts` | 보호 라우트 1차 가드 (쿠키 존재 → 통과, 부재 → /login) |

## 인증 방식 — 채택 근거

기획 문서(`01-prd`, `03-user-flow`, `specs/screens/settings.yaml`, `specs/domain/resources.yaml`,
`.claude/constitutions/nextjs/auth.md`)를 전수 확인한 결과 **구체 인증 방식(소셜/이메일/비번)이
명시돼 있지 않다.** `resources.yaml` 의 `account` 는 `{id, email}` 만, `settings.yaml` 은 `auth:true` 만 규정한다.

따라서 작업지시의 "발명 금지" 규율에 따라:

- **세션·가드·account 서비스는 실제 동작**하도록 구현(외부 IdP 실키 불필요).
- 세션은 외부 패키지 없이 `node:crypto` HMAC 서명 쿠키로 구현(NextAuth 미설치 상태에서
  헌법 §1 "단일 Auth 레이어" 원칙은 `getCurrentUser`/`requireAuth` 로 동일하게 충족).
- 자격증명(이메일/비번) 로그인 + 개발용 `dev-login` 스텁으로 골격을 검증.
- 외부 IdP(Kakao 등) 연동은 `.env` placeholder + 아래 ADR 로 **[OPEN]** 처리.

## [OPEN] ADR-P1R1-001 — v1 외부 인증 방식 미확정

- **상태**: OPEN (사용자/오케스트레이터 결정 필요)
- **맥락**: x-sag 는 Kakao 로그인 + 세션을 사용(읽기 전용 참고). boina 기획에는 v1 인증 방식이 미명시.
- **현재 구현**: 이메일/비번 자격증명 + dev-login 스텁 + HMAC 쿠키 세션 (실제 동작하는 토대).
- **결정 필요**:
  1. v1 인증 수단: 소셜(Kakao 등) vs 이메일/비번 vs 매직링크?
  2. 세션 전략 유지(HMAC 쿠키) vs NextAuth(Auth.js) 도입 — 헌법은 NextAuth 사용 시 규칙을 규정하나
     도입 자체는 강제하지 않음.
- **마이그레이션 경로**: 인증 수단이 바뀌어도 `getCurrentUser`/`requireAuth`/`AccountRepository`/
  세션 쿠키 계약은 그대로 유지 → 어댑터(provider)만 교체. 호출부(보호 라우트·S7) 불변.

## 보안 규율 준수

- 시크릿(`SESSION_SECRET`)은 `.env` (하드코딩 금지, 미설정 시 명시적 throw).
- 비밀번호: scrypt(KDF, salt) — md5/sha1 금지(Guardrails). 검증은 `timingSafeEqual`.
- 세션 서명 검증도 `timingSafeEqual` (타이밍 공격 방지). 쿠키 `httpOnly`+`sameSite=lax`+`secure`(prod).
- DB 접근은 Drizzle `eq()` 파라미터 바인딩 — 문자열 보간 쿼리 없음(SQL Injection 방지).
- 로그인 실패는 계정 존재 여부를 구분 노출하지 않음(둘 다 401 `Invalid credentials`).
- `dev-login` 은 `NODE_ENV !== production` AND `DEV_LOGIN_ENABLED=true` 일 때만 — 프로덕션 강제 차단.
