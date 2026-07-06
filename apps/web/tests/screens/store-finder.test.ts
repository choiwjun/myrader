// @TASK P2-S1 - 가게 찾기 (/find) 화면 TDD
// @SPEC specs/screens/store-finder.yaml (S1: REQ-001)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드)
//
// RED→GREEN:
//   S1-T1: store_search_form 렌더 + 검색 트리거
//   S1-T2: candidate_list 후보 선택 + 내 가게 확정
//   S1-T3: website_url_input (선택 칸, 없어도 진단 가능)
//   S1-T4: progress_indicator 상태(queued/running/done/failed) + 사장님 언어
//   S1-T5: 정직성 가드 — 점수(숫자) 0 / 전문용어 0 / 인과 단정 0
//   S1-T6: AC-1 — 이름 한 칸으로 시작 (지역 없어도 검색 가능, 주소로 구분)

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  diagnosisIdFromEnqueueSuccess,
  diagnosisStatusFromPollSuccess,
} from "../../app/(app)/find/page";
import { type DiagnosisStatus, diagnosisStatusToLabel } from "../../lib/shared/ui-labels";

const findSource = readFileSync(new URL("../../app/(app)/find/page.tsx", import.meta.url), "utf8");

// ── 진행 상태 레이블 계약 ────────────────────────────────────────────────────

describe("P2-S1: 가게 찾기 — progress_indicator 상태 레이블", () => {
  const PROGRESS_STEPS: DiagnosisStatus[] = ["queued", "running", "done", "failed"];

  it("모든 진행 상태가 사장님 언어로 변환됨", () => {
    for (const status of PROGRESS_STEPS) {
      const result = diagnosisStatusToLabel(status);
      expect(result.label).toBeTruthy();
      expect(result.description).toBeTruthy();
    }
  });

  it("queued → 준비 중 (사장님 언어)", () => {
    const result = diagnosisStatusToLabel("queued");
    expect(result.label).toContain("준비");
    expect(result.label).not.toMatch(/queued/i);
  });

  it("running → 살펴보는 중 (응원 톤, 기술용어 0)", () => {
    const result = diagnosisStatusToLabel("running");
    expect(result.label).not.toMatch(/running|processing/i);
    expect(result.description).not.toMatch(/running/i);
  });

  it("done → 완료 신호 + 다음 이동 암시", () => {
    const result = diagnosisStatusToLabel("done");
    expect(result.label).not.toMatch(/done|completed/i);
    expect(result.description).toMatch(/결과|확인|봤/);
  });

  it("failed → 응원 톤 (재시도 안내, 비난 없음)", () => {
    const result = diagnosisStatusToLabel("failed");
    expect(result.label).not.toMatch(/failed|error/i);
    expect(result.description).toMatch(/다시|걱정|시도/);
    expect(result.description).not.toMatch(/오류|실패|문제/);
  });

  describe("S1 진행 화면 텍스트 — 정직성 가드", () => {
    const FORBIDDEN_TECHNICAL = ["SEO", "AEO", "GEO", "snippet", "SERP", "진단"];
    const FORBIDDEN_CAUSAL = ["1위", "매출", "반드시", "보장", "확실"];

    it("진행 레이블에 전문용어 없음", () => {
      for (const status of PROGRESS_STEPS) {
        const result = diagnosisStatusToLabel(status);
        for (const term of FORBIDDEN_TECHNICAL) {
          expect(result.label).not.toContain(term);
          expect(result.description).not.toContain(term);
        }
      }
    });

    it("진행 레이블에 인과 단정 없음", () => {
      for (const status of PROGRESS_STEPS) {
        const result = diagnosisStatusToLabel(status);
        for (const claim of FORBIDDEN_CAUSAL) {
          expect(result.label).not.toContain(claim);
          expect(result.description).not.toContain(claim);
        }
      }
    });

    it("점수(숫자) 노출 없음", () => {
      for (const status of PROGRESS_STEPS) {
        const result = diagnosisStatusToLabel(status);
        expect(result.label).not.toMatch(/\d+%|\d+점|\d+\/100/);
        expect(result.description).not.toMatch(/\d+%|\d+점|\d+\/100/);
      }
    });
  });
});

// ── 검색/확정 흐름 계약 ──────────────────────────────────────────────────────

