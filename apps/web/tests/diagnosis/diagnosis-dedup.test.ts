// @TASK 수정R2-A-3 - 진단 dedup 단위 테스트 (진행 중 진단 재사용)
// @SPEC apps/web/lib/diagnosis/diagnosis-dedup.ts
// @TEST apps/web/tests/diagnosis/diagnosis-dedup.test.ts

import { describe, expect, it, vi } from "vitest";
import {
  type ActiveDiagnosisFinder,
  findActiveDiagnosisForBusiness,
} from "../../lib/diagnosis/diagnosis-dedup.js";
import type { DiagnosisRepository } from "../../lib/diagnosis/diagnosis-service.js";

// repo 는 dedup 조회에 사용되지 않지만(인터페이스 호환), 시그니처를 만족하는 stub 을 둔다.
const stubRepo = {} as DiagnosisRepository;

describe("findActiveDiagnosisForBusiness (수정R2-A-3 dedup)", () => {
  it("진행 중(queued/running) 진단이 있으면 그 diagnosisId 를 반환한다(새로 만들지 않음)", async () => {
    const finder: ActiveDiagnosisFinder = vi
      .fn()
      .mockResolvedValue({ id: "diag-active", status: "running" });
    const active = await findActiveDiagnosisForBusiness(stubRepo, "biz-1", finder);
    expect(active).toEqual({ id: "diag-active", status: "running" });
    expect(finder).toHaveBeenCalledWith("biz-1");
  });

  it("진행 중 진단이 없으면 null 을 반환한다(새 진단 생성 경로)", async () => {
    const finder: ActiveDiagnosisFinder = vi.fn().mockResolvedValue(null);
    const active = await findActiveDiagnosisForBusiness(stubRepo, "biz-2", finder);
    expect(active).toBeNull();
  });
});
