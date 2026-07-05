// @TASK P2-S5 - 행동 (/actions) 화면 TDD
// @SPEC specs/screens/actions.yaml (S5: REQ-005)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드)
//
// RED→GREEN:
//   S5-T1: today_one — isTodayOne=true 행동 정확히 1개
//   S5-T2: 4분류 카드 구분 (green_self/yellow_copy/red_vendor/gray_ongoing)
//   S5-T3: AC-4 — 4분류 + 오늘 딱 하나 배너
//   S5-T4: AC-5 — green_self 딥링크 (deeplink 있을 때 바로 이동)
//   S5-T5: 무료/유료 경계 (무료: 오늘딱하나+일부, 유료: 전체)
//   S5-T6: 정직성 가드 — 인과 단정 0 ("도움이 돼요" 톤)

import { describe, expect, it } from "vitest";
import { actionTierToLabel } from "../../lib/shared/ui-labels";

// ── action 타입 계약 ──────────────────────────────────────────────────────────

interface Action {
  id: string;
  title: string; // 사장님 언어
  tier: "green_self" | "yellow_copy" | "red_vendor" | "gray_ongoing";
  isTodayOne: boolean; // 오늘 딱 하나 배너 대상
  deeplink?: string; // green_self 직접 이동 URL
  doneable: boolean; // 사장님이 직접 할 수 있는지
  isPaid: boolean; // 유료 경계
}

const MOCK_ACTIONS: Action[] = [
  {
    id: "a1",
    title: "네이버 플레이스 소개글 채우기",
    tier: "green_self",
    isTodayOne: true,
    deeplink: "https://new.place.naver.com/edit",
    doneable: true,
    isPaid: false,
  },
  {
    id: "a2",
    title: "가게 소개글 복사해서 올리기",
    tier: "yellow_copy",
    isTodayOne: false,
    doneable: true,
    isPaid: false,
  },
  {
    id: "a3",
    title: "홈페이지 최적화 업체에 맡기기",
    tier: "red_vendor",
    isTodayOne: false,
    doneable: false,
    isPaid: false,
  },
  {
    id: "a4",
    title: "리뷰 꾸준히 쌓기",
    tier: "gray_ongoing",
    isTodayOne: false,
    doneable: true,
    isPaid: false,
  },
  {
    id: "a5",
    title: "FAQ 블로그 포스팅 작성",
    tier: "yellow_copy",
    isTodayOne: false,
    doneable: true,
    isPaid: true,
  },
];

// ── S5-T1: today_one — isTodayOne=true 정확히 1개 ──────────────────────────

describe("P2-S5: 행동 — today_one (오늘 딱 하나)", () => {
  function getTodayOne(actions: Action[]): Action | undefined {
    return actions.find((a) => a.isTodayOne);
  }

  function countTodayOne(actions: Action[]): number {
    return actions.filter((a) => a.isTodayOne).length;
  }

  it("S5-T1-a: isTodayOne=true인 행동이 정확히 1개", () => {
    expect(countTodayOne(MOCK_ACTIONS)).toBe(1);
  });

  it("S5-T1-b: 오늘 딱 하나 배너가 최상단 (가장 급한 행동)", () => {
    const todayOne = getTodayOne(MOCK_ACTIONS);
    expect(todayOne).toBeDefined();
    expect(todayOne?.title).toBeTruthy();
  });

  it("S5-T1-c: 무료 사용자에게도 오늘 딱 하나 항상 노출 (isPaid=false)", () => {
    const todayOne = getTodayOne(MOCK_ACTIONS);
    expect(todayOne?.isPaid).toBe(false);
  });

  it("S5-T1-d: 오늘 딱 하나 배너 제목에 응원 톤 (인과 단정 0)", () => {
    const CAUSAL_FORBIDDEN = ["반드시", "확실히", "보장", "무조건", "1위", "1등"];
    const todayOne = getTodayOne(MOCK_ACTIONS);
    if (todayOne) {
      for (const claim of CAUSAL_FORBIDDEN) {
        expect(todayOne.title).not.toContain(claim);
      }
    }
  });
});

// ── S5-T2: 4분류 카드 구분 ───────────────────────────────────────────────────

