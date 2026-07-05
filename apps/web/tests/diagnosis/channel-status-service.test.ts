// @TASK P2-R2 - channelStatus 변환·게이팅 TDD (RED→GREEN, 순수 함수 — 실외부호출 0)
// @SPEC specs/domain/resources.yaml (channelStatus: channel/signal/summaryLine/found/note)
// @SPEC specs/screens/my-status.yaml (S2: naver 실측 / google 맛보기 / ai 게이팅)
// @SPEC docs/planning/02-trd.md §2 (데이터소스·게이팅) / 07 §4 (점수 비노출·인과 금지)
// @TEST apps/web/tests/diagnosis/channel-status-service.test.ts
//
// 핵심 계약(REQ-002, 양보 불가):
//   1. 점수(number) 절대 비노출 — signal(green/yellow/red) + summaryLine(사장님 언어)만.
//   2. ai 채널 green 은 grounded 실인용일 때만(게이팅). non-grounded/미인용 → yellow/red(정직).
//   3. google 은 v1 맛보기(note 동반). 실 SERP 순위는 [OPEN] OQ-4 v1.5.
//   4. 전문용어(SEO/AEO/GEO/SERP/snippet) 노출 0. 인과 단정("고치면 1위/매출↑") 0.

import type { DiagnosisJson } from "@boina/contracts/diagnosis";
import { describe, expect, it } from "vitest";
import {
  deriveAiChannelStatus,
  deriveChannelStatuses,
  deriveChannelStatusesFromView,
  deriveGoogleChannelStatus,
  deriveNaverChannelStatus,
} from "../../lib/diagnosis/channel-status-service.js";

// ── 테스트용 DiagnosisJson 부분 빌더 (필요한 meta/scores 부분만; 순수 변환 검증) ──

type Naver = NonNullable<DiagnosisJson["meta"]["naverPresence"]>;
type Llm = NonNullable<DiagnosisJson["meta"]["llmValidation"]>;

function naverPresent(): Naver {
  return {
    place: {
      queries: [
        { query: "강남 한식", found: true, rank: 2 },
        { query: "역삼 맛집", found: true, rank: 5 },
      ],
      visibleCount: 2,
      totalQueries: 2,
    },
    web: { homepageFound: true, homepageRank: 3, blogDominatesTop: false },
    blog: { reviewCount: 12 },
  };
}

function naverAbsent(): Naver {
  return {
    place: {
      queries: [
        { query: "강남 한식", found: false, rank: null },
        { query: "역삼 맛집", found: false, rank: null },
      ],
      visibleCount: 0,
      totalQueries: 2,
    },
    web: { homepageFound: false, homepageRank: null, blogDominatesTop: false },
    blog: { reviewCount: 0 },
  };
}

function naverPartial(): Naver {
  return {
    place: {
      queries: [
        { query: "강남 한식", found: true, rank: 4 },
        { query: "역삼 맛집", found: false, rank: null },
      ],
      visibleCount: 1,
      totalQueries: 2,
    },
    web: { homepageFound: false, homepageRank: null, blogDominatesTop: true },
    blog: { reviewCount: 3 },
  };
}

/** grounded + 실인용(언급률 > 0) → ai green 자격. */
function llmGroundedCited(): Llm {
  return {
    provider: "openai",
    grounded: true,
    disclaimer: "실측 기반 참고 신호입니다.",
    geo: { mentionRate: 0.4, directMentionRate: 0.2 },
    aeo: { appearanceRate: 0.5, prominenceScore: 0.6 },
  };
}

/** grounded 인데 미인용(언급률 0) → green 불가(정직: 아직 AI가 잘 몰라요). */
function llmGroundedNotCited(): Llm {
  return {
    provider: "openai",
    grounded: true,
    disclaimer: "실측 기반 참고 신호입니다.",
    geo: { mentionRate: 0, directMentionRate: 0 },
    aeo: { appearanceRate: 0, prominenceScore: 0 },
  };
}

/** grounded=false(학습기억 모드) → 실인용 아님 → green 절대 불가(게이팅). */
function llmNotGrounded(): Llm {
  return {
    provider: "openai",
    grounded: false,
    disclaimer: "학습 기억 기반(실측 아님)입니다.",
    geo: { mentionRate: 0.9, directMentionRate: 0.9 },
    aeo: { appearanceRate: 0.9, prominenceScore: 0.9 },
  };
}

