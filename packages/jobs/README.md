# @boina/jobs — 백그라운드 잡 큐 골격 (P0-T3)

느린 분석(크롤·SERP·AI 인용)을 동기 처리하지 않도록 하는 **백그라운드 잡 큐**.
`enqueue → worker(drain) → 상태 전이 → diagnoses 반영` 골격을 제공한다.

> 정본 스펙: `docs/planning/02-trd.md §3`(백그라운드 잡·상태 모델)·`§6`(확장성:
> 잡·스토리지 인터페이스 추상화), `docs/planning/07-coding-convention.md §6`.

---

## ADR-001 — 잡 인프라: 경량(인터페이스 뒤) (OQ-5 결정)

- **상태**: Accepted (DECISION_LOG.md OQ-5 확정 반영)
- **맥락**: 초기 트래픽·단위경제에서 BullMQ+Redis는 운영 부담이 과하다. 그러나
  규모가 커지면 전용 브로커가 필요해질 수 있다.
- **결정**:
  1. 모든 잡 처리를 **`JobQueue` 인터페이스**(`src/queue/types.ts`) 뒤에 둔다.
     서비스/Route Handler는 이 인터페이스 타입에만 의존한다.
  2. 경량 구현 2종을 제공한다 — 인터페이스가 불변임을 실증한다:
     - **`InMemoryJobQueue`**: 단위 테스트·로컬용. 의존성·영속성 없음.
     - **`DbBackedJobQueue`**: 운영 경량. 별도 브로커 없이 `@boina/db`의
       `diagnoses` 테이블을 큐 상태 저장소로 활용한다.
  3. **BullMQ+Redis는 도입하지 않는다.** 트래픽이 늘면 동일 `JobQueue`
     인터페이스를 만족하는 `BullMqJobQueue`를 추가하고 바인딩만 교체한다
     (호출부 코드 불변).
- **근거**: 02-trd §3 결정 원칙("가장 가벼운 선택, 규모 커지면 교체") +
  §6 잡·스토리지 추상화 + 07 §6 외부 격리 규칙.

### 교체 경계 (불변 인터페이스)

```
[Route Handler / Server Action]
        │  (JobQueue 인터페이스 타입에만 의존)
        ▼
   ┌─────────────┐
   │  JobQueue   │  ◀── 이 경계는 불변
   └─────────────┘
        ▲     ▲     ▲
   InMemory  DbBacked  (추후) BullMq   ← 구현 교체 자유
```

---

## 상태 모델 (queued → running → completed / failed)

02-trd §3은 `pending/running/done/failed`로 표기하지만, boina는 contracts/DB의
정본 enum(`ReportStatus`)에 정합시켜 **새 enum을 발명하지 않는다**:

| 02-trd 표기 | boina(JobStatus = ReportStatus 부분집합) |
|-------------|------------------------------------------|
| pending     | `queued`                                 |
| running     | `running`                                |
| done        | `completed`                              |
| failed      | `failed`                                 |

허용 전이(단방향 전진, 가드됨 — 위반 시 `InvalidJobTransitionError`):

```
queued  ──► running ──► completed   (성공)
   │            └─────► failed       (핸들러 throw)
   └─────────────────► failed        (사전 실패)
completed / failed = 종료(재처리 없음)
```

### diagnoses 반영

`DbBackedJobQueue`는 전이를 `@boina/db`의 `diagnoses.status`에 반영한다
(`src/queue/diagnosis-status.ts` 매퍼 경유). 종료 전이(completed/failed) 시
`completedAt`도 stamp한다. **`@boina/db`는 import만 — 스키마 수정 금지.**

---

## 비용 게이팅 함수 자리 (`src/gating`)

grounded llmValidation·SERP 무분별 호출로 인한 비용 폭증(02-trd §5 리스크)을
막기 위한 **게이트 함수 인터페이스**. 골격 단계에서는 **자리만** 둔다:

- `CostGate` 시그니처 + `CostGateContext`/`CostGateDecision` 타입 고정.
- `allowAllCostGate` / `defaultCostGate` 더미 구현(항상 허용, `[placeholder]` 사유).
- 실제 정책(예산·쿼터·캐시 히트·플랜 티어)은 P1+에서 이 시그니처 뒤에 채운다
  (호출부 불변 — 07 §6 어댑터/레지스트리 확장점).

> **[OPEN]** 예산 한도·플랜별 쿼터·캐시 TTL 수치는 미결정(REQ-007 / OQ-2 연동).

---

## enqueue 진입점

리소스 중심(REST) Route Handler 골격은 앱層에 있다:

- `apps/web/lib/jobs.ts` — 잡 큐 싱글톤 + 더미 진단 핸들러 등록.
- `apps/web/app/api/diagnosis/route.ts` — `POST /api/diagnosis`(enqueue → 202),
  `GET /api/diagnosis?jobId=`(상태 조회).

> 실제 진단 파이프라인 배선(`runDiagnosisPipeline` 등)은 **P1-R2 담당**.
> 여기선 골격/더미 핸들러까지(status 전이 실증).

---

## 공개 API

```ts
import {
  JobQueue, Job, JobSpec, JobStatus, JobHandler,
  InMemoryJobQueue, DbBackedJobQueue,
  canTransition, isTerminalJobStatus, InvalidJobTransitionError,
  jobStatusToDiagnosisStatus,
} from "@boina/jobs";
import { CostGate, defaultCostGate } from "@boina/jobs/gating";
```

## 테스트

- `src/queue/__tests__/in-memory-queue.test.ts` — 상태 전이 단위 테스트(DB 불필요).
- `src/queue/__tests__/db-backed-queue.test.ts` — `diagnoses.status` 반영 통합
  테스트(docker Postgres; `DATABASE_URL` 없으면 자동 skip).
- `apps/web/tests/diagnosis-enqueue.test.ts` — enqueue 진입점 골격 스모크.

## [OPEN] 후속 (P1+)

- `DbBackedJobQueue` 멀티워커 동시성 잠금(`FOR UPDATE SKIP LOCKED`/advisory lock).
- 잡 재시도/백오프 정책(현재 attempts 카운트만; contracts `DEFAULT_ANALYZE_JOB_OPTIONS` 참고).
- 비용 게이팅 실제 정책 수치.
- 별도 `jobs` 테이블 승격 여부(현 골격은 diagnoses.status가 진실의 원천).
