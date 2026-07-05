// @TASK P2-R5 - action 변환·4분류·"오늘 딱 하나" TDD (RED→GREEN)
// @SPEC specs/domain/resources.yaml (action: id/title/tier/isTodayOne/deeplink/doneable/isPaid)
// @SPEC specs/screens/actions.yaml (S5: 오늘 딱 하나 1개 / 4분류 / 직접건 deeplink / 무료·유료 경계)
// @SPEC docs/planning/07-coding-convention.md §4 (누가-하나 부착·인과 단정 0·전문용어 0)
// @SPEC docs/planning/05-design-system.md (행동 카드 4분류·"오늘 딱 하나" 배너)
// @TEST apps/web/tests/diagnosis/action-service.test.ts
//
// 핵심 계약(REQ-005, 양보 불가):
//   1. gapItem actionTier(self_fix|snippet|vendor|ongoing) → 사장님 언어 4분류
//      (green_self 🟢직접 / yellow_copy 🟡복붙 / red_vendor 🔴업체 / gray_ongoing ⏳꾸준히).
//      4분류 전부 누가-하나(이모지+라벨) 부착. 전문용어 0.
//   2. "오늘 딱 하나" — PriorityGap 우선순위 → isTodayOne=true 가 정확히 1개.
//   3. deeplink — 직접건(green_self)에만 바로가기 URL(네이버 플레이스 등). 비직접건은 없음.
//   4. isPaid 경계 — [무료] 오늘딱하나+일부 / [유료] 전체. gapItem.isPaid 승계.
//   5. 정직성 — 노출/순위 보장 단정 0("도움이 돼요" 톤). 룰 코드값/점수 노출 0.

import { describe, expect, it } from "vitest";
import {
  type Action,
  buildActionIntro,
  deriveActionViewFromView,
  deriveActions,
} from "../../lib/diagnosis/action-service.js";
import type { GapItem } from "../../lib/diagnosis/gap-service.js";

// ── 전문용어/인과 단정/룰 코드값 금지 가드 (07 §4) ──────────────────────────
const JARGON = /SERP|grounded|snippet|스니펫|크롤|메타태그|\bAEO\b|\bGEO\b|\bSEO\b|robots|schema/i;
const CAUSAL = /1위|매출\s*↑|매출이?\s*늘|반드시|확실히|보장|따라\s*하면|고치면\s*추천|추천\s*보장/;
const RULE_CODE = /[A-Z]{2,}-[A-Z0-9-]*-?\d{2,}/;

// ── mock gapItem 빌더 (P2-R4 deriveGapItemsFromResult 산출 형태) ─────────────
function gap(partial: Partial<GapItem> & Pick<GapItem, "actionTier" | "priority">): GapItem {
  return {
    id: `00000000-0000-4000-8000-${String(partial.priority).padStart(12, "0")}`,
    label: "영업시간이 안 적혀 있어요",
    competitorHas: true,
    iHave: false,
    category: "노출",
    isPaid: false,
    ...partial,
  };
}

/** 모든 action 의 정직성·필드·룰코드 비노출 공통 검증. */
function assertHonestAction(a: Action) {
  // resources.yaml 필드만 (발명 금지).
  for (const k of Object.keys(a)) {
    expect(["id", "title", "tier", "isTodayOne", "deeplink", "doneable", "isPaid"]).toContain(k);
  }
  // id UUID v4.
  expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  // title 사장님 언어 — 룰 코드값/전문용어/인과/점수 노출 0.
  expect(a.title).toBeTruthy();
  expect(a.title).not.toMatch(RULE_CODE);
  expect(a.title).not.toMatch(JARGON);
  expect(a.title).not.toMatch(CAUSAL);
  expect(a.title).not.toMatch(/\d{1,3}\s*점|score|점수/i);
  // tier 4분류 enum.
  expect(["green_self", "yellow_copy", "red_vendor", "gray_ongoing"]).toContain(a.tier);
  // doneable / isPaid boolean.
  expect(typeof a.doneable).toBe("boolean");
  expect(typeof a.isPaid).toBe("boolean");
}

