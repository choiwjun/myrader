# 진단 자원 접근 모델 — Capability Token (UUID) by design

> @TASK 수정라운드A-3a — capability token 설계 명문화 (외부 QA "소유권 검증 없음" 지적 대응)
> @SPEC docs/planning/01-prd.md#AC-1 (이름 한 칸으로 진단 시작 — 미인증)
> @SPEC docs/planning/03-user-flow.md (S1~S6 auth:false / S7·결제 auth:true)
> @SPEC docs/planning/DECISION_LOG.md (익명 진단: businesses.account_id nullable)

## 요약 (TL;DR)

`diagnosisId`, `businessId` 등 S1~S6 화면이 다루는 식별자는 **추측 불가능한 UUID v4 capability
token** 이다. 이 토큰을 **소유(=URL 로 알고 있음)** 하는 것 자체가 해당 진단 자원에 접근할 권한을
부여한다. 이는 버그가 아니라 **의도된 설계**다 — 익명 진단(미인증)에서 세션 소유권을 강제하지
않기 위함이다.

외부 QA 가 지적한 "소유권 검증 없음"은, 익명 설계에서 **세션 기반 소유권 검증이 불가능**하기
때문에 의도적으로 **capability(비추측 토큰) 모델**을 채택한 결과다. 아래에 근거와 경계를 명문화한다.

## 왜 세션 소유권을 강제하지 않는가 (익명 진단)

- **AC-1 (01-prd)**: "이름 한 칸으로 진단 시작" — 진단 시작에 로그인을 요구하지 않는다.
- **03-user-flow**: S1(가게 검색·확정) ~ S6(생성물)은 모두 `auth:false`. 로그인은 S7(설정)과 결제에만.
- 따라서 진단을 만든 주체가 **세션(account)을 갖지 않을 수 있다**(`businesses.account_id` nullable).
  세션이 없으면 "이 진단의 소유자 = 세션 account" 라는 검증 자체가 성립하지 않는다.
- 미인증 사용자가 S1→S6 를 끝까지 진행하려면, 진단 자원을 다시 가리킬 **무상태(stateless) 핸들**이
  필요하다. 그 핸들이 곧 `diagnosisId`(URL 쿼리로 화면 간 전파되는 UUID)다.

## 왜 capability token 이 안전한가

- `diagnosisId` / `businessId` 는 DB `gen_random_uuid()`(UUID v4, 122비트 무작위)로 생성된다
  (앱이 임의로 만들지 않음 — `.claude/constitutions/common/uuid.md`). **열거(enumeration)·추측이
  사실상 불가능**하다(순번 id 가 아니다).
- 토큰을 모르면 자원에 접근할 수 없다 → "토큰 보유 = 접근 권한"(object-capability 모델).
- 응답은 **비민감 데이터만** 노출한다(07 §4): 점수·내부 룰코드·시크릿 0, 신호등/사장님 언어만.
  진단 결과가 유출돼도 PII/결제정보는 포함되지 않는다.

## 경계 — 이 모델이 적용되지 *않는* 곳 (강한 인증 유지)

capability 모델은 **익명 진단 조회(S1~S6)** 에만 적용된다. 다음은 **세션 인증을 강제**한다:

| 자원/동작 | 접근 모델 | 강제 위치 |
|---|---|---|
| S1~S6 진단 조회(채널/경쟁/갭/행동/생성물) | capability(UUID) | — (토큰 보유로 충분) |
| **결제**(`/api/payment` POST/PUT) | 현재 제품 범위에서 비활성(410 `PAYMENT_DISABLED`) | payment route |
| **설정**(`/api/settings`, `/settings`) | **세션 인증 필수**(401/redirect) | `getCurrentUser`/`requireAuth` |
| 설정에서 **타인 business 수정** | **소유권 검증**(account_id 일치, 불일치 403) | settings route |

즉, "추측 불가 토큰 = 조회 가능"은 *읽기(익명 진단 결과)* 에 한정되고, *쓰기·권한 상승·계정
데이터* 는 세션 인증과 소유권 검증으로 보호된다.

## 남용 완화 (rate limit)

capability 모델은 자원 *조회* 를 토큰 보유로 허용하지만, 자원 *생성*(검색·확정·진단 enqueue)은
무제한 호출 시 남용될 수 있다. 따라서 공개 생성 API 에 IP/세션 기반 rate limit 을 둔다
(`apps/web/lib/shared/rate-limit.ts` — OQ-5 경량 in-memory, 인프라 추상화 뒤). 무한 진단 생성·
검색 스크립트성 남용을 분 단위로 완화한다.

## 향후([OPEN])

- 익명 진단을 **나중에 로그인한 account 로 귀속**(claim)하는 흐름은 설정(S7) 시점에 일어난다
  (`account_id` 를 NULL→account 로 갱신). 이 시점부터는 해당 business 에 대해 소유권 검증이 추가된다.
- 더 강한 보호가 필요해지면(예: 진단 결과에 민감정보 포함 시) capability 토큰에 **만료/서명**을
  더하거나 익명 세션(서명 쿠키)로 소유권을 묶을 수 있다. v1 범위에서는 비추측 UUID + 비민감 응답 +
  rate limit 으로 충분하다(발명 금지 — 기획 스코프 유지).

---

# 진단 잡 워커 운영 가이드 (수정R2-A — 진단 실행 회복)

> @TASK 수정R2-A — 잡 워커 배선 (drain 트리거 부재로 모든 진단이 영구 queued 였던 출시차단 결함 회복)
> @SPEC docs/planning/02-trd.md §3 (백그라운드 잡) / DECISION_LOG.md (OQ-5 경량 잡)

