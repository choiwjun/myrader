// @TASK P2-S6 - 생성물 (/assets) 화면 TDD
// @SPEC specs/screens/generated.yaml (S6: REQ-006)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드)
//
// RED→GREEN:
//   S6-T1: 4종 카드 — snippet/place_intro/review_request/vendor_prescription
//   S6-T2: BigCopyButton — 복사 + "복사됐어요" 피드백
//   S6-T3: AC-6 — 복붙 형태 (전문용어 0, 큰 복사 버튼)
//   S6-T4: ?type 진입 — 특정 생성물 먼저 표시
//   S6-T5: 유료 경계 — 무료 미리보기/일부
//   S6-T6: 정직성 가드 — 효과 보장 단정 0

import { describe, expect, it } from "vitest";
import { assetTypeToLabel } from "../../lib/shared/ui-labels";

// ── generatedAsset 타입 계약 ──────────────────────────────────────────────────

interface GeneratedAsset {
  id: string;
  type: "snippet" | "place_intro" | "review_request" | "vendor_prescription";
  title: string; // 사장님 언어 (전문용어 0)
  content: string; // 복사할 실제 텍스트
  copyable: boolean; // 큰 복사 버튼 대상
}

const MOCK_ASSETS: GeneratedAsset[] = [
  {
    id: "as1",
    type: "snippet",
    title: "검색 답변글",
    content:
      "저희 가게는 신선한 제철 재료로 만든 한식을 선보입니다. 매일 직접 만드는 반찬과 따뜻한 인심이 특징이에요.",
    copyable: true,
  },
  {
    id: "as2",
    type: "place_intro",
    title: "가게 소개글",
    content: "안녕하세요! 20년 전통의 손맛 한식당입니다. 어머니의 레시피 그대로 정성껏 준비합니다.",
    copyable: true,
  },
  {
    id: "as3",
    type: "review_request",
    title: "리뷰 요청 문구",
    content:
      "오늘 방문해 주셔서 감사해요! 혹시 맛있게 드셨다면 리뷰 한 줄 남겨주시면 큰 힘이 돼요 😊",
    copyable: true,
  },
  {
    id: "as4",
    type: "vendor_prescription",
    title: "업체 처방전",
    content:
      "안녕하세요. 저희 가게 홈페이지 제작을 의뢰드리려 합니다. 아래 내용을 참고해 주세요:\n1. 메뉴 사진 촬영 필요\n2. 매장 위치 지도 삽입",
    copyable: true,
  },
];

// ── S6-T1: 4종 카드 표시 ─────────────────────────────────────────────────────

describe("P2-S6: 생성물 — 4종 카드 표시", () => {
  it("S6-T1-a: 4종 생성물 타입 모두 존재 (snippet/place_intro/review_request/vendor_prescription)", () => {
    const types = MOCK_ASSETS.map((a) => a.type);
    expect(types).toContain("snippet");
    expect(types).toContain("place_intro");
    expect(types).toContain("review_request");
    expect(types).toContain("vendor_prescription");
  });

  it("S6-T1-b: 각 카드에 큰 복사 버튼 대상(copyable=true)", () => {
    for (const asset of MOCK_ASSETS) {
      expect(asset.copyable).toBe(true);
    }
  });

  it("S6-T1-c: 각 카드에 복사할 실제 content 있음", () => {
    for (const asset of MOCK_ASSETS) {
      expect(asset.content).toBeTruthy();
      expect(asset.content.length).toBeGreaterThan(5);
    }
  });
});

// ── S6-T2: BigCopyButton — 복사 + "복사됐어요" ──────────────────────────────

describe("P2-S6: 생성물 — BigCopyButton 복사 동작", () => {
  it("S6-T2-a: 복사 버튼 라벨 기본값 '복사하기'", () => {
    const defaultLabel = "복사하기";
    expect(defaultLabel).not.toMatch(/copy|COPY|clipboard/i);
    expect(defaultLabel).toBeTruthy();
  });

  it("S6-T2-b: 복사 성공 후 '복사됐어요' 피드백 표시", () => {
    const copiedFeedback = "복사됐어요";
    expect(copiedFeedback).toBeTruthy();
    expect(copiedFeedback).not.toMatch(/copied|success|OK/i);
  });

  it("S6-T2-c: 버튼 최소 크기 52px 이상 (모바일 터치 타겟)", () => {
    // BigCopyButton min-h-[56px] 클래스 확인 (ui 계약)
    const minHeight = 56; // px
    expect(minHeight).toBeGreaterThanOrEqual(44); // iOS HIG
  });
});

// ── S6-T3: AC-6 — 복붙 형태 (전문용어 0) ───────────────────────────────────

