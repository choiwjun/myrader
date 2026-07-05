// @TASK P2-R4 - gapItem 변환·정직성·GapAnalyzer 배선 TDD (RED→GREEN)
// @SPEC specs/domain/resources.yaml (gapItem: id/label/competitorHas/iHave/category/actionTier/priority/isPaid)
// @SPEC specs/screens/reverse-gap.yaml (S4: 무료 Top3 / 유료 전체 / actionTier 연결 / 정직성)
// @SPEC docs/planning/07-coding-convention.md §4 (룰 코드값 노출 0·인과 단정 0·전문용어 0)
// @SPEC x-sag-FR012-competitor-gap-wiring-spec.md (GapAnalyzer 배선: competitorUrls→GapResult)
// @TEST apps/web/tests/diagnosis/gap-service.test.ts
//
// 핵심 계약(REQ-004, 양보 불가):
//   1. GapAnalyzer 실제 배선 — competitorUrls(수동/mock) → CompetitorReport → GapAnalyzer.analyze()
//      → GapResult(matrix/priorities/selfStrengths). 실 SERP 자동발견 키 0(메모리 FR-012).
//   2. GapMatrixRow(ruleId 코드값) → 사장님 언어 label 번역. 룰 코드값 UI 노출 0(번역만).
//   3. priority 1~5(1=급함) 정렬 + [무료] Top3 컷오프 / [유료] 전체(isPaid 경계).
//   4. actionTier(self_fix|snippet|vendor|ongoing) — P2-R5 action 4분류 연결 토대.
//   5. '룰 역공학(어떻게)' — competitorTop(실측 누가, P2-R3)과 구분. 인과 단정 0.
//
// GapAnalyzer 실제 호출 검증: 엔진 gap 모듈의 실제 GapAnalyzer 를 import 해 GapResult 를
// 산출하고, 그 산출이 gapItem 으로 정확히 번역되는지 검증한다(mock GapResult 가짜 통과 금지).

import { describe, expect, it } from "vitest";
import {
  type CompetitorReportLike,
  type GapAnalyzerPort,
  type GapInputLike,
  type GapItem,
  type GapMatrixRowLike,
  type GapResultLike,
  type PriorityGapLike,
  type SelfReportLike,
  buildGapIntro,
  deriveGapItems,
  deriveGapItemsFromResult,
  ruleToBossLabel,
} from "../../lib/diagnosis/gap-service.js";

// 실제 엔진 GapAnalyzer 를 배선 검증용으로 런타임 로드(엔진 로직 수정 0, 호출만).
// 선언된 서브경로 export(@boina/engine/v2/gap)로 가져온다 — package.json exports 에 선언 완료
// (serp/competitor/perf 와 동형) → tsc 가 이 경로를 해석한다(잠든 GapAnalyzer 라이브 배선).
// 미러 boundary 타입으로 캐스팅해 엔진 source(types.ts)를 web 타입체크 프로그램에 끌어오지 않는다
// (packages 무수정 유지). 엔진 자체 단위테스트가 GapResult 정확성은 이미 보증; 여기선 배선/번역 검증.
// specifier 를 변수로 두어 web 타입체크 프로그램이 엔진 gap source(types.ts 등)를 끌어오지 않게 한다
// (packages 무수정 유지 — 미러 boundary 타입으로만 의존). 런타임 해석은 vitest alias 가 수행한다.
const ENGINE_GAP_SPECIFIER = "@boina/engine/v2/gap";
async function loadRealAnalyzer(): Promise<GapAnalyzerPort> {
  const mod = (await import(ENGINE_GAP_SPECIFIER)) as unknown as {
    GapAnalyzer: new () => { analyze(input: GapInputLike): GapResultLike };
  };
  const instance = new mod.GapAnalyzer();
  return { analyze: (input) => instance.analyze(input) };
}

// ── 전문용어/인과 단정/룰 코드값 금지 가드 (07 §4) ──────────────────────────
const JARGON = /SERP|grounded|snippet|스니펫|크롤|메타태그|\bAEO\b|\bGEO\b|\bSEO\b|robots|schema/i;
const CAUSAL = /1위|매출\s*↑|매출이?\s*늘|반드시|확실히|보장|따라\s*하면|고치면\s*추천|추천\s*보장/;
// 룰 코드값 패턴 — "SEO-TITLE-001" 류. label 에 절대 노출 금지.
const RULE_CODE = /[A-Z]{2,}-[A-Z0-9-]*-?\d{2,}/;

