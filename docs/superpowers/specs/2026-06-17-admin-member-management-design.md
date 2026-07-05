# 관리자 회원 관리 콘솔 (Admin Member Management) — 설계 문서

- **날짜**: 2026-06-17
- **상태**: 승인됨 (브레인스토밍 합의 완료)
- **대상 제품**: 보이나 (boina) — `apps/web`
- **브랜치**: `feat/admin-member-management` (← `feat/admin-dashboard` 위에 쌓임, 아직 main 미머지)
- **선행 의존**: 관리자 대시보드(2026-06-17-admin-dashboard-design.md) — admin 셸·인증·rate-limit 인프라 재사용

## 1. 배경 & 목적

관리자 대시보드는 현재 **읽기 전용**이다. 1인 운영자가 정식 오픈 후 회원을 직접 통제해야 하므로(이용권 수동 부여, 악성/환불 사용자 차단 등), 회원에 대한 **읽기·쓰기 관리 콘솔**을 추가한다. 단일 관리자(`ADMIN_PASSWORD` 게이트) 전용.

## 2. 범위

### v1 포함 (A~F 전부)
- **A. 플랜/이용권 변경** — 회원 plan을 `free/basic/pro/business` 중 수동 설정(무료↔유료 부여/회수)
- **B. 계정 차단/해제** — 차단 시 로그인·기존 세션 모두 거부. 해제 가능
- **C. 회원 상세 보기** — 그 회원의 가게·진단 이력·plan·상태
- **D. 계정 삭제/복구** — 소프트 삭제(`deletedAt`), 복구 가능
- **E. 강제 로그아웃** — 전체 세션 무효화 (비밀번호 리셋 아님 — SNS 로그인엔 비번 없음)
- **F. 회원 검색·필터·페이지네이션** — 이메일 검색 + plan/상태 필터

### v1 비범위 (의도적 컷)
- **감사 로그** — 사용자 결정(B): 1인 운영, 기록 없이 즉시 반영. 후속 추가 가능.
- **비밀번호 리셋** — 로그인은 **카카오·구글 SNS 전용**(사용자 결정)이라 우리가 관리하는 비밀번호가 없음. 따라서 무의미.
- **카카오/구글 OAuth 실구현** — 별도 작업("로그인 연동"). 본 콘솔은 OAuth가 붙으면 가입경로 표시하도록 **앞으로 호환**만 둠(이번엔 `provider` 컬럼 미생성).
- 플랜 만료/기간, 결제 환불 연동, 수동부여 vs 실결제 지표 분리.

## 3. 데이터 모델 변경

`accounts` 테이블에 컬럼 2개 추가 (마이그레이션 1개). 기존 `deletedAt`(소프트삭제)·`plan`(이용권)은 그대로 재사용.

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `blockedAt` | `timestamptz null` | 설정되면 차단 상태. 해제 = null |
| `sessionsRevokedAt` | `timestamptz null` | 이 시각 **이전** 발급된 세션 토큰을 거부(강제 로그아웃 기준). null이면 미적용 |

- 인덱스: `accounts_blocked_at_idx`(차단 회원 필터용, 선택적).
- `plan` enum 값은 기존 `free/basic/pro/business` 그대로 사용. 결제 성공 시 코드가 `basic` 설정(기존). 수동 부여도 동일 enum 사용.

## 4. 인증 강제 (보안 핵심 — 단일 레이어에서만)

헌법 §1 "단일 Auth 레이어"를 준수해, 강제는 **`apps/web/lib/auth/index.ts`의 `getCurrentUser()` 한 곳**에서만 한다. API마다 흩뿌리지 않는다.

`getCurrentUser` 수정:
1. 세션 토큰 검증(기존 `verifySessionToken` — 서명+만료) 후 `payload.accountId`로 account 조회.
2. account가 없거나 `deletedAt != null` 또는 `blockedAt != null` → **null 반환(미인증 취급)**.
3. account의 `sessionsRevokedAt != null` 이고 `payload.iat < sessionsRevokedAt` (ms 비교) → **null 반환**(강제 로그아웃된 세션).
4. 그 외 → 정상 account 반환.

- `getCurrentUser`가 `payload.iat`를 비교에 쓰려면 `verifySessionToken`이 반환하는 `{accountId, iat}`에서 `iat`를 함께 받아 비교한다(이미 payload에 존재).
- 로그인 서비스(`loginWithCredentials`/`authenticateAccount`, 추후 OAuth 콜백)도 `blockedAt`/`deletedAt` 계정은 거부한다(2차). 권위 검증은 getCurrentUser.
- `PublicAccount` 타입은 노출 안전 필드만 유지(passwordHash 제외 기존대로). 차단/삭제 계정은 애초에 null이 되므로 PublicAccount에 상태 필드 추가는 불필요.
- account-repository에 차단/삭제/세션무효화 갱신 메서드 추가(아래 §5에서 사용).

## 5. 관리자 API (전부 admin 가드 + Zod + rate-limit + 일관 응답)

기존 `{ data?, error?, code?, success }` 형식, `force-dynamic`, `isAdminAuthenticated()` 가드, 기존 rate-limit 인프라 사용.