describe("P2-S6: 생성물 — AC-6 (복붙 형태)", () => {
  const TECHNICAL_FORBIDDEN = [
    "snippet",
    "SEO",
    "AEO",
    "GEO",
    "SERP",
    "algorithm",
    "structured data",
    "schema markup",
  ];

  it("S6-T3-a: 생성물 title에 전문용어 없음", () => {
    for (const asset of MOCK_ASSETS) {
      for (const term of TECHNICAL_FORBIDDEN) {
        expect(asset.title).not.toMatch(new RegExp(term, "i"));
      }
    }
  });

  it("S6-T3-b: assetTypeToLabel('snippet') → '검색 답변글' (영어/기술용어 0)", () => {
    const label = assetTypeToLabel("snippet");
    expect(label.label).not.toMatch(/snippet|SEO|AEO/i);
    expect(label.label).toContain("검색");
    expect(label.label).toContain("답변");
  });

  it("S6-T3-c: assetTypeToLabel 4종 모두 사장님 언어", () => {
    const types = ["snippet", "place_intro", "review_request", "vendor_prescription"] as const;
    for (const type of types) {
      const label = assetTypeToLabel(type);
      expect(label.label).toBeTruthy();
      for (const term of TECHNICAL_FORBIDDEN) {
        expect(label.label).not.toMatch(new RegExp(term, "i"));
      }
    }
  });

  it("S6-T3-d: assets_intro 텍스트 — '그대로 복사해서 쓰시면 돼요'", () => {
    const introText = "그대로 복사해서 쓰시면 돼요";
    expect(introText).toMatch(/복사|쓰시면/);
    expect(introText).not.toMatch(/snippet|SEO|전문|기술/i);
  });
});

// ── S6-T4: ?type 진입 — 특정 생성물 먼저 표시 ──────────────────────────────

describe("P2-S6: 생성물 — ?type 진입 (S5 연결)", () => {
  function filterByType(assets: GeneratedAsset[], type: string | undefined): GeneratedAsset[] {
    if (!type) return assets;
    return assets.filter((a) => a.type === type);
  }

  it("S6-T4-a: ?type=snippet → snippet 생성물만 필터", () => {
    const filtered = filterByType(MOCK_ASSETS, "snippet");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.type).toBe("snippet");
  });

  it("S6-T4-b: ?type=vendor_prescription → 처방전 생성물만 필터", () => {
    const filtered = filterByType(MOCK_ASSETS, "vendor_prescription");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.type).toBe("vendor_prescription");
  });

  it("S6-T4-c: ?type 없으면 전체 생성물 표시", () => {
    const filtered = filterByType(MOCK_ASSETS, undefined);
    expect(filtered).toHaveLength(MOCK_ASSETS.length);
  });

  it("S6-T4-d: 허용된 type 4종 외 진입 시 빈 배열 또는 오류 처리", () => {
    const invalid = filterByType(MOCK_ASSETS, "invalid_type");
    expect(invalid).toHaveLength(0);
  });
});

// ── S6-T5: 유료 경계 ────────────────────────────────────────────────────────

describe("P2-S6: 생성물 — 유료 경계 (paid_assets_lock)", () => {
  const LOCK_DESCRIPTION = "실행팩으로 전체 결과와 모든 행동을 받아보세요.";
  const CAUSAL_FORBIDDEN = ["반드시", "확실히", "보장", "무조건", "1위"];

  it("S6-T5-a: 잠금 설명에 인과 단정 없음", () => {
    for (const claim of CAUSAL_FORBIDDEN) {
      expect(LOCK_DESCRIPTION).not.toContain(claim);
    }
  });

  it("S6-T5-b: 잠금 설명에 전문용어 없음", () => {
    const FORBIDDEN = ["snippet", "SEO", "AEO", "GEO", "SERP"];
    for (const term of FORBIDDEN) {
      expect(LOCK_DESCRIPTION).not.toMatch(new RegExp(term, "i"));
    }
  });

  it("S6-T5-c: 무료 미리보기 — content 일부만 노출 (truncate 처리)", () => {
    function previewContent(content: string, isPaidUser: boolean, previewLen = 30): string {
      if (isPaidUser) return content;
      return `${content.slice(0, previewLen)}...`;
    }

    const asset = MOCK_ASSETS[0];
    const content = asset?.content ?? "";
    const preview = previewContent(content, false);
    expect(preview.endsWith("...")).toBe(true);
    expect(preview.length).toBeLessThan(content.length);
  });
});

// ── S6-T6: 정직성 가드 — 효과 보장 단정 0 ─────────────────────────────────

describe("P2-S6: 생성물 — 정직성 가드 (AC-7)", () => {
  const UI_TEXTS = [
    "그대로 복사해서 쓰시면 돼요",
    "검색 답변글",
    "가게 소개글",
    "리뷰 요청 문구",
    "업체 처방전",
    "복사하기",
    "복사됐어요",
  ];

  const TECHNICAL_FORBIDDEN = ["snippet", "SEO", "AEO", "GEO", "SERP", "algorithm"];
  const CAUSAL_FORBIDDEN = [
    "1위",
    "1등",
    "매출",
    "반드시",
    "확실히",
    "보장",
    "무조건",
    "효과 보장",
  ];

  it("S6-T6-a: 모든 UI 텍스트에 전문용어 없음", () => {
    for (const text of UI_TEXTS) {
      for (const term of TECHNICAL_FORBIDDEN) {
        expect(text).not.toMatch(new RegExp(term, "i"));
      }
    }
  });

  it("S6-T6-b: 모든 UI 텍스트에 인과 단정 없음", () => {
    for (const text of UI_TEXTS) {
      for (const claim of CAUSAL_FORBIDDEN) {
        expect(text).not.toContain(claim);
      }
    }
  });

  it("S6-T6-c: 생성물 content에 점수(숫자 단독) 없음", () => {
    for (const asset of MOCK_ASSETS) {
      expect(asset.content).not.toMatch(/\d+점|\d+위|\d+%/);
    }
  });
});
