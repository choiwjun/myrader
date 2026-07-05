// @TASK P1-S0-V — 정직성 가드 회귀 테스트 (G-HONESTY 횡단 게이트)
// @SPEC docs/planning/08-derived-gates.md (G-HONESTY)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드)
// @SPEC docs/planning/07-coding-convention.md §4 (점수 비노출, 전문용어 0, 인과 금지)
//
// 정직성 가드 회귀 테스트: 공통 컴포넌트·변환 함수의 *모든* 출력에서
// (a) 점수 숫자 0건
// (b) 전문용어(SEO/AEO/GEO/snippet/SERP/etc) 0건
// (c) 인과 단정("1위/매출↑/반드시" 등) 0건
// 을 강하게 검증한다. 이후 회귀 방지용 가드로 항상 실행.
//
// RED 의도: ui-labels 함수나 SignalLight 컴포넌트가 위 규칙을 위반하면 실패.
// GREEN: 모든 enum 변환 결과가 정직성 기준을 만족.

import { describe, expect, it } from "vitest";
import {
  type ActionTier,
  type AssetType,
  type Channel,
  type DiagnosisStatus,
  type Signal,
  actionTierToLabel,
  assetTypeToLabel,
  channelToLabel,
  diagnosisStatusToLabel,
  signalToLabel,
} from "../../lib/shared/ui-labels";