function makeDiagnosis(parts: {
  naverPresence?: Naver;
  llmValidation?: Llm;
  seo?: number;
  geo?: number;
}): DiagnosisJson {
  return {
    schemaVersion: "1.0.0",
    reportId: "00000000-0000-4000-8000-000000000001",
    profileId: null,
    meta: {
      websiteUrl: "https://example.com",
      businessName: "테스트가게",
      industry: "한식당",
      region: "서울 강남구",
      mainServices: ["한식"],
      targetKeywords: ["강남 한식"],
      modules: ["seo", "aeo", "geo"],
      engineVersion: "1.0.0",
      scoringVersion: "1.0.0",
      startedAt: "2026-06-14T00:00:00.000Z",
      completedAt: "2026-06-14T00:01:00.000Z",
      durationMs: 60000,
      naverPresence: parts.naverPresence,
      llmValidation: parts.llmValidation,
    },
    scores: {
      overall: 70,
      seo: parts.seo ?? 70,
      aeo: 70,
      geo: parts.geo ?? 70,
      grade: "fair",
      disclaimer: "참고 지표입니다. 노출을 보장하지 않습니다.",
    },
    summary: {
      headline: "요약",
      topIssues: [],
      actionCounts: { self_fix: 0, snippet_action: 0, vendor_action: 0, si_action: 0 },
    },
    analyzedPages: [],
    items: [],
    recommendations: { executionOrder: [], quickWins: [], aiSummary: null },
    snippets: [],
    prescriptionItems: [],
  };
}

// 전문용어/인과 단정 금지 정규식 (07 §4 가드).
const JARGON = /SEO|AEO|GEO|SERP|snippet|스니펫|크롤|메타태그|grounded/i;
const CAUSAL = /1위|매출\s*↑|매출\s*오름|매출이?\s*늘|반드시|확실히|보장|고치면/;

/** ChannelStatus 한 건의 정직성·점수비노출 공통 검증. */
function assertHonest(status: {
  channel: string;
  signal: string;
  summaryLine: string;
  note?: string;
}) {
  expect(["green", "yellow", "red"]).toContain(status.signal);
  expect(status.summaryLine).toBeTruthy();
  expect(status.summaryLine).not.toMatch(JARGON);
  expect(status.summaryLine).not.toMatch(CAUSAL);
  expect(status.summaryLine).not.toMatch(/\d{1,3}\s*점|score|점수/i);
  if (status.note) {
    expect(status.note).not.toMatch(JARGON);
    expect(status.note).not.toMatch(CAUSAL);
  }
}

// ── naver (실측) ─────────────────────────────────────────────────────────────
describe("deriveNaverChannelStatus (실측 노출)", () => {
  it("플레이스가 잘 노출되면 green", () => {
    const s = deriveNaverChannelStatus(naverPresent());
    expect(s.channel).toBe("naver");
    expect(s.signal).toBe("green");
    expect(s.found).toBe(true);
    assertHonest(s);
  });

  it("일부만 노출되면 yellow", () => {
    const s = deriveNaverChannelStatus(naverPartial());
    expect(s.signal).toBe("yellow");
    assertHonest(s);
  });

  it("전혀 안 보이면 red + found=false", () => {
    const s = deriveNaverChannelStatus(naverAbsent());
    expect(s.signal).toBe("red");
    expect(s.found).toBe(false);
    assertHonest(s);
  });

  it("naverPresence 자체가 없으면(미측정) red + 정직한 note", () => {
    const s = deriveNaverChannelStatus(undefined);
    expect(s.signal).toBe("red");
    expect(s.note).toBeTruthy();
    assertHonest(s);
  });
});

// ── google (v1 맛보기) ───────────────────────────────────────────────────────
describe("deriveGoogleChannelStatus (v1 맛보기)", () => {
  it("on-page 준비도가 좋으면 green 맛보기 + note(자세한 순위는 다음 단계)", () => {
    const s = deriveGoogleChannelStatus({ seo: 85, geo: 85 });
    expect(s.channel).toBe("google");
    expect(s.signal).toBe("green");
    expect(s.note).toBeTruthy();
    // 맛보기 안내: 자세한 순위는 다음 단계
    expect(s.note).toMatch(/다음 단계|맛보기|준비/);
    assertHonest(s);
  });

  it("준비도가 낮으면 red 맛보기 (단, 실 순위 단정 금지)", () => {
    const s = deriveGoogleChannelStatus({ seo: 20, geo: 20 });
    expect(s.signal).toBe("red");
    assertHonest(s);
  });

  it("맛보기는 항상 note 를 단다(실 SERP 는 다음 단계)", () => {
    const s = deriveGoogleChannelStatus({ seo: 60, geo: 60 });
    expect(s.note).toBeTruthy();
    assertHonest(s);
  });
});

