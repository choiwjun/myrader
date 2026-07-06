// @TASK P2-R3 - competitor 변환·정직성 TDD (RED→GREEN, 순수 함수 — 실외부호출 0)
// @SPEC specs/domain/resources.yaml (competitor: id/name/channel/beatsMe/rank/source)
// @SPEC specs/screens/vs-competitor.yaml (S3: 손실 프레이밍 / source 배지 / 익명화)
// @SPEC docs/planning/07-coding-convention.md §4 (점수 비노출·인과 단정 금지·전문용어 0)
// @TEST apps/web/tests/diagnosis/competitor-service.test.ts
//
// 핵심 계약(REQ-003, 양보 불가):
//   1. '실측 라이벌(누가)'만 — naverPresence.competitorTop(실측 SERP) +
//      llmValidation.competitors(grounded AI). '어떻게(역공학)'는 P2-R4 gapItem 담당(구분).
//   2. source 1:1 대응 — naver_serp→channel naver, gpt_grounded→channel ai. 추측 경쟁사 금지.
//   3. beatsMe=true (둘 다: 옆집이 나보다 위) → 손실 프레이밍 카드 트리거.
//   4. 익명화 옵션 — anonymize=true 면 실명 비노출(마스킹). 경쟁사 비방·오인 금지.
//   5. 신뢰 추출 실패(빈/미존재) → 카드 생략(빈 배열). 추측 경쟁사 표시 0.
//   6. 인과 단정("따라하면 1위/매출↑") 0. 전문용어(SERP/grounded) UI 카피 노출 0.

import type { DiagnosisJson } from "@boina/contracts/diagnosis";
import { describe, expect, it } from "vitest";
import {
  type Competitor,
  buildLossHeadline,
  deriveCompetitorViewFromPersisted,
  deriveCompetitors,
  sourceToBadge,
} from "../../lib/diagnosis/competitor-service.js";

// ── 테스트용 입력 빌더 (필요한 부분만; 순수 변환 검증) ──────────────────────────

type Naver = NonNullable<DiagnosisJson["meta"]["naverPresence"]>;
type Llm = NonNullable<DiagnosisJson["meta"]["llmValidation"]>;
type NaverCompetitor = NonNullable<Naver["competitorTop"]>[number];
type LlmCompetitor = NonNullable<Llm["competitors"]>[number];

function naverComp(name: string, rank: number): NaverCompetitor {
  return { name, rank, query: "강남 한식", source: "naver_serp" };
}

function llmComp(name: string, n = 2): LlmCompetitor {
  return { name, mentionedInQueries: n, sampleQuery: "강남 한식 추천", source: "gpt_grounded" };
}

function naverWith(top?: NaverCompetitor[]): Naver {
  return {
    place: { queries: [], visibleCount: 0, totalQueries: 2 },
    web: { homepageFound: false, homepageRank: null, blogDominatesTop: false },
    blog: { reviewCount: 0 },
    competitorTop: top,
  };
}

function llmWith(competitors?: LlmCompetitor[]): Llm {
  return {
    provider: "openai",
    grounded: true,
    disclaimer: "실측 기반 참고 신호입니다.",
    geo: { mentionRate: 0.1, directMentionRate: 0 },
    aeo: { appearanceRate: 0.1, prominenceScore: 0.1 },
    competitors,
  };
}

// 전문용어/인과 단정 금지 정규식 (07 §4 가드 — 채널 테스트와 동일 계열).
const JARGON = /SERP|grounded|snippet|스니펫|크롤|메타태그|AEO|GEO\b/i;
const CAUSAL = /1위|매출\s*↑|매출\s*오름|매출이?\s*늘|반드시|확실히|보장|따라하면|고치면/;

/** 첫 항목을 비-null 단언 없이 꺼낸다(biome noNonNullAssertion 회피). */
function first(list: Competitor[]): Competitor {
  const c = list[0];
  if (!c) throw new Error("expected at least one competitor");
  return c;
}

