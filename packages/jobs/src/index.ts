/**
 * @boina/jobs — 백그라운드 잡 큐 골격 (P0-T3)
 *
 * @SPEC docs/planning/02-trd.md#3-백그라운드-잡
 * @SPEC docs/planning/07-coding-convention.md#6-확장성-코딩-규칙구속
 *
 * 공개 API:
 *  - JobQueue 인터페이스 (인프라 교체 경계 — OQ-5 경량 결정)
 *  - InMemoryJobQueue (단위 테스트·로컬용)
 *  - DbBackedJobQueue (운영 경량 — diagnoses.status 활용)
 *  - 상태 전이 가드 (queued → running → completed/failed)
 *  - 비용 게이팅 함수 자리 (gating)
 *
 * ADR·인터페이스 경계·비용 게이팅 결정: packages/jobs/README.md
 */

export * from "./queue/index.js";
export * from "./gating/index.js";
