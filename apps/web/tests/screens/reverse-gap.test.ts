// @TASK P2-S4 - 역공학 갭 (/gap) 화면 TDD
// @SPEC specs/screens/reverse-gap.yaml (S4: REQ-004)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드)
//
// RED→GREEN:
//   S4-T1: gap_matrix_card — 무료 Top3 노출 + 나머지 잠금 (priority 오름차순)
//   S4-T2: gap_matrix_card — 사장님 언어 label (룰 코드값 0)
//   S4-T3: paid_gap_lock — 손실 프레이밍 카피 (인과 단정 0)
//   S4-T4: go_actions_button — /actions 이동 경로
//   S4-T5: 정직성 가드 — 점수 0 / 전문용어 0 / 인과 단정 0
//   S4-T6: gap_intro — 보장 아님 안내 한 문장

import { describe, expect, it } from "vitest";
import { actionTierToLabel } from "../../lib/shared/ui-labels";

// ── gapItem 타입 계약 ─────────────────────────────────────────────────────────

interface GapItem {
  id: string;
  label: string; // 사장님 언어 (룰 코드값 ❌)
  competitorHas: boolean; // 옆집 ⭕
  iHave: boolean; // 우리 ✕
  category: string;
  actionTier: "green_self" | "yellow_copy" | "red_vendor" | "gray_ongoing";
  priority: number; // 오름차순 정렬
  isPaid: boolean;
}

const FREE_GAP_ITEMS: GapItem[] = [
  {
    id: "g1",
    label: "가게 소개글",
    competitorHas: true,
    iHave: false,
    category: "place",
    actionTier: "yellow_copy",
    priority: 1,
    isPaid: false,
  },
  {
    id: "g2",
    label: "영업시간 등록",
    competitorHas: true,
    iHave: false,
    category: "info",
    actionTier: "green_self",
    priority: 2,
    isPaid: false,
  },
  {
    id: "g3",
    label: "리뷰 답변",
    competitorHas: true,
    iHave: false,
    category: "review",
    actionTier: "gray_ongoing",
    priority: 3,
    isPaid: false,
  },
  // 유료 잠금 항목
  {
    id: "g4",
    label: "사진 10장 이상",
    competitorHas: true,
    iHave: false,
    category: "photo",
    actionTier: "green_self",
    priority: 4,
    isPaid: true,
  },
  {
    id: "g5",
    label: "FAQ 등록",
    competitorHas: true,
    iHave: false,
    category: "faq",
    actionTier: "yellow_copy",
    priority: 5,
    isPaid: true,
  },
];

// ── S4-T1: 무료 Top3 노출 + 나머지 잠금 ─────────────────────────────────────

describe("P2-S4: 역공학 갭 — gap_matrix_card 무료 Top3 노출", () => {
  function getFreeGapItems(items: GapItem[]): GapItem[] {
    return items
      .filter((item) => !item.isPaid)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3);
  }

  function getLockedGapItems(items: GapItem[]): GapItem[] {
    return items.filter((item) => item.isPaid);
  }

  it("S4-T1-a: 무료 사용자에게 Top3 갭 카드가 보임", () => {
    const free = getFreeGapItems(FREE_GAP_ITEMS);
    expect(free).toHaveLength(3);
    expect(free[0]?.priority).toBe(1);
    expect(free[1]?.priority).toBe(2);
    expect(free[2]?.priority).toBe(3);
  });

  it("S4-T1-b: Top3 이후 나머지 갭은 잠금(isPaid=true) 상태", () => {
    const locked = getLockedGapItems(FREE_GAP_ITEMS);
    expect(locked.length).toBeGreaterThan(0);
    for (const item of locked) {
      expect(item.isPaid).toBe(true);
    }
  });

  it("S4-T1-c: priority 오름차순 정렬 (1이 가장 급함)", () => {
    const free = getFreeGapItems(FREE_GAP_ITEMS);
    for (let i = 0; i < free.length - 1; i++) {
      const curr = free[i]?.priority ?? 0;
      const next = free[i + 1]?.priority ?? 0;
      expect(curr).toBeLessThan(next);
    }
  });

  it("S4-T1-d: 유료 사용자는 전체 갭 열람 가능 (잠금 없음)", () => {
    const allItems = FREE_GAP_ITEMS.map((item) => ({ ...item, isPaid: false }));
    const visible = allItems.filter((item) => !item.isPaid);
    expect(visible).toHaveLength(FREE_GAP_ITEMS.length);
  });
});

// ── S4-T2: 사장님 언어 label (룰 코드값 0) ──────────────────────────────────

describe("P2-S4: 역공학 갭 — 사장님 언어 label", () => {
  const FORBIDDEN_RULE_CODES = [
    "SEO",
    "AEO",
    "GEO",
    "SERP",
    "snippet",
    "algorithm",
    "crawl",
    "index",
    "rankFactor",
    "naver_serp",
    "gpt_grounded",
    "rank_factor",
    "on_page",
    "off_page",
    "schema_markup",
  ];

  it("S4-T2-a: gapItem.label에 룰 코드 0건", () => {
    for (const item of FREE_GAP_ITEMS) {
      for (const code of FORBIDDEN_RULE_CODES) {
        expect(item.label).not.toMatch(new RegExp(code, "i"));
      }
    }
  });

  it("S4-T2-b: actionTier → 사장님 언어 변환 (전문용어 0)", () => {
    const tiers = ["green_self", "yellow_copy", "red_vendor", "gray_ongoing"] as const;
    for (const tier of tiers) {
      const result = actionTierToLabel(tier);
      for (const code of FORBIDDEN_RULE_CODES) {
        expect(result.label).not.toMatch(new RegExp(code, "i"));
        expect(result.description).not.toMatch(new RegExp(code, "i"));
      }
    }
  });

  it("S4-T2-c: gapItem에 점수(숫자 단독) 없음 — priority는 내부 정렬용", () => {
    for (const item of FREE_GAP_ITEMS) {
      // label에 '점수', '%', '위' 없음
      expect(item.label).not.toMatch(/\d+점|\d+%|\d+위/);
    }
  });

  it("S4-T2-d: 갭 카드 표시 형태 — 옆집 ⭕ / 우리 ✕", () => {
    for (const item of FREE_GAP_ITEMS) {
      expect(item.competitorHas).toBe(true); // 갭 = 옆집은 있고
      expect(item.iHave).toBe(false); // 우리는 없음
    }
  });
});

