/**
 * X-SAG Contracts — Error Code Dictionary
 *
 * Sources: TRD § 7.3, SCREEN_SPEC § A.1 (공통 에러 코드).
 * 26 error codes covering all API error scenarios (incl. SERP/Competitor v2 + queue 503).
 *
 * Import: import { ErrorCode, ApiErrorSchema, ERROR_MESSAGES, type ApiError } from "@boina/contracts/errors";
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// ErrorCode — 26 codes (TRD § 7.3 + TASK-CORE-V2-001~006 + E_QUEUE_UNAVAILABLE)
// ---------------------------------------------------------------------------

/**
 * All possible error codes returned by X-SAG APIs.
 * Crawl failure reasons (DNS_FAILED etc.) appear in `status` fields, not HTTP error bodies —
 * they are included here for completeness and shared use by workers.
 */
export const ErrorCodeSchema = z.enum([
  // Input / Validation (HTTP 400)
  "E_VALIDATION",        // Generic field validation failure (details[])
  "E_INVALID_URL",       // URL format invalid
  "E_BLOCKED_MEDICAL",   // Legacy medical hard-block compatibility
  "E_BLOCKED_SNS",       // Legacy SNS hard-block compatibility

  // Auth / Access (HTTP 401, 403)
  "E_AUTH",              // Session expired or missing
  "E_FORBIDDEN",         // IDOR / general access denied
  "E_FORBIDDEN_PLAN",    // Feature requires higher plan (Pro+)
  "E_BRAND_FORBIDDEN",   // White-label brand mismatch (TASK-WORKER-008)
  "E_SCHEMA_UNSUPPORTED", // X-XSAG-Schema-Version 미지원 (TASK-API-016)

  // Not Found / Gone (HTTP 404, 410)
  "E_NOT_FOUND",         // Resource not found
  "E_EXPIRED",           // Guest report expired (24h)

  // Rate limiting (HTTP 429)
  "E_RATE_LIMIT",        // Per-user rate limit exceeded
  "E_QUOTA_EXCEEDED",    // API client monthly quota exceeded

  // Server / Processing errors (HTTP 500, 422)
  "E_SERVER",            // Internal server error
  "E_AI_FAILED",         // AI generation failed (retryable)
  "E_PDF_FAILED",        // PDF generation failed
  "E_QUEUE_UNAVAILABLE", // 진단 큐(Redis/BullMQ) 연결 불가 — 503, 재시도 안내

  // SERP / Competitor Discovery errors (TASK-CORE-V2-001~006)
  "E_SERP_UNAVAILABLE",     // 모든 SERP 프로바이더 실패 (503)
  "E_COMPETITOR_NOT_FOUND", // 경쟁사 발견 결과 없음 (404)
  "E_SERP_RATE_LIMIT",      // SERP 일일 한도 초과 (429)
  "E_FORBIDDEN_DOMAIN",     // 의료/SNS 도메인 금지 (400)

  // Crawl failure reasons (used in report status fields, not HTTP bodies)
  "DNS_FAILED",
  "CONNECTION_REFUSED",
  "HTTP_5xx",
  "HTTP_4xx",
  "ROBOTS_BLOCK_ALL",
  "TIMEOUT",
  "JS_RENDER_FAILED",
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

// ---------------------------------------------------------------------------
// ApiError Zod Schema — TRD § 7.3 공통 에러 응답 본문
// ---------------------------------------------------------------------------

export const ApiErrorDetailSchema = z.object({
  field: z.string(),
  issue: z.string(),
});
export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;

export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.array(ApiErrorDetailSchema).optional(),
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Wrapper matching the TRD § 7.3 response body shape: `{ "error": { ... } }` */
export const ApiErrorResponseSchema = z.object({
  error: ApiErrorSchema,
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

// ---------------------------------------------------------------------------
// Korean user-facing message map (TRD § 7.3 메시지 KO column)
// ---------------------------------------------------------------------------

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Validation
  E_VALIDATION:       "입력값을 확인해주세요.",
  E_INVALID_URL:      "유효한 URL 형식이 아닙니다.",
  E_BLOCKED_MEDICAL:  "의료 업종은 안전모드 동의 후 진단합니다.",
  E_BLOCKED_SNS:      "SNS/플레이스/블로그 URL은 플랫폼 진단 모드로 처리됩니다.",

  // Auth
  E_AUTH:             "로그인이 만료되었습니다.",
  E_FORBIDDEN:        "이 기능에 접근할 권한이 없습니다.",
  E_FORBIDDEN_PLAN:   "Pro 이상 플랜이 필요합니다.",
  E_BRAND_FORBIDDEN:  "이 brand 에 대한 접근 권한이 없습니다.",
  E_SCHEMA_UNSUPPORTED: "지원하지 않는 schemaVersion 입니다.",

  // Not Found / Gone
  E_NOT_FOUND:        "찾을 수 없습니다.",
  E_EXPIRED:          "결과 보존 기간이 만료되었습니다.",

  // Rate Limit
  E_RATE_LIMIT:       "잠시 후 다시 시도해주세요.",
  E_QUOTA_EXCEEDED:   "API 사용 한도를 초과했습니다.",

  // Server
  E_SERVER:           "일시적 오류가 발생했습니다.",
  E_AI_FAILED:        "AI 생성이 실패했습니다. 재시도해주세요.",
  E_PDF_FAILED:       "PDF 생성에 실패했습니다.",
  E_QUEUE_UNAVAILABLE: "일시적인 문제로 진단을 시작하지 못했어요. 잠시 후 다시 시도해주세요.",

  // SERP / Competitor Discovery
  E_SERP_UNAVAILABLE:     "SERP 검색 서비스를 일시적으로 사용할 수 없습니다.",
  E_COMPETITOR_NOT_FOUND: "경쟁사 발견 결과를 찾을 수 없습니다.",
  E_SERP_RATE_LIMIT:      "SERP 검색 일일 한도를 초과했습니다.",
  E_FORBIDDEN_DOMAIN:     "의료기관 또는 SNS URL은 경쟁사로 등록할 수 없습니다.",

  // Crawl failures (status field messages, not HTTP bodies)
  DNS_FAILED:          "도메인을 찾을 수 없습니다.",
  CONNECTION_REFUSED:  "사이트가 연결을 거부했습니다.",
  HTTP_5xx:            "사이트에서 일시적 오류가 발생했습니다.",
  HTTP_4xx:            "페이지에 접근할 수 없습니다.",
  ROBOTS_BLOCK_ALL:    "robots.txt가 X-SAG 봇 접근을 모두 차단합니다.",
  TIMEOUT:             "분석 시간이 길어집니다.",
  JS_RENDER_FAILED:    "JS 렌더링 의존도가 높아 일부 항목만 분석됩니다.",
};

// ---------------------------------------------------------------------------
// HTTP status code map (for API layer convenience)
// ---------------------------------------------------------------------------

export const ERROR_HTTP_STATUS: Partial<Record<ErrorCode, number>> = {
  E_VALIDATION:      400,
  E_INVALID_URL:     400,
  E_BLOCKED_MEDICAL: 400,
  E_BLOCKED_SNS:     400,
  E_AUTH:            401,
  E_FORBIDDEN:       403,
  E_FORBIDDEN_PLAN:  403,
  E_BRAND_FORBIDDEN: 403,
  E_SCHEMA_UNSUPPORTED: 400,
  E_NOT_FOUND:       404,
  E_EXPIRED:         410,
  E_RATE_LIMIT:      429,
  E_QUOTA_EXCEEDED:  429,
  E_SERVER:          500,
  E_AI_FAILED:       422,
  E_PDF_FAILED:      422,
  E_QUEUE_UNAVAILABLE: 503,

  // SERP / Competitor Discovery
  E_SERP_UNAVAILABLE:     503,
  E_COMPETITOR_NOT_FOUND: 404,
  E_SERP_RATE_LIMIT:      429,
  E_FORBIDDEN_DOMAIN:     400,
};
