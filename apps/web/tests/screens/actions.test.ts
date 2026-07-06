// @TASK P2-S5 - 행동 (/actions) 화면 TDD
// @SPEC specs/screens/actions.yaml (S5: REQ-005)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드)

import { describe, expect, it } from "vitest";
import {
  buildActionIntro,
  deriveActionViewFromGapItems,
  deriveActions,
} from "../../lib/diagnosis/action-service";
import type { GapItem } from "../../lib/diagnosis/gap-service";
import { actionTierToLabel } from "../../lib/shared/ui-labels";

const CAUSAL_FORBIDDEN = /반드시|확실히|보장|무조건|1위|1등|매출/;
const TECHNICAL_FORBIDDEN =
  /SEO|AEO|GEO|SERP|snippet|algorithm|actionType|green_self|yellow_copy|red_vendor|gray_ongoing|todayOne/i;

const GAP_ITEMS: GapItem[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    label: "네이버에 영업시간을 채워요",
    competitorHas: true,
    iHave: false,
    category: "소개",
    actionTier: "self_fix",
    priority: 1,
    isPaid: false,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    label: "가게 소개글을 붙여 넣어요",
    competitorHas: true,
    iHave: false,
    category: "소개",
    actionTier: "snippet",
    priority: 2,
    isPaid: false,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    label: "사진 정리를 업체에 요청해요",
    competitorHas: true,
    iHave: false,
    category: "노출",
    actionTier: "vendor",
    priority: 3,
    isPaid: true,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    label: "리뷰 답글을 꾸준히 챙겨요",
    competitorHas: true,
    iHave: false,
    category: "리뷰",
    actionTier: "ongoing",
    priority: 4,
    isPaid: true,
  },
];

describe("P2-S5: 행동 — product action view", () => {
  it("gapItem 실데이터에서 4분류와 오늘 딱 하나를 제품 함수로 만든다", () => {
    const view = deriveActionViewFromGapItems(GAP_ITEMS, { isPaid: true });

    expect(view.actions).toHaveLength(GAP_ITEMS.length);
    expect(new Set(view.actions.map((action) => action.tier))).toEqual(
      new Set(["green_self", "yellow_copy", "red_vendor", "gray_ongoing"]),
    );
    expect(view.actions.filter((action) => action.isTodayOne)).toHaveLength(1);
    expect(view.todayOne?.id).toBe(GAP_ITEMS[0]?.id);
    expect(view.todayOne?.isPaid).toBe(false);
  });

  it("직접건에만 공식 deeplink를 붙이고 업체/복붙/꾸준히 항목에는 붙이지 않는다", () => {
    const actions = deriveActions(GAP_ITEMS, { isPaid: true });
    const directAction = actions.find((action) => action.tier === "green_self");
    const others = actions.filter((action) => action.tier !== "green_self");

    expect(directAction?.deeplink).toBe("https://new.smartplace.naver.com/");
    expect(others.every((action) => !action.deeplink)).toBe(true);
  });

  it("빈 gap에서는 행동과 오늘 딱 하나를 추측하지 않는다", () => {
    const view = deriveActionViewFromGapItems([]);

    expect(view.actions).toEqual([]);
    expect(view.todayOne).toBeNull();
    expect(view.intro).toBe(buildActionIntro(0));
    expect(view.intro).toMatch(/아직.*추천할 행동.*찾지 못했어요/);
  });
});

describe("P2-S5: 행동 — label and honesty contract", () => {
  it("4분류 라벨은 사장님 언어 텍스트 토큰이고 기술 코드값을 노출하지 않는다", () => {
    const tiers = ["green_self", "yellow_copy", "red_vendor", "gray_ongoing"] as const;

    for (const tier of tiers) {
      const label = actionTierToLabel(tier);
      expect(label.emoji).toMatch(/^[a-z_]+$/);
      expect(label.label.length).toBeGreaterThan(0);
      expect(`${label.label}\n${label.description}`).not.toMatch(TECHNICAL_FORBIDDEN);
      expect(`${label.label}\n${label.description}`).not.toMatch(CAUSAL_FORBIDDEN);
    }
  });

  it("product action text has no score, rank, or guarantee copy", () => {
    const view = deriveActionViewFromGapItems(GAP_ITEMS, { isPaid: true });
    const productTexts = [
      view.intro,
      ...view.actions.map((action) => action.title),
      ...view.actions.map((action) => actionTierToLabel(action.tier).description),
    ];

    for (const text of productTexts) {
      expect(text).not.toMatch(/\d+점|\d+%|\d+위/);
      expect(text).not.toMatch(CAUSAL_FORBIDDEN);
    }
  });
});
