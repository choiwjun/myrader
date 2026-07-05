# 관리자 대시보드 (Admin Dashboard) — 설계 문서

- **날짜**: 2026-06-17
- **상태**: 승인됨 (브레인스토밍 합의 완료)
- **대상 제품**: 보이나 (boina) — `apps/web` (Next.js 15 App Router)
- **브랜치**: `feat/admin-dashboard`

## 1. 배경 & 목적

보이나 v1은 고객용 7화면(S1~S7)만 구현돼 있고 **관리자/운영 화면은 기획·설계·구현 전 단계에 걸쳐 전무**하다 (DECISION_LOG: "앱 내 관리 기능은 v1 비범위"). 곧 정식 오픈 + SNS·네이버블로그 일일 GEO 콘텐츠 홍보를 시작하므로, 운영자(사장님)가 **마케팅이 실제 가입·진단·전환으로 이어지는지**를 한 화면에서 볼 수 있어야 한다.

본 문서는 그 관리자 대시보드의 신규 설계다. (신규 스코프 — 사용자 승인 완료)

## 2. 범위

### v1 포함
- 환경변수 비밀번호 기반 관리자 접근 게이트 (`ADMIN_PASSWORD`)
- 단일 페이지 종합 대시보드 `/admin` (읽기 전용)
  - KPI 카드 (가입/진단/전환/잡 상태)
  - 일자별 추이 (최근 14일: 가입 수, 진단 시작 수)
  - 퍼널 (가입 → 진단시작 → 진단완료 → 유료전환)
  - 최근 내역 테이블 (최근 가입 / 최근 진단 / 실패·지연 잡 — **실패 사유 표시 포함**)

### v1 비범위 (의도적 컷 — 후속)
- **결제 매출 원장** (건별 금액·일시) — 결제 이력 테이블 없음. PG 연동 단계에서 결제 테이블과 함께 설계. v1은 `accounts.plan`(free→paid) 기반 "유료 계정 수/전환율"까지만.
- **실패 잡 재시도(재실행) 버튼** — 외부 키·PG 연동 단계에서 추가. (근거: §6)
- 사용자 편집/삭제, 다단계 권한(role), 멀티 페이지 어드민, 알림.

## 3. 데이터 출처 (기존 DB 스키마 — 신규 마이그레이션 없음)

| 테이블 | 사용 컬럼 | 대시보드 용도 |
|---|---|---|
| `accounts` | `id, email, name, plan(free/basic/pro/business), createdAt` | 가입 수·추이, 유료 전환 (plan != 'free') |
| `businesses` | `id, name, createdAt` | 진단받은 가게 식별/표시 |
| `diagnoses` | `id, businessId, status, crawlFailureReason, createdAt, completedAt` | 진단 수·추이, 완료/실패, 잡 상태, 실패 사유 |

- 진단 상태 enum: `queued / running / completed / failed / partial / canceled / timeout`
- 실패 사유 enum (`CrawlFailureReason`): `DNS_FAILED / CONNECTION_REFUSED / HTTP_5xx / HTTP_4xx / ROBOTS_BLOCK_ALL / TIMEOUT / JS_RENDER_FAILED`
- 인덱스 존재: `diagnoses_status_idx`, `diagnoses_created_at_idx` (집계 쿼리에 활용)
- **유료 전환 정의**: `accounts.plan != 'free'` 인 계정 수 / 전체 계정 수.

## 4. 아키텍처

### 4.1 라우팅 & 셸
- 신규 라우트그룹 `app/(admin)/` — 고객용 `(app)` 셸(AppHeader·보이나 브랜딩)을 **상속하지 않는** 독립 레이아웃. 운영 도구 톤.
- 라우트:
  - `app/(admin)/admin/page.tsx` — 대시보드 (보호됨)
  - `app/(admin)/admin/login/page.tsx` — 비밀번호 입력 (공개)
  - `app/(admin)/layout.tsx` — admin 전용 레이아웃

### 4.2 접근 보안 (환경변수 비밀번호)
- 신규 env `ADMIN_PASSWORD` (`.env.example`에 `[운영필수]`로 문서화).
- `POST /api/admin/login` — 입력 비밀번호를 `ADMIN_PASSWORD`와 **상수시간 비교**(timing-safe). 통과 시 **관리자 전용 서명 쿠키** `boina_admin` 발급.
  - 쿠키 서명: 기존 `SESSION_SECRET` HMAC-SHA256 인프라 재사용. 페이로드 `{ admin: true, iat }`. 고객 세션 쿠키(`boina_session`)와 **별도 쿠키명**으로 격리.
- `POST /api/admin/logout` — admin 쿠키 만료.
- `middleware.ts` 확장: `/admin/*` 요청은 유효한 `boina_admin` 쿠키 없으면 `/admin/login`으로 리다이렉트. 단 `/admin/login`·`/api/admin/login`은 예외.
- **production fail-fast**: `NODE_ENV=production`에서 `ADMIN_PASSWORD` 미설정(또는 trim 후 빈 값)이면 admin 라우트·로그인 API를 **403으로 차단** (빈 비밀번호 무방비 노출 0). 개발/CI에서만 미설정 허용(로컬 골격 검증). — 기존 mock fail-fast 규율과 동일 철학.

### 4.3 데이터 흐름 (서버 집계, 읽기 전용)
- `/admin` 은 서버 컴포넌트. 렌더 시 `lib/admin/metrics.ts`의 집계 함수들을 호출해 DB에서 직접 집계 → 카드/테이블에 주입.
- 클라이언트 상태·폴링 없음(v1). 새로고침으로 갱신.

## 5. 컴포넌트 / 코드 구조 (작고 분리된 단위)