// ===========================================================================
// 1. gapItem actionTier → 사장님 언어 4분류 (누가-하나 전부 부착)
// ===========================================================================
describe("deriveActions — actionTier → 4분류 번역", () => {
  it("self_fix→green_self, snippet→yellow_copy, vendor→red_vendor, ongoing→gray_ongoing", () => {
    const cases: [GapItem["actionTier"], Action["tier"]][] = [
      ["self_fix", "green_self"],
      ["snippet", "yellow_copy"],
      ["vendor", "red_vendor"],
      ["ongoing", "gray_ongoing"],
    ];
    for (const [actionTier, expected] of cases) {
      const actions = deriveActions([gap({ actionTier, priority: 1 })], { isPaid: true });
      expect(actions[0]?.tier).toBe(expected);
    }
  });

  it("4분류가 전부 누가-하나(이모지) 부착되어 title 에 분류 신호가 정직 반영된다", () => {
    const items = [
      gap({ actionTier: "self_fix", priority: 1, label: "영업시간이 안 적혀 있어요" }),
      gap({ actionTier: "snippet", priority: 2, label: "자주 묻는 질문 안내가 없어요" }),
      gap({ actionTier: "vendor", priority: 3, label: "첫 화면이 늦게 떠요" }),
      gap({ actionTier: "ongoing", priority: 4, label: "후기 모음 안내가 없어요" }),
    ];
    const actions = deriveActions(items, { isPaid: true });
    // 4분류 전부 존재 — 하나도 누락되면 실패(RED).
    const tiers = new Set(actions.map((a) => a.tier));
    expect(tiers).toEqual(new Set(["green_self", "yellow_copy", "red_vendor", "gray_ongoing"]));
    for (const a of actions) assertHonestAction(a);
  });

  it("빈 gapItem → 빈 행동(추측 0)", () => {
    expect(deriveActions([], { isPaid: true })).toEqual([]);
  });
});

// ===========================================================================
// 2. "오늘 딱 하나" — isTodayOne 정확히 1개 (RED: 2개+ 면 실패)
// ===========================================================================
describe("deriveActions — 오늘 딱 하나(isTodayOne 정확히 1개)", () => {
  it("여러 행동이 있어도 isTodayOne=true 는 정확히 1개", () => {
    const items = [
      gap({ actionTier: "self_fix", priority: 2 }),
      gap({ actionTier: "snippet", priority: 1 }),
      gap({ actionTier: "vendor", priority: 3 }),
      gap({ actionTier: "ongoing", priority: 4 }),
      gap({ actionTier: "self_fix", priority: 5 }),
    ];
    const actions = deriveActions(items, { isPaid: true });
    const todayOnes = actions.filter((a) => a.isTodayOne);
    expect(todayOnes).toHaveLength(1); // 다중(2+)이면 RED
  });

  it("오늘 딱 하나는 사장님이 바로 실행 가능한 순서 — 가장 급한(priority 작은) 직접건 우선", () => {
    const items = [
      gap({ actionTier: "vendor", priority: 1, label: "첫 화면이 늦게 떠요" }), // 가장 급하나 업체건
      gap({ actionTier: "self_fix", priority: 2, label: "영업시간이 안 적혀 있어요" }), // 바로 실행 가능
      gap({ actionTier: "snippet", priority: 3 }),
    ];
    const actions = deriveActions(items, { isPaid: true });
    const todayOne = actions.find((a) => a.isTodayOne);
    expect(todayOne).toBeDefined();
    // 바로 실행 가능(직접건)이 "오늘 딱 하나" — 사장님이 오늘 끝낼 수 있는 것.
    expect(todayOne?.tier).toBe("green_self");
    expect(todayOne?.doneable).toBe(true);
  });

  it("직접건이 없으면 가장 급한 행동 1개가 오늘 딱 하나 (그래도 정확히 1개)", () => {
    const items = [
      gap({ actionTier: "snippet", priority: 2 }),
      gap({ actionTier: "vendor", priority: 1 }),
      gap({ actionTier: "ongoing", priority: 3 }),
    ];
    const actions = deriveActions(items, { isPaid: true });
    expect(actions.filter((a) => a.isTodayOne)).toHaveLength(1);
    // 직접건 부재 → 가장 급한(priority=1) 행동이 오늘 딱 하나.
    const todayOne = actions.find((a) => a.isTodayOne);
    expect(todayOne?.tier).toBe("red_vendor");
  });

  it("행동이 1개뿐이어도 isTodayOne=true 정확히 1개", () => {
    const actions = deriveActions([gap({ actionTier: "self_fix", priority: 1 })], {
      isPaid: true,
    });
    expect(actions.filter((a) => a.isTodayOne)).toHaveLength(1);
  });

  it("무료(isPaid=false)에서도 오늘 딱 하나는 항상 노출 — isTodayOne 1개", () => {
    const items = [
      gap({ actionTier: "self_fix", priority: 1, isPaid: false }),
      gap({ actionTier: "snippet", priority: 2, isPaid: false }),
      gap({ actionTier: "vendor", priority: 3, isPaid: true }),
    ];
    const actions = deriveActions(items, { isPaid: false });
    expect(actions.filter((a) => a.isTodayOne)).toHaveLength(1);
    // 오늘 딱 하나는 무료여야(잠금 뒤 아님).
    const todayOne = actions.find((a) => a.isTodayOne);
    expect(todayOne?.isPaid).toBe(false);
  });
});

