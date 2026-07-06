// @TASK P1-S0 - enum→UI 변환 함수 TDD (RED→GREEN)
// @SPEC specs/shared/types.yaml (Signal/Channel/ActionTier/AssetType → 사장님 언어)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드 — 전문용어 0·점수 비노출)
// @TEST apps/web/tests/shared/ui-labels.test.ts
//
// 정직성 가드 핵심 계약:
//   1. 전문용어(SEO/AEO/GEO/snippet) 절대 노출 금지
//   2. 점수(number) → 신호등 only (숫자 노출 금지)
//   3. 인과 단정("고치면 1위") 금지

import { describe, expect, it } from "vitest";
import {
  SIGNAL_EMOJI,
  actionTierToLabel,
  assetTypeToLabel,
  channelToLabel,
  diagnosisStatusToLabel,
  signalToLabel,
} from "../../lib/shared/ui-labels";

// ── Signal ──────────────────────────────────────────────────────────────────
describe("signalToLabel (P1-S0 정직성 가드)", () => {
  it("green → 사장님 언어 한 줄 (전문용어 없음)", () => {
    const result = signalToLabel("green");
    expect(result.emoji).toBe("good");
    expect(result.summary).toBeTruthy();
    // 전문용어 노출 금지
    expect(result.summary).not.toMatch(/SEO|AEO|GEO|snippet|스니펫/i);
    // 인과 단정 금지
    expect(result.summary).not.toMatch(/1위|매출\s*↑|매출\s*오름|반드시|확실히/);
  });

  it("yellow → 사장님 언어 한 줄 (전문용어 없음)", () => {
    const result = signalToLabel("yellow");
    expect(result.emoji).toBe("watch");
    expect(result.summary).toBeTruthy();
    expect(result.summary).not.toMatch(/SEO|AEO|GEO|snippet/i);
    expect(result.summary).not.toMatch(/1위|매출\s*↑/);
  });

  it("red → 사장님 언어 한 줄 (전문용어 없음)", () => {
    const result = signalToLabel("red");
    expect(result.emoji).toBe("wait");
    expect(result.summary).toBeTruthy();
    expect(result.summary).not.toMatch(/SEO|AEO|GEO|snippet/i);
    expect(result.summary).not.toMatch(/1위|매출\s*↑/);
  });

  it("SIGNAL_EMOJI 맵이 green/yellow/red 텍스트 토큰으로 포함한다", () => {
    expect(SIGNAL_EMOJI.green).toBe("good");
    expect(SIGNAL_EMOJI.yellow).toBe("watch");
    expect(SIGNAL_EMOJI.red).toBe("wait");
    for (const value of Object.values(SIGNAL_EMOJI)) {
      expect(value).not.toMatch(/\p{Emoji_Presentation}/u);
    }
  });
});

// ── SignalLight props 계약: number score 절대 받지 않음 ─────────────────────
describe("SignalLight props 계약 — 점수 number 차단", () => {
  it("signalToLabel 은 signal string만 받는다 (number 파라미터 없음)", () => {
    // signalToLabel('green') — string enum값만 허용
    expect(() => signalToLabel("green")).not.toThrow();
    expect(() => signalToLabel("yellow")).not.toThrow();
    expect(() => signalToLabel("red")).not.toThrow();
  });

  it("signalToLabel 반환값에 점수 필드(score/number)가 없다", () => {
    const result = signalToLabel("green");
    const obj = result as unknown as Record<string, unknown>;
    // score 필드가 있으면 안 됨
    expect(obj.score).toBeUndefined();
    expect(obj.number).toBeUndefined();
    expect(obj.value).toBeUndefined();
  });
});

// ── Channel ─────────────────────────────────────────────────────────────────
describe("channelToLabel (P1-S0)", () => {
  it("naver → 네이버 (전문용어 없음)", () => {
    const result = channelToLabel("naver");
    expect(result.label).toBeTruthy();
    expect(result.label).not.toMatch(/SEO|AEO|GEO|SERP/i);
  });

  it("google → 구글 맛보기 계열 (전문용어 없음)", () => {
    const result = channelToLabel("google");
    expect(result.label).toBeTruthy();
    expect(result.label).not.toMatch(/SEO|AEO|GEO/i);
  });

  it("ai → AI 추천 계열 (전문용어 없음)", () => {
    const result = channelToLabel("ai");
    expect(result.label).toBeTruthy();
    expect(result.label).not.toMatch(/AEO|GEO|geo/);
  });
});

// ── ActionTier ───────────────────────────────────────────────────────────────
describe("actionTierToLabel (P1-S0)", () => {
  it("green_self → 직접 5분 무료 (전문용어 없음)", () => {
    const result = actionTierToLabel("green_self");
    expect(result.emoji).toBe("self");
    expect(result.label).not.toMatch(/SEO|AEO|snippet/i);
  });

  it("yellow_copy → 복붙 계열 (전문용어 없음)", () => {
    const result = actionTierToLabel("yellow_copy");
    expect(result.emoji).toBe("copy");
    expect(result.label).not.toMatch(/SEO|snippet/i);
  });

  it("red_vendor → 도움 받기 계열", () => {
    const result = actionTierToLabel("red_vendor");
    expect(result.emoji).toBe("help");
    expect(result.label).toBe("업체 도움 받기");
  });

  it("gray_ongoing → 꾸준히 계열", () => {
    const result = actionTierToLabel("gray_ongoing");
    expect(result.emoji).toBe("ongoing");
  });
});

// ── AssetType ────────────────────────────────────────────────────────────────
describe("assetTypeToLabel (P1-S0)", () => {
  it("snippet → 전문용어 없이 사장님 언어", () => {
    const result = assetTypeToLabel("snippet");
    // 'snippet' 영어 단어가 노출 label에 없어야 함
    expect(result.label).not.toMatch(/snippet/i);
  });

  it("place_intro → 사장님 언어", () => {
    const result = assetTypeToLabel("place_intro");
    expect(result.label).toBeTruthy();
  });

  it("review_request → 사장님 언어", () => {
    const result = assetTypeToLabel("review_request");
    expect(result.label).toBeTruthy();
  });

  it("vendor_prescription → 사장님 언어 (전문용어 없음)", () => {
    const result = assetTypeToLabel("vendor_prescription");
    expect(result.label).not.toMatch(/prescription/i);
  });
});

// ── DiagnosisStatus ──────────────────────────────────────────────────────────
describe("diagnosisStatusToLabel (P1-S0)", () => {
  it("queued → 준비 중 계열", () => {
    const result = diagnosisStatusToLabel("queued");
    expect(result.label).toBeTruthy();
  });

  it("running → 살펴보는 중 계열", () => {
    const result = diagnosisStatusToLabel("running");
    expect(result.label).toBeTruthy();
  });

  it("done → 다 봤어요 계열", () => {
    const result = diagnosisStatusToLabel("done");
    expect(result.label).toBeTruthy();
  });

  it("failed → 잠깐 멈췄어요 계열", () => {
    const result = diagnosisStatusToLabel("failed");
    expect(result.label).toBeTruthy();
  });
});