| 파일 | 책임 | 의존 | 테스트 |
|---|---|---|---|
| `apps/web/lib/admin/auth.ts` | admin 쿠키 서명/검증, 비밀번호 timing-safe 비교, production fail-fast 판정 | `SESSION_SECRET`, crypto | 단위: 비번 일치/불일치, 쿠키 위변조, prod 미설정 차단 |
| `apps/web/lib/admin/metrics.ts` | 순수 집계 쿼리 함수 (DB client 주입). KPI/추이/퍼널/최근목록 각각 독립 함수 | `@boina/db` | 단위: 시드 데이터로 집계 결과 검증 |
| `apps/web/app/api/admin/login/route.ts` | 비번 검증 → 쿠키 발급 | `lib/admin/auth` | 통합: 200+쿠키 / 401 / prod 403 |
| `apps/web/app/api/admin/logout/route.ts` | 쿠키 만료 | `lib/admin/auth` | 통합 |
| `apps/web/app/(admin)/layout.tsx` | admin 셸 (헤더/로그아웃) | — | — |
| `apps/web/app/(admin)/admin/page.tsx` | 대시보드 조립 (서버 컴포넌트) | `lib/admin/metrics` | — |
| `apps/web/app/(admin)/admin/login/page.tsx` | 로그인 폼 | `/api/admin/login` | — |
| `apps/web/app/components/admin/*` | KPI 카드 / 추이 / 퍼널 / 테이블 표시 컴포넌트 | — | — |
| `apps/web/middleware.ts` (수정) | `/admin/*` 게이팅 추가 | `lib/admin/auth` | 단위: 경로 결정 |

### metrics.ts 함수 (안)
- `getKpiSummary(db)` → `{ totalAccounts, accountsToday, accounts7d, paidAccounts, conversionRate, totalDiagnoses, diagnosesToday, completedCount, failedCount, stuckJobs }`
- `getDailyTrend(db, days=14)` → `[{ date, signups, diagnoses }]`
- `getFunnel(db)` → `{ signups, diagnosed, completed, paid }` (+ 단계별 비율)
- `getRecentAccounts(db, limit=20)` / `getRecentDiagnoses(db, limit=20)` / `getFailedJobs(db, limit=20)` (실패 잡은 `crawlFailureReason` 포함)

## 6. 실패 잡 재시도 — v1에서 빼는 근거

진단 실패 사유별 재시도 효과가 갈린다:

| 사유 | 재시도 효과 |
|---|---|
| `TIMEOUT`, `HTTP_5xx` | 🟢 도움됨 (일시적) |
| `CONNECTION_REFUSED`, `DNS_FAILED`, `JS_RENDER_FAILED` | 🟡 반반 |
| `HTTP_4xx`, `ROBOTS_BLOCK_ALL` | 🔴 소용없음 (구조적) |

또한 **외부 키 연동 전에 들어온 진단은 production에서 키 부재로 fail-fast(503)** 실패한다 — 이건 "키를 넣으면 해결되는 실패"이므로, **재실행이 진짜 가치 있는 시점은 키·PG 연동 직후**다. 따라서:
- **v1**: 잡 목록에 **실패 사유를 표시**(읽기 전용)해 운영자가 재시도 가치를 판단할 근거만 제공.
- **재시도(재실행) 버튼**: 외부 키·PG 연동 단계에서 함께 추가 (기존 `/api/jobs/process` 재실행 경로 재사용 예정).

## 7. 에러 처리 & 엣지 케이스
- DB 미연결/쿼리 throw → 대시보드는 섹션별 에러 상태 표시(전체 크래시 금지), 카드 단위로 graceful degradation.
- 데이터 0건(오픈 직후) → "아직 데이터가 없어요" 빈 상태 카피 (정직성 가드: 측정부재를 성과로 위장 0).
- 잘못된/만료된 admin 쿠키 → `/admin/login` 리다이렉트.
- 시간대: 집계 "오늘/일자"는 일관된 기준 timezone 사용(서버 UTC 기준 + 표시 시 KST 고려 — 구현 시 확정, 기존 `withTimezone` 컬럼 활용).

## 8. 테스트 전략 (기존 vitest 패턴, 회귀 0 유지)
- **단위**: `lib/admin/auth.ts` (비번 비교·쿠키 위변조·prod 차단), `lib/admin/metrics.ts` (시드 데이터 집계 정확성, 빈 데이터, 추이 경계일).
- **통합**: `/api/admin/login` (성공/실패/prod 403), 미들웨어 `/admin` 게이팅 결정.
- 기존 3552 테스트 전부 통과 유지(회귀 0). 새 테스트는 동일 디렉터리 컨벤션(`apps/web/tests/...`).

## 9. 게이트 (출시 일관성)
- `bun run build` env 없이 **exit 0** 유지(기존 출시 게이트). admin DB 라우트는 동적(force-dynamic)이어야 빌드 통과.
- `bun run typecheck` / `bun run lint` exit 0.
- prod fail-fast 동작 확인(ADMIN_PASSWORD 없이 prod에서 admin 차단).

## 10. 환경변수 추가
```
# ── 관리자 대시보드 ───────────────────────────────────────────
# [운영필수] 관리자 페이지 접근 비밀번호. production에서 미설정/빈 값이면 admin 라우트 403 차단.
#   개발/CI에서만 미설정 허용(로컬 골격 검증). 강한 무작위 값 권장.
ADMIN_PASSWORD=""
```

## 11. 미해결/구현 시 확정
- 추이 기간 기본 14일 (확정). 필요 시 30일 토글은 후속.
- 집계 기준 timezone(UTC vs KST) — 구현 단계에서 한 곳으로 고정.
- 차트 렌더: v1은 경량(막대/숫자 테이블)로 시작, 외부 차트 라이브러리 도입 보류(YAGNI).
