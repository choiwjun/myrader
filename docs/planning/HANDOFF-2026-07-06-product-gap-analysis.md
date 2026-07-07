# Handoff — 2026-07-06 소상공인용 v1 재감사

## 목적

기획서와 현재 구현을 다시 대조해, 다음 작업자가 **무엇을 새로 만들지 말고**, **무엇을 기존 boina 구현에서 복원·재연결해야 하며**, **무엇을 아직 구현해야 하는지** 바로 실행할 수 있게 정리한다.

이 문서는 사용자 정정 사항을 반영한다:

- Toss 결제는 사용하지 않는다.
- SMS/Kakao 알림도 사용하지 않는다.
- 기존 boina에는 실측 저장 구현이 있었다. 따라서 실측/evidence 관련 항목은 “무조건 새로 구현”이 아니라 **기존 구현 확인 → 현재 레포 read/write path 재연결 → 회귀검증**이 우선이다.

> 2026-07-07 업데이트: 이 문서는 재감사 당시의 갭 목록이었고, 이후 G001~G005에서 핵심 배선 갭을 닫았다. 아래 "상태 업데이트" 섹션은 현재 코드 기준으로 보정된 감사 로그다.

## 조사 기준

- v1 범위: `docs/planning/06-tasks.md` §2 — 가게 찾기 → 내 상태 → 경쟁 비교 → 역공학 갭 → 행동 4분류/오늘 하나 → 쉬운 생성물.
- v1.5/비범위: 구글 실 SERP/AI Overview rank, 재진단/추이, 결제, 구독, Kakao/SMS 알림.
- 완료 정의: `docs/planning/loop/08-derived-gates.md` — 코드 머지가 아니라 각 REQ Hard/Metric/Domain/Evidence 게이트 통과.
- 구현 확인 파일: `apps/web/app/(app)/*`, `apps/web/app/api/*`, `apps/web/lib/diagnosis/*`, `apps/web/lib/jobs.ts`, `packages/db/src/schema/*`, `packages/jobs/src/queue/db-backed-queue.ts`, `apps/web/tests/**`.

## 현재 구현된 것 — 다시 만들지 말 것

### 1. 소상공인용 제품 골격

현재 실제 구현 중심은 **소상공인용 boina/사장님 레이더**다.

- `/find`, `/home`, `/status`, `/rivals`, `/write`, `/settings` route가 존재한다.
- `/compare`, `/gap`, `/actions`, `/assets`는 legacy redirect/alias 성격으로 남아 있다.
- `/checkout`은 `/home`으로 redirect한다.
- `/api/payment`는 `PAYMENT_DISABLED`를 반환한다.

크리에이터용 주제 레이더/글 진단/인용 추적은 문서 라인으로 남아 있을 뿐, 현재 `apps/web` 구현 대상은 아니다.

### 2. DB와 normalized persistence 골격

현재 레포에는 실측/진단 결과를 담는 기본 저장 구조가 있다.

- `businesses.homepageUrl`, `businesses.category` 존재.
- `engine_results.evidence` JSONB 존재.
- `competitors` 테이블 존재.
- `gap_rows` 테이블 존재.
- `generated_assets`, `actions` 테이블 존재.
- `actions.is_completed`, `actions.completed_at` 컬럼도 존재.

`apps/web/lib/diagnosis/diagnosis-persistence.ts`는 mock/현재 pipeline output 기준으로 다음을 저장한다.

- `mapEngineResults()` → `engine_results`
- `mapCompetitors()` → `competitors`
- `GapAnalyzer` 결과 → `gap_rows`
- generated assets → `generated_assets`
- gap 기반 action → `actions`

### 3. persistence integration 테스트

`apps/web/tests/diagnosis/diagnosis-persistence-integration.test.ts`는 mock pipeline 기준으로 다음을 검증한다.