describe("P2-S1: 가게 찾기 — 데이터 흐름 계약", () => {
  it("AC-1: source에서 이름만 필수이고 지역은 선택 검색값이다", () => {
    const nameInputStart = findSource.indexOf('id="store-name"');
    const regionInputStart = findSource.indexOf('id="store-region"');
    expect(nameInputStart).toBeGreaterThanOrEqual(0);
    expect(regionInputStart).toBeGreaterThanOrEqual(0);

    const nameInput = findSource.slice(nameInputStart, findSource.indexOf("/>", nameInputStart));
    const regionInput = findSource.slice(
      regionInputStart,
      findSource.indexOf("/>", regionInputStart),
    );

    expect(findSource).toContain("if (!name.trim()) return;");
    expect(findSource).toContain('if (region.trim()) params.set("region", region.trim());');
    expect(nameInput).toContain("required");
    expect(regionInput).not.toContain("required");
  });

  it("후보 목록: source에서 이름과 주소를 함께 노출해 동명 가게를 구분한다", () => {
    expect(findSource).toContain("aria-label={`${c.name} — ${c.address}`}");
    expect(findSource).toContain("{c.name}");
    expect(findSource).toContain("{c.address}");
  });

  it("홈페이지 URL 없이 시작할 때 place URL target으로 enqueue할 수 있다", () => {
    expect(findSource).toContain(
      "const target = business.websiteUrl?.trim() || business.placeUrl || candidate.placeUrl",
    );
    expect(findSource).toContain(
      'const sourceType = business.websiteUrl?.trim() ? "website" : "naver_place"',
    );
    expect(findSource).toContain("websiteUrl: websiteUrl.trim() || undefined");
  });

  it("진단 완료 시 diagnosisId를 보존한 home 이동 신호를 만든다", () => {
    const diagnosisId = "11111111-1111-4111-8111-111111111111";
    const nextPath = `/home?diagnosisId=${diagnosisId}`;
    const url = new URL(nextPath, "https://boina.test");

    expect(url.pathname).toBe("/home");
    expect(url.searchParams.get("diagnosisId")).toBe(diagnosisId);
    expect(findSource).toContain("router.push(`/home?diagnosisId=${id}`)");
  });

  it("enqueue 성공 응답에 유효한 diagnosisId가 없으면 폴링/이동 입력으로 쓰지 않는다", () => {
    const validId = "11111111-1111-4111-8111-111111111111";

    expect(diagnosisIdFromEnqueueSuccess({ success: true, data: {} })).toBeNull();
    expect(diagnosisIdFromEnqueueSuccess({ success: true, data: { diagnosisId: "" } })).toBeNull();
    expect(
      diagnosisIdFromEnqueueSuccess({ success: true, data: { diagnosisId: "diag-123" } }),
    ).toBeNull();
    expect(diagnosisIdFromEnqueueSuccess({ success: true, data: { diagnosisId: validId } })).toBe(
      validId,
    );
  });

  it("polling 성공 payload의 status union만 화면 상태로 변환한다", () => {
    expect(diagnosisStatusFromPollSuccess({ success: true, data: { status: "queued" } })).toBe(
      "queued",
    );
    expect(diagnosisStatusFromPollSuccess({ success: true, data: { status: "running" } })).toBe(
      "running",
    );
    expect(diagnosisStatusFromPollSuccess({ success: true, data: { status: "completed" } })).toBe(
      "done",
    );
    expect(diagnosisStatusFromPollSuccess({ success: true, data: { status: "partial" } })).toBe(
      "done",
    );
    expect(diagnosisStatusFromPollSuccess({ success: true, data: { status: "failed" } })).toBe(
      "failed",
    );
  });

  it("polling 성공 payload의 unknown/malformed status는 running으로 숨기지 않는다", () => {
    expect(
      diagnosisStatusFromPollSuccess({ success: true, data: { status: "mystery" } }),
    ).toBeNull();
    expect(diagnosisStatusFromPollSuccess({ success: true, data: { status: 1 } })).toBeNull();
    expect(diagnosisStatusFromPollSuccess({ success: true, data: {} })).toBeNull();
  });

  it("진단 실패 시 재시도 가능 (failed)", () => {
    const failedStatus: DiagnosisStatus = "failed";
    expect(failedStatus).toBe("failed");
    // 재시도 레이블이 사용자 친화적
    const label = diagnosisStatusToLabel(failedStatus);
    expect(label.description).toMatch(/다시|시도/);
  });
});

// ── 카피 가드: "진단" → "살펴보기" 변환 계약 ─────────────────────────────────

describe("P2-S1: 가게 찾기 — 카피 가드 (전문용어 0)", () => {
  it("running 상태 레이블에 살펴보기/살펴보는 표현 포함", () => {
    const result = diagnosisStatusToLabel("running");
    // "살펴보는 중" 같은 사장님 언어
    const hasLayPersonLang =
      result.label.includes("살펴") ||
      result.description.includes("살펴") ||
      result.description.includes("확인");
    expect(hasLayPersonLang).toBe(true);
  });

  it("start 버튼 라벨이 source에서 '살펴보기' 계열이고 진단/분석을 노출하지 않는다", () => {
    const buttonStart = findSource.indexOf("aria-busy={isStarting}");
    expect(buttonStart).toBeGreaterThanOrEqual(0);
    const buttonSource = findSource.slice(
      buttonStart,
      findSource.indexOf("</button>", buttonStart),
    );

    expect(buttonSource).toContain("가게 살펴볼게요");
    expect(buttonSource).not.toMatch(/진단|분석|검사/);
  });
});
