# Handoff — 2026-07-06 소상공인용 v1 재감사

## 목적

기획서와 현재 구현을 다시 대조해, 다음 작업자가 **무엇을 새로 만들지 말고**, **무엇을 기존 boina 구현에서 복원·재연결해야 하며**, **무엇을 아직 구현해야 하는지** 바로 실행할 수 있게 정리한다.

이 문서는 사용자 정정 사항을 반영한다:

- Toss 결제는 사용하지 않는다.
- SMS/Kakao 알림도 사용하지 않는다.
- 기존 boina에는 실측 저장 구현이 있었다. 따라서 실측/evidence 관련 항목은 “무조건 새로 구현”이 아니라 **기존 구현 확인 → 현재 레포 read/write path 재연결 → 회귀검증**이 우선이다.

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

## 핵심 남은 작업 — 우선순위

## P0-1. `/find` 진단 입력 경로 재연결

### 현재 확인

- `apps/web/app/(app)/find/page.tsx`는 `websiteUrl`을 `/api/business`로 저장한다.
- 같은 파일의 `enqueueWithBusiness()`는 저장된 `business.websiteUrl` 대신 항상 `candidate.placeUrl`을 `target`으로 보내고, `sourceType: "naver_place"`로 enqueue한다.
- `apps/web/app/api/diagnosis/route.ts`는 받은 `input.target`을 그대로 job payload에 넣는다.
- 반대로 `job-payload-resolver.ts`의 cron 복구 경로는 `homepageUrl`이 있으면 `sourceType: "website"`로 복원한다.

### 문제

same-process drain과 cron recovery가 서로 다른 target/sourceType으로 진단할 수 있다. 홈페이지가 있는 가게도 첫 경로에서는 네이버 플레이스로 진단되고, 복구 경로에서는 홈페이지로 진단된다.

### 해야 할 일

1. 기존 boina에서 홈페이지/플랫폼 입력 선택 규칙을 확인한다.
2. 현재 `/find` 또는 `/api/diagnosis`에서 `business.websiteUrl`이 있으면 `target=homepageUrl`, `sourceType=website`로 통일한다.
3. 홈페이지가 없을 때만 네이버 플레이스/검색 보조 경로를 사용한다.
4. same-process drain과 cron recovery가 동일 payload 의미를 갖도록 테스트한다.

### 필요한 테스트

- `/find` 후보 확정 + 홈페이지 URL 입력 → `/api/diagnosis` payload가 website target을 사용.
- 홈페이지 없음 → naver_place 보조 경로.
- same-process와 cron recovery가 같은 target/sourceType/profile을 사용.

## P0-2. durable job payload 저장

### 현재 확인

- `packages/jobs/src/queue/db-backed-queue.ts`는 `diagnoses.status`를 큐 상태로 쓰고, job type/payload는 인메모리 `meta`에 둔다.
- `apps/web/lib/jobs.ts`는 cron/cross-process 복구를 위해 `resolveDiagnosisJobPayload()`를 주입한다.
- `job-payload-resolver.ts`는 DB의 `diagnoses + businesses`에서 payload를 재구성한다.
- 재구성 payload는 `requestLlmValidation:false`, `modules:["seo","aeo","geo"]`, `mainServices/targetKeywords:[name]`이며, 현재 resolver는 category를 select하지 않는다.

### 문제

복구 경로는 원래 사용자가 요청한 payload와 다를 수 있다. 특히 LLM validation 요청, 업종, 서비스, target keywords, modules, sourceType이 달라질 수 있다.

### 해야 할 일

1. `diagnoses.job_payload jsonb` 또는 별도 `jobs` 테이블을 추가한다.
2. enqueue 시 validated `DiagnosisJobPayload` 원문을 저장한다.
3. cron recovery는 재구성하지 말고 저장 payload를 그대로 사용한다.
4. attempts, lastError, timestamps를 저장한다.
5. 기존 resolver는 legacy fallback으로만 남긴다.

## P0-3. 실측 evidence 저장/read path 재검증

### 현재 확인

- `engine_results.evidence`는 존재한다.
- `mapEngineResults()`는 rule item evidence를 저장한다.
- `channel-status` route는 `engine_results`를 읽어 channel signal을 만든다.
- 그러나 `channel-status-service.ts`의 persisted 경로는 `engine_results`에 grounded citation 근거가 없으므로 AI green 불가라고 명시한다.
- `deriveChannelStatuses(diagnosis: DiagnosisJson)`는 `meta.naverPresence`, `meta.llmValidation`을 사용할 수 있지만, route read path는 full `DiagnosisJson` 원자료를 읽지 않는다.

### 문제

