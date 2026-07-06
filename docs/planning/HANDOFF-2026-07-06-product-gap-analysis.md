# Handoff — 2026-07-06 Product Gap Analysis

## 목적

기획서와 구현 소스를 대조해, 현재 제품이 MVP 요구사항을 만족하지 못하는 누락·미구현·계약 불일치 지점을 다음 작업자가 바로 이어받을 수 있게 정리한다.

## 조사 범위

- 기획 문서: `docs/planning/01-prd.md`, `02-trd.md`, `03-user-flow.md`, `04-database-design.md`, `06-screens.md`, `06-tasks.md`
- 화면/리소스 스펙: `specs/screens/*.yaml`, `specs/shared/types.yaml`, `specs/domain/resources.yaml`
- 주요 구현: `apps/web/app/(app)/*`, `apps/web/app/api/*`, `apps/web/lib/diagnosis/*`, `apps/web/lib/radar/*`, `packages/engine/src/pipeline.ts`, `packages/jobs/src/gating/index.ts`, `packages/db/src/schema/*`

## 결론

엔진 결함 수정과 별개로, 제품의 핵심 계약인 “실측 기반 진단 → 경쟁사/갭 → 오늘 할 일” 흐름은 아직 완성 상태가 아니다. 가장 큰 문제는 실측 근거와 job payload가 영속화되지 않고, 경쟁사 갭이 실제 경쟁사 진단이 아니라 추정으로 생성되며, Home/Status/Rivals/Write 화면의 데이터 계약이 기획서보다 약하다는 점이다.

## 출시 차단급 이슈

### P0-1. `/find`가 선택 홈페이지를 진단 대상으로 쓰지 않음

- `apps/web/app/(app)/find/page.tsx`는 `websiteUrl`을 `/api/business`에 저장하지만, 진단 enqueue는 항상 `target: candidate.placeUrl`, `sourceType: "naver_place"`로 보낸다.
- `packages/engine/src/pipeline.ts`는 비웹 source에서 `platformLiveFetchAllowlist` 기본값이 빈 배열이다.
- 결과: 홈페이지 SEO/AEO/GEO 분석이 누락되거나 `PLATFORM_LIVE_FETCH_NOT_APPROVED` 경로로 빈/부분 결과가 될 수 있다.

**다음 작업:** 홈페이지 URL이 있으면 `sourceType: "website"`로 우선 진단하고, 네이버 플레이스는 공식 API/허용된 수집 경로로만 보조 증거화한다.

### P0-2. 경쟁사 갭이 실제 경쟁사 진단이 아니라 추정

- `apps/web/lib/diagnosis/diagnosis-persistence.ts`의 `buildCompetitorReports()`는 내 실패 룰을 경쟁사는 모두 `passed: true`로 가정한다.
- `apps/web/lib/diagnosis/competitor-derivation.ts`는 `naver_serp:<name>`, `gpt_grounded:<name>` placeholder를 gap 입력으로 사용한다.
- 결과: “경쟁사는 있고 우리는 없음”이 사실이 아닐 수 있다.

**다음 작업:** 실제 competitor URL을 보존하고, 경쟁사별 lightweight `runDiagnosisPipeline()`을 돌린 뒤 그 결과를 `GapAnalyzer`에 넣는다. 실제 경쟁사 리포트가 없으면 gap row 대신 measured-unavailable 상태를 반환한다.

### P0-3. Naver/AI 실측 근거가 영속화되지 않음

- `apps/web/lib/diagnosis/channel-status-service.ts`는 persisted `engine_results`에 grounded evidence가 없어 AI green이 불가능하다고 명시한다.
- `llmValidation`, `naverPresence`, `GapResult`가 구조적으로 저장되지 않는다.
- 결과: AI HERO, Status evidence sheet, 채널 신호가 기획서의 실측/수집/추정 라벨 계약을 만족하지 못한다.

**다음 작업:** `diagnosisId` 기준으로 full `DiagnosisJson` raw JSON 또는 `naverPresence`, `llmValidation`, `GapResult` 전용 evidence 테이블/JSON 컬럼을 추가한다.

### P0-4. DB job payload가 정확히 영속화되지 않음

- `apps/web/lib/diagnosis/job-payload-resolver.ts`는 cron/cross-process 복구 시 `industry: "기타"`, `requestLlmValidation: false`, `mainServices/targetKeywords: [name]`으로 payload를 재구성한다.
- 결과: 같은 진단 요청이 same-process drain과 cron recovery에서 서로 다른 의미로 실행될 수 있다.

**다음 작업:** validated `DiagnosisJobPayload`, job type, attempts, last error, timestamps를 durable job table 또는 `diagnoses.job_payload jsonb`에 저장한다.

### P0-5. 비용 게이트가 항상 허용

- `packages/jobs/src/gating/index.ts`의 `defaultCostGate`는 `allowAllCostGate`이며 항상 `allowed: true`를 반환한다.
- `apps/web/app/(app)/find/page.tsx`는 모든 진단에 `requestLlmValidation: true`를 보낸다.
- 결과: 프로덕션 키가 연결되면 공개 진단 플로우가 LLM/SERP 비용을 제어하지 못한다.

