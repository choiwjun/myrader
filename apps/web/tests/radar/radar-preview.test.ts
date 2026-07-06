import { describe, expect, it } from "vitest";

import {
  buildSubscribedRadarPreview,
  buildUnsubscribedRadarPreview,
  emptySubscribedRadarPreview,
  failedSubscribedRadarPreview,
  waitingSubscribedRadarPreview,
} from "../../lib/radar/radar-preview.js";

describe("buildUnsubscribedRadarPreview", () => {
  it("uses honest example rows when keyword expansion only has fallback candidates", async () => {
    const preview = await buildUnsubscribedRadarPreview({
      businessName: "비건빵집",
      region: "성수동",
      category: "베이커리",
    });

    expect(preview.source).toBe("example");
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[0]).toMatchObject({
      locked: false,
      reason: "검색은 늘고 글은 적어요",
      status: "good",
    });
    expect(preview.rows.slice(1).every((row) => row.locked)).toBe(true);
    expect(preview.ctaLabel).toBe("매주 검색어 받아보기");
    expect(preview.priceLine).toBe("결제 없이 홈에서 먼저 받아볼 수 있어요");
    expect(preview.fallbackLabel).toBe("예시 미리보기");
  });

  it("uses an honest example label when business context is missing", async () => {
    const preview = await buildUnsubscribedRadarPreview({
      businessName: "",
      region: null,
      category: null,
    });

    expect(preview.source).toBe("example");
    expect(preview.fallbackLabel).toBe("예시 미리보기");
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[0]?.locked).toBe(false);
  });
});

describe("buildSubscribedRadarPreview", () => {
  it("builds weekly keyword rows that open write from stored radar results", () => {
    const preview = buildSubscribedRadarPreview(
      [
        {
          id: "keyword-1",
          text: "성수동 비오는날 빵집",
          verdict: "now",
          naverEvidence: {
            volume: 120,
            docs: 4,
            saturation: 0.03,
            trend7d: 18,
            checkedAt: "2026-07-05T00:00:00.000Z",
          },
        },
        {
          id: "keyword-2",
          text: "서울숲 비건 케이크",
          verdict: "good",
          naverEvidence: {
            volume: 80,
            docs: 22,
            saturation: 0.27,
            trend7d: 0,
            checkedAt: "2026-07-05T00:00:00.000Z",
          },
        },
      ],
      { diagnosisId: "00000000-0000-4000-8000-000000000abc" },
    );

    expect(preview.mode).toBe("subscribed");
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]?.actionHref).toContain("/write?");
    expect(preview.rows[0]?.actionHref).toContain("radarKeywordId=keyword-1");
    expect(preview.rows[0]?.actionHref).toContain("keyword=");
    expect(preview.rows[0]?.actionHref).toContain(
      "diagnosisId=00000000-0000-4000-8000-000000000abc",
    );
    expect(preview.rows[0]).toMatchObject({
      locked: false,
      reason: "지난주보다 찾는 사람이 늘었어요",
      status: "good",
    });
    expect(preview.ctaLabel).toBe("문안 만들기");
    expect(preview.sheetEnabled).toBe(false);
  });

  it("defines waiting, empty, and failed subscribed states without fake measured rows", () => {
    const waiting = waitingSubscribedRadarPreview();
    const empty = emptySubscribedRadarPreview();
    const failed = failedSubscribedRadarPreview();

    expect(waiting.mode).toBe("waiting");
    expect(waiting.rows).toHaveLength(0);
    expect(waiting.ctaLabel).toBe("첫 결과 준비 중");
    expect(empty.mode).toBe("empty");
    expect(empty.rows).toHaveLength(0);
    expect(empty.ctaLabel).toBe("다음 주에도 지켜볼게요");
    expect(failed.mode).toBe("failed");
    expect(failed.rows).toHaveLength(0);
    expect(failed.ctaLabel).toBe("다시 시도");
  });
});
