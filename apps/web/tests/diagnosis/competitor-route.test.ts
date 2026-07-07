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

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      }),
  },
}));
import { describe, expect, it, vi } from "vitest";
import type { DiagnosisView } from "../../lib/diagnosis/diagnosis-service.js";

const state: {
  view: DiagnosisView | null;
  competitors: Array<{
    name: string;
    source: "naver_serp" | "gpt_grounded" | "manual";
    serpRank: number | null;
    collectedAt: string;
  }>;
  engineResults: Array<{
    channel: string;
    category: string;
    code: string;
    impactScore: number | null;
    priority: "high" | "medium" | "low";
    evidence: Record<string, unknown> | null;
    collectedAt: string;
  }>;
} = { view: null, competitors: [], engineResults: [] };

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
  getPersistedCompetitors: vi.fn(async () => state.competitors),
  getPersistedEngineResults: vi.fn(async () => state.engineResults),
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

  it("완료 진단 + 저장 경쟁사 → collectedAt/evidence/source를 함께 반환 (200)", async () => {
    state.view = completedView();
    state.competitors = [
      {
        name: "옆집카페",
        source: "gpt_grounded",
        serpRank: null,
        collectedAt: "2026-07-06T07:00:00.000Z",
      },
    ];
    state.engineResults = [
      {
        channel: "ai_citation",
        category: "aeo",
        code: "BOINA_MEASUREMENT_LLM_VALIDATION",
        impactScore: null,
        priority: "low",
        evidence: {
          measurementKind: "llm_validation",
          source: "llm_validation",
          measurementLabel: "measured",
          payload: {
            provider: "mock",
            grounded: true,
            disclaimer: "참고",
            geo: { mentionRate: 0.2, directMentionRate: 0.1 },
            aeo: { appearanceRate: 0.3, prominenceScore: 0.4 },
            competitors: [
              {
                name: "옆집카페",
                mentionedInQueries: 3,
                sampleQuery: "강남 카페",
                source: "gpt_grounded",
              },
            ],
          },
        },
        collectedAt: "2026-07-06T07:00:00.000Z",
      },
    ];
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        competitors: Array<{
          name: string;
          source: string;
          collectedAt?: string;
          measurementLabel?: string;
          evidence?: Array<{ label: string; detail: string }>;
        }>;
        headline: string;
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.competitors).toHaveLength(1);
    expect(body.data.competitors[0]).toMatchObject({
      name: "옆집카페",
      source: "gpt_grounded",
      collectedAt: "2026-07-06T07:00:00.000Z",
      measurementLabel: "measured",
    });
    expect(body.data.competitors[0]?.evidence).toEqual(
      expect.arrayContaining([{ label: "질문", detail: "강남 카페" }]),
    );
    expect(typeof body.data.headline).toBe("string");
  });

  it("naver 경쟁사는 measured rank 근거를 포함한다", async () => {
    state.view = completedView();
    state.engineResults = [];
    state.competitors = [
      {
        name: "앞선가게",
        source: "naver_serp",
        serpRank: 2,
        collectedAt: "2026-07-06T07:05:00.000Z",
      },
    ];
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    const body = (await res.json()) as {
      data: {
        competitors: Array<{
          evidence?: Array<{ label: string; detail: string }>;
          measurementLabel?: string;
        }>;
      };
    };
    expect(body.data.competitors[0]?.evidence).toEqual(
      expect.arrayContaining([{ label: "순위", detail: "2" }]),
    );
    expect(body.data.competitors[0]?.measurementLabel).toBe("measured");
  });

  it("v1 폴백: 원자료 미영속화 → 추측 경쟁사 0(빈 배열) + 응원 헤드라인(손실 단정 금지)", async () => {
    state.view = completedView();
    state.competitors = [];
    state.engineResults = [];
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    const body = (await res.json()) as {
      data: { competitors: unknown[]; headline: string };
    };
    expect(body.data.competitors).toEqual([]);
    expect(body.data.headline).not.toMatch(/뒤처|졌|밀려/);
    expect(body.data.headline).not.toMatch(/1위|매출\s*↑|보장|따라하면|고치면/);
    expect(body.data.headline).not.toMatch(/SERP|grounded|점수/i);
  });
});