/** Competitor 한 건의 정직성·점수비노출·필드 공통 검증. */
function assertHonestCompetitor(c: Competitor) {
  // resources.yaml 필드만 (발명 금지).
  for (const k of Object.keys(c)) {
    expect(["id", "name", "channel", "beatsMe", "rank", "source"]).toContain(k);
  }
  // id 는 UUID v4.
  expect(c.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  // channel ↔ source 1:1 대응 (정직성).
  if (c.source === "naver_serp") expect(c.channel).toBe("naver");
  if (c.source === "gpt_grounded") expect(c.channel).toBe("ai");
  // name 에 점수/전문용어/인과 카피 없음.
  expect(c.name).not.toMatch(/\d{1,3}\s*점|score|점수/i);
  expect(c.name).not.toMatch(CAUSAL);
}

function assertEvidenceRows(evidence: unknown) {
  expect(Array.isArray(evidence)).toBe(true);
  const rows = evidence as Array<{ label?: unknown; detail?: unknown }>;
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(typeof row.label).toBe("string");
    expect(typeof row.detail).toBe("string");
    expect(row.label).toMatch(/[가-힣]/);
    expect(row.detail).not.toMatch(
      /serpRank|measurementKind|measured|estimated|unavailable|gpt_grounded|naver_serp/,
    );
  }
}

// ── deriveCompetitors: naver_serp(실측) 매핑 ─────────────────────────────────
describe("deriveCompetitors — naver_serp 실측 매핑", () => {
  it("competitorTop → channel naver / source naver_serp / beatsMe=true / rank 보존", () => {
    const out = deriveCompetitors({ naver: naverWith([naverComp("옆집국밥", 1)]) });
    expect(out).toHaveLength(1);
    const c = first(out);
    expect(c.channel).toBe("naver");
    expect(c.source).toBe("naver_serp");
    expect(c.beatsMe).toBe(true); // SERP 상위 노출 = 나보다 위
    expect(c.rank).toBe(1);
    expect(c.name).toBe("옆집국밥");
    assertHonestCompetitor(c);
  });

  it("rank 빈도순(낮은 rank=상위) 정렬 유지", () => {
    const out = deriveCompetitors({
      naver: naverWith([naverComp("3등집", 3), naverComp("1등집", 1), naverComp("2등집", 2)]),
    });
    expect(out.map((c) => c.rank)).toEqual([1, 2, 3]);
  });
});

// ── deriveCompetitors: gpt_grounded(AI) 매핑 ─────────────────────────────────
describe("deriveCompetitors — gpt_grounded AI 매핑", () => {
  it("competitors → channel ai / source gpt_grounded / beatsMe=true", () => {
    const out = deriveCompetitors({ llm: llmWith([llmComp("옆집카페")]) });
    expect(out).toHaveLength(1);
    const c = first(out);
    expect(c.channel).toBe("ai");
    expect(c.source).toBe("gpt_grounded");
    expect(c.beatsMe).toBe(true); // AI 가 내 대신 추천 = 나보다 위
    assertHonestCompetitor(c);
  });

  it("grounded=false(학습기억)면 실측 아님 → AI 경쟁사 산출 0 (게이팅)", () => {
    const llm = llmWith([llmComp("학습기억경쟁사")]);
    llm.grounded = false;
    const out = deriveCompetitors({ llm });
    expect(out.filter((c) => c.channel === "ai")).toHaveLength(0);
  });
});

// ── 통합: 두 소스 합산 + source 정직 표기 ───────────────────────────────────
describe("deriveCompetitors — 두 소스 합산·정직성", () => {
  it("naver + ai 둘 다 있으면 합산, 각자 source/channel 1:1 유지", () => {
    const out = deriveCompetitors({
      naver: naverWith([naverComp("실측집", 1)]),
      llm: llmWith([llmComp("AI집")]),
    });
    expect(out).toHaveLength(2);
    expect(out.find((c) => c.name === "실측집")?.source).toBe("naver_serp");
    expect(out.find((c) => c.name === "AI집")?.source).toBe("gpt_grounded");
    for (const c of out) assertHonestCompetitor(c);
  });

  it("산출물 어디에도 추측 경쟁사/발명 필드 없음 (resources.yaml 필드만)", () => {
    const out = deriveCompetitors({
      naver: naverWith([naverComp("a", 1)]),
      llm: llmWith([llmComp("b")]),
    });
    for (const c of out) assertHonestCompetitor(c);
  });
});

// ── 신뢰 추출 실패 → 카드 생략 (추측 금지) ──────────────────────────────────
describe("deriveCompetitors — 신뢰 실패 시 카드 생략", () => {
  it("competitorTop/competitors 미존재 → 빈 배열(카드 생략, 추측 0)", () => {
    expect(deriveCompetitors({})).toEqual([]);
    expect(deriveCompetitors({ naver: naverWith(undefined), llm: llmWith(undefined) })).toEqual([]);
  });

  it("빈 배열 입력 → 빈 배열", () => {
    expect(deriveCompetitors({ naver: naverWith([]), llm: llmWith([]) })).toEqual([]);
  });

  it("이름이 비거나 공백뿐인 항목은 제외(틀린 이름 노출 < 생략)", () => {
    const out = deriveCompetitors({
      naver: naverWith([naverComp("   ", 1), naverComp("진짜집", 2)]),
    });
    expect(out).toHaveLength(1);
    expect(first(out).name).toBe("진짜집");
  });
});

