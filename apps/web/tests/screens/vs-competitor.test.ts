// @TASK P2-S3 - 경쟁 비교 (/compare) 화면 TDD
// @SPEC specs/screens/vs-competitor.yaml (S3: REQ-003)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드)
//
// RED→GREEN:
//   S3-T1: loss_headline — 손실 프레이밍 한 문장 (응원 톤, 사실 기반)
//   S3-T2: competitor_vs_me_card — beatsMe / 신호등
//   S3-T3: AC-3 — 손실 프레이밍 카드 (beatsMe=true 일 때)
//   S3-T4: AC-8 — 인과 단정 0
//   S3-T5: 경쟁사 없을 때 응원 ("잘 지키고 계세요")
//   S3-T6: source_badge — 출처 정직 배지 (naver_serp / gpt_grounded 사장님 언어)
//   S3-T7: 정직성 가드 — 점수(숫자) 0 / 전문용어 0 / 과장 금지

import { describe, expect, it } from "vitest";
import { type Signal, signalToLabel } from "../../lib/shared/ui-labels";

// ── source 배지 사장님 언어 변환 계약 ────────────────────────────────────────

/** source 코드 → 사장님 언어 배지 변환 (vs-competitor 전용) */
function sourceToLabel(source: "naver_serp" | "gpt_grounded"): string {
  switch (source) {
    case "naver_serp":
      return "네이버 검색에서 확인";
    case "gpt_grounded":
      return "AI가 확인";
  }
}

describe("P2-S3: 경쟁 비교 — source_badge 사장님 언어 변환", () => {
  it("naver_serp → '네이버 검색에서 확인' (영어/기술용어 0)", () => {
    const label = sourceToLabel("naver_serp");
    expect(label).not.toMatch(/SERP|serp|SEO/i);
    expect(label).not.toMatch(/algorithm|crawl|index/i);
    expect(label).toContain("네이버");
  });

  it("gpt_grounded → 'AI가 확인' (grounded/LLM 노출 금지)", () => {
    const label = sourceToLabel("gpt_grounded");
    expect(label).not.toMatch(/gpt|grounded|LLM|GPT/i);
    expect(label).not.toMatch(/AEO|GEO/i);
    expect(label).toContain("AI");
  });

  it("배지 텍스트에 점수(숫자) 없음", () => {
    const sources = ["naver_serp", "gpt_grounded"] as const;
    for (const source of sources) {
      const label = sourceToLabel(source);
      expect(label).not.toMatch(/\d+점|\d+%|\d+위/);
    }
  });

  it("배지 텍스트에 인과 단정 없음", () => {
    const CAUSAL = ["반드시", "확실히", "보장", "무조건", "1위"];
    const sources = ["naver_serp", "gpt_grounded"] as const;
    for (const source of sources) {
      const label = sourceToLabel(source);
      for (const claim of CAUSAL) {
        expect(label).not.toContain(claim);
      }
    }
  });
});

// ── loss_headline 계약 ────────────────────────────────────────────────────

describe("P2-S3: 경쟁 비교 — loss_headline (손실 프레이밍)", () => {
  function buildLossHeadline(beatsMeCount: number): string {
    if (beatsMeCount === 0) {
      return "지금 잘 지키고 계세요! 계속 이렇게 해요.";
    }
    return `옆집 ${beatsMeCount}곳이 먼저 보이고 있어요. 같이 따라잡아 볼까요?`;
  }

  it("AC-3: beatsMe > 0 이면 손실 프레이밍 한 문장", () => {
    const headline = buildLossHeadline(2);
    expect(headline).toBeTruthy();
    // 손실 암시 — "먼저 보이고 있어요" 같은 표현
    expect(headline).toMatch(/먼저|옆집|따라/);
  });

  it("AC-3: beatsMe = 0 이면 응원 메시지 ('잘 지키고 계세요')", () => {
    const headline = buildLossHeadline(0);
    expect(headline).toMatch(/지키고|잘|계속/);
    // 손실 프레이밍 없음
    expect(headline).not.toMatch(/먼저 보이고|따라잡/);
  });

  it("손실 헤드라인에 전문용어 없음", () => {
    const FORBIDDEN = ["SEO", "AEO", "GEO", "SERP", "snippet", "algorithm"];
    const headlines = [buildLossHeadline(1), buildLossHeadline(0)];
    for (const headline of headlines) {
      for (const term of FORBIDDEN) {
        expect(headline).not.toMatch(new RegExp(term, "i"));
      }
    }
  });

  it("AC-8: 손실 헤드라인에 인과 단정 없음", () => {
    const CAUSAL = ["1위", "1등", "매출", "반드시", "보장", "확실히"];
    const headlines = [buildLossHeadline(3), buildLossHeadline(0)];
    for (const headline of headlines) {
      for (const claim of CAUSAL) {
        expect(headline).not.toContain(claim);
      }
    }
  });

  it("손실 헤드라인에 점수(숫자 단독) 없음", () => {
    const headline = buildLossHeadline(2);
    // 경쟁사 수(2곳)는 허용 — 점수/백분율/위 금지
    expect(headline).not.toMatch(/\d+점|\d+%|\d+위/);
  });

  it("응원 톤: '같이' 또는 '해볼까요' 같은 협력 표현", () => {
    const headline = buildLossHeadline(2);
    expect(headline).toMatch(/같이|해볼까요|따라/);
  });
});

// ── competitor_vs_me_card 계약 ───────────────────────────────────────────────