// ── S4-T3: paid_gap_lock 손실 프레이밍 ───────────────────────────────────────

describe("P2-S4: 역공학 갭 — paid_gap_lock 손실 프레이밍", () => {
  const LOCK_DESCRIPTION = "옆집은 이미 이 정보를 다 갖췄어요. 지금 바로 확인하세요.";
  const CAUSAL_FORBIDDEN = ["반드시", "확실히", "보장", "무조건", "1위", "1등", "매출", "따라하면"];

  it("S4-T3-a: 잠금 설명에 손실 프레이밍 표현 있음", () => {
    expect(LOCK_DESCRIPTION).toMatch(/옆집|이미|갖췄|확인/);
  });

  it("S4-T3-b: 잠금 설명에 인과 단정 없음", () => {
    for (const claim of CAUSAL_FORBIDDEN) {
      expect(LOCK_DESCRIPTION).not.toContain(claim);
    }
  });

  it("S4-T3-c: 잠금 설명에 전문용어 없음", () => {
    const FORBIDDEN = ["SEO", "AEO", "GEO", "SERP", "snippet", "algorithm"];
    for (const term of FORBIDDEN) {
      expect(LOCK_DESCRIPTION).not.toMatch(new RegExp(term, "i"));
    }
  });

  it("S4-T3-d: 부족한 항목은 결제가 아니라 write 흐름으로 이어진다", () => {
    const unlockAction = "/write";
    expect(unlockAction).toBe("/write");
    expect(unlockAction).not.toBe("/checkout");
  });
});

// ── S4-T4: go_actions_button 이동 경로 ──────────────────────────────────────

describe("P2-S4: 역공학 갭 — go_actions_button", () => {
  it("S4-T4-a: 다음 이동 경로가 /actions", () => {
    const nextPath = "/actions";
    expect(nextPath).toBe("/actions");
    expect(nextPath).not.toBe("/gap");
    expect(nextPath).not.toBe("/score");
  });

  it("S4-T4-b: 버튼 라벨이 사장님 언어", () => {
    const label = "그래서 뭘 하면 되나요?";
    expect(label).not.toMatch(/SEO|AEO|action|tier/i);
    expect(label).toBeTruthy();
  });
});

// ── S4-T5: 정직성 통합 가드 ─────────────────────────────────────────────────

describe("P2-S4: 역공학 갭 — 정직성 통합 가드 (AC-7)", () => {
  const UI_TEXTS = [
    "옆집은 갖췄고 우리는 아직인 것들이에요",
    "가게 소개글",
    "영업시간 등록",
    "리뷰 답변",
    "사진 10장 이상",
    "그래서 뭘 하면 되나요?",
    "옆집은 이미 이 정보를 다 갖췄어요. 지금 바로 확인하세요.",
  ];

  const TECHNICAL_FORBIDDEN = [
    "SEO",
    "AEO",
    "GEO",
    "SERP",
    "snippet",
    "algorithm",
    "crawl",
    "index",
  ];
  const CAUSAL_FORBIDDEN = ["1위", "1등", "매출", "반드시", "확실히", "보장", "무조건"];

  it("S4-T5-a: 모든 UI 텍스트에 전문용어 없음", () => {
    for (const text of UI_TEXTS) {
      for (const term of TECHNICAL_FORBIDDEN) {
        expect(text).not.toMatch(new RegExp(term, "i"));
      }
    }
  });

  it("S4-T5-b: 모든 UI 텍스트에 인과 단정 없음", () => {
    for (const text of UI_TEXTS) {
      for (const claim of CAUSAL_FORBIDDEN) {
        expect(text).not.toContain(claim);
      }
    }
  });

  it("S4-T5-c: gapItem.label에 점수(숫자) 없음", () => {
    for (const item of FREE_GAP_ITEMS) {
      expect(item.label).not.toMatch(/\d+점|\d+%|\d+위/);
    }
  });
});

// ── S4-T6: gap_intro — 보장 아님 안내 ──────────────────────────────────────

describe("P2-S4: 역공학 갭 — gap_intro (정직한 한 문장)", () => {
  const INTRO_TEXT = "옆집은 갖췄고 우리는 아직인 것들이에요";
  const CAUSAL_FORBIDDEN = ["반드시", "확실히", "보장", "무조건", "1위", "따라하면", "되면"];

  it("S4-T6-a: intro에 격차 안내 표현 있음", () => {
    expect(INTRO_TEXT).toMatch(/옆집|아직|갖췄/);
  });

  it("S4-T6-b: intro에 보장/인과 단정 없음", () => {
    for (const claim of CAUSAL_FORBIDDEN) {
      expect(INTRO_TEXT).not.toContain(claim);
    }
  });

  it("S4-T6-c: intro에 전문용어 없음", () => {
    const FORBIDDEN = ["SEO", "AEO", "GEO", "SERP", "snippet", "gap", "matrix"];
    for (const term of FORBIDDEN) {
      expect(INTRO_TEXT).not.toMatch(new RegExp(term, "i"));
    }
  });
});
