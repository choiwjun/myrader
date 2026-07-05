/**
 * X-SAG Contracts — Version Constants (FR-018)
 *
 * Single source of truth for schema, engine, and scoring versions.
 * When any version changes, update this file and follow the policy
 * described in README.md § Version Policy.
 *
 * v2.0.0 변경 (Phase M-A):
 * - ENGINE_VERSION: 2.0.0 (룰 카탈로그 확장: SEO 36개, AEO 20개, GEO 19개)
 * - SCORING_VERSION: 2.0.0 (가중치 SEO35/AEO25/GEO25/PERF15, perf optional)
 * - SCHEMA_VERSION: 1.1.0 (Phase U schemaVersion bump: 비서 톤 + 산업 7+1)
 */

/** JSON schema version for Diagnosis JSON payloads. Bump MINOR on additive changes, MAJOR on breaking. */
export const SCHEMA_VERSION = "1.1.0" as const;

/** Core engine version — bump when rule logic changes. */
export const ENGINE_VERSION = "2.0.0" as const;

/** Scoring algorithm version — bump when score weights or thresholds change.
 *  2.1.0: graded(비포화) 채점 기본 승격 — v2 포화결함 실증 후(DL-137). */
export const SCORING_VERSION = "2.1.0" as const;