// ── 익명화 옵션 ─────────────────────────────────────────────────────────────
describe("deriveCompetitors — 익명화 옵션", () => {
  it("anonymize=true 면 실명 비노출(마스킹), 다른 필드는 유지", () => {
    const out = deriveCompetitors(
      { naver: naverWith([naverComp("옆집국밥", 1)]) },
      { anonymize: true },
    );
    const c = first(out);
    expect(c.name).not.toBe("옆집국밥"); // 실명 노출 안 함
    expect(c.name).toBeTruthy();
    expect(c.channel).toBe("naver");
    expect(c.rank).toBe(1);
    assertHonestCompetitor(c);
  });

  it("anonymize=false(기본)면 실명 유지", () => {
    const out = deriveCompetitors({ naver: naverWith([naverComp("옆집국밥", 1)]) });
    expect(first(out).name).toBe("옆집국밥");
  });
});

// ── 손실 프레이밍 헤드라인 ──────────────────────────────────────────────────
describe("buildLossHeadline — 손실/응원 프레이밍", () => {
  it("beatsMe 경쟁사 있으면 손실 메시지(응원 톤, 인과·비방 0)", () => {
    const comps = deriveCompetitors({ naver: naverWith([naverComp("옆집", 1)]) });
    const h = buildLossHeadline(comps);
    expect(h).toBeTruthy();
    expect(h).not.toMatch(CAUSAL);
    expect(h).not.toMatch(JARGON);
    expect(h).not.toMatch(/\d{1,3}\s*점|점수/);
  });

  it("beatsMe 경쟁사 없으면 측정 부재 메시지(승리 단정 금지, 손실 단정도 금지)", () => {
    const h = buildLossHeadline([]);
    expect(h).toBeTruthy();
    expect(h).not.toMatch(/뒤처|졌|밀려/); // 손실 단정 금지
    expect(h).not.toMatch(/잘 지키고|잘 하고|이기고|우위/); // 승리 단정 금지(측정 부재 ≠ 승리)
    expect(h).not.toMatch(CAUSAL);
    // 측정 부재를 정직하게 표현(비교 못 함 / 진단 후 확인)
    expect(h).toMatch(/못 모았어요|비교.*못|진단.*완료|보여드릴/);
  });

  it("R2-B: 빈 배열 헤드라인은 '아직 비교 데이터를 못 모았어요' 류 표현", () => {
    const h = buildLossHeadline([]);
    // 측정 부재를 정직하게 표현
    expect(h).toMatch(/아직.*비교.*못|비교.*데이터.*못/);
  });
});

// ── source 배지(사장님 언어 출처 표기) ───────────────────────────────────────
describe("sourceToBadge — 출처 정직 표기", () => {
  it("naver_serp → '네이버 검색' 류 배지(전문용어 0)", () => {
    const b = sourceToBadge("naver_serp");
    expect(b).toBeTruthy();
    expect(b).toMatch(/네이버/);
    expect(b).not.toMatch(JARGON);
  });

  it("gpt_grounded → 'AI 확인' 류 배지(전문용어 0)", () => {
    const b = sourceToBadge("gpt_grounded");
    expect(b).toBeTruthy();
    expect(b).toMatch(/AI/);
    expect(b).not.toMatch(JARGON);
  });
});

describe("deriveCompetitorViewFromPersisted — 근거 표시 계약", () => {
  it("네이버/AI 경쟁사 evidence 를 한국어 label/detail 배열로 반환한다", () => {
    const view = deriveCompetitorViewFromPersisted([
      {
        name: "옆집국밥",
        source: "naver_serp",
        serpRank: 2,
        collectedAt: "2026-07-06T00:00:00.000Z",
      },
      {
        name: "AI추천집",
        source: "gpt_grounded",
        serpRank: null,
        collectedAt: "2026-07-06T00:01:00.000Z",
      },
    ]);

    expect(view.competitors).toHaveLength(2);
    for (const competitor of view.competitors) {
      expect(competitor.measurementLabel).toBe("measured");
      assertEvidenceRows(competitor.evidence);
    }
    expect(view.competitors[0]?.evidence?.map((row) => row.label)).toContain("순위");
    expect(view.competitors[1]?.evidence?.map((row) => row.label)).toContain("경쟁사");
  });
});
