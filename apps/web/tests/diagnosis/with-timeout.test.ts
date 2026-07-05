// @TASK 수정R2-A-3 - 진단 타임아웃 래퍼 단위 테스트
// @SPEC apps/web/lib/diagnosis/with-timeout.ts
// @TEST apps/web/tests/diagnosis/with-timeout.test.ts

import { describe, expect, it } from "vitest";
import { mapCrawlFailureToReason } from "../../lib/diagnosis/crawl-failure.js";
import { DiagnosisTimeoutError, withTimeout } from "../../lib/diagnosis/with-timeout.js";

describe("withTimeout (수정R2-A-3)", () => {
  it("시간 내 완료하면 결과를 그대로 반환한다", async () => {
    const out = await withTimeout(async () => 42, 1000);
    expect(out).toBe(42);
  });

  it("초과하면 DiagnosisTimeoutError 로 reject 한다", async () => {
    await expect(
      withTimeout(() => new Promise((resolve) => setTimeout(() => resolve("late"), 50)), 10),
    ).rejects.toBeInstanceOf(DiagnosisTimeoutError);
  });

  it("타임아웃 에러는 crawlFailureReason=TIMEOUT 으로 매핑된다(diagnoses.status timeout/failed 전이 근거)", () => {
    const reason = mapCrawlFailureToReason(new DiagnosisTimeoutError(100));
    expect(reason).toBe("TIMEOUT");
  });

  it("fn 이 throw 하면 그 에러를 전파한다(타임아웃 무관)", async () => {
    await expect(
      withTimeout(async () => {
        throw new Error("boom");
      }, 1000),
    ).rejects.toThrow("boom");
  });
});