// ── mock 경쟁사/자기 진단 빌더 (실 외부 호출 0 — 수동/mock competitorUrls) ────
function selfItem(
  ruleId: string,
  passed: boolean,
  category: "seo" | "aeo" | "geo" | "perf" = "geo",
  actionType: "self_fix" | "snippet_action" | "vendor_action" | "si_action" = "self_fix",
  priority: "high" | "medium" | "low" = "high",
): SelfReportLike["diagnosisItems"][number] {
  return { ruleId, category, passed, actionType, priority };
}

function makeSelf(items: SelfReportLike["diagnosisItems"]): SelfReportLike {
  return { reportId: "self-1", websiteUrl: "https://me.example", diagnosisItems: items };
}

function makeCompetitor(
  url: string,
  items: { ruleId: string; category: "seo" | "aeo" | "geo" | "perf"; passed: boolean }[],
): CompetitorReportLike {
  return { competitorUrl: url, diagnosisItems: items };
}

/** 모든 gapItem 의 정직성·필드·룰코드 비노출 공통 검증. */
function assertHonestGapItem(g: GapItem) {
  // resources.yaml 필드만 (발명 금지).
  for (const k of Object.keys(g)) {
    expect([
      "id",
      "label",
      "competitorHas",
      "iHave",
      "category",
      "actionTier",
      "priority",
      "isPaid",
    ]).toContain(k);
  }
  // id UUID v4.
  expect(g.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  // label 사장님 언어 — 룰 코드값/전문용어/인과/점수 노출 0.
  expect(g.label).toBeTruthy();
  expect(g.label).not.toMatch(RULE_CODE);
  expect(g.label).not.toMatch(JARGON);
  expect(g.label).not.toMatch(CAUSAL);
  expect(g.label).not.toMatch(/\d{1,3}\s*점|score|점수/i);
  // priority 1~5.
  expect(g.priority).toBeGreaterThanOrEqual(1);
  expect(g.priority).toBeLessThanOrEqual(5);
  // actionTier enum.
  expect(["self_fix", "snippet", "vendor", "ongoing"]).toContain(g.actionTier);
}

// ===========================================================================
// 1. GapAnalyzer 실제 배선 — competitorUrls(mock) → GapResult → gapItem
// ===========================================================================
describe("deriveGapItems — GapAnalyzer 실제 배선(FR-012)", () => {
  // 실제 엔진 GapAnalyzer 를 port 로 주입(실 외부 호출 0 — competitorUrls 수동 입력).

  it("GapAnalyzer 를 실제 호출해 GapResult 를 산출하고 gapItem 으로 번역한다", async () => {
    const realAnalyzer = await loadRealAnalyzer();
    // 자기: GEO-OPENING-HOURS 미통과, 경쟁사 둘 다 통과 → 경쟁사 우위 갭.
    const self = makeSelf([
      selfItem("GEO-OPENING-HOURS-001", false, "geo", "self_fix", "high"),
      selfItem("SEO-TITLE-001", true, "seo", "self_fix", "high"),
    ]);
    const competitors = [
      makeCompetitor("https://rivalA.example", [
        { ruleId: "GEO-OPENING-HOURS-001", category: "geo", passed: true },
        { ruleId: "SEO-TITLE-001", category: "seo", passed: false },
      ]),
      makeCompetitor("https://rivalB.example", [
        { ruleId: "GEO-OPENING-HOURS-001", category: "geo", passed: true },
        { ruleId: "SEO-TITLE-001", category: "seo", passed: false },
      ]),
    ];

    const items = deriveGapItems(
      {
        selfReport: self,
        competitors,
        competitorUrls: ["https://rivalA.example", "https://rivalB.example"],
      },
      { analyzer: realAnalyzer, isPaid: true },
    );

    // 경쟁사 우위(gap>0) 항목이 gapItem 으로 산출되어야.
    expect(items.length).toBeGreaterThanOrEqual(1);
    const opening = items.find((g) => g.label.includes("영업시간"));
    expect(opening).toBeDefined();
    if (opening) {
      expect(opening.competitorHas).toBe(true); // 경쟁사 보유
      expect(opening.iHave).toBe(false); // 내 미보유
    }
    for (const g of items) assertHonestGapItem(g);
  });

  it("competitorUrls 가 비면(수동 미입력) 빈 배열 — 자동발견 SERP 호출 0(FR-012 MVP)", async () => {
    const realAnalyzer = await loadRealAnalyzer();
    const self = makeSelf([selfItem("GEO-OPENING-HOURS-001", false)]);
    const items = deriveGapItems(
      { selfReport: self, competitors: [], competitorUrls: [] },
      { analyzer: realAnalyzer, isPaid: true },
    );
    expect(items).toEqual([]);
  });

  it("엔진 GapResult 가 서비스 boundary 타입과 구조 호환(미러링 검증)", async () => {
    const realAnalyzer = await loadRealAnalyzer();
    const self = makeSelf([selfItem("GEO-OPENING-HOURS-001", false)]);
    // 실 GapAnalyzer 산출을 서비스 boundary 타입(GapResultLike)에 할당 — 구조 동일 보장.
    const like: GapResultLike = realAnalyzer.analyze({
      selfReport: self,
      competitors: [
        makeCompetitor("https://r.example", [
          { ruleId: "GEO-OPENING-HOURS-001", category: "geo", passed: true },
        ]),
      ],
    });
    expect(Array.isArray(like.matrix)).toBe(true);
    expect(Array.isArray(like.priorities)).toBe(true);
    // 실제로 경쟁사 우위(gap>0) 행이 산출됐는지 — GapAnalyzer 가 진짜 돌았다는 증거.
    const advantage = like.matrix.filter((r: GapMatrixRowLike) => r.gap > 0);
    expect(advantage.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// 2. 룰 코드값 → 사장님 언어 label 번역 (코드값 노출 0)
// ===========================================================================
describe("ruleToBossLabel — 룰 코드값 → 사장님 언어", () => {
  it("알려진 룰은 구체 사장님 언어 label (코드값 0)", () => {
    const label = ruleToBossLabel("GEO-OPENING-HOURS-001", "geo");
    expect(label).toContain("영업시간");
    expect(label).not.toMatch(RULE_CODE);
    expect(label).not.toMatch(JARGON);
  });

  it("미등록 룰도 카테고리 기반 폴백 label — 코드값 절대 노출 0", () => {
    const label = ruleToBossLabel("WHATEVER-NEW-RULE-999", "aeo");
    expect(label).toBeTruthy();
    expect(label).not.toMatch(RULE_CODE);
    expect(label).not.toMatch(JARGON);
    expect(label).not.toMatch(/WHATEVER|NEW|RULE|999/);
  });

  it("모든 카테고리(seo/aeo/geo/perf) 폴백이 사장님 언어이며 코드값 0", () => {
    for (const cat of ["seo", "aeo", "geo", "perf"] as const) {
      const label = ruleToBossLabel("X-UNKNOWN-000", cat);
      expect(label).toBeTruthy();
      expect(label).not.toMatch(RULE_CODE);
      expect(label).not.toMatch(JARGON);
    }
  });
});

// ===========================================================================
// 3. priority Top3 컷오프 + isPaid 경계
// ===========================================================================
describe("deriveGapItemsFromResult — priority Top3 / isPaid 경계", () => {
  // 5개 경쟁사 우위 갭(priority 다양) GapResult 미러 — 정렬·컷오프 검증.
  function fiveGapResult(): GapResultLike {
    const matrix: GapMatrixRowLike[] = [
      row("GEO-OPENING-HOURS-001", "geo", "self_fix", "high", 1.0),
      row("AEO-FAQ-001", "aeo", "snippet_action", "high", 0.9),
      row("SEO-META-001", "seo", "self_fix", "medium", 0.8),
      row("GEO-REVIEW-AGGREGATE-001", "geo", "vendor_action", "medium", 0.7),
      row("NLP-EEAT-TRUST-001", "geo", "si_action", "low", 0.6),
    ];
    const priorities: PriorityGapLike[] = [
      pg(1, "GEO-OPENING-HOURS-001", "self_fix"),
      pg(2, "AEO-FAQ-001", "snippet_action"),
      pg(3, "SEO-META-001", "self_fix"),
      pg(4, "GEO-REVIEW-AGGREGATE-001", "vendor_action"),
      pg(5, "NLP-EEAT-TRUST-001", "si_action"),
    ];
    return {
      matrix,
      priorities,
      selfStrengths: [],
      marketAverage: { seo: 0, aeo: 0, geo: 0, perf: 0, overall: 0 },
    };
  }

  it("무료(isPaid=false): priority 오름차순 Top3 만 노출", () => {
    const items = deriveGapItemsFromResult(fiveGapResult(), { isPaid: false });
    expect(items).toHaveLength(3);
    expect(items.map((g) => g.priority)).toEqual([1, 2, 3]); // 오름차순(1=급함)
    for (const g of items) {
      expect(g.isPaid).toBe(false); // 무료 노출분
      assertHonestGapItem(g);
    }
  });

  it("유료(isPaid=true): 전체 매트릭스 노출 + 정렬 유지", () => {
    const items = deriveGapItemsFromResult(fiveGapResult(), { isPaid: true });
    expect(items).toHaveLength(5);
    expect(items.map((g) => g.priority)).toEqual([1, 2, 3, 4, 5]);
    for (const g of items) assertHonestGapItem(g);
  });

  it("유료 전용 갭(Top3 밖)은 isPaid=true 로 경계 표기", () => {
    const items = deriveGapItemsFromResult(fiveGapResult(), { isPaid: true });
    const top3 = items.slice(0, 3);
    const rest = items.slice(3);
    for (const g of top3) expect(g.isPaid).toBe(false); // 무료 노출 가능
    for (const g of rest) expect(g.isPaid).toBe(true); // 유료 경계
  });
});

// ===========================================================================
// 4. actionTier 매핑 (engine actionType → action 4분류 토대)
// ===========================================================================
describe("actionTier 매핑 — P2-R5 4분류 연결", () => {
  function singleRow(actionType: PriorityGapLike["actionType"]): GapResultLike {
    return {
      matrix: [row("X-RULE-001", "geo", actionType, "high", 0.9)],
      priorities: [pg(1, "X-RULE-001", actionType)],
      selfStrengths: [],
      marketAverage: { seo: 0, aeo: 0, geo: 0, perf: 0, overall: 0 },
    };
  }

  it("self_fix→self_fix, snippet_action→snippet, vendor_action→vendor, si_action→ongoing", () => {
    const cases: [PriorityGapLike["actionType"], GapItem["actionTier"]][] = [
      ["self_fix", "self_fix"],
      ["snippet_action", "snippet"],
      ["vendor_action", "vendor"],
      ["si_action", "ongoing"],
    ];
    for (const [actionType, expected] of cases) {
      const items = deriveGapItemsFromResult(singleRow(actionType), { isPaid: true });
      expect(items[0]?.actionTier).toBe(expected);
    }
  });
});

// ===========================================================================
// 5. gap_intro 헤드라인 (응원 톤·인과/비방 0)
// ===========================================================================
describe("buildGapIntro — 정직 한 문장", () => {
  it("갭 있으면 응원 톤(보장 아님·격차 안내), 인과/전문용어/코드값 0", () => {
    const intro = buildGapIntro(3);
    expect(intro).toBeTruthy();
    expect(intro).not.toMatch(CAUSAL);
    expect(intro).not.toMatch(JARGON);
    expect(intro).not.toMatch(RULE_CODE);
  });

  it("갭 0이면 손실 단정 금지 → 응원('잘 갖추고 계세요' 류)", () => {
    const intro = buildGapIntro(0);
    expect(intro).toBeTruthy();
    expect(intro).not.toMatch(/뒤처|졌|밀려|망했/);
    expect(intro).not.toMatch(CAUSAL);
  });
});

// ── 테스트 로컬 빌더 (GapResultLike 미러 행 — 발명 없이 엔진 필드만) ──────────
function row(
  ruleId: string,
  category: "seo" | "aeo" | "geo" | "perf",
  actionType: PriorityGapLike["actionType"],
  priority: "high" | "medium" | "low",
  gap: number,
): GapMatrixRowLike {
  return {
    ruleId,
    category,
    selfPassed: false,
    competitorPassedCount: 2,
    competitorTotal: 2,
    gap,
    actionType,
    priority,
  };
}

function pg(
  rank: 1 | 2 | 3 | 4 | 5,
  ruleId: string,
  actionType: PriorityGapLike["actionType"],
): PriorityGapLike {
  return {
    rank,
    ruleId,
    reason: "경쟁사 통과 항목인데 본인 미통과.",
    actionType,
    expectedImpact: "high",
  };
}