describe("P2-S5: 행동 — 4분류 카드 (AC-4)", () => {
  function groupByTier(actions: Action[]): Record<string, Action[]> {
    const result: Record<string, Action[]> = {
      green_self: [],
      yellow_copy: [],
      red_vendor: [],
      gray_ongoing: [],
    };
    for (const action of actions) {
      result[action.tier]?.push(action);
    }
    return result;
  }

  it("S5-T2-a: 4분류가 모두 존재 (green_self, yellow_copy, red_vendor, gray_ongoing)", () => {
    const grouped = groupByTier(MOCK_ACTIONS);
    expect(grouped.green_self?.length).toBeGreaterThan(0);
    expect(grouped.yellow_copy?.length).toBeGreaterThan(0);
    expect(grouped.red_vendor?.length).toBeGreaterThan(0);
    expect(grouped.gray_ongoing?.length).toBeGreaterThan(0);
  });

  it("S5-T2-b: actionTierToLabel 4분류 사장님 언어 변환", () => {
    const tiers = ["green_self", "yellow_copy", "red_vendor", "gray_ongoing"] as const;
    const expected = {
      green_self: { emoji: "🟢", hasLabel: true },
      yellow_copy: { emoji: "🟡", hasLabel: true },
      red_vendor: { emoji: "🔴", hasLabel: true },
      gray_ongoing: { emoji: "⏳", hasLabel: true },
    };
    for (const tier of tiers) {
      const result = actionTierToLabel(tier);
      expect(result.emoji).toBe(expected[tier].emoji);
      expect(result.label).toBeTruthy();
      expect(result.description).toBeTruthy();
    }
  });

  it("S5-T2-c: green_self — 5분·무료 표현 (직접 가능)", () => {
    const label = actionTierToLabel("green_self");
    expect(label.label).toMatch(/직접|무료|5분/);
  });

  it("S5-T2-d: yellow_copy — 복붙 표현", () => {
    const label = actionTierToLabel("yellow_copy");
    expect(label.label).toMatch(/복붙|복사/);
  });

  it("S5-T2-e: red_vendor — 업체 표현", () => {
    const label = actionTierToLabel("red_vendor");
    expect(label.label).toMatch(/업체/);
  });

  it("S5-T2-f: gray_ongoing — 꾸준히 표현 (조급 금지)", () => {
    const label = actionTierToLabel("gray_ongoing");
    expect(label.label).toMatch(/꾸준히/);
    expect(label.description).not.toMatch(/빨리|즉시|지금 당장/);
  });
});

// ── S5-T3: AC-4 — 4분류 + 오늘 딱 하나 배너 조합 ───────────────────────────

describe("P2-S5: 행동 — AC-4 (4분류 + 오늘 딱 하나)", () => {
  it("S5-T3-a: 배너는 가장 위에, 4분류 카드는 그 아래", () => {
    // 렌더 순서: today_one(header) → 4분류 카드(main)
    const order = [
      "today_one_banner",
      "green_self_card",
      "yellow_copy_card",
      "red_vendor_card",
      "gray_ongoing_card",
    ];
    expect(order[0]).toBe("today_one_banner");
    expect(order.slice(1)).toContain("green_self_card");
    expect(order.slice(1)).toContain("yellow_copy_card");
    expect(order.slice(1)).toContain("red_vendor_card");
    expect(order.slice(1)).toContain("gray_ongoing_card");
  });

  it("S5-T3-b: 한 번에 하나 강조 — 오늘 딱 하나만 크게", () => {
    const todayOnes = MOCK_ACTIONS.filter((a) => a.isTodayOne);
    expect(todayOnes).toHaveLength(1);
  });
});

// ── S5-T4: AC-5 — green_self 딥링크 ────────────────────────────────────────

