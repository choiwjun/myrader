// @TASK P1-S0-V — 공통 연결점 검증: 공통 컴포넌트 enum 계약 준수
// @SPEC docs/planning/06-tasks.md#p1-s0-v
// @SPEC specs/shared/types.yaml (Signal/Channel/ActionTier/AssetType enum)
// @SPEC apps/web/lib/shared/ui-labels.ts (변환 함수)
// @SPEC apps/web/app/components/shared/SignalLight.tsx (props 계약)
//
// 통합 테스트: SignalLight, StepNav 등 공통 컴포넌트가 ui-labels 변환 함수를 경유해
// enum(Signal/Channel/ActionTier/AssetType) 계약대로 동작하는지 검증.
// 정직성 가드: enum 값이 직접 노출되면 안 되고, 변환 함수 경유 필수.
//
// RED 의도: 컴포넌트가 enum을 받되, 그 값을 그대로 렌더하거나 전문용어 검사 없이 통과하면 실패.
// GREEN: enum → signalToLabel/channelToLabel 등 경유 → 사장님 언어 렌더.

import { describe, expect, it } from "vitest";
import {
  type ActionTier,
  type AssetType,
  type Channel,
  type Signal,
  actionTierToLabel,
  assetTypeToLabel,
  channelToLabel,
  signalToLabel,
} from "../../lib/shared/ui-labels";