기존 boina에 `naverPresence`, `llmValidation`, `GapResult` 실측 저장이 있었다면 현재 레포에서 그 raw/structured evidence가 route와 화면까지 이어지는지 끊겨 있다. 현재 normalized table은 “룰 결과 evidence”는 담지만, AI grounded citation의 query/sample/mention, Naver presence 원자료, GapResult raw matrix 같은 화면 evidence sheet용 근거가 부족하다.

### 해야 할 일

1. 기존 boina의 실측 저장 구현 위치를 찾는다.
2. 현재 레포에 다음 중 하나로 복원한다.
   - full `DiagnosisJson` raw JSON 저장
   - 또는 `diagnosis_measurements`류 테이블로 `naverPresence`, `llmValidation`, `GapResult`, `businessPresence` 구조 저장
3. `/api/channel-status`가 raw measured evidence를 우선 사용하도록 바꾼다.
4. `found`, `collectedAt`, `source`, `evidence`, `measurementLabel`을 API 응답에 포함한다.
5. Status/Rivals evidence sheet에서 이 값을 렌더링한다.

## P0-4. 경쟁사 gap의 “실제 경쟁사 진단” 재검증

### 현재 확인

- `competitors`와 `gap_rows`는 저장된다.
- `diagnosis-persistence-integration.test.ts`는 mock pipeline + 수동 `competitorUrls`로 gap rows 저장을 검증한다.
- 하지만 `buildCompetitorReports()`는 현재 self failed item을 경쟁사는 모두 `passed:true`로 복제한다.
- `competitor-derivation.ts`는 `naver_serp:<name>`, `gpt_grounded:<name>` 같은 placeholder를 만들 수 있다.

### 문제

저장 구조와 GapAnalyzer 배선은 있다. 그러나 실제 경쟁사 웹/플랫폼을 진단한 report가 아니라 “내가 실패한 룰을 경쟁사는 통과했다고 가정”하는 경로가 남아 있다. 기존 boina에서 실제 경쟁사 실측 저장이 있었다면 그 경로를 복원해야 한다.

### 해야 할 일

1. 기존 boina의 competitor report 저장/재사용 방식을 확인한다.
2. SERP/grounded 결과에서 실제 competitor URL 또는 충분한 measured identifier를 보존한다.
3. 경쟁사별 lightweight diagnosis를 실행하거나 기존 저장 report를 재사용한다.
4. `GapAnalyzer`에는 실제 competitor diagnosis item/report를 넣는다.
5. 실제 competitor report가 없으면 gap row를 만들지 말고 measured-unavailable 상태를 반환한다.

## P0-5. cost gate 실제 정책 구현

### 현재 확인

- `packages/jobs/src/gating/index.ts`의 `defaultCostGate`는 `allowAllCostGate`다.
- `/find`는 모든 진단에 `requestLlmValidation:true`를 보낸다.
- handler는 `decideLlmValidation()`에서 cost gate를 호출하지만 기본 정책은 항상 허용이다.

### 문제

운영 key가 연결되면 공개 진단이 LLM/SERP 비용을 제어하지 못한다.

### 해야 할 일

1. account/business/IP 기준 quota를 둔다.
2. daily/monthly budget과 cached measurement reuse를 둔다.
3. plan tier가 남아 있더라도 결제 플로우는 만들지 말고 서버 정책 판단에만 사용한다.
4. deny/defer reason을 저장해 화면에서 정직하게 “측정 전/나중에”를 표시한다.

## P1. 화면/API 계약 보강

### Home

- 기획: 5개 카드가 상태 기반이어야 한다.
- 현재: `/home`은 `/api/radar/preview`만 동적으로 조회하고 HERO/channel/rival/steady card는 대부분 정적 문구/링크다.

해야 할 일:

1. home summary API/loader 추가.
2. diagnosis status, channel status, rival headline, today-one action, radar preview를 합성.
3. running/failed/insufficient/unavailable 상태 반영.

### Status

- 기획: channel rows + evidence sheet + priority fix list → `/write`.
- 현재: `naver/google/ai` 3개 카드, evidence sheet 없음, priority fix 없음, CTA는 `/rivals`.
- 스펙 충돌: `my-status.yaml`은 SNS를 요구하지만 `specs/shared/types.yaml`과 구현은 `naver/google/ai`다.

해야 할 일:

1. evidence sheet 구현.
2. priority fix list 구현.
3. priority fix CTA를 `/write`로 연결.
4. SNS는 제품 결정 후 스펙/타입/API/UI를 일괄 정리. 현재 v1에서 SNS를 넣지 않는다면 `my-status.yaml`에서 제거한다.

### Rivals

- 기획: competitor/gap evidence, source, collectedAt, evidence sheet.
- 현재: competitor/gap 표시는 있으나 gap evidence와 수집시각/출처 sheet가 약하다.

해야 할 일:

