// @TASK P1-S0-V — 공통 연결점 검증: 진단 status → 공통 진행 UI 반영
// @SPEC docs/planning/06-tasks.md#p1-s0-v
// @SPEC docs/planning/02-trd.md §3 (진단 상태)
// @SPEC apps/web/lib/shared/ui-labels.ts (diagnosisStatusToLabel)
//
// 통합 테스트: 진단 파이프라인의 status(queued/running/done/failed)가
// 공통 컴포넌트(diagnosisStatusToLabel + UI 렌더)에서 사장님 언어로 정확히 반영되는지.
// 정직성 가드: 기술 용어(queued/running) 절대 노출 금지.
//
// RED 의도: diagnosisStatusToLabel 또는 SignalLight가 status enum을 받지 못하면 실패.
// GREEN: 모든 status → 사장님 언어 + 전문용어 0.

import { describe, expect, it } from "vitest";
import { type DiagnosisStatus, diagnosisStatusToLabel } from "../../lib/shared/ui-labels";

describe("P1-S0-V: 진단 status → 공통 진행 UI 반영 (diagnosisStatusToLabel)", () => {
  describe("status enum 모두 사장님 언어 변환 (정직성 가드)", () => {
    it('queued → "준비 중" (기술용어 0)', () => {
      const result = diagnosisStatusToLabel("queued");
      expect(result.label).toBeTruthy();
      // 기술용어 금지: "queued" 노출 안 함
      expect(result.label).not.toMatch(/queued/i);
      // 사장님 언어 확인
      expect(result.label.toLowerCase()).toContain("준비");
    });

    it('running → "살펴보는 중" (기술용어 0)', () => {
      const result = diagnosisStatusToLabel("running");
      expect(result.label).toBeTruthy();
      // 기술용어 금지
      expect(result.label).not.toMatch(/running|processing|in.progress/i);
      expect(result.description).not.toMatch(/running/i);
    });

    it('done → "다 봤어요" (완료 신호 명확)', () => {
      const result = diagnosisStatusToLabel("done");
      expect(result.label).toBeTruthy();
      // 기술용어 금지: "completed" "done" 노출 안 함
      expect(result.label).not.toMatch(/completed|done/i);
    });

    it('failed → "잠깐 멈췄어요" (실패를 응원 톤으로, 기술용어 0)', () => {
      const result = diagnosisStatusToLabel("failed");
      expect(result.label).toBeTruthy();
      // 기술용어 금지: "failed" "error" "failure" 노출 안 함
      expect(result.label).not.toMatch(/failed|error|failure/i);
      // 응원 톤 (비난 없음)
      expect(result.description).not.toMatch(/오류|실패|에러/);
    });
  });

  describe("각 상태별 description(부가 설명)도 정직성 가드 준수", () => {
    it("queued: description 있어야 함", () => {
      const result = diagnosisStatusToLabel("queued");
      expect(result.description).toBeTruthy();
      expect(result.description).not.toMatch(/queue|wait|pending/i);
    });

    it("running: description은 상태 설명(기술 용어 0)", () => {
      const result = diagnosisStatusToLabel("running");
      expect(result.description).toBeTruthy();
      // 진행 중을 사장님 관점으로 설명 (확인/살펴보기)
      expect(result.description).not.toMatch(/processing|running|diagnostic|analysis/i);
    });

    it("done: description은 완료 신호(결과 확인 가능)", () => {
      const result = diagnosisStatusToLabel("done");
      expect(result.description).toBeTruthy();
      // 결과 확인 가능을 암시
      expect(result.description.toLowerCase()).toMatch(/결과|확인|봤/);
    });

    it("failed: description은 응원+복구(비난 없음)", () => {
      const result = diagnosisStatusToLabel("failed");
      expect(result.description).toBeTruthy();
      // 응원 톤 (걱정 마/다시/복구)
      expect(result.description).toMatch(/다시|걱정|시도/);
      // 비난/실패감 없음
      expect(result.description).not.toMatch(/오류|실패|문제|잘못/);
    });
  });

  describe("UI 렌더링 계약: 모든 상태가 유효한 label/description 반환", () => {
    const allStatuses: DiagnosisStatus[] = ["queued", "running", "done", "failed"];

    it("모든 상태 enum이 처리되어야 함 (switch exhaustive)", () => {
      for (const status of allStatuses) {
        const result = diagnosisStatusToLabel(status);
        expect(result).toHaveProperty("label");
        expect(result).toHaveProperty("description");
        expect(result.label).toBeTruthy();
        expect(result.description).toBeTruthy();
      }
    });

    it("어떤 상태도 undefined 반환하면 안 됨", () => {
      for (const status of allStatuses) {
        const result = diagnosisStatusToLabel(status);
        expect(result).toBeDefined();
        expect(result.label).not.toBeUndefined();
      }
    });
  });

  describe("정직성 회귀: 모든 상태에서 전문용어 0건", () => {
    const technicalTerms = [
      "queued",
      "running",
      "completed",
      "done",
      "failed",
      "error",
      "failure",
      "processing",
      "pending",
      "diagnostic",
      "analysis",
    ];

    it("label 에서 기술용어 0건", () => {
      const statuses: DiagnosisStatus[] = ["queued", "running", "done", "failed"];
      for (const status of statuses) {
        const result = diagnosisStatusToLabel(status);
        for (const term of technicalTerms) {
          expect(result.label.toLowerCase()).not.toMatch(new RegExp(`\\b${term}\\b`, "i"));
        }
      }
    });

    it("description 에서도 기술용어 0건", () => {
      const statuses: DiagnosisStatus[] = ["queued", "running", "done", "failed"];
      for (const status of statuses) {
        const result = diagnosisStatusToLabel(status);
        // "processing" "running" "diagnostic" 등 절대 금지
        expect(result.description.toLowerCase()).not.toMatch(/processing|diagnostic/);
      }
    });
  });

  describe("연결점 검증: diagnosis service → diagnosisStatusToLabel 호출 계약", () => {
    it("진단 status는 항상 DiagnosisStatus enum 형태여야 함", () => {
      // 구현에서 diagnosisStatusToLabel(diagnosis.status) 호출 시
      // diagnosis.status가 유효한 DiagnosisStatus enum인지 확인.
      // (타입 체크로 강제되지만, 런타임 값도 유효함을 명시)
      const result = diagnosisStatusToLabel("done");
      expect(result).toBeDefined();
    });

    it("레이블 함수에서 status 값 자체가 노출되면 안 됨", () => {
      // 예: label: `상태: ${status}` → 금지
      // diagnosisStatusToLabel은 status를 받아 완전히 다른 사장님 언어로 변환해야 함.
      const result = diagnosisStatusToLabel("queued");
      expect(result.label).not.toContain("queued");
    });
  });
});