// ===========================================================================
// 3. deeplink — 직접건(green_self)에만 바로가기
// ===========================================================================
describe("deriveActions — deeplink(직접건만)", () => {
  it("green_self 행동은 deeplink(바로가기 URL) 부착", () => {
    const actions = deriveActions([gap({ actionTier: "self_fix", priority: 1 })], {
      isPaid: true,
    });
    const green = actions.find((a) => a.tier === "green_self");
    expect(green?.deeplink).toBeTruthy();
    expect(green?.deeplink).toMatch(/^https?:\/\//);
    expect(green?.doneable).toBe(true);
  });

  it("비직접건(복붙/업체/꾸준히)은 deeplink 없음(직접 바로가기 대상 아님)", () => {
    const items = [
      gap({ actionTier: "snippet", priority: 1 }),
      gap({ actionTier: "vendor", priority: 2 }),
      gap({ actionTier: "ongoing", priority: 3 }),
    ];
    const actions = deriveActions(items, { isPaid: true });
    for (const a of actions) {
      expect(a.deeplink).toBeUndefined();
    }
  });

  it("업체건(red_vendor)은 doneable=false (직접 끝낼 수 없음)", () => {
    const actions = deriveActions([gap({ actionTier: "vendor", priority: 1 })], {
      isPaid: true,
    });
    expect(actions[0]?.doneable).toBe(false);
  });
});

// ===========================================================================
// 4. isPaid 경계 ([무료] 오늘딱하나+일부 / [유료] 전체)
// ===========================================================================
describe("deriveActions — isPaid 경계", () => {
  it("gapItem.isPaid 를 승계 — 유료 갭(Top3 밖)은 유료 행동", () => {
    const items = [
      gap({ actionTier: "self_fix", priority: 1, isPaid: false }),
      gap({ actionTier: "snippet", priority: 2, isPaid: false }),
      gap({ actionTier: "vendor", priority: 3, isPaid: false }),
      gap({ actionTier: "ongoing", priority: 4, isPaid: true }),
      gap({ actionTier: "self_fix", priority: 5, isPaid: true }),
    ];
    const actions = deriveActions(items, { isPaid: true });
    const paid = actions.filter((a) => a.isPaid);
    expect(paid.length).toBe(2); // Top3 밖 2개
  });

  it("오늘 딱 하나는 절대 유료 잠금 뒤가 아니다([무료] 보장)", () => {
    const items = [
      gap({ actionTier: "snippet", priority: 1, isPaid: true }), // 가장 급하나 유료
      gap({ actionTier: "self_fix", priority: 2, isPaid: false }), // 무료 직접건
    ];
    const actions = deriveActions(items, { isPaid: false });
    const todayOne = actions.find((a) => a.isTodayOne);
    expect(todayOne?.isPaid).toBe(false); // 오늘 딱 하나는 무료여야
  });
});

// ===========================================================================
// 5. action_intro 헤드라인 (응원 톤·인과/보장 0)
// ===========================================================================
describe("buildActionIntro — 정직 한 문장", () => {
  it("행동 있으면 응원 톤(노출/순위 보장 단정 0), 인과/전문용어/코드값 0", () => {
    const intro = buildActionIntro(3);
    expect(intro).toBeTruthy();
    expect(intro).not.toMatch(CAUSAL);
    expect(intro).not.toMatch(JARGON);
    expect(intro).not.toMatch(RULE_CODE);
  });

  it("행동 0이면 측정부재 표현(승리 단정 금지, 손실 단정 금지)", () => {
    const intro = buildActionIntro(0);
    expect(intro).toBeTruthy();
    expect(intro).not.toMatch(/뒤처|졌|밀려|망했/); // 손실 단정 금지
    // R2-B: 측정 부재 ≠ 승리 — '잘 하고 계세요' 단정 금지
    expect(intro).not.toMatch(/잘 하고 계세요|기본은 잘|이기고 있어요/);
    expect(intro).not.toMatch(CAUSAL);
    // 정직한 미확인 상태 표현
    expect(intro).toMatch(/아직.*못.*찾|추천할 행동.*못|채워드릴/);
  });
});

// ===========================================================================
// 6. v1 정직 폴백 (원자료 미영속화 → 추측 0)
// ===========================================================================
describe("deriveActionViewFromView — v1 정직 폴백", () => {
  it("원자료 없으면 추측 행동 0(빈 배열) + 응원 인트로 + isPaid 분기", () => {
    const view = deriveActionViewFromView({ isPaid: false });
    expect(view.actions).toEqual([]);
    expect(view.todayOne).toBeNull(); // 추측 오늘 딱 하나 만들지 않음
    expect(view.intro).toBeTruthy();
    expect(view.intro).not.toMatch(CAUSAL);
    expect(view.intro).not.toMatch(RULE_CODE);
    expect(view.isPaid).toBe(false);
  });

  it("paid=true 면 isPaid=true 경계", () => {
    expect(deriveActionViewFromView({ isPaid: true }).isPaid).toBe(true);
  });
});