- `engine_results` 저장
- `competitors` 저장
- `gap_rows` 저장
- `generated_assets` 저장
- `actions` 저장
- `/api/channel-status`, `/api/competitor`, `/api/gap`, `/api/action`, `/api/generated-asset`가 저장 데이터를 읽어 화면용 응답을 만든다.

따라서 “저장 테이블이 전혀 없다”는 판단은 틀리다. 정확한 남은 문제는 **현재 운영 플로우에서 기존/현재 저장 구조가 실제 입력·실측·화면 계약까지 완전하게 연결되는지**다.

## 상태 업데이트 — 2026-07-07 현재

### G001. 경쟁사 gap/action 생성 — 해결됨

- `diagnosis-persistence.ts`는 실제 competitor report coverage가 있을 때만 `gap_rows`와 gap 기반 `actions`를 만든다.
- dev/test mock 경로는 `(샘플)` 라벨과 sample surface를 명시해 샘플임을 숨기지 않는다.
- 측정 근거가 없으면 `/api/gap`은 `measurementLabel: "unavailable"`과 빈 `items`를 반환한다.

### G002. `/find` 수동 입력/target 계약 — 해결됨

- `/find`와 `/api/business`는 후보가 없거나 후보가 부적합해도 사장님이 이름/지역/URL을 직접 확정할 수 있다.
- `placeUrl`은 optional이며, 직접 입력 business는 `naverPlaceId=null`을 허용한다.
- enqueue target 선택은 `business.websiteUrl` → `business.placeUrl` → 이름/지역 기반 manual search target 순서다. `candidate.placeUrl`을 다시 우선하지 않는다.

### G003. 이름만 있는 경쟁사 처리 — 해결됨

- `deriveCompetitorInput()`은 URL이 있는 grounded 경쟁사만 diagnosable `competitorUrls`로 보낸다.
- 이름만 있는 grounded 경쟁사는 competitor evidence로만 저장되며 fake target/gap/action을 만들지 않는다.
- mixed result(`[name-only, url-backed]`)에서도 URL-backed measured row를 placeholder보다 먼저 저장해 gap row가 이름-only placeholder에 붙지 않는다.

### G004. cost/rate gate 운영 가시성 — 해결됨

- `defaultCostGate`는 production에서 subject key(`businessId` 우선, 없으면 `diagnosisId`) 기준 daily/monthly quota, cache TTL, fallback 정책을 적용한다.
- 진단 핸들러는 LLM gate 판정(`requested`, `allowed`, `reason`, `fallback`, 실제 engine enable 여부)을 `diagnoses.job_payload.costGate.llmValidation`에 저장한다.
- `requestLlmValidation` 미요청/deny/defer 경로는 engine LLM을 끄고, 운영자가 왜 꺼졌는지 DB row에서 확인할 수 있다.

### G005. Radar external integration — 검증/보강됨

- `RADAR_NAVER_*` 자격증명이 없으면 `RADAR_SIGNAL_ADAPTER_UNAVAILABLE`로 정직하게 실패한다. generic `NAVER_*` 값만으로 Radar adapter를 활성화하지 않는다.
- configured OpenAPI/SearchAd 경로는 테스트에서 endpoint/header/signature shape를 검증하며 live production credential을 요구하지 않는다.
- adapter-unavailable scan은 retry하지 않고 fake measured keywords를 쓰지 않는다.
- `/api/radar/subscription`은 waiting/failed/empty/measured 상태를 구분하고, measured row는 completed scan의 latest keywords가 있을 때만 반환한다.
- `/api/radar/feedback`은 diagnosis business의 active/trialing subscription에 속한 latest keyword에 대해서만 기록한다.
- `/api/radar/scans/process`는 production에서 `RADAR_PROCESS_SECRET` 또는 `CRON_SECRET` 없이 실행되지 않는다.

## 화면/API 계약 현재 상태

### Home

- `/home`은 Radar preview를 동적으로 조회하고, diagnosis 상태·채널·경쟁·행동 진입점을 현재 route model(`/home`, `/status`, `/rivals`, `/write`, `/settings`)에 맞춘다.
- 남은 제품 검증은 "사장님이 홈 카드 5개를 이해하는가"이며, 코드 배선 갭은 아니다.

