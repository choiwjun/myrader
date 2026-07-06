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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeDisplayChannels, sourceToText } from "../../app/(app)/status/page";
import {
  type Channel,
  type Signal,
  channelToLabel,
  signalToLabel,
} from "../../lib/shared/ui-labels";

const statusPageSource = readFileSync(
  new URL("../../app/(app)/status/page.tsx", import.meta.url),
  "utf8",
);

function sourceAround(source: string, marker: string, before = 120, after = 160) {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(Math.max(0, start - before), start + marker.length + after);
}

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

  it("신호등 신호 3종 모두 텍스트 토큰 있음", () => {
    for (const signal of signals) {
      const result = signalToLabel(signal);
      expect(result.emoji).toMatch(/good|watch|wait/);
      expect(result.emoji).not.toMatch(/\p{Emoji_Presentation}/u);
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

  it("빈/부분 채널 응답은 같은 표시 배열에서 근거 부족 상태로 보강된다", () => {
    const empty = normalizeDisplayChannels([]);
    expect(empty.map((channel) => channel.channel)).toEqual(["naver", "google", "ai"]);
    expect(empty.every((channel) => channel.signal === "red")).toBe(true);
    expect(empty.every((channel) => channel.summaryLine.includes("근거가 아직 부족"))).toBe(true);

    const partial = normalizeDisplayChannels([
      {
        channel: "naver",
        signal: "green",
        summaryLine: "",
        found: false,
      },
    ] as Parameters<typeof normalizeDisplayChannels>[0]);

    expect(partial.find((channel) => channel.channel === "naver")?.signal).toBe("red");
    expect(partial.find((channel) => channel.channel === "naver")?.summaryLine).toContain(
      "조금 더 살펴보는 중",
    );
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
  it("google 채널 note: 실제 status/page 상수는 전문용어/점수/보장 표현을 쓰지 않는다", () => {
    const noteBlock = sourceAround(statusPageSource, "GOOGLE_PREVIEW_NOTE");
    expect(noteBlock).toContain("자세한 순위는 다음 단계에서 확인할 수 있어요.");
    expect(noteBlock).not.toMatch(/SEO|SERP|ranking|algorithm/i);
    expect(noteBlock).not.toMatch(/\d+점|\d+%/);
    expect(noteBlock).not.toMatch(/반드시|보장/);
  });

  it("구글 맛보기 note는 실제 렌더 경로에 연결되어 있고 전문용어가 없다", () => {
    const googleNoteUsage = sourceAround(
      statusPageSource,
      'note={channel.channel === "google" ? GOOGLE_PREVIEW_NOTE : undefined}',
    );
    expect(googleNoteUsage).toContain("GOOGLE_PREVIEW_NOTE");
    expect(googleNoteUsage).not.toMatch(/SEO|SERP|GEO|AEO|ranking/i);
    expect(googleNoteUsage).not.toMatch(/\d+점|\d+%/);
  });
});

// ── AI 카드 정직성 게이팅 ───────────────────────────────────────────────────

describe("P2-S2: 내 상태 — AI 카드 실인용 게이팅", () => {
  it("AI green은 grounded 출처와 근거가 함께 있을 때만 유지된다", () => {
    const displayChannels = normalizeDisplayChannels([
      {
        channel: "ai",
        signal: "green",
        summaryLine: "AI가 실제 인용 근거로 가게를 확인했어요.",
        found: true,
        source: "gpt_grounded",
        evidence: [{ label: "확인 문장", detail: "AI 응답에 가게명이 포함됨" }],
      },
    ] as Parameters<typeof normalizeDisplayChannels>[0]);

    const ai = displayChannels.find((channel) => channel.channel === "ai");
    expect(ai?.signal).toBe("green");
    expect(sourceToText(ai as NonNullable<typeof ai>)).toBe("AI 직접 확인");
  });

  it("AI green이라도 출처나 근거가 없으면 확인 전 출처와 근거 부족 상태로 낮춘다", () => {
    const displayChannels = normalizeDisplayChannels([
      {
        channel: "ai",
        signal: "green",
        summaryLine: "AI가 우리 가게를 알고 있어요.",
        found: true,
        source: null,
        evidence: [],
      },
    ] as Parameters<typeof normalizeDisplayChannels>[0]);

    const ai = displayChannels.find((channel) => channel.channel === "ai");
    expect(ai?.signal).toBe("red");
    expect(ai?.summaryLine).toContain("AI 추천 근거가 아직 부족");
    expect(sourceToText(ai as NonNullable<typeof ai>)).toBe("출처 확인 전");
  });

  it("상태 근거 출처는 확인된 소유자 라벨만 쓰고 unknown/null은 확정처럼 보이지 않는다", () => {
    const channel = {
      channel: "naver",
      signal: "green",
      summaryLine: "네이버 근거 확인",
      found: true,
    } as Parameters<typeof sourceToText>[0];

    expect(sourceToText({ ...channel, source: "engine_results" })).toBe("살펴보기 결과");
    expect(sourceToText({ ...channel, source: "naver_serp" })).toBe("네이버 확인");
    expect(sourceToText({ ...channel, source: "manual" })).toBe("직접 입력");
    expect(sourceToText({ ...channel, source: null })).toBe("출처 확인 전");
    expect(sourceToText({ ...channel, source: "unknown-source" })).toBe("출처 확인 전");
  });

  it("AI note: 실제 status/page 안내는 인과 단정 없이 정직한 안내만 쓴다", () => {
    const aiNoteBlock = sourceAround(statusPageSource, "AI_NOT_YET_NOTE");
    expect(aiNoteBlock).toContain("실제로 AI가 추천할 때만 초록불이 켜져요.");
    expect(aiNoteBlock).not.toMatch(/반드시|무조건|보장|확실히/);
    expect(aiNoteBlock).not.toMatch(/AEO|GEO|LLM|grounded/i);
    expect(aiNoteBlock).not.toMatch(/\d+점|\d+%/);
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
  // channels 배열에서 ai 를 뽑아 HERO로 분리하는 실제 status/page 로직을 검증한다.

  it("S2-HERO-1: ai 채널은 배열 끝에 있어도 분리 추출됨", () => {
    const channels: Parameters<typeof normalizeDisplayChannels>[0] = [
      { channel: "naver", signal: "yellow" as Signal, summaryLine: "네이버 중간", found: true },
      { channel: "google", signal: "yellow" as Signal, summaryLine: "구글 미흡", found: false },
      { channel: "ai", signal: "red" as Signal, summaryLine: "AI 아직 몰라요", found: false },
    ];
    const displayChannels = normalizeDisplayChannels(channels);
    const ai = displayChannels.find((channel) => channel.channel === "ai");
    expect(ai?.channel).toBe("ai");
    expect(ai?.summaryLine).toContain("AI 추천 근거가 아직 부족");
  });

  it("S2-HERO-2: ai 채널이 없으면 HERO 는 red signal 기본값(fallback)", () => {
    const channels: Parameters<typeof normalizeDisplayChannels>[0] = [
      { channel: "naver", signal: "yellow" as Signal, summaryLine: "네이버", found: true },
    ];
    const displayChannels = normalizeDisplayChannels(channels);
    const ai = displayChannels.find((channel) => channel.channel === "ai");
    expect(ai?.signal).toBe("red");
    expect(ai?.summaryLine).toContain("AI 추천 근거가 아직 부족");
  });

  it("S2-HERO-3: HERO 맥락 헤드라인 전문용어 0", () => {
    const headlineBlock = sourceAround(statusPageSource, "요즘 손님은 AI한테 물어봐요");
    expect(headlineBlock).not.toMatch(/AEO|GEO|LLM|grounded|SERP/i);
    expect(headlineBlock).not.toMatch(/\d+점|\d+%/);
  });

  it("S2-HERO-4: 미래지향 박스 카피 인과 단정 0", () => {
    const forwardBoxBlock = sourceAround(
      statusPageSource,
      "지금 준비하는 가게가 AI 시대에 먼저 잡혀요",
    );
    expect(forwardBoxBlock).not.toMatch(/반드시|무조건|보장|확실히/);
    expect(forwardBoxBlock).not.toMatch(/\d+점|\d+%/);
  });
});