## 무엇이 문제였나

잡 큐의 `drain()`(대기 잡을 처리하는 메서드)을 **프로덕션에서 호출하는 주체가 없었다**. `drain()`은
테스트만 직접 호출했고, 라우트(`POST /api/diagnosis`)는 enqueue 만 했다. 결과적으로 모든 진단이
영구 `queued` 로 남아 엔진 파이프라인·영속화가 0% 실행 → S3/S4/S5 항상 빈 화면이었다.

## 채택한 방식 (왜 이걸 골랐나)

OQ-5(경량) 원칙에 따라 **별도 워커 프로세스/브로커 없이** 표준 배포(Vercel/Node)에서 진단이
자동 완주하도록 **2경로 트리거**를 둔다:

1. **1차 — enqueue 직후 백그라운드 drain** (`kickBackgroundDrain`, `apps/web/lib/jobs.ts`)
   - `POST /api/diagnosis` 가 enqueue 직후 같은 프로세스에서 `processJobQueue()`(=`drain`)를
     비동기로 띄운다(응답을 막지 않음 → 여전히 202 + 폴링 UX 유지).
   - 같은 프로세스라 큐의 인메모리 메타(type/payload)가 살아 있어 **full fidelity** 로 처리된다.
   - 표준 서버(Node, 장수명 인스턴스)에서는 이 경로만으로 진단이 자동 완주한다.

2. **2차 — cron 트리거 라우트** (`GET/POST /api/jobs/process`, 시크릿 가드)
   - 서버리스(응답 직후 인스턴스 종료)나 인스턴스 사망으로 **남은 고아 잡**을 주기적으로 복구한다.
   - `apps/web/vercel.json` 의 Vercel Cron(`* * * * *`)이 매분 호출한다(외부 스케줄러도 가능).
   - 다른 프로세스라 인메모리 메타가 없으면 **`payloadResolver`**(`job-payload-resolver.ts`)가
     먼저 `diagnoses.job_payload` 를 사용하고, 레거시 행은 `diagnoses`+`businesses` 로 보수 재구성한다.

> **enqueue 시 동기 처리**는 채택하지 않았다 — 진단이 수십초라 202 비동기 + 폴링 UX 와 충돌한다.

## 멱등·동시성 안전

- `DbBackedJobQueue.drain()` 은 `queued → running` 을 **조건부 UPDATE(`WHERE status='queued'`)**로
  원자적으로 claim 한다. 두 드레이너(백그라운드 + cron)가 동시에 같은 잡을 집어도 **정확히 하나만**
  소유권을 얻어 처리한다(같은 잡 2회 처리 0). 검증: `db-backed-queue-concurrency.test.ts`.
- 한 라운드 동시 처리 상한은 `concurrency`(기본 5) — 진단의 무제한 동시 실행을 막는다.

## 타임아웃

- 핸들러 전체를 `withTimeout`(`with-timeout.ts`, 기본 180s)으로 감싼다. 초과 시
  `markDiagnosisFailed(reason=TIMEOUT)` → `diagnoses.status=failed`(엔진 자체 스테이지 타임아웃과
  중첩되는 상위 가드 — 멈춘 외부 의존이 잡을 영구 running 으로 고착시키지 못하게).

## 중복 방지 (dedup)

- `POST /api/diagnosis` 는 같은 `businessId` 의 진행 중(`queued`/`running`) 진단이 있으면 새로 만들지
  않고 기존 `diagnosisId` 를 반환한다(`diagnosis-dedup.ts`). 폴링 중 재요청·더블클릭으로 인한 중복
  크롤·LLM 비용을 차단한다.

## 경쟁사/갭 데이터 (S3~S5 빈 화면 해소)

- `/find` enqueue 는 `competitorUrls` 를 보내지 않는다. 핸들러가 `competitor-derivation.ts` 로
  경쟁사를 산출한다: **실 grounded 경쟁사 신호**가 있으면 그것을, 없고 **개발/test** 면 명시적
  샘플(`"(샘플)"` 접두) 경쟁사를 산출해 `GapAnalyzer` 를 돌려 S3(경쟁)·S4(갭)·S5(행동)가 실데이터로
  채워지게 한다. **production + 실 경쟁사 신호 0** 이면 가짜 데이터 노출 대신 fail-fast(failed) 한다
  (`runtime-env.isMockFallbackAllowed` 일관 규율 — 가짜 경쟁사 노출 0).

## 운영 환경 변수

| 변수 | 용도 |
|---|---|
| `JOBS_PROCESS_SECRET` | 외부 스케줄러/운영자가 `POST /api/jobs/process` 호출 시 `x-jobs-secret` 헤더로 인증 |
| `CRON_SECRET` | Vercel Cron 이 `Authorization: Bearer` 로 인증(Vercel 규약) |

production 에서 두 시크릿이 모두 비어 있으면 `/api/jobs/process` 는 403(무단 drain 차단). 개발/test
환경(NODE_ENV≠production)에서는 시크릿 없이 개방(로컬 편의).

## 회귀 가드

- `diagnosis-job-execution-e2e.test.ts` 가 **프로덕션 트리거 경로**(라우트 백그라운드 drain + cron
  트리거 라우트)로 진단이 `queued→completed` 완주하고 5종 테이블이 채워지는지 검증한다(테스트가
  `drain()` 을 *직접* 호출하지 않는다 — 드레인 호출자 부재를 잡도록 설계).