| 엔드포인트 | 동작 |
|---|---|
| `GET /api/admin/members` | 목록: 쿼리 `q`(이메일 부분검색), `plan`, `status`(active/blocked/deleted), `limit`(기본 20, 최대 100), `offset`. 반환: rows + total count |
| `GET /api/admin/members/[id]` | 상세: account(id/email/name/phone/plan/상태/가입일) + 그 회원의 businesses[] + 각 business의 최근 진단 상태 요약 |
| `PATCH /api/admin/members/[id]` | 액션 분기(zod discriminated union): `{action:"setPlan", plan}` / `{action:"block"}` / `{action:"unblock"}` / `{action:"forceLogout"}` / `{action:"softDelete"}` / `{action:"restore"}`. 각 액션은 멱등(이미 그 상태면 무변경 200). 대상 없음 404 |

- `setPlan`: `accounts.plan = plan` (+ updatedAt).
- `block`: `blockedAt = now` / `unblock`: `blockedAt = null`.
- `forceLogout`: `sessionsRevokedAt = now`.
- `softDelete`: `deletedAt = now` (+ 그 회원의 활성 세션도 자연히 거부됨) / `restore`: `deletedAt = null`.
- 입력 검증: `id`는 UUID, `plan`은 enum, `action`은 허용목록. 위반 400.

## 6. 관리자 UI

- **헤더 내비**: admin 셸 헤더에 "대시보드 | 회원 관리" 링크 추가.
- **`/admin/members`** (서버 컴포넌트, force-dynamic, requireAdmin 가드):
  - 검색창(이메일) + 필터(plan/상태) + 회원 테이블(이메일/이름/plan/상태 배지/가입일) + 페이지네이션(이전/다음).
  - 행 클릭 → 상세.
- **`/admin/members/[id]`** (서버 컴포넌트, 가드):
  - 회원 정보 + 가게/진단 요약.
  - 제어 패널(클라이언트 컴포넌트): 플랜 드롭다운+저장, 차단/해제 토글, 강제 로그아웃 버튼, 삭제/복구 버튼.
  - **위험 작업(차단·삭제)은 확인 다이얼로그**(window.confirm 수준이면 충분 — 1인 운영). 액션 후 페이지 갱신.

## 7. 안전장치 & 엣지

- 차단·삭제는 **확인 후 실행**, 그리고 **되돌릴 수 있음**(해제/복구 제공).
- 멱등: 이미 차단된 계정 재차단, 이미 삭제된 계정 재삭제 → 무변경 200(에러 아님).
- 존재하지 않는 회원 id → 404.
- 관리자 API에도 rate-limit(기존 인프라) 적용.
- 빈 목록/검색결과 0 → 빈 상태 카피.
- ⚠️ **알려진 상호작용**: 수동 플랜 부여는 대시보드 "전환율"(plan≠free 기준)에 합산됨(실결제와 수동부여 미구분). 1인 운영 허용 가정. 후속에 분리 플래그 가능.
- 시간 비교(`iat < sessionsRevokedAt`)는 ms epoch로 일관 비교(토큰 iat는 ms, 컬럼은 timestamptz → ms로 변환해 비교).

## 8. 코드 구조 (작고 분리)

| 파일 | 책임 |
|---|---|
| `packages/db/src/schema/account.ts` (수정) | `blockedAt`, `sessionsRevokedAt` 컬럼 + 인덱스 |
| `packages/db/migrations/*` (신규) | 컬럼 추가 마이그레이션 |
| `apps/web/lib/auth/index.ts` (수정) | `getCurrentUser` 차단/삭제/세션무효화 강제 |
| `apps/web/lib/auth/account-repository.ts` (수정) | block/unblock/forceLogout/softDelete/restore/setPlan + 목록/상세 조회 메서드 |
| `apps/web/lib/admin/members.ts` (신규) | 회원 목록/상세 조회·필터·페이지네이션 (순수, DbClient 주입) |
| `apps/web/app/api/admin/members/route.ts` (신규) | GET 목록 |
| `apps/web/app/api/admin/members/[id]/route.ts` (신규) | GET 상세 + PATCH 액션 |
| `apps/web/app/(admin)/admin/members/page.tsx` (신규) | 목록 화면 |
| `apps/web/app/(admin)/admin/members/[id]/page.tsx` (신규) | 상세 화면 |
| `apps/web/app/components/admin/MemberControls.tsx` (신규) | 제어 패널(클라이언트) |
| `apps/web/lib/shared/api-rate-limit.ts` (수정) | admin members 액션용 limiter(또는 기존 admin limiter 재사용) |

## 9. 테스트 전략 (TDD, 회귀 0)

- **인증 강제(단위·최우선 보안)**: 차단된 계정/삭제된 계정/`iat < sessionsRevokedAt` 세션이 `getCurrentUser`에서 null 처리되는지. 정상 계정은 통과.
- **account-repository(통합)**: setPlan/block/unblock/forceLogout/softDelete/restore가 DB에 정확히 반영.
- **members.ts(통합)**: 검색·필터·페이지네이션·total count 정확성, 상세 조립.
- **관리자 API(통합)**: 각 PATCH 액션 반영 + 가드 401 + 404 + 멱등 + rate-limit.
- 기존 3651 테스트 회귀 0.

## 10. 게이트
- env 없이 `bun run build` exit 0 / typecheck / lint / 전체 test 통과.
- 마이그레이션은 clean DB에 적용 가능해야 함.

## 11. 구현 시 확정(미세 결정)
- 확인 다이얼로그는 v1에서 `window.confirm` 수준(YAGNI; 별도 모달 컴포넌트 후속).
- `sessionsRevokedAt` ms 변환 비교 위치는 getCurrentUser 내부 한 곳에 고정.
- 마이그레이션 번호/방식은 기존 `packages/db` 컨벤션(0000_init 등) 확인 후 정합.