describe("P1-S0-V: 정직성 가드 회귀 테스트 (G-HONESTY)", () => {
  // 회귀 리스트: 절대 노출 금지 단어들
  const forbiddenTechnicalTerms = [
    "SEO",
    "seo",
    "AEO",
    "aeo",
    "GEO",
    "geo",
    "snippet",
    "SERP",
    "serp",
    "algorithm",
    "keyword",
    "ranking",
    "score",
    "점수",
    "스코어",
    "스니펫",
  ];

  const forbiddenCausalClaims = [
    "1위",
    "1등",
    "일등",
    "매출",
    "수익",
    "반드시",
    "확실히",
    "보장",
    "무조건",
    "필수",
    "꼭",
  ];

  describe("(a) 점수 숫자 노출 0건 — 신호등만 허용", () => {
    it("signalToLabel: number/score 필드 없음", () => {
      const signals: Signal[] = ["green", "yellow", "red"];
      for (const signal of signals) {
        const result = signalToLabel(signal);
        const obj = result as unknown as Record<string, unknown>;
        expect(obj.score).toBeUndefined();
        expect(obj.number).toBeUndefined();
        expect(obj.value).toBeUndefined();
        expect(obj.percentage).toBeUndefined();
      }
    });

    it("channelToLabel: 점수 필드 없음", () => {
      const channels: Channel[] = ["naver", "google", "ai"];
      for (const channel of channels) {
        const result = channelToLabel(channel);
        const obj = result as unknown as Record<string, unknown>;
        expect(obj.score).toBeUndefined();
        expect(obj.number).toBeUndefined();
      }
    });

    it("actionTierToLabel: 점수 필드 없음", () => {
      const tiers: ActionTier[] = ["green_self", "yellow_copy", "red_vendor", "gray_ongoing"];
      for (const tier of tiers) {
        const result = actionTierToLabel(tier);
        const obj = result as unknown as Record<string, unknown>;
        expect(obj.score).toBeUndefined();
        expect(obj.number).toBeUndefined();
      }
    });

    it("assetTypeToLabel: 점수 필드 없음", () => {
      const assets: AssetType[] = [
        "snippet",
        "place_intro",
        "review_request",
        "vendor_prescription",
      ];
      for (const asset of assets) {
        const result = assetTypeToLabel(asset);
        const obj = result as unknown as Record<string, unknown>;
        expect(obj.score).toBeUndefined();
        expect(obj.number).toBeUndefined();
      }
    });

    it("diagnosisStatusToLabel: 진행률(%) 같은 수치 없음", () => {
      const statuses: DiagnosisStatus[] = ["queued", "running", "done", "failed"];
      for (const status of statuses) {
        const result = diagnosisStatusToLabel(status);
        const obj = result as unknown as Record<string, unknown>;
        expect(obj.progress).toBeUndefined();
        expect(obj.percentage).toBeUndefined();
      }
    });

    it("label/summary/description 에 숫자 %% 패턴 없음", () => {
      const signals: Signal[] = ["green", "yellow", "red"];
      for (const signal of signals) {
        const result = signalToLabel(signal);
        expect(result.summary).not.toMatch(/\d+%|\d+\/100|점수/);
      }
    });
  });

  describe("(b) 전문용어(SEO/AEO/GEO/snippet/SERP 등) 0건", () => {
    it("signalToLabel: 금지 용어 0건", () => {
      const signals: Signal[] = ["green", "yellow", "red"];
      for (const signal of signals) {
        const result = signalToLabel(signal);
        for (const term of forbiddenTechnicalTerms) {
          expect(result.emoji).not.toMatch(new RegExp(`\\b${term}\\b`, "i"));
          expect(result.summary).not.toMatch(new RegExp(`\\b${term}\\b`, "i"));
        }
      }
    });

    it("channelToLabel: 금지 용어 0건 (특히 SERP/SEO/AEO/GEO)", () => {
      const channels: Channel[] = ["naver", "google", "ai"];
      for (const channel of channels) {
        const result = channelToLabel(channel);
        expect(result.label).not.toMatch(/SERP|SEO|AEO|GEO|algorithm|keyword/i);
        expect(result.description).not.toMatch(/SERP|SEO|AEO|GEO/i);
      }
    });

    it("actionTierToLabel: 금지 용어 0건 (특히 snippet/SEO)", () => {
      const tiers: ActionTier[] = ["green_self", "yellow_copy", "red_vendor", "gray_ongoing"];
      for (const tier of tiers) {
        const result = actionTierToLabel(tier);
        expect(result.label).not.toMatch(/snippet|SEO|AEO|algorithm/i);
        expect(result.description).not.toMatch(/snippet|SEO/i);
      }
    });

    it("assetTypeToLabel: snippet 절대 노출 금지", () => {
      const result = assetTypeToLabel("snippet");
      expect(result.label).not.toMatch(/snippet/i);
      expect(result.description).not.toMatch(/snippet/i);
    });

    it("assetTypeToLabel(vendor_prescription): prescription 영어 노출 금지", () => {
      const result = assetTypeToLabel("vendor_prescription");
      expect(result.label).not.toMatch(/prescription/i);
    });

    it("diagnosisStatusToLabel: 기술용어 0건", () => {
      const statuses: DiagnosisStatus[] = ["queued", "running", "done", "failed"];
      for (const status of statuses) {
        const result = diagnosisStatusToLabel(status);
        expect(result.label).not.toMatch(
          /queued|running|completed|failed|error|failure|processing|diagnostic/i,
        );
        expect(result.description).not.toMatch(/queued|running|processing/i);
      }
    });
  });

  describe("(c) 인과 단정 (1위/매출상승/반드시 등) 0건", () => {
    it("signalToLabel: 인과 단정 0건 (green/yellow/red 모두)", () => {
      const signals: Signal[] = ["green", "yellow", "red"];
      for (const signal of signals) {
        const result = signalToLabel(signal);
        for (const claim of forbiddenCausalClaims) {
          expect(result.summary).not.toMatch(new RegExp(`${claim}`, "g"));
        }
      }
    });

    it("channelToLabel: 인과 보장 없음 (잘 보여요 같은 조건부 표현만)", () => {
      const channels: Channel[] = ["naver", "google", "ai"];
      for (const channel of channels) {
        const result = channelToLabel(channel);
        // "반드시 나타날 거야" "확실히 보여요" 금지
        expect(result.label).not.toMatch(/반드시|확실히|무조건|보장/);
        expect(result.description).not.toMatch(/1위|일등|매출/);
      }
    });

    it("actionTierToLabel: 효과 단정 금지 (수행 방법만 설명)", () => {
      const tiers: ActionTier[] = ["green_self", "yellow_copy", "red_vendor", "gray_ongoing"];
      for (const tier of tiers) {
        const result = actionTierToLabel(tier);
        // "이렇게 하면 1위가 돼요" 금지
        // "이렇게 하면 더 잘 보여요" 같은 조건부는 가능하지만 인과 강조 금지
        expect(result.description).not.toMatch(/반드시|확실히|무조건|1위|매출증가/);
      }
    });

    it("diagnosisStatusToLabel: 상태 설명만 (시간 예측 같은 인과 금지)", () => {
      const statuses: DiagnosisStatus[] = ["queued", "running", "done", "failed"];
      for (const status of statuses) {
        const result = diagnosisStatusToLabel(status);
        // "5분 안에 끝날 거야" 같은 인과 보장 금지
        // "잠깐만요" 같은 응원은 OK
        expect(result.description).not.toMatch(/반드시|무조건|보장|5분|완벽/);
      }
    });
  });

  describe("정직성 강화: 응원 톤은 유지하되 과장 금지", () => {
    it("red signal: 응원(함께 고쳐보자)은 유지, 비난(당신이 못했다) 없음", () => {
      const result = signalToLabel("red");
      expect(result.summary).toMatch(/같이|함께|고쳐/);
      expect(result.summary).not.toMatch(/못|부족|안 좋|나쁨/);
    });

    it("failed status: 응원(다시 시도/걱정 마)은 유지, 비난(오류/실패) 없음", () => {
      const result = diagnosisStatusToLabel("failed");
      expect(result.description).toMatch(/다시|걱정|시도/);
      expect(result.description).not.toMatch(/오류|실패|문제|잘못/);
    });

    it("yellow signal: 개선 필요를 긍정적으로 프레이밍", () => {
      const result = signalToLabel("yellow");
      // "더 잘 보일 수 있어요" (긍정) vs "부족해요" (비난)
      expect(result.summary).toMatch(/더|채우|잘/);
    });
  });

  describe("회귀 테스트: 통합 신호", () => {
    it("모든 변환 함수의 모든 enum 값이 정직성 기준을 만족", () => {
      // 이 테스트는 위의 모든 케이스를 한 번에 검증하는 통합 신호.
      // CI/CD 에서 always run (회귀 방지).
      const signals: Signal[] = ["green", "yellow", "red"];
      const channels: Channel[] = ["naver", "google", "ai"];
      const tiers: ActionTier[] = ["green_self", "yellow_copy", "red_vendor", "gray_ongoing"];
      const assets: AssetType[] = [
        "snippet",
        "place_intro",
        "review_request",
        "vendor_prescription",
      ];
      const statuses: DiagnosisStatus[] = ["queued", "running", "done", "failed"];

      // 점수, 전문용어, 인과 기준 적용
      const checkHonesty = (text: string, context: string) => {
        // 점수 0건
        expect(text, `${context}: 점수 패턴 노출`).not.toMatch(
          /\d+%|\d+\/100|점수|스코어|score|number/i,
        );
        // 전문용어 0건
        for (const term of forbiddenTechnicalTerms) {
          expect(text, `${context}: ${term}`).not.toMatch(new RegExp(`\\b${term}\\b`, "i"));
        }
        // 인과 단정 0건
        for (const claim of forbiddenCausalClaims) {
          expect(text, `${context}: ${claim}`).not.toMatch(new RegExp(`${claim}`, "g"));
        }
      };

      for (const signal of signals) {
        const result = signalToLabel(signal);
        checkHonesty(result.emoji + result.summary, `signal:${signal}`);
      }

      for (const channel of channels) {
        const result = channelToLabel(channel);
        checkHonesty(result.label + result.description, `channel:${channel}`);
      }

      for (const tier of tiers) {
        const result = actionTierToLabel(tier);
        checkHonesty(result.label + result.description, `tier:${tier}`);
      }

      for (const asset of assets) {
        const result = assetTypeToLabel(asset);
        checkHonesty(result.label + result.description, `asset:${asset}`);
      }

      for (const status of statuses) {
        const result = diagnosisStatusToLabel(status);
        checkHonesty(result.label + result.description, `status:${status}`);
      }
    });
  });
});
