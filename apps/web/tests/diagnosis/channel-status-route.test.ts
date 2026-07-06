// @TASK P2-R2 - channelStatus Route Handler 테스트 (RED→GREEN, 실 DB/외부호출 0)
// @SPEC specs/screens/my-status.yaml (S2: GET ?diagnosisId= → 채널 신호등 3종)
// @SPEC .claude/constitutions/nextjs/api-routes.md (try-catch / Zod / 일관 응답 / 비-200 에러)
// @TEST apps/web/tests/diagnosis/channel-status-route.test.ts
//
// route 모듈을 직접 import 해 Request 로 호출 (Next 런타임 없이 핸들러 단위 검증).
// 저장소(getDefaultDiagnosisRepository)는 vi.mock 으로 fake 주입 — 실 DB 접근 0.

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

// fake 진단 view 를 토글하기 위한 mutable 상태(mock 내부에서 참조).
const state: {
  view: DiagnosisView | null;
  engineResults: Array<{
    channel: string;
    category: string;
    code: string;
    impactScore: number | null;
    priority: "high" | "medium" | "low";
    evidence: Record<string, unknown> | null;
    collectedAt: string;
  }>;
} = { view: null, engineResults: [] };

vi.mock("../../lib/diagnosis/diagnosis-repository.js", () => ({
  // route 가 호출하는 진입점만 stub. 실제 Drizzle/DB 미접근.
  getDefaultDiagnosisRepository: () => ({
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  }),
}));

// 영속화 저장소 stub — 실 DB 접근 0. 기본 빈 데이터(미진단/구진단 → 정직 폴백 검증).
vi.mock("../../lib/diagnosis/persistence-repository.js", () => ({
  getDefaultDb: () => ({}),
  getPersistedEngineResults: vi.fn(async () => state.engineResults),
}));

vi.mock("../../lib/diagnosis/diagnosis-service.js", async (orig) => {
  const actual = await orig<typeof import("../../lib/diagnosis/diagnosis-service.js")>();
  return {
    ...actual,
    // view 조회만 가로채 결정적 결과 반환(나머지 순수 함수는 실제 사용).
    getDiagnosisView: vi.fn(async () => state.view),
  };
});

const { GET } = await import("../../app/api/channel-status/route.js");

function req(qs: string): Request {
  return new Request(`http://localhost/api/channel-status?${qs}`);
}

const VALID_UUID = "00000000-0000-4000-8000-000000000abc";

function completedView(overallSignal: DiagnosisView["overallSignal"]): DiagnosisView {
  return {
    id: VALID_UUID,
    businessId: "00000000-0000-4000-8000-0000000000b1",
    status: "completed",
    overallSignal,
    summaryText: "요약",
    crawlFailureReason: null,
    startedAt: new Date(),
    completedAt: new Date(),
  };
}

describe("GET /api/channel-status (P2-R2)", () => {
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

  it("완료 진단 + 저장 측정값 → 채널 신호등 3종과 evidence metadata 반환", async () => {
    state.view = completedView("good");
    state.engineResults = [
      {
        channel: "naver",
        category: "geo",
        code: "BOINA_MEASUREMENT_BUSINESS_PRESENCE",
        impactScore: null,
        priority: "low",
        evidence: {
          measurementKind: "business_presence",
          source: "naver_place",
          measurementLabel: "measured",
          found: true,
          payload: {
            primarySourceType: "website",
            primaryUrl: "https://example.com",
            canonicalName: null,
            services: [],
            surfaces: [
              {
                sourceType: "naver_place",
                url: "https://place.naver.com/restaurant/1",
                status: "fetched",
                sourceLabel: "네이버 플레이스",
              },
            ],
            limitations: [],
          },
        },
        collectedAt: "2026-07-06T07:20:00.000Z",
      },
      {
        channel: "google",
        category: "seo",
        code: "SEO_TITLE_MISSING",
        impactScore: 20,
        priority: "medium",
        evidence: { url: "https://example.com" },
        collectedAt: "2026-07-06T07:20:00.000Z",
      },
    ];
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        channels: Array<{
          channel: string;
          signal: string;
          summaryLine: string;
          source?: string;
          collectedAt?: string;
          measurementLabel?: string;
        }>;
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.channels.map((c) => c.channel).sort()).toEqual(["ai", "google", "naver"]);
    expect(body.data.channels.find((c) => c.channel === "naver")).toMatchObject({
      source: "naver_place",
      collectedAt: "2026-07-06T07:20:00.000Z",
      measurementLabel: "measured",
    });
    expect(body.data.channels.find((c) => c.channel === "google")).toMatchObject({
      source: "engine_results",
      measurementLabel: "estimated",
    });
  });

  it("응답 채널 객체에 점수 필드 없음 + ai 는 green 아님(게이팅) — 정직성", async () => {
    state.view = completedView("good");
    state.engineResults = [];
    const res = await GET(req(`diagnosisId=${VALID_UUID}`));
    const body = (await res.json()) as {
      data: { channels: Array<Record<string, unknown>> };
    };
    for (const c of body.data.channels) {
      for (const k of Object.keys(c)) {
        expect([
          "channel",
          "signal",
          "summaryLine",
          "found",
          "note",
          "source",
          "collectedAt",
          "evidence",
          "measurementLabel",
        ]).toContain(k);
      }
      expect(String(c.summaryLine)).not.toMatch(/SEO|AEO|GEO|SERP|snippet|점수|\d{1,3}\s*점/i);
      expect(String(c.summaryLine)).not.toMatch(/1위|매출\s*↑|보장|고치면/);
    }
    const ai = body.data.channels.find((c) => c.channel === "ai");
    expect(ai?.signal).not.toBe("green");
  });
});
