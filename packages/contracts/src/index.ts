/**
 * @boina/contracts — Public API (x-sag contracts 복사 후 독립 패키지화, OQ-6)
 *
 * 앱↔엔진 입출력의 단일 진실 데이터 계약. 변경은 additive optional 만 허용 (07 §6).
 * Re-exports all schemas, types, helpers, and constants from sub-modules.
 * Use sub-path imports for tree-shaking in production bundles:
 *
 *   import { DiagnosisJsonSchema } from "@boina/contracts/diagnosis";
 *   import { ErrorCode }           from "@boina/contracts/errors";
 *
 * Or use this barrel for convenience in scripts / tests:
 *
 *   import { DiagnosisJsonSchema, ErrorCode, SCHEMA_VERSION } from "@boina/contracts";
 */

// Version constants
export * from "./version.js";

// Enumerations
export * from "./enums.js";

// Error codes, message map, and ApiError schema
export * from "./errors.js";

// Shared queue contracts
export * from "./queue.js";

// Core Diagnosis JSON schema + helpers
export * from "./diagnosis.js";

// API request / response schemas (5 endpoints)
export * from "./api.js";

// Domain models
export * from "./snippet.js";
export * from "./prescription.js";
export * from "./inquiry.js";

export * from "./radar.js";

// External API schemas (FR-020)
export * from "./external-api.js";

// Copy module — 비서 톤 카피 + 산업 vocab + 렌더 엔진 (v0.4)
export * from "./copy/index.js";

// P0-T1 부팅 스모크 마커 — 빈 배럴 시절 호환 유지 (워크스페이스 배선 테스트 의존).
/**
 * 패키지 식별 상수 — 엔진 경계 부팅 스모크에서 사용한다.
 */
export const CONTRACTS_PACKAGE = "@boina/contracts" as const;