1. `/api/competitor`, `/api/gap` 응답에 `source`, `collectedAt`, `evidence`, `measurementLabel` 추가.
2. competitor와 gapItem을 같은 evidence sheet로 묶는다.
3. measured/unavailable/estimated를 명확히 구분한다.

### Write

- 기획: `tier`, `actionId`, generated asset evidence/sourceKeywords, action completion.
- 현재: `tier`는 하이라이트에만 쓰이고 `/api/action` 필터로 전달되지 않는다. `actionId`도 사용하지 않는다.
- DB에는 `actions.is_completed`, `completed_at`이 있지만 mutation/UI가 없다.

해야 할 일:

1. `/api/action?diagnosisId=&tier=` 필터 반영.
2. `/write?actionId=` deep link 처리.
3. action completion mutation 추가.
4. generated asset sourceKeywords/evidence 표시.

### Navigation

- 기획: primary nav는 `/home`, `/status`, `/rivals`, `/write`, `/settings`.
- 현재: `AppNav.SECTIONS`는 `/home`, `/status`, `/rivals`, `/write`만 포함하고 settings는 icon-only 링크다.

해야 할 일:

1. settings를 primary nav model에 포함.
2. 모바일 bottom navigation 요구사항을 구현하거나 스펙을 현재 top nav 기준으로 정리.

## P2. 스펙/호환성 정리

1. `Channel` 타입 충돌 정리
   - 구현/shared types: `naver/google/ai`
   - 일부 화면 스펙: `naver/google/sns/ai`

2. generated asset type 충돌 정리
   - 구현: `snippet`, `place_intro`, `review_request`, `vendor_prescription`
   - `actions.yaml`: `menu_photo_description`, `faq_snippet`, `vendor_brief`

3. legacy redirect query 보존
   - `/gap`은 `businessId`, `tier` 보존 필요.
   - `/assets`는 `actionId` 보존 필요.

4. generated asset DB type semantic overload 정리
   - 현재 product asset type을 engine enum에 매핑한다.
   - product-facing asset type 컬럼/enum 분리가 안전하다.

5. radar adapter/waiting state
   - radar DB/job/preview 골격은 있으나 실제 Naver/DataLab/SearchAd adapter는 credential 없으면 throw하는 stub 경로다.
   - S8 waiting/first-scan 상태를 Home card에 명확히 연결한다.

## 명시적 비범위 — 구현하지 말 것

- Toss 결제는 사용하지 않는다.
- SMS/Kakao 알림도 사용하지 않는다.
- checkout/payment/settings billing UI를 만들지 않는다.
- Settings 재진단은 v1.5 placeholder다.
- Google real SERP / AI Overview rank / REQ-007 재진단·추이는 v1.5다.
- 크리에이터판은 현재 소상공인용 v1 완료 범위가 아니다.

## 권장 실행 순서

1. 기존 boina 실측 저장/경쟁사 report 구현 위치를 찾아 현재 레포와 diff한다.
2. `/find` → `/api/business` → `/api/diagnosis` 입력 target/sourceType을 홈페이지 우선으로 정정한다.
3. job payload를 durable하게 저장한다.
4. raw measured evidence 저장/read path를 복원한다.
5. 경쟁사 실제 report 기반 GapAnalyzer 입력을 복원한다.
6. cost gate를 allow-all에서 운영 정책으로 교체한다.
7. Home/Status/Rivals/Write의 evidence/state UI를 보강한다.
8. action completion과 query deep link를 마무리한다.
9. 스펙 충돌을 정리한다.
10. 통합 테스트를 mock-only에서 실제 pipeline input/evidence read path 중심으로 보강한다.

## 필수 검증 세트

최소 검증은 다음 순서로 잡는다.

1. `bun test apps/web/tests/business/business-db-integration.test.ts`
2. `bun test apps/web/tests/diagnosis/job-payload-resolver.test.ts`
3. `bun test apps/web/tests/diagnosis/diagnosis-job-execution-e2e.test.ts`
4. `bun test apps/web/tests/diagnosis/diagnosis-persistence-integration.test.ts`
5. 새 테스트: `/find` 홈페이지 URL 입력이 실제 pipeline `startUrl`로 들어가는지 검증.
6. 새 테스트: cron recovery와 same-process drain의 payload 동일성 검증.
7. 새 테스트: stored `llmValidation/naverPresence/GapResult`가 `/api/channel-status`, `/api/competitor`, `/api/gap`로 노출되는지 검증.
8. 화면 회귀: Home 5카드, Status evidence sheet/priority fix, Rivals evidence sheet, Write action completion.

## 현재 한 줄 상태

**소상공인용 v1의 저장/배선 골격은 꽤 들어와 있다. 하지만 v1 완료라고 보기에는 `/find` 입력 계약, durable payload, raw 실측 evidence read path, 실제 competitor report 기반 gap, cost gate, 화면 evidence/state 계약이 아직 닫히지 않았다.**
