// @TASK P1-R2 - diagnosis 서비스 단위 테스트 (RED→GREEN)
// @SPEC docs/planning/04-database-design.md#diagnosis-table
// @SPEC docs/planning/07-coding-convention.md §4 (점수 비노출 → 신호등 변환)
//
// diagnosis 서비스의 순수 로직(저장소 추상화 주입)을 검증한다.
// - 생성/조회/상태전이 (DB-agnostic 코어, 인메모리 fake repo)
// - overallSignal 파생(overallScore → HealthBand 신호등, 07 §4)
//
// 실제 DB·엔진·네트워크 없이 fake repository 로 검증 (실외부호출 0).

import { describe, expect, it } from "vitest";
import {
  type DiagnosisRecord,
  type DiagnosisRepository,
  createDiagnosis,
  deriveOverallSignal,
  getDiagnosisView,
  markDiagnosisFailed,
  markDiagnosisRunning,
  reflectDiagnosisResult,
} from "../../lib/diagnosis/diagnosis-service.js";

/** 테스트용 인메모리 DiagnosisRepository (실 DB 미접근). */
function makeFakeRepo(): DiagnosisRepository & { rows: Map<string, DiagnosisRecord> } {
  const rows = new Map<string, DiagnosisRecord>();
  let seq = 0;
  return {
    rows,
    async create(input) {
      const id = `00000000-0000-4000-8000-${String(seq++).padStart(12, "0")}`;
      const now = new Date();
      const rec: DiagnosisRecord = {
        id,
        businessId: input.businessId,
        status: "queued",
        overallScore: null,
        summaryText: null,
        crawlFailureReason: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      rows.set(id, rec);
      return rec;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async update(id, patch) {
      const cur = rows.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch, updatedAt: new Date() };
      rows.set(id, next);
      return next;
    },
  };
}

describe("diagnosis 서비스 (P1-R2)", () => {
  it("createDiagnosis: businessId 로 queued 진단 행을 만든다 (UUID v4 id)", async () => {
    const repo = makeFakeRepo();
    const rec = await createDiagnosis(repo, { businessId: "biz-1" });
    expect(rec.status).toBe("queued");
    expect(rec.businessId).toBe("biz-1");
    // id 는 repository(DB defaultRandom) 가 생성 — 앱이 만들지 않는다.
    expect(rec.id).toMatch(/^[0-9a-f-]+$/);
  });

  it("deriveOverallSignal: overallScore → 신호등(HealthBand) 파생 (07 §4)", () => {
    // 점수는 엔진 내부 신호 — UI 노출은 신호등으로 변환.
    expect(deriveOverallSignal(85)).toBe("good");
    expect(deriveOverallSignal(70)).toBe("fair");
    expect(deriveOverallSignal(50)).toBe("weak");
    expect(deriveOverallSignal(20)).toBe("poor");
    expect(deriveOverallSignal(null)).toBeNull();
  });

  it("getDiagnosisView: overallScore 를 노출하지 않고 overallSignal 만 파생한다", async () => {
    const repo = makeFakeRepo();
    const rec = await createDiagnosis(repo, { businessId: "biz-1" });
    await reflectDiagnosisResult(repo, rec.id, { overallScore: 82, summaryText: "ok" });

    const view = await getDiagnosisView(repo, rec.id);
    expect(view).not.toBeNull();
    expect(view?.status).toBe("completed");
    expect(view?.overallSignal).toBe("good");
    // 점수 원본은 뷰에 노출하지 않는다 (07 §4 점수 비노출).
    expect(view as unknown as Record<string, unknown>).not.toHaveProperty("overallScore");
  });

  it("상태 전이: queued → running → completed (reflectResult 가 completed + completedAt stamp)", async () => {
    const repo = makeFakeRepo();
    const rec = await createDiagnosis(repo, { businessId: "biz-1" });

    await markDiagnosisRunning(repo, rec.id);
    expect((await repo.findById(rec.id))?.status).toBe("running");

    const done = await reflectDiagnosisResult(repo, rec.id, {
      overallScore: 64,
      summaryText: "fair",
    });
    expect(done?.status).toBe("completed");
    expect(done?.overallScore).toBe("64");
    expect(done?.completedAt).not.toBeNull();
  });

  it("실패 전이: markDiagnosisFailed → failed + crawlFailureReason 반영", async () => {
    const repo = makeFakeRepo();
    const rec = await createDiagnosis(repo, { businessId: "biz-1" });
    await markDiagnosisRunning(repo, rec.id);

    const failed = await markDiagnosisFailed(repo, rec.id, { crawlFailureReason: "TIMEOUT" });
    expect(failed?.status).toBe("failed");
    expect(failed?.crawlFailureReason).toBe("TIMEOUT");
    expect(failed?.completedAt).not.toBeNull();
  });
});
