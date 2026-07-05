// @TASK P1-R2 - 신호등 변환 parity (전달 레이어 ↔ 엔진 scoreToHealthBand)
// @SPEC docs/planning/07-coding-convention.md §4 (점수 → 신호등 변환)
//
// 전달 레이어(앱)의 scoreToSignal 이 엔진 scoreToHealthBand 와 동일한 임계값을
// 유지하는지 고정한다. (앱 읽기 경로는 엔진을 import 하지 않지만, 테스트에서는
// 두 구현의 일치를 보장해 분기(drift)를 막는다.)

import { scoreToHealthBand } from "@boina/engine";
import { describe, expect, it } from "vitest";
import { scoreToSignal } from "../../lib/diagnosis/signal.js";

describe("scoreToSignal parity (P1-R2)", () => {
  it("0~100 전 구간에서 엔진 scoreToHealthBand 와 동일하다", () => {
    for (let s = 0; s <= 100; s++) {
      expect(scoreToSignal(s)).toBe(scoreToHealthBand(s));
    }
  });

  it("비정상 값(음수/NaN)도 엔진과 동일하게 poor 로 처리한다", () => {
    expect(scoreToSignal(-1)).toBe(scoreToHealthBand(-1));
    expect(scoreToSignal(Number.NaN)).toBe(scoreToHealthBand(Number.NaN));
  });
});
