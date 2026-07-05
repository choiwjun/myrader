// @TASK P2-R3 - competitor Route Handler 테스트 (RED→GREEN, 실 DB/외부호출 0)
// @SPEC specs/screens/vs-competitor.yaml (S3: GET ?diagnosisId= → 경쟁사 비교 + 손실 헤드라인 + 출처 배지)
// @SPEC specs/domain/resources.yaml (competitor 리소스)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러)
// @TEST apps/web/tests/diagnosis/competitor-route.test.ts
//
// route 모듈을 직접 import 해 Request 로 호출 (Next 런타임 없이 핸들러 단위 검증).
// 저장소(getDefaultDiagnosisRepository)는 vi.mock 으로 fake 주입 — 실 DB 접근 0.
//
// v1 한계(정직): DB(04 스키마)는 진단 원자료(naverPresence.competitorTop /
// llmValidation.competitors)를 영속화하지 않으므로(스키마 수정 금지), route 는
// 진단 view(완료 여부)만으로 정직 폴백을 산출한다 — 추측 경쟁사 표시 0, 카드 생략 + 응원.

import { describe, expect, it, vi } from "vitest";
import type { DiagnosisView } from "../../lib/diagnosis/diagnosis-service.js";

const state: { view: DiagnosisView | null } = { view: null };

vi.mock("../../lib/diagnosis/diagnosis-repository.js", () => ({
  getDefaultDiagnosisRepository: () => ({
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  }),
}));

// 영속화 저장소 stub — 실 DB 접근 0. 기본 빈 데이터(미진단/구진단 → 정직 폴백 검증).
vi.mock("../../lib/diagnosis/persistence-repository.js", () => ({
  getDefaultDb: () => ({}),
  getPersistedCompetitors: vi.fn(async () => []),
}));

vi.mock("../../lib/diagnosis/diagnosis-service.js", async (orig) => {
  const actual = await orig<typeof import("../../lib/diagnosis/diagnosis-service.js")>();
  return {
    ...actual,
    getDiagnosisView: vi.fn(async () => state.view),
  };
});

const { GET } = await import("../../app/api/competitor/route.js");

function req(qs: string): Request {
  return new Request(`http://localhost/api/competitor?${qs}`);
}

const VALID_UUID = "00000000-0000-4000-8000-000000000abc";

function completedView(): DiagnosisView {
  return {
    id: VALID_UUID,
    businessId: "00000000-0000-4000-8000-0000000000b1",
    status: "completed",
    overallSignal: "fair",
    summaryText: "요약",
    crawlFailureReason: null,
    startedAt: new Date(),
    completedAt: new Date(),
  };
}

describe("GET /api/competitor (P2-R3)", () => {
  it("diagnosisId 누락/비UUID 시 400 (Validation)", async () => {
    const res = await GET(req("diagnosisId=not-a-uuid"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("진단을 찾을 수 없으면 404", async () => {
    state.view = null;
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("완료 진단 → competitors 배열 + headline 반환 (200)", async () => {
    state.view = completedView();
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { competitors: unknown[]; headline: string };
    };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.competitors)).toBe(true);
    expect(typeof body.data.headline).toBe("string");
  });

  it("v1 폴백: 원자료 미영속화 → 추측 경쟁사 0(빈 배열) + 응원 헤드라인(손실 단정 금지)", async () => {
    state.view = completedView();
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    const body = (await res.json()) as {
      data: { competitors: unknown[]; headline: string };
    };
    // 영속화 부재 → 신뢰 경쟁사 없음 → 카드 생략(추측 0).
    expect(body.data.competitors).toEqual([]);
    // 손실 단정 금지(없을 땐 응원), 인과/전문용어 0.
    expect(body.data.headline).not.toMatch(/뒤처|졌|밀려/);
    expect(body.data.headline).not.toMatch(/1위|매출\s*↑|보장|따라하면|고치면/);
    expect(body.data.headline).not.toMatch(/SERP|grounded|점수/i);
  });
});