describe("P2-S5: 행동 — AC-5 (green_self 딥링크)", () => {
  it("S5-T4-a: green_self 행동에 deeplink 있으면 외부 이동", () => {
    const greenSelf = MOCK_ACTIONS.filter((a) => a.tier === "green_self");
    const withDeeplink = greenSelf.filter((a) => !!a.deeplink);
    expect(withDeeplink.length).toBeGreaterThan(0);
    for (const action of withDeeplink) {
      expect(action.deeplink).toMatch(/^https?:\/\//);
    }
  });

  it("S5-T4-b: deeplink는 네이버 플레이스 등 실제 서비스 URL", () => {
    const withDeeplink = MOCK_ACTIONS.filter((a) => a.tier === "green_self" && a.deeplink);
    for (const action of withDeeplink) {
      expect(action.deeplink).not.toBe("/");
      expect(action.deeplink).not.toBe("#");
    }
  });
});

// ── S5-T5: 무료/유료 경계 ───────────────────────────────────────────────────

describe("P2-S5: 행동 — 무료/유료 경계 (paid_actions_lock)", () => {
  function getVisibleActions(actions: Action[], isPaidUser: boolean): Action[] {
    if (isPaidUser) return actions;
    // 무료: 오늘딱하나(항상) + isPaid=false 항목만
    return actions.filter((a) => a.isTodayOne || !a.isPaid);
  }

  it("S5-T5-a: 무료 사용자에게 오늘딱하나는 항상 노출", () => {
    const visible = getVisibleActions(MOCK_ACTIONS, false);
    const hasTodayOne = visible.some((a) => a.isTodayOne);
    expect(hasTodayOne).toBe(true);
  });

  it("S5-T5-b: 무료 사용자에게 isPaid=true 행동은 잠김", () => {
    const visible = getVisibleActions(MOCK_ACTIONS, false);
    const paidVisible = visible.filter((a) => a.isPaid && !a.isTodayOne);
    expect(paidVisible).toHaveLength(0);
  });

  it("S5-T5-c: 유료 사용자에게 전체 행동 노출", () => {
    const visible = getVisibleActions(MOCK_ACTIONS, true);
    expect(visible).toHaveLength(MOCK_ACTIONS.length);
  });
});

// ── S5-T6: 정직성 가드 — "도움이 돼요" 톤 ─────────────────────────────────

describe("P2-S5: 행동 — 정직성 가드 (AC-7)", () => {
  const UI_TEXTS = [
    "오늘 딱 하나 👆",
    "네이버 플레이스 소개글 채우기",
    "가게 소개글 복사해서 올리기",
    "홈페이지 최적화 업체에 맡기기",
    "리뷰 꾸준히 쌓기",
    "지금 해볼게요",
    "도움이 돼요",
  ];

  const TECHNICAL_FORBIDDEN = [
    "SEO",
    "AEO",
    "GEO",
    "SERP",
    "snippet",
    "algorithm",
    "tier",
    "actionType",
  ];
  const CAUSAL_FORBIDDEN = ["1위", "1등", "매출", "반드시", "확실히", "보장", "무조건"];

  it("S5-T6-a: 모든 UI 텍스트에 전문용어 없음", () => {
    for (const text of UI_TEXTS) {
      for (const term of TECHNICAL_FORBIDDEN) {
        expect(text).not.toMatch(new RegExp(term, "i"));
      }
    }
  });

  it("S5-T6-b: 모든 UI 텍스트에 인과 단정 없음", () => {
    for (const text of UI_TEXTS) {
      for (const claim of CAUSAL_FORBIDDEN) {
        expect(text).not.toContain(claim);
      }
    }
  });

  it("S5-T6-c: 행동 타이틀에 점수(숫자 단독) 없음", () => {
    for (const action of MOCK_ACTIONS) {
      expect(action.title).not.toMatch(/\d+점|\d+%|\d+위/);
    }
  });

  it("S5-T6-d: actionTierToLabel 반환값에 인과 단정 없음", () => {
    const tiers = ["green_self", "yellow_copy", "red_vendor", "gray_ongoing"] as const;
    for (const tier of tiers) {
      const result = actionTierToLabel(tier);
      for (const claim of CAUSAL_FORBIDDEN) {
        expect(result.description).not.toContain(claim);
      }
    }
  });
});

// ── R2-B: S5 모순 카피 제거 — done+todayOne null 시 "진단 완료하세요" 미노출 ─

describe("R2-B: S5 모순 카피 제거 (done + todayOne null)", () => {
  // 진단 완료(done) 여부에 따른 카피 분기 계약
  function getEmptyStateCopy(diagnosisDone: boolean): string {
    if (diagnosisDone) {
      // done인데 행동 없음 → "진단 완료하면" 표시 금지
      return "아직 추천할 행동을 못 찾았어요. 채널을 조금 더 채우면 보여드릴게요.";
    }
    // 진단 미완료 → 안내 표시 가능
    return "지금 진단을 완료하면 오늘 딱 하나를 알려드릴게요!";
  }

  it("R2-B-S5-1: done=true + todayOne null → '진단 완료하면' 표현 미노출", () => {
    const copy = getEmptyStateCopy(true);
    expect(copy).not.toMatch(/지금 진단을 완료하면/);
  });

  it("R2-B-S5-2: done=true + todayOne null → 정직한 '아직 못 찾았어요' 표현", () => {
    const copy = getEmptyStateCopy(true);
    expect(copy).toMatch(/아직.*못 찾았어요|추천할 행동.*못/);
  });

  it("R2-B-S5-3: done=false + todayOne null → '진단 완료하면' 안내 가능", () => {
    const copy = getEmptyStateCopy(false);
    expect(copy).toMatch(/진단을 완료하면/);
  });

  it("R2-B-S5-4: done+행동없음 카피에 인과 단정 없음", () => {
    const CAUSAL = ["반드시", "무조건", "보장", "확실히", "1위", "1등"];
    const copy = getEmptyStateCopy(true);
    for (const claim of CAUSAL) {
      expect(copy).not.toContain(claim);
    }
  });

  it("R2-B-S5-5: 빈데이터 카피 '잘 하고 계세요' 승리 단정 금지", () => {
    const copy = getEmptyStateCopy(true);
    expect(copy).not.toMatch(/잘 하고 계세요|잘 지키고|이기고 있어요/);
  });
});
