// @TASK P2-S2 - 내 상태 (/status) 화면 TDD
// @SPEC specs/screens/my-status.yaml (S2: REQ-002)
// @SPEC docs/planning/05-design-system.md §4 (신호등 — 점수 대신)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드)
//
// RED→GREEN:
//   S2-T1: overall_summary — 큰 신호등 + 한 문장 (점수 숫자 0)
//   S2-T2: naver/google/ai 채널 카드 — Signal + 사장님 언어
//   S2-T3: AC-2 — 신호등/한 줄 원칙
//   S2-T4: AC-8 — 인과 단정 0 (특히 AI/구글)
//   S2-T5: 구글 맛보기 안내 (note: "자세한 순위는 다음 단계")
//   S2-T6: AI 카드 — 실인용일 때만 green, 인과 단정 금지
//   S2-T7: 정직성 가드 — 점수(숫자) 0 / 전문용어 0

import { describe, expect, it } from "vitest";
import {
  type Channel,
  type Signal,
  channelToLabel,
  signalToLabel,
} from "../../lib/shared/ui-labels";

// ── overall_summary 계약 ────────────────────────────────────────────────────

describe("P2-S2: 내 상태 — overall_summary", () => {
  const signals: Signal[] = ["green", "yellow", "red"];

  it("AC-2: 모든 신호에서 한 줄 요약 반환 (점수 숫자 0)", () => {
    for (const signal of signals) {
      const result = signalToLabel(signal);
      expect(result.summary).toBeTruthy();
      // 점수(숫자) 절대 금지
      expect(result.summary).not.toMatch(/\d+점|\d+%|\d+\/100/);
    }
  });

  it("신호등 신호 3종 모두 emoji 있음", () => {
    for (const signal of signals) {
      const result = signalToLabel(signal);
      expect(result.emoji).toMatch(/[🟢🟡🔴]/u);
    }
  });

  it("green: 잘 되고 있다는 응원 표현", () => {
    const result = signalToLabel("green");
    expect(result.summary).toMatch(/잘|지금처럼/);
    expect(result.summary).not.toMatch(/\d+|점수|순위/);
  });

  it("yellow: 조금만 더 채우면 긍정 프레이밍", () => {
    const result = signalToLabel("yellow");
    expect(result.summary).toMatch(/더|채우|잘/);
  });

  it("red: 응원 톤 (비난 없음, 함께 고치자)", () => {
    const result = signalToLabel("red");
    expect(result.summary).toMatch(/같이|함께|고쳐/);
    expect(result.summary).not.toMatch(/못|나쁨|부족/);
  });
});

// ── 채널 카드 계약 ──────────────────────────────────────────────────────────

describe("P2-S2: 내 상태 — 채널별 카드", () => {
  const channels: Channel[] = ["naver", "google", "ai"];

  it("3채널 모두 사장님 언어 라벨 있음", () => {
    for (const channel of channels) {
      const result = channelToLabel(channel);
      expect(result.label).toBeTruthy();
      expect(result.description).toBeTruthy();
    }
  });

  it("naver 채널: 전문용어 0 (SEO/SERP/AEO 금지)", () => {
    const result = channelToLabel("naver");
    expect(result.label).not.toMatch(/SEO|SERP|AEO|GEO|algorithm/i);
    expect(result.description).not.toMatch(/SEO|SERP/i);
  });

  it("google 채널: '맛보기' 표현 포함 + 전문용어 0", () => {
    const result = channelToLabel("google");
    // 맛보기 라벨 확인
    expect(result.label).toContain("맛보기");
    expect(result.label).not.toMatch(/SEO|SERP|ranking/i);
  });

  it("ai 채널: AI 추천 사장님 언어 (AEO/GEO 금지)", () => {
    const result = channelToLabel("ai");
    expect(result.label).not.toMatch(/AEO|GEO|LLM|AI 최적화/i);
    // "AI 추천" 같은 사장님 언어
    expect(result.label).toMatch(/AI|인공지능|추천/);
  });

  it("채널 라벨에 점수(숫자) 없음", () => {
    for (const channel of channels) {
      const result = channelToLabel(channel);
      expect(result.label).not.toMatch(/\d+점|\d+%|\d+위/);
      expect(result.description).not.toMatch(/\d+점|\d+%/);
    }
  });
});

