// @TASK S4-FIX - gap actionTier(self_fix|snippet|vendor|ongoing) → UI 4분류(green_self 등) 정합
// @SPEC apps/web/lib/shared/ui-labels.ts (actionTierToLabel — 4분류 사장님 언어)
// @SPEC apps/web/lib/diagnosis/gap-service.ts (GapActionTier — 도메인 actionTier)
// @TEST apps/web/tests/diagnosis/gap-actiontier-class.test.ts
//
// 버그 1 회귀 가드: S4 /gap 화면이 gapItem.actionTier(도메인값 self_fix 등)를 그대로
// actionTierToLabel(UI enum green_self 기대)에 넣어 undefined.emoji 크래시가 났다.
// 근본 수정: gap-service 가 도메인 actionTier → UI 4분류로 변환하는 단일 함수를 노출하고,
// 변환 결과는 항상 actionTierToLabel 이 라벨을 돌려주는 값(undefined 0)이어야 한다.

import { describe, expect, it } from "vitest";
import { type GapActionTier, gapActionTierToClass } from "../../lib/diagnosis/gap-service.js";
import { type ActionTier, actionTierToLabel } from "../../lib/shared/ui-labels.js";

describe("gapActionTierToClass — 도메인 actionTier → UI 4분류(green_self 등)", () => {
  it("self_fix→green_self, snippet→yellow_copy, vendor→red_vendor, ongoing→gray_ongoing", () => {
    const cases: [GapActionTier, ActionTier][] = [
      ["self_fix", "green_self"],
      ["snippet", "yellow_copy"],
      ["vendor", "red_vendor"],
      ["ongoing", "gray_ongoing"],
    ];
    for (const [domain, ui] of cases) {
      expect(gapActionTierToClass(domain)).toBe(ui);
    }
  });

  it("변환 결과는 항상 actionTierToLabel 이 라벨을 돌려준다(undefined 0 — 크래시 가드)", () => {
    const all: GapActionTier[] = ["self_fix", "snippet", "vendor", "ongoing"];
    for (const domain of all) {
      const cls = gapActionTierToClass(domain);
      const label = actionTierToLabel(cls);
      expect(label).toBeDefined();
      expect(label.emoji).toBeTruthy();
      expect(label.label).toBeTruthy();
    }
  });
});

describe("actionTierToLabel — enum 밖 값은 라벨링하지 않고 경계에서 걸러낸다", () => {
  it("도메인 actionTier를 직접 넘기면 조용한 할 일 라벨 대신 오류로 드러난다", () => {
    const unknowns = ["self_fix", "snippet", "vendor", "ongoing", "???"];
    for (const u of unknowns) {
      expect(() => actionTierToLabel(u as ActionTier)).toThrow(/Unknown action tier/);
    }
  });

  it("도메인 actionTier는 gapActionTierToClass 경계를 통과한 뒤에만 라벨링된다", () => {
    const domain: GapActionTier = "snippet";
    const uiTier = gapActionTierToClass(domain);

    expect(uiTier).toBe("yellow_copy");
    expect(actionTierToLabel(uiTier).label).toBe("복붙");
  });
});