// ── ai (grounded 게이팅 — 핵심) ──────────────────────────────────────────────
describe("deriveAiChannelStatus (grounded 게이팅)", () => {
  it("grounded 실인용(언급률>0)일 때만 green", () => {
    const s = deriveAiChannelStatus(llmGroundedCited());
    expect(s.channel).toBe("ai");
    expect(s.signal).toBe("green");
    expect(s.found).toBe(true);
    assertHonest(s);
  });

  it("grounded 인데 미인용(언급률 0)이면 green 불가 → yellow/red (정직)", () => {
    const s = deriveAiChannelStatus(llmGroundedNotCited());
    expect(s.signal).not.toBe("green");
    expect(s.found).toBe(false);
    assertHonest(s);
  });

  it("grounded=false(학습기억)면 언급률 높아도 green 절대 불가(게이팅)", () => {
    const s = deriveAiChannelStatus(llmNotGrounded());
    expect(s.signal).not.toBe("green");
    assertHonest(s);
  });

  it("llmValidation 자체가 없으면(미측정·게이트 차단) green 불가 + 미래지향 note", () => {
    const s = deriveAiChannelStatus(undefined);
    expect(s.signal).not.toBe("green");
    expect(s.note).toBeTruthy();
    assertHonest(s);
  });
});

// ── 통합: deriveChannelStatuses ──────────────────────────────────────────────
describe("deriveChannelStatuses (DiagnosisJson → ChannelStatus[])", () => {
  it("naver/google/ai 3채널을 모두 산출한다", () => {
    const out = deriveChannelStatuses(
      makeDiagnosis({
        naverPresence: naverPresent(),
        llmValidation: llmGroundedCited(),
        seo: 80,
        geo: 80,
      }),
    );
    const channels = out.map((c) => c.channel).sort();
    expect(channels).toEqual(["ai", "google", "naver"]);
  });

  it("산출물 어디에도 점수(number) 필드가 없다 (점수 비노출)", () => {
    const out = deriveChannelStatuses(
      makeDiagnosis({
        naverPresence: naverPresent(),
        llmValidation: llmGroundedCited(),
        seo: 90,
        geo: 90,
      }),
    );
    for (const c of out) {
      const keys = Object.keys(c);
      // ChannelStatus 필드는 resources.yaml: channel/signal/summaryLine/found/note 만.
      for (const k of keys) {
        expect(["channel", "signal", "summaryLine", "found", "note"]).toContain(k);
      }
      // 어떤 값도 raw number 점수가 아님
      assertHonest(c);
    }
  });

  it("작은 가게(naver 미노출 + ai grounded 미인용): naver red, ai green 아님 — 정직", () => {
    const out = deriveChannelStatuses(
      makeDiagnosis({
        naverPresence: naverAbsent(),
        llmValidation: llmGroundedNotCited(),
        seo: 30,
        geo: 30,
      }),
    );
    const naver = out.find((c) => c.channel === "naver");
    const ai = out.find((c) => c.channel === "ai");
    expect(naver?.signal).toBe("red");
    expect(ai?.signal).not.toBe("green");
  });

  it("grounded=false 가게: ai green 절대 불가(게이팅) — 전체에서 인과 단정 0건", () => {
    const out = deriveChannelStatuses(
      makeDiagnosis({
        naverPresence: naverPresent(),
        llmValidation: llmNotGrounded(),
        seo: 95,
        geo: 95,
      }),
    );
    const ai = out.find((c) => c.channel === "ai");
    expect(ai?.signal).not.toBe("green");
    for (const c of out) assertHonest(c);
  });
});

// ── route(view) 폴백: 전체 DiagnosisJson 영속화 전 정직 노출 ────────────────────
describe("deriveChannelStatusesFromView (v1 정직 폴백)", () => {
  it("미완료면 3채널 모두 '준비 중'(yellow) + note", () => {
    const out = deriveChannelStatusesFromView({ overallSignal: null, completed: false });
    expect(out.map((c) => c.channel).sort()).toEqual(["ai", "google", "naver"]);
    for (const c of out) {
      expect(c.signal).toBe("yellow");
      expect(c.note).toBeTruthy();
      assertHonest(c);
    }
  });

  it("완료 + 전체 good 이어도 ai 는 grounded 근거 없이 green 불가(게이팅) → red", () => {
    const out = deriveChannelStatusesFromView({ overallSignal: "good", completed: true });
    const ai = out.find((c) => c.channel === "ai");
    const naver = out.find((c) => c.channel === "naver");
    expect(ai?.signal).toBe("red"); // 게이팅: 실인용 근거 없음
    expect(naver?.signal).toBe("green");
    for (const c of out) assertHonest(c);
  });

  it("완료 + 전체 poor → naver/google red, ai red — 점수 비노출", () => {
    const out = deriveChannelStatusesFromView({ overallSignal: "poor", completed: true });
    for (const c of out) {
      expect(c.signal).toBe("red");
      assertHonest(c);
      // 점수 필드 없음
      for (const k of Object.keys(c)) {
        expect(["channel", "signal", "summaryLine", "found", "note"]).toContain(k);
      }
    }
  });

  it("google 은 항상 맛보기 note(다음 단계) 를 단다", () => {
    const out = deriveChannelStatusesFromView({ overallSignal: "fair", completed: true });
    const google = out.find((c) => c.channel === "google");
    expect(google).toBeDefined();
    expect(google?.note).toMatch(/다음 단계|맛보기/);
    if (google) assertHonest(google);
  });
});
