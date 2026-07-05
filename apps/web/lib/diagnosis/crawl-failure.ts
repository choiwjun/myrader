// @TASK P1-R2 - 진단 실패 사유 매핑 (error → CrawlFailureReason enum)
// @SPEC docs/planning/04-database-design.md#diagnosis-table (crawl_failure_reason)
// @SPEC .claude/constitutions/nextjs/api-routes.md (민감정보 비노출)
//
// 파이프라인 throw 를 diagnoses.crawl_failure_reason enum 으로 좁힌다.
// 원본 에러 메시지를 DB/화면에 그대로 싣지 않는다(민감정보·스택 비노출 — 헌법).
// 매핑 불가(미지정 원인)면 null 을 반환해 enum 을 오염시키지 않는다.

import type { DiagnosisCrawlFailureReason } from "./diagnosis-service.js";

/** 타임아웃류 키워드 → TIMEOUT (엔진 StageTimeoutError 포함). */
const TIMEOUT_HINTS = ["timeout", "timed out", "stage timed out", "etimedout"];

/**
 * 알 수 없는 에러를 CrawlFailureReason enum 으로 best-effort 매핑한다.
 * 안전 기본값: 확신할 수 없으면 null(원인 미상) — 잘못된 enum 단정 금지.
 */
export function mapCrawlFailureToReason(err: unknown): DiagnosisCrawlFailureReason | null {
  const name = err instanceof Error ? err.name.toLowerCase() : "";
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  const haystack = `${name} ${message}`;

  if (TIMEOUT_HINTS.some((h) => haystack.includes(h))) return "TIMEOUT";
  if (haystack.includes("enotfound") || haystack.includes("dns")) return "DNS_FAILED";
  if (haystack.includes("econnrefused") || haystack.includes("connection refused")) {
    return "CONNECTION_REFUSED";
  }
  // 원인 미상 — enum 을 추측으로 채우지 않는다(정직성).
  return null;
}