### Status

- v1 채널 taxonomy는 **UI/API: `naver`, `google`, `ai`** 이다.
- 저장 계층의 `engine_results.channel`은 **`naver`, `google`, `ai_citation`** 이며, service layer가 `ai_citation`을 UI 채널 `ai`로 변환한다.
- SNS는 현재 SME v1 채널이 아니다. SNS/인스타/유튜브/블로그 자동 연동은 future lever scope로만 남긴다.

### Rivals

- competitor/gap API는 source, collectedAt, evidence, measurementLabel을 포함하고 measured/unavailable 상태를 구분한다.
- 경쟁사 이름만 있는 경우 비교 evidence는 남기되 gap/action을 추측 생성하지 않는다.

### Write

- `tier`/`actionId` deep link, action completion mutation, generated asset evidence/source keywords 경로가 구현되어 있다.
- generated asset product type은 현재 구현 enum(`snippet`, `place_intro`, `review_request`, `vendor_prescription`)을 기준으로 문서를 맞춘다.

### Navigation

- primary route model은 `/home`, `/status`, `/rivals`, `/write`, `/settings`다.
- legacy `/compare`, `/gap`, `/actions`, `/assets`, `/checkout`은 현재 route로 redirect/alias 처리한다.

## 스펙/호환성 정리 — 현재 결론

1. `Channel` 타입 충돌은 **SME v1 = `naver/google/ai`** 로 정리한다.
   - 저장 raw channel: `naver/google/ai_citation`.
   - UI/API display channel: `naver/google/ai`.
   - SNS는 Creator/future lever 문서에만 둔다.
2. generated asset type은 구현 enum(`snippet`, `place_intro`, `review_request`, `vendor_prescription`)을 정본으로 삼는다.
3. Radar adapter는 credential absence를 honest unavailable로 처리하고, subscription waiting/first-scan 상태를 Home Radar card와 연결한다.

## 명시적 비범위 — 구현하지 말 것

- Toss 결제는 사용하지 않는다.
- SMS/Kakao 알림도 사용하지 않는다.
- checkout/payment/settings billing UI를 만들지 않는다.
- Settings 재진단은 v1.5 placeholder다.
- Google real SERP / AI Overview rank / REQ-007 재진단·추이는 v1.5다.
- 크리에이터판은 현재 소상공인용 v1 완료 범위가 아니다.

## 남은 검증/운영 과제

1. 비IT 사장님 2~3명 기준 AC-7 이해도 검증(5분 내 "내 상태/경쟁/할 일" 자기 설명).
2. production credential 환경에서 mock fallback이 꺼진 상태의 smoke 검증.
3. Google real SERP / AI Overview rank / REQ-007 재진단·추이는 v1.5에서 별도 결정.
4. 결제·구독·Kakao/SMS·Creator Radar는 현재 SME v1 범위 밖으로 유지.

## 필수 회귀 검증 세트

최소 회귀는 다음 묶음으로 잡는다.

1. business/find fallback: `apps/web/tests/business/*`, `apps/web/tests/find/*`.
2. diagnosis persistence/gap/action: `apps/web/tests/diagnosis/diagnosis-persistence.test.ts`, `competitor-derivation.test.ts`, `gap-route.test.ts`.
3. job payload/cost gate: `apps/web/tests/diagnosis/job-payload-resolver.test.ts`, `diagnosis-pipeline.test.ts`, `packages/jobs/src/gating/__tests__/index.test.ts`.
4. Radar external integration: `apps/web/tests/radar/*`.
5. 화면 회귀: Home/Status/Rivals/Write route tests and browser smoke where available.

## 현재 한 줄 상태

**소상공인용 v1의 주요 저장/배선 갭은 닫혔다. 남은 판단은 코드 배선보다 production credential smoke와 사장님 이해도 검증이다.**