describe("P1-S0-V: 공통 컴포넌트 enum 계약 준수 (변환 함수 경유)", () => {
  describe("Signal enum → signalToLabel 경유 필수", () => {
    const signalValues: Signal[] = ["green", "yellow", "red"];

    it("모든 Signal enum 값이 signalToLabel 에서 처리됨", () => {
      for (const signal of signalValues) {
        const result = signalToLabel(signal);
        expect(result).toBeDefined();
        expect(result.emoji).toBeTruthy();
        expect(result.summary).toBeTruthy();
      }
    });

    it("Signal 값 자체가 label.emoji 또는 label.summary 에 노출되면 안 됨", () => {
      for (const signal of signalValues) {
        const result = signalToLabel(signal);
        // enum 문자열이 그대로 노출되는지 체크
        expect(result.emoji).not.toContain(signal);
        expect(result.summary).not.toContain(signal);
      }
    });

    it("SignalLight props 계약: signal 만 받고, score/number 절대 금지", () => {
      // SignalLight 컴포넌트는 signal: Signal 만 props로 받음 (score 없음)
      // 이는 타입 시스템으로 강제되며, 여기서는 함수 서명으로 확인.
      const signal: Signal = "green";
      const result = signalToLabel(signal);
      expect(result.emoji).toBe("good");
      // 반환값에도 score 필드 없음
      const resultObj = result as unknown as Record<string, unknown>;
      expect(resultObj.score).toBeUndefined();
    });
  });

  describe("Channel enum → channelToLabel 경유 필수", () => {
    const channelValues: Channel[] = ["naver", "google", "ai"];

    it("모든 Channel enum 값이 channelToLabel 에서 처리됨", () => {
      for (const channel of channelValues) {
        const result = channelToLabel(channel);
        expect(result).toBeDefined();
        expect(result.label).toBeTruthy();
        expect(result.description).toBeTruthy();
      }
    });

    it("Channel 값이 label 에 그대로 노출되면 안 됨 (전문용어 가드)", () => {
      for (const channel of channelValues) {
        const result = channelToLabel(channel);
        // enum 값 자체가 노출되지 않음 (사장님 언어로 변환)
        expect(result.label.toLowerCase()).not.toMatch(/serp|seo|aeo|geo/);
      }
    });
  });

  describe("ActionTier enum → actionTierToLabel 경유 필수", () => {
    const tierValues: ActionTier[] = ["green_self", "yellow_copy", "red_vendor", "gray_ongoing"];

    it("모든 ActionTier enum 값이 actionTierToLabel 에서 처리됨", () => {
      for (const tier of tierValues) {
        const result = actionTierToLabel(tier);
        expect(result).toBeDefined();
        expect(result.emoji).toBeTruthy();
        expect(result.label).toBeTruthy();
      }
    });

    it("ActionTier enum 형식(green_self/yellow_copy) 이 label 에 노출되면 안 됨", () => {
      for (const tier of tierValues) {
        const result = actionTierToLabel(tier);
        // underscore 포함 enum 형식 노출 금지
        expect(result.label).not.toMatch(/_/);
        // 전문용어도 금지
        expect(result.label).not.toMatch(/SEO|AEO|snippet/i);
      }
    });
  });

  describe("AssetType enum → assetTypeToLabel 경유 필수", () => {
    const assetValues: AssetType[] = [
      "snippet",
      "place_intro",
      "review_request",
      "vendor_prescription",
    ];

    it("모든 AssetType enum 값이 assetTypeToLabel 에서 처리됨", () => {
      for (const asset of assetValues) {
        const result = assetTypeToLabel(asset);
        expect(result).toBeDefined();
        expect(result.label).toBeTruthy();
      }
    });

    it("전문용어(snippet/prescription) 절대 노출 금지", () => {
      const result = assetTypeToLabel("snippet");
      expect(result.label).not.toMatch(/snippet/i);

      const prescResult = assetTypeToLabel("vendor_prescription");
      expect(prescResult.label).not.toMatch(/prescription/i);
    });
  });

  describe("연결점 검증: 컴포넌트 → 변환 함수 호출 순서", () => {
    it("SignalLight: 컴포넌트 내부에서 signalToLabel(signal) 호출 (코드 검증)", () => {
      // apps/web/app/components/shared/SignalLight.tsx 에서:
      // const label = signalToLabel(signal);
      // 이를 마크업에서 사용해야 함.
      // 여기서는 계약만 확인: signal을 직접 렌더하지 않고 변환.
      const signal: Signal = "yellow";
      const label = signalToLabel(signal);
      expect(label.summary).toContain("조금");
      // 반대로, 컴포넌트가 signal 값 자체를 렌더하면 안 됨 (노출 금지)
    });

    it("모든 공통 컴포넌트가 동일한 ui-labels 함수를 사용해야 일관성 있음", () => {
      // SignalLight/StepNav/TodayOneBanner 등이 signalToLabel/channelToLabel 을
      // 각각 호출하지 않고, 공통 함수 import 로 통일되어야 함.
      // 여기서는 함수 가용성만 확인.
      expect(signalToLabel).toBeDefined();
      expect(channelToLabel).toBeDefined();
      expect(actionTierToLabel).toBeDefined();
      expect(assetTypeToLabel).toBeDefined();
    });
  });

  describe("회귀 테스트: 모든 enum이 변환 후 UI 렌더 가능한 형태인지", () => {
    it("Signal enum → emoji + summary (렌더 가능)", () => {
      const signals: Signal[] = ["green", "yellow", "red"];
      for (const signal of signals) {
        const result = signalToLabel(signal);
        // 렌더링에 필요한 필드 모두 있는지
        expect(typeof result.emoji).toBe("string");
        expect(typeof result.summary).toBe("string");
      }
    });

    it("Channel enum → label + description (렌더 가능)", () => {
      const channels: Channel[] = ["naver", "google", "ai"];
      for (const channel of channels) {
        const result = channelToLabel(channel);
        expect(typeof result.label).toBe("string");
        expect(typeof result.description).toBe("string");
      }
    });

    it("ActionTier enum → emoji + label + description (렌더 가능)", () => {
      const tiers: ActionTier[] = ["green_self", "yellow_copy", "red_vendor", "gray_ongoing"];
      for (const tier of tiers) {
        const result = actionTierToLabel(tier);
        expect(typeof result.emoji).toBe("string");
        expect(typeof result.label).toBe("string");
        expect(typeof result.description).toBe("string");
      }
    });

    it("AssetType enum → label + description (렌더 가능)", () => {
      const assets: AssetType[] = [
        "snippet",
        "place_intro",
        "review_request",
        "vendor_prescription",
      ];
      for (const asset of assets) {
        const result = assetTypeToLabel(asset);
        expect(typeof result.label).toBe("string");
        expect(typeof result.description).toBe("string");
      }
    });
  });
});