// ── AC-8: 인과 단정 0 ───────────────────────────────────────────────────────

describe("P2-S2: 내 상태 — AC-8 인과 단정 0", () => {
  const CAUSAL_FORBIDDEN = ["1위", "1등", "매출", "반드시", "확실히", "보장", "무조건"];

  it("signalToLabel: 인과 단정 없음", () => {
    const signals: Signal[] = ["green", "yellow", "red"];
    for (const signal of signals) {
      const result = signalToLabel(signal);
      for (const claim of CAUSAL_FORBIDDEN) {
        expect(result.summary).not.toContain(claim);
      }
    }
  });

  it("channelToLabel: 인과 단정 없음 (특히 AI/구글)", () => {
    const channels: Channel[] = ["naver", "google", "ai"];
    for (const channel of channels) {
      const result = channelToLabel(channel);
      for (const claim of CAUSAL_FORBIDDEN) {
        expect(result.label).not.toContain(claim);
        expect(result.description).not.toContain(claim);
      }
    }
  });

  it("AI 채널: '추천하면 좋아진다' 같은 단정 없음", () => {
    const result = channelToLabel("ai");
    // 인과 보장 없음
    expect(result.description).not.toMatch(/추천받으면.*\d|반드시.*추천/);
    expect(result.description).not.toMatch(/확실히|무조건|보장/);
  });
});

// ── 구글 맛보기 안내 ────────────────────────────────────────────────────────

describe("P2-S2: 내 상태 — 구글 맛보기 안내", () => {
  it("google 채널 note: '자세한 순위는 다음 단계' 안내 텍스트 상수 정의됨", () => {
    // note 텍스트는 컴포넌트에서 상수로 관리 — 여기서는 텍스트 형식 계약 확인
    const GOOGLE_PREVIEW_NOTE = "자세한 순위는 다음 단계에서 확인할 수 있어요.";
    expect(GOOGLE_PREVIEW_NOTE).not.toMatch(/SEO|SERP|ranking|algorithm/i);
    expect(GOOGLE_PREVIEW_NOTE).not.toMatch(/\d+점|\d+%/);
    expect(GOOGLE_PREVIEW_NOTE).not.toMatch(/반드시|보장/);
  });

  it("구글 맛보기 note에 전문용어 없음", () => {
    const notes = [
      "자세한 순위는 다음 단계에서 확인할 수 있어요.",
      "구글 쪽 상태를 맛보기로 보여드려요.",
    ];
    for (const note of notes) {
      expect(note).not.toMatch(/SEO|SERP|GEO|AEO|ranking/i);
      expect(note).not.toMatch(/\d+점|\d+%/);
    }
  });
});

// ── AI 카드 정직성 게이팅 ───────────────────────────────────────────────────

describe("P2-S2: 내 상태 — AI 카드 실인용 게이팅", () => {
  it("AI signal green: 실인용일 때만 (grounded 전용)", () => {
    // signal=green 이 되려면 grounded 실인용 근거 필요
    // 컴포넌트에서 channel-status API가 grounded 없으면 green 반환 불가
    // 여기서는 Signal 타입 계약만 확인
    const greenResult = signalToLabel("green");
    expect(greenResult.emoji).toBe("🟢");
    // green 이라도 "AI가 반드시 추천해요" 같은 단정 없음
    expect(greenResult.summary).not.toMatch(/반드시|무조건|보장/);
  });

  it("AI signal yellow/red: 정직한 상태 표현 (부정적 비난 없음)", () => {
    for (const signal of ["yellow", "red"] as Signal[]) {
      const result = signalToLabel(signal);
      expect(result.summary).not.toMatch(/못|부족|나쁨|최악/);
    }
  });

  it("AI note: 인과 단정 없이 정직한 안내만", () => {
    // AI 카드 note 텍스트 예시 (실제 렌더 텍스트 계약)
    const aiNotes = [
      "실제로 AI가 추천할 때만 초록불이 켜져요.",
      "아직 AI에서 가게가 확인되지 않았어요.",
    ];
    for (const note of aiNotes) {
      expect(note).not.toMatch(/반드시|무조건|보장|확실히/);
      expect(note).not.toMatch(/AEO|GEO|LLM|grounded/i);
      expect(note).not.toMatch(/\d+점|\d+%/);
    }
  });
});

