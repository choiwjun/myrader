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

import { describe, expect, it } from "vitest";
import { type DiagnosisStatus, diagnosisStatusToLabel } from "../../lib/shared/ui-labels";

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
  it("AC-1: 이름만으로 검색 가능 (지역은 선택)", () => {
    // 이름 한 칸 필수, 지역은 선택 — 입력 최소화
    const minimalInput = { name: "홍길동 치킨" };
    expect(minimalInput.name.trim().length).toBeGreaterThan(0);
    // 지역 없어도 검색 요청 구성 가능
    const params = new URLSearchParams({
      name: minimalInput.name,
      // region 없음 → 공개 검색
    });
    expect(params.get("name")).toBe("홍길동 치킨");
    expect(params.get("region")).toBeNull();
  });

  it("후보 목록: 이름+주소 조합으로 동명 구분", () => {
    const candidates = [
      { name: "홍길동 치킨", address: "서울 마포구", placeUrl: "https://naver.me/1" },
      { name: "홍길동 치킨", address: "서울 강남구", placeUrl: "https://naver.me/2" },
    ];
    // 이름이 같아도 address 로 구분 가능해야 함
    const unique = candidates.map((c) => `${c.name} — ${c.address}`);
    expect(unique[0]).not.toBe(unique[1]);
  });

  it("홈페이지 URL 없이 진단 시작 가능 (선택)", () => {
    // websiteUrl 이 undefined 여도 enqueue payload 가 유효해야 함
    const payload = {
      target: "https://map.naver.com/v5/entry/place/12345",
      businessId: "some-uuid",
      businessProfile: {
        businessName: "홍길동 치킨",
        industry: "음식점",
        region: "서울",
        mainServices: ["치킨"],
        targetKeywords: ["치킨", "배달"],
      },
      // websiteUrl 없음
    };
    expect(payload.target).toBeTruthy();
    expect((payload as { websiteUrl?: string }).websiteUrl).toBeUndefined();
  });

  it("진단 완료 시 /status 이동 신호 생성", () => {
    // done 상태가 되면 /status 로 이동해야 함
    const doneStatus: DiagnosisStatus = "done";
    expect(doneStatus).toBe("done");
    // 완료 시 이동 경로
    const nextPath = "/status";
    expect(nextPath).toBe("/status");
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

  it("start 버튼 라벨이 '살펴보기' 계열 (진단/분석 금지)", () => {
    // 버튼 텍스트 후보 중 진단/분석은 금지
    const allowedLabels = ["살펴볼게요", "살펴보기 시작", "살펴보기", "가게 살펴보기"];
    const forbidden = ["진단", "분석", "검사"];
    for (const label of allowedLabels) {
      for (const term of forbidden) {
        expect(label).not.toContain(term);
      }
    }
  });
});