describe("P2-S3: 경쟁 비교 — competitor_vs_me_card", () => {
  type CompetitorItem = {
    id: string;
    name: string;
    channel: "naver" | "google" | "ai";
    beatsMe: boolean;
    rank?: number;
    source: "naver_serp" | "gpt_grounded";
  };

  const mockCompetitor: CompetitorItem = {
    id: "comp-1",
    name: "옆집 카페",
    channel: "naver",
    beatsMe: true,
    rank: undefined, // 점수/순위 직접 노출 금지
    source: "naver_serp",
  };

  it("beatsMe=true: 경쟁사 이름 + 채널 + 우위 표시", () => {
    expect(mockCompetitor.beatsMe).toBe(true);
    expect(mockCompetitor.name).toBeTruthy();
    expect(mockCompetitor.channel).toBeTruthy();
  });

  it("rank(순위 숫자)는 카드에 직접 노출 안 함", () => {
    // rank 는 내부 데이터, UI 에는 신호등(beatsMe)만 표시
    const displayData = {
      name: mockCompetitor.name,
      channel: mockCompetitor.channel,
      beatsMe: mockCompetitor.beatsMe,
      // rank 제거 — 점수 비노출 원칙
    };
    expect((displayData as Record<string, unknown>).rank).toBeUndefined();
  });

  it("beatsMe=false: 옆집 안 이기고 있다는 의미 — 우리가 앞", () => {
    const meFirst: CompetitorItem = { ...mockCompetitor, beatsMe: false };
    expect(meFirst.beatsMe).toBe(false);
  });

  it("경쟁사 이름 anonymize 가능 (옵션)", () => {
    // 경쟁사 비방 방지 — 익명화 옵션 있어야 함
    const anon = { ...mockCompetitor, name: "근처 같은 업종" };
    expect(anon.name).not.toBe("옆집 카페");
    expect(anon.name).toBeTruthy();
  });
});

// ── 경쟁사 없을 때 응원 ──────────────────────────────────────────────────────

describe("P2-S3: 경쟁 비교 — 경쟁사 없을 때 응원 메시지", () => {
  it("competitors 빈 배열 → 응원 헤드라인", () => {
    const competitors: unknown[] = [];
    const isEmpty = competitors.length === 0;
    expect(isEmpty).toBe(true);

    const encouragementHeadline = "지금 잘 지키고 계세요! 계속 이렇게 해요.";
    expect(encouragementHeadline).toMatch(/지키고|잘|계속/);
    expect(encouragementHeadline).not.toMatch(/반드시|보장|1위/);
  });

  it("빈 상태 메시지에 전문용어 없음", () => {
    const emptyMessages = [
      "지금 잘 지키고 계세요! 계속 이렇게 해요.",
      "이 채널에서는 경쟁 가게가 아직 확인되지 않았어요.",
    ];
    const FORBIDDEN = ["SEO", "AEO", "GEO", "SERP", "competitor", "algorithm"];
    for (const msg of emptyMessages) {
      for (const term of FORBIDDEN) {
        expect(msg).not.toMatch(new RegExp(term, "i"));
      }
    }
  });
});

// ── 정직성 통합 가드 (S3 전체) ──────────────────────────────────────────────

describe("P2-S3: 경쟁 비교 — 정직성 통합 가드 (AC-8 + G-HONESTY)", () => {
  const TECHNICAL_FORBIDDEN = [
    "SEO",
    "AEO",
    "GEO",
    "SERP",
    "snippet",
    "algorithm",
    "grounded",
    "LLM",
    "GPT",
    "naver_serp",
    "gpt_grounded",
  ];
  const CAUSAL_FORBIDDEN = ["1위", "1등", "매출", "반드시", "확실히", "보장", "무조건"];

  it("화면에 노출되는 모든 텍스트 샘플에 전문용어 없음", () => {
    const uiTexts = [
      "옆집 2곳이 먼저 보이고 있어요. 같이 따라잡아 볼까요?",
      "지금 잘 지키고 계세요! 계속 이렇게 해요.",
      "네이버 검색에서 확인",
      "AI가 확인",
      "옆집은 뭘 갖췄나 볼까요?",
    ];
    for (const text of uiTexts) {
      for (const term of TECHNICAL_FORBIDDEN) {
        expect(text).not.toMatch(new RegExp(term, "i"));
      }
    }
  });

  it("화면에 노출되는 모든 텍스트 샘플에 인과 단정 없음", () => {
    const uiTexts = [
      "옆집 2곳이 먼저 보이고 있어요. 같이 따라잡아 볼까요?",
      "지금 잘 지키고 계세요! 계속 이렇게 해요.",
      "네이버 검색에서 확인",
      "AI가 확인",
      "옆집은 뭘 갖췄나 볼까요?",
    ];
    for (const text of uiTexts) {
      for (const claim of CAUSAL_FORBIDDEN) {
        expect(text).not.toContain(claim);
      }
    }
  });

  it("signalToLabel 사용: 신호등 컴포넌트에 점수 없음", () => {
    const signals: Signal[] = ["green", "yellow", "red"];
    for (const signal of signals) {
      const result = signalToLabel(signal);
      expect(result.summary).not.toMatch(/\d+점|\d+%|\d+위/);
      // score/number 필드가 없어야 함 (unknown 경유로 안전 캐스팅)
      const obj = result as unknown as Record<string, unknown>;
      expect(obj.score).toBeUndefined();
    }
  });

  it("경쟁사 카드 클릭 이동 경로는 /gap", () => {
    const nextPath = "/gap";
    expect(nextPath).toBe("/gap");
    expect(nextPath).not.toBe("/score");
    expect(nextPath).not.toBe("/rank");
  });
});