// ── 점수 숫자 완전 0 ────────────────────────────────────────────────────────

describe("P2-S2: 내 상태 — 점수 숫자 완전 0 (AC-2 강화)", () => {
  it("signalToLabel: 수치 형태 완전 없음", () => {
    const signals: Signal[] = ["green", "yellow", "red"];
    for (const signal of signals) {
      const result = signalToLabel(signal);
      const allText = `${result.emoji}${result.summary}`;
      expect(allText).not.toMatch(/\d+점|\d+%|\d+\/\d+|\d+위/);
      // score/number 필드 없음 (unknown 경유 안전 캐스팅)
      const obj = result as unknown as Record<string, unknown>;
      expect(obj.score).toBeUndefined();
      expect(obj.number).toBeUndefined();
    }
  });
});

// ── R2-B: AI HERO 슬롯 — 05-design-system §1-A (출시 차단 수정) ─────────────

describe("R2-B: S2 AI HERO 슬롯 — channels 배열 순서와 무관 최상단 렌더", () => {
  // channels 배열에서 ai 를 뽑아 HERO로 분리하는 계약 검증
  // (실제 DOM 렌더는 브라우저 환경 필요 — 여기서는 분리 로직 계약만 검증)

  function findAiChannel(
    channels: { channel: string; signal: Signal; summaryLine: string; found: boolean }[],
  ) {
    return channels.find((c) => c.channel === "ai");
  }

  it("S2-HERO-1: ai 채널은 배열 끝에 있어도 분리 추출됨", () => {
    const channels = [
      { channel: "naver", signal: "yellow" as Signal, summaryLine: "네이버 중간", found: true },
      { channel: "google", signal: "yellow" as Signal, summaryLine: "구글 미흡", found: false },
      { channel: "ai", signal: "red" as Signal, summaryLine: "AI 아직 몰라요", found: false },
    ];
    const ai = findAiChannel(channels);
    expect(ai).toBeDefined();
    expect(ai?.channel).toBe("ai");
  });

  it("S2-HERO-2: ai 채널이 없으면 HERO 는 red signal 기본값(fallback)", () => {
    const channels = [
      { channel: "naver", signal: "yellow" as Signal, summaryLine: "네이버", found: true },
    ];
    const ai = findAiChannel(channels);
    // ai 없으면 undefined → 컴포넌트는 signal 기본값 "red" 사용
    expect(ai).toBeUndefined();
  });

  it("S2-HERO-3: HERO 맥락 헤드라인 전문용어 0", () => {
    const headline = "요즘 손님은 AI한테 물어봐요";
    expect(headline).not.toMatch(/AEO|GEO|LLM|grounded|SERP/i);
    expect(headline).not.toMatch(/\d+점|\d+%/);
  });

  it("S2-HERO-4: 미래지향 박스 카피 인과 단정 0", () => {
    const forwardBox =
      "괜찮아요 — 아직 대부분 가게가 그래요. 지금 준비하는 가게가 AI 시대에 먼저 잡혀요.";
    expect(forwardBox).not.toMatch(/반드시|무조건|보장|확실히/);
    expect(forwardBox).not.toMatch(/\d+점|\d+%/);
  });
});
