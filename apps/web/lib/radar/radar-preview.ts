import { expand } from "@radar/keyword-pipeline";

export type RadarPreviewSource = "measured" | "example";
export type RadarPreviewStatus = "good" | "mid" | "wait";
export type RadarPreviewMode = "unsubscribed" | "subscribed" | "empty" | "failed";

export interface RadarPreviewBusiness {
  readonly businessName: string;
  readonly region: string | null;
  readonly category: string | null;
}

export interface RadarPreviewRow {
  readonly id?: string;
  readonly text: string;
  readonly reason: string;
  readonly status: RadarPreviewStatus;
  readonly locked: boolean;
  readonly actionHref?: string;
}

export interface RadarHomePreview {
  readonly mode: RadarPreviewMode;
  readonly source: RadarPreviewSource;
  readonly fallbackLabel: string | null;
  readonly rows: readonly RadarPreviewRow[];
  readonly ctaLabel: string;
  readonly priceLine: string;
  readonly caption: string;
  readonly sheetEnabled: boolean;
}

export type UnsubscribedRadarPreview = RadarHomePreview;

export interface SubscribedRadarKeyword {
  readonly id: string;
  readonly text: string;
  readonly verdict: string;
  readonly naverEvidence: {
    readonly volume: number | null;
    readonly docs: number | null;
    readonly saturation: number | null;
    readonly trend7d: number | null;
    readonly checkedAt: string;
  } | null;
}

const CTA_LABEL = "매주 검색어 받아보기";
const PRICE_LINE = "결제 없이 홈에서 먼저 받아볼 수 있어요";
const SUBSCRIBED_CTA_LABEL = "문안 만들기";
const EMPTY_CTA_LABEL = "다음 주에도 지켜볼게요";
const FAILED_CTA_LABEL = "다시 시도";

const FIRST_EXAMPLE_ROW: RadarPreviewRow = {
  text: "우리 동네 비오는날 맛집",
  reason: "검색은 늘고 글은 적어요",
  status: "good",
  locked: false,
};

const EXAMPLE_ROWS: readonly RadarPreviewRow[] = [
  FIRST_EXAMPLE_ROW,
  {
    text: "우리 동네 혼밥 맛집",
    reason: "점심 검색이 늘고 있어요",
    status: "good",
    locked: true,
  },
  {
    text: "시장 근처 밥집",
    reason: "주말마다 오르는 말이에요",
    status: "mid",
    locked: true,
  },
];

const REASONS = [
  "검색은 늘고 글은 적어요",
  "점심 검색이 늘고 있어요",
  "주말마다 오르는 말이에요",
] as const;

export async function buildUnsubscribedRadarPreview(
  business: RadarPreviewBusiness,
): Promise<UnsubscribedRadarPreview> {
  const seed = seedForBusiness(business);
  if (!seed) return examplePreview();

  try {
    const expanded = await expand(seed, { limit: 3 });
    const rows = expanded.keywords.slice(0, 3).map((keyword, index): RadarPreviewRow => {
      const fallback = EXAMPLE_ROWS[index] ?? FIRST_EXAMPLE_ROW;
      return {
        text: keyword.text || fallback.text,
        reason: REASONS[index] ?? REASONS[0],
        status: index === 2 ? "mid" : "good",
        locked: index > 0,
      };
    });

    return {
      mode: "unsubscribed",
      source: "measured",
      fallbackLabel: null,
      rows: completeRows(rows),
      ctaLabel: CTA_LABEL,
      priceLine: PRICE_LINE,
      caption: PRICE_LINE,
      sheetEnabled: true,
    };
  } catch {
    return examplePreview();
  }
}

export function buildSubscribedRadarPreview(
  keywords: readonly SubscribedRadarKeyword[],
): RadarHomePreview {
  if (keywords.length === 0) return emptySubscribedRadarPreview();

  const rows = keywords.slice(0, 5).map(
    (keyword): RadarPreviewRow => ({
      id: keyword.id,
      text: keyword.text,
      reason: reasonForKeyword(keyword),
      status: statusForVerdict(keyword.verdict),
      locked: false,
      actionHref: `/write?radarKeywordId=${encodeURIComponent(keyword.id)}&keyword=${encodeURIComponent(keyword.text)}`,
    }),
  );

  return {
    mode: "subscribed",
    source: "measured",
    fallbackLabel: null,
    rows,
    ctaLabel: SUBSCRIBED_CTA_LABEL,
    priceLine: "이번 주 검색어를 문안에 바로 써볼 수 있어요.",
    caption: "이번 주 키워드와 변화예요.",
    sheetEnabled: false,
  };
}

export function emptySubscribedRadarPreview(): RadarHomePreview {
  return {
    mode: "empty",
    source: "measured",
    fallbackLabel: null,
    rows: [],
    ctaLabel: EMPTY_CTA_LABEL,
    priceLine: "충분한 키워드가 모이면 다음 주에 보여드릴게요.",
    caption: "아직 보여줄 검색어가 충분하지 않아요.",
    sheetEnabled: false,
  };
}

export function failedSubscribedRadarPreview(): RadarHomePreview {
  return {
    mode: "failed",
    source: "measured",
    fallbackLabel: null,
    rows: [],
    ctaLabel: FAILED_CTA_LABEL,
    priceLine: "이번 주 스캔을 다시 확인해야 해요.",
    caption: "스캔 결과를 불러오지 못했어요.",
    sheetEnabled: false,
  };
}

function seedForBusiness(business: RadarPreviewBusiness): string {
  return [business.region, business.businessName, business.category]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function completeRows(rows: readonly RadarPreviewRow[]): readonly RadarPreviewRow[] {
  if (rows.length >= 3) return rows;
  return [...rows, ...EXAMPLE_ROWS.slice(rows.length)].slice(0, 3);
}

function examplePreview(): UnsubscribedRadarPreview {
  return {
    mode: "unsubscribed",
    source: "example",
    fallbackLabel: "예시 미리보기",
    rows: EXAMPLE_ROWS,
    ctaLabel: CTA_LABEL,
    priceLine: PRICE_LINE,
    caption: PRICE_LINE,
    sheetEnabled: true,
  };
}

function reasonForKeyword(keyword: SubscribedRadarKeyword): string {
  const evidence = keyword.naverEvidence;
  if (typeof evidence?.trend7d === "number" && evidence.trend7d > 0) {
    return "지난주보다 찾는 사람이 늘었어요";
  }
  if (typeof evidence?.docs === "number" && evidence.docs <= 10) {
    return "글이 적어 지금 쓰기 좋아요";
  }
  return "이번 주 눈에 띈 검색어예요";
}

function statusForVerdict(verdict: string): RadarPreviewStatus {
  if (verdict === "now" || verdict === "good") return "good";
  if (verdict === "normal") return "mid";
  return "wait";
}