**다음 작업:** account/business/IP 단위 quota, cache 재사용, plan tier, daily/monthly budget, deny/defer reason을 가진 실제 cost gate로 교체한다.

## 화면/스펙 구현 갭

### Home

- `specs/screens/home.yaml`은 5개 카드가 상태 기반이어야 한다.
- 구현 `apps/web/app/(app)/home/page.tsx`는 `/api/radar/preview`만 동적으로 조회하고, HERO/channel/rival/steady 카드 대부분은 정적 문구와 링크다.

**다음 작업:** diagnosis, channelStatus, competitor/gap headline, todayOne action, radar preview를 합성하는 home summary API/loader를 추가한다.

### Status

- `specs/screens/my-status.yaml`은 Naver/Google/SNS/AI, evidence sheet, priority fix list → `/write`를 요구한다.
- 구현은 `naver/google/ai` 3개만 렌더링하고, evidence sheet와 priority fix list가 없다. CTA는 `/rivals`로 향한다.
- `specs/shared/types.yaml`은 Channel을 `[naver, google, ai]`로 정의해 status 스펙의 SNS와 충돌한다.

**다음 작업:** 먼저 evidence sheet와 priority fix list를 구현하고, SNS는 기획 정리 후 shared type/API/UI를 일괄 수정한다.

### Rivals

- `specs/screens/vs-competitor.yaml`은 competitor/gapItem의 `source`, `collectedAt`, `evidence`를 요구한다.
- 구현은 competitor/gap 표시와 정렬은 있으나 gap evidence와 수집 시각이 부족하고 evidence sheet가 아니다.

**다음 작업:** competitor/gap API 응답에 evidence/collectedAt/sourceLabel을 추가하고 reusable evidence sheet로 렌더링한다.

### Write

- `specs/screens/actions.yaml`은 `actionId`, `tier`, evidence, generated asset sourceKeywords를 요구한다.
- 구현은 `tier`를 하이라이트에만 쓰고 `/api/action` 필터로 전달하지 않는다. `actionId`도 사용하지 않는다.
- DB `actions.is_completed/completed_at`은 있으나 action completion API/UI가 없다.

**다음 작업:** action filtering, `actionId` deep link, completion mutation, source keyword/evidence 표시를 추가한다.

### Navigation

- `docs/planning/03-user-flow.md`는 primary nav를 `/home`, `/status`, `/rivals`, `/write`, `/settings`로 정의한다.
- `apps/web/app/components/shared/AppNav.tsx`의 `SECTIONS`는 4개이고 settings는 icon-only 링크다.

**다음 작업:** settings를 primary nav model에 포함하고 모바일 bottom navigation 요구사항을 구현한다.

## 스펙/계약 불일치

- `specs/shared/types.yaml`의 `Channel`에는 SNS가 없지만 `my-status.yaml`과 화면 문서는 SNS를 요구한다.
- `specs/screens/actions.yaml`의 asset type(`menu_photo_description`, `faq_snippet`, `vendor_brief`)이 구현 타입(`snippet`, `place_intro`, `review_request`, `vendor_prescription`)과 다르다.
- `/gap` redirect는 `businessId`, `tier`를 보존하지 않는다.
- `/assets` redirect는 `actionId`를 보존하지 않는다.
- `generated_assets.type`은 제품 asset type이 아니라 엔진 enum에 제품 의미를 덧씌운 매핑이라 장기적으로 취약하다.

## 명시적 비범위 — 구현하지 말 것

- Toss 결제는 사용하지 않는다. `/checkout -> /home`, `/api/payment -> PAYMENT_DISABLED` 상태가 현재 기획과 일치한다.
- SMS와 Kakao 알림도 사용하지 않는다. 알림톡, 문자 fallback, 결제/알림 설정 화면은 누락이 아니라 의도된 제외다.
- Settings의 재진단은 v1.5 placeholder로 문서화되어 있어 현재 MVP 누락으로 보지 않는다.
- Google real SERP / AI Overview rank / REQ-007 재진단·추이는 OPEN/v1.5 범위다.

## 권장 실행 순서

1. 진단 입력/크롤 계약 수정: 홈페이지 우선, 네이버 플레이스 보조 증거화, platform allowlist 정책 명확화.
2. durable job payload 저장.
3. `DiagnosisJson`/evidence raw 저장 및 channel-status 재배선.
4. 실제 competitor diagnostics + `GapAnalyzer` 재배선.
5. cost gate 실제 정책 구현.
6. Home/Status/Rivals/Write API/UI evidence contract 보강.
7. action completion과 deep link query 보존 수정.
8. 스펙 타입 충돌 정리.
9. mock-only 테스트를 보강해 `/find -> /api/diagnosis -> pipeline input -> persisted evidence -> UI routes` 통합 경로를 검증한다.

## 검증 상태

이번 문서는 read-only 소스/기획 비교 결과를 정리한 handoff다. 제품 소스 수정 및 테스트 실행은 포함하지 않았다.
