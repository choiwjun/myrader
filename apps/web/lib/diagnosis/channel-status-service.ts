// @TASK P2-R2 - channelStatus 변환·게이팅 (전달 레이어: DiagnosisJson → 채널 신호등)
// @SPEC specs/domain/resources.yaml (channelStatus: channel/signal/summaryLine/found/note)
// @SPEC specs/screens/my-status.yaml (S2: naver 실측 / google 맛보기 / ai grounded 게이팅)
// @SPEC docs/planning/02-trd.md §2 (데이터소스·게이팅: AI 실인용=HERO·게이팅, google=맛보기 OQ-4)
// @SPEC docs/planning/07-coding-convention.md §4 (점수 비노출 → 신호등·사장님 언어만)
// @SPEC docs/planning/05-design-system.md §1-A/§5 (AI HERO·채널 연료·인과 단정 금지)
// @TEST apps/web/tests/diagnosis/channel-status-service.test.ts
//
// 책임(REQ-002, S2): 진단 산출(DiagnosisJson)의 naverPresence / google(맛보기) /
// llmValidation 을 채널별 신호등(green/yellow/red) + 사장님 언어 한 줄로 "번역"한다.
//
// 정직성 가드(07 §4 — 양보 불가):
//   1. 엔진 원점수(scores.*)는 내부 신호 — UI 노출 0. signal enum + summaryLine 만 반환.
//   2. ai 채널 green 은 grounded 실인용일 때만(게이팅). 무분별 grounded 호출은 잡 핸들러가
//      cost-gate 로 막고, 여기선 이미 산출된 llmValidation.grounded 결과만 신호로 번역한다.
//   3. google 은 v1 맛보기(on-page 준비도/AI Overview). 실 SERP 순위는 [OPEN] OQ-4 v1.5 →
//      항상 "자세한 순위는 다음 단계" note 동반. 실 순위 단정 금지.
//   4. 전문용어(SEO/AEO/GEO/SERP/snippet) 노출 0. 인과 단정("고치면 1위/매출↑") 0.
//
// 이 모듈은 순수 함수다 — 무거운 엔진 배럴(@boina/engine, Playwright 등)을 끌고 오지 않고
// contracts 타입(DiagnosisJson)만 의존한다. 점수→신호 변환은 전달 레이어(앱) 책임(07 §4).

import type { DiagnosisJson, LlmValidation, NaverPresence } from "@boina/contracts/diagnosis";
import type { HealthBand } from "@boina/contracts/enums";
import type { Channel, Signal } from "../shared/ui-labels.js";
import {
  BUSINESS_PRESENCE_MEASUREMENT_CODE,
  LLM_VALIDATION_MEASUREMENT_CODE,
  type MeasurementLabel,
  getBusinessPresenceMeasurement,
  getLlmValidationMeasurement,
  pickLatestTimestamp,
} from "./measurement.js";

/**
 * 화면(S2)용 채널 신호등 — resources.yaml channelStatus 필드와 1:1.
 * 점수 원본은 이 객체에 절대 담지 않는다(07 §4). signal + 사장님 언어만.
 */
export interface ChannelStatus {
  /** naver | google | ai */
  channel: Channel;
  /** green | yellow | red (점수 대신) */
  signal: Signal;
  /** 사장님 언어 한 줄 요약 (전문용어 0·인과 단정 0). */
  summaryLine: string;
  /** 노출/인용 여부 (선택). */
  found?: boolean;
  /** 맛보기·게이팅 등 부가 안내 (선택). */
  note?: string;
  /** evidence sheet 용 출처 라벨(정직 표기). */
  source?: string;
  /** evidence sheet 용 수집 시각(ISO 8601). */
  collectedAt?: string;
  /** evidence sheet 용 원근거(raw/structured). */
  evidence?: unknown;
  /** measured | estimated | unavailable */
  measurementLabel?: MeasurementLabel;
}

// ---------------------------------------------------------------------------
// naver (실측 노출 — naverPresence)
// ---------------------------------------------------------------------------

/**
 * 네이버 실측 노출 → 신호등.
 *
 * 실측 우선(준비도 점수가 아니라 "진짜 뜨는지"):
 *   - 플레이스가 모든/대부분 질의에서 보이고 홈페이지도 잡힘 → green
 *   - 일부만 보임 → yellow
 *   - 전혀 안 보임 → red
 *   - naverPresence 미측정(자격증명 없음 등) → red + 정직한 note
 *
 * 정직성: 노출은 실측값으로만 판단. "안 보임"을 실패가 아니라 다음 행동의 출발점으로 카피.
 */
export function deriveNaverChannelStatus(presence: NaverPresence | undefined): ChannelStatus {
  if (!presence) {
    return {
      channel: "naver",
      signal: "red",
      summaryLine: "아직 네이버 노출을 확인하지 못했어요. 같이 채워봐요.",
      found: false,
      note: "네이버 노출은 다음 진단에서 더 정확히 확인할 수 있어요.",
    };
  }

  const { place, web } = presence;
  const total = place.totalQueries;
  const visible = place.visibleCount;
  // 노출 비율(내부 판단용 — 외부 노출 안 함). 0 나눗셈 방어.
  const ratio = total > 0 ? visible / total : 0;
  const homepageFound = web.homepageFound;

  // green: 플레이스가 대부분 노출 + 홈페이지도 잡힘.
  if (ratio >= 0.75 && homepageFound) {
    return {
      channel: "naver",
      signal: "green",
      summaryLine: "네이버에서 잘 보이고 있어요. 지금처럼만 해요!",
      found: true,
    };
  }

  // green(약식): 플레이스가 모두 노출(홈페이지 없어도 핵심은 플레이스 노출).
  if (ratio >= 1 && total > 0) {
    return {
      channel: "naver",
      signal: "green",
      summaryLine: "네이버 지도·검색에 잘 나오고 있어요.",
      found: true,
    };
  }

  // yellow: 일부만 노출(보강 여지).
  if (visible > 0) {
    return {
      channel: "naver",
      signal: "yellow",
      summaryLine: "네이버에 조금 보여요. 정보를 더 채우면 훨씬 잘 보여요.",
      found: true,
    };
  }

  // red: 전혀 안 보임.
  return {
    channel: "naver",
    signal: "red",
    summaryLine: "아직 네이버에 잘 안 보여요. 네이버부터 채워봐요.",
    found: false,
    note: homepageFound ? undefined : "가게 정보를 채우면 네이버가 먼저 알아보기 시작해요.",
  };
}

// ---------------------------------------------------------------------------
// google (v1 맛보기 — on-page 준비도)
// ---------------------------------------------------------------------------

/** google 맛보기에 쓰는 on-page 준비도 입력(엔진 내부 점수 — 외부 노출 안 함). */
export interface GoogleReadinessInput {
  /** on-page 구조 준비도(엔진 내부 점수 0-100, null 가능). */
  seo: number | null;
  /** AI 답변 준비도(엔진 내부 점수 0-100, null 가능). */
  geo: number | null;
}

/** v1 맛보기 안내(항상 동반) — 실 SERP 순위는 [OPEN] OQ-4 v1.5. */
const GOOGLE_PREVIEW_NOTE = "지금은 맛보기예요. 자세한 구글 순위는 다음 단계에서 알려드릴게요.";

/**
 * 구글 v1 맛보기 → 신호등.
 *
 * v1 한계(정직): 실 SERP 순위는 아직(OQ-4 v1.5, [OPEN]). 그래서 "맛보기"로,
 * on-page 준비도(구조/AI 답변 준비)만 신호로 번역하고 항상 note 로 한계를 밝힌다.
 * 실 순위 단정 금지 — "준비됨/덜 됨"까지만, "몇 위" 단정 0.
 */
export function deriveGoogleChannelStatus(input: GoogleReadinessInput): ChannelStatus {
  // 내부 준비도(둘 중 높은 쪽 기준 — 둘 다 null 이면 보수적으로 미흡 처리).
  const readiness = Math.max(coerce(input.seo), coerce(input.geo));

  let signal: Signal;
  let summaryLine: string;
  if (readiness >= 80) {
    signal = "green";
    summaryLine = "구글에 보일 준비가 잘 돼 있어요.";
  } else if (readiness >= 40) {
    signal = "yellow";
    summaryLine = "구글 쪽은 조금만 더 채우면 좋아져요.";
  } else {
    signal = "red";
    summaryLine = "구글 쪽은 아직 준비가 더 필요해요. 차근차근 해봐요.";
  }

  return {
    channel: "google",
    signal,
    summaryLine,
    note: GOOGLE_PREVIEW_NOTE,
  };
}

/** null/비정상 점수를 0 으로(보수적). 점수 자체는 외부 노출 안 함 — 신호 판단에만 사용. */
function coerce(n: number | null): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// ai (grounded 실인용 게이팅 — HERO 신호)
// ---------------------------------------------------------------------------

/**
 * AI 채널 → 신호등. **grounded 실인용 게이팅(핵심)**.
 *
 * green 자격(양보 불가): llmValidation 이 존재 + grounded=true + 실인용(언급률>0) 일 때만.
 *   - grounded=false(학습기억 모드)면 언급률이 아무리 높아도 green 절대 불가
 *     (실측 인용이 아니므로 — 정직성). yellow 로 "익숙해지는 중" 정도.
 *   - grounded=true 인데 미인용(언급률 0)이면 red — "아직 AI가 잘 몰라요"(작은 가게엔 정상).
 *   - llmValidation 미존재(미측정·cost-gate 차단)면 red + 미래지향 note.
 *
 * 인과 단정 금지: "추천되면 매출↑/1위" 류 0건. 현재 상태만 정직하게 + 미래지향 응원.
 */
export function deriveAiChannelStatus(llm: LlmValidation | undefined): ChannelStatus {
  if (!llm) {
    return {
      channel: "ai",
      signal: "red",
      summaryLine: "아직 AI가 우리 가게를 잘 몰라요. 지금부터 준비하면 돼요.",
      found: false,
      note: "AI 추천은 준비가 쌓일수록 좋아져요. 너무 걱정 마세요.",
    };
  }

  // [게이팅] 실인용 여부 — grounded=true + 실제 언급(언급률>0) 일 때만 인용으로 인정.
  const cited = isGroundedCitation(llm);

  if (cited) {
    return {
      channel: "ai",
      signal: "green",
      summaryLine: "AI가 우리 가게를 추천하고 있어요. 아주 좋아요!",
      found: true,
    };
  }

  // grounded=true 인데 미인용 → red(정직: 작은 가게엔 흔하고 정상).
  if (llm.grounded) {
    return {
      channel: "ai",
      signal: "red",
      summaryLine: "아직 AI가 우리 가게를 추천하진 않아요. 같이 준비해봐요.",
      found: false,
      note: "작은 가게는 AI가 아직 모르는 게 흔해요. 지금 준비하면 먼저 잡혀요.",
    };
  }

  // grounded=false(학습기억 모드) → 실인용 아님 → green 절대 불가. yellow 로 정직 처리.
  return {
    channel: "ai",
    signal: "yellow",
    summaryLine: "AI가 우리 가게를 조금씩 익히는 중이에요.",
    found: false,
    note: "아직 실제 추천으로 확인된 건 아니에요. 꾸준히 채우면 좋아져요.",
  };
}

/**
 * [게이팅 판정] grounded 실인용인가.
 *
 * 양보 불가 조건: grounded=true 이고, 실측 언급률(geo.mentionRate 또는
 * geo.directMentionRate, 또는 aeo.appearanceRate)이 0 보다 큰 경우에만 true.
 * grounded=false 면 즉시 false(학습기억은 실인용이 아님).
 */
export function isGroundedCitation(llm: LlmValidation): boolean {
  if (!llm.grounded) return false;
  const geoMention = llm.geo
    ? Math.max(toRate(llm.geo.mentionRate), toRate(llm.geo.directMentionRate))
    : 0;
  const aeoMention = llm.aeo ? toRate(llm.aeo.appearanceRate) : 0;
  return geoMention > 0 || aeoMention > 0;
}

/** 비율(0-1)을 안전하게 정규화 — NaN/음수 → 0. */
function toRate(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// 통합: DiagnosisJson → ChannelStatus[]
// ---------------------------------------------------------------------------

/**
 * 진단 산출(DiagnosisJson)을 S2 채널 신호등 3종(naver/google/ai)으로 번역한다.
 *
 * 정보 계층(05 §1-A): AI 가 HERO 이지만 이 함수는 데이터만 산출한다(배치/크기는 화면 책임).
 * 반환 순서는 안정적으로 naver, google, ai (화면이 연료 순서대로 렌더하기 좋게).
 */
export function deriveChannelStatuses(diagnosis: DiagnosisJson): ChannelStatus[] {
  const { meta, scores } = diagnosis;
  return [
    deriveNaverChannelStatus(meta.naverPresence),
    deriveGoogleChannelStatus({ seo: scores.seo, geo: scores.geo }),
    deriveAiChannelStatus(meta.llmValidation),
  ];
}

// ---------------------------------------------------------------------------
// route 경로용: measured engine_results 부재 시 폴백
// ---------------------------------------------------------------------------
//
// 저장된 채널 measurement(engine_results evidence)가 없는 read 경로(route)는
// "아직 채널별로는 측정 전" 상태를 정직하게 노출한다 — 점수/인과 단정 없이,
// 신호등은 보수적으로, note 로 한계를 밝힌다.

/** route(view) 경로용 입력 — 전달 레이어가 가진 최소 정보(전체 신호등 한 가지). */
export interface ChannelStatusViewInput {
  /** 진단 전체 신호등(07 §4 파생, 미산출 시 null). 점수 원본은 받지 않는다. */
  overallSignal: HealthBand | null;
  /** 진단 완료 여부 — 미완료면 모든 채널을 "준비 중"으로. */
  completed: boolean;
}

/**
 * 저장된 채널 measurement 없이(view 만으로) 채널 신호등을 산출한다(v1 정직 폴백).
 *
 * 정직성: 채널 원자료가 없으면 채널별 단정은 하지 않는다.
 *   - 미완료 → 3채널 모두 "준비 중"(yellow) + note.
 *   - 완료 → naver/google 은 전체 신호등을 보수적으로 반영하되 "맛보기/다음 단계" note,
 *            ai 는 grounded 실인용 근거가 없으므로 green 절대 불가(게이팅) → red + 미래지향 note.
 * 점수(number)는 어디에도 노출하지 않는다.
 */
export function deriveChannelStatusesFromView(input: ChannelStatusViewInput): ChannelStatus[] {
  if (!input.completed) {
    const line = "아직 살펴보는 중이에요. 조금만 기다려 주세요.";
    return (["naver", "google", "ai"] as const).map((channel) => ({
      channel,
      signal: "yellow" as Signal,
      summaryLine: line,
      note: "진단이 끝나면 채널별로 더 정확히 알려드릴게요.",
    }));
  }

  const base = overallToSignal(input.overallSignal);
  return [
    {
      channel: "naver",
      signal: base,
      summaryLine: naverViewLine(base),
      note: "채널별 자세한 노출은 다음 진단에서 더 정확해져요.",
    },
    {
      channel: "google",
      signal: base,
      summaryLine: googleViewLine(base),
      note: GOOGLE_PREVIEW_NOTE,
    },
    {
      // ai 는 grounded 실인용 근거(llmValidation) 없이는 green 불가(게이팅).
      channel: "ai",
      signal: "red",
      summaryLine: "아직 AI가 우리 가게를 잘 몰라요. 지금부터 준비하면 돼요.",
      found: false,
      note: "AI 추천은 준비가 쌓일수록 좋아져요. 너무 걱정 마세요.",
    },
  ];
}

/** HealthBand(good/fair/weak/poor) → Signal(green/yellow/red). weak/poor/null → red(보수적). */
function overallToSignal(band: HealthBand | null): Signal {
  switch (band) {
    case "good":
      return "green";
    case "fair":
      return "yellow";
    default:
      // weak / poor / null → red (보수적).
      return "red";
  }
}

function naverViewLine(signal: Signal): string {
  switch (signal) {
    case "green":
      return "네이버 쪽은 잘 되고 있는 편이에요.";
    case "yellow":
      return "네이버는 조금만 더 채우면 좋아져요.";
    case "red":
      return "네이버부터 채우면 좋겠어요. 같이 해봐요.";
  }
}

function googleViewLine(signal: Signal): string {
  switch (signal) {
    case "green":
      return "구글에 보일 준비가 잘 돼 있는 편이에요.";
    case "yellow":
      return "구글 쪽은 조금만 더 채우면 좋아져요.";
    case "red":
      return "구글 쪽은 아직 준비가 더 필요해요.";
  }
}

// ---------------------------------------------------------------------------
// route(view) 경로용: 영속화된 engine_results → S2 채널 신호등 (실데이터 경로)
// ---------------------------------------------------------------------------
//
// 04 §4 영속화 이후: engine_results(채널별 진단 항목 + 내부 점수)가 기록되므로, route 는
// 추측/전체신호등 폴백 대신 채널별(naver/google/ai_citation) 실데이터로 신호등을 산출한다.
//
// 점수 비노출(07 §4): impactScore/priority 는 내부 신호 — 신호등 판정에만 쓰고 응답엔 signal 만.
// AI 게이팅 유지: grounded 실인용 measurement 가 없으면 ai 채널은 green 불가.
// 미진단(빈 배열)이면 정직 빈 상태(준비 중)로.

/** 영속화된 engine_result 한 줄(앱層 — persistence-repository 가 반환). */
export interface PersistedEngineResultLike {
  /** naver | google | ai_citation. */
  channel: string;
  code: string;
  /** 내부 점수(impactScore) — 신호 판정 전용(응답 노출 0). */
  impactScore: number | null;
  /** high | medium | low — 갭 시급도(내부 신호). */
  priority: "high" | "medium" | "low";
  evidence: Record<string, unknown> | null;
  collectedAt: string;
}

/** 채널별 미진단 시 "아직 측정 전" 신호등 1줄(준비 중 — 추측 0). */
function notMeasuredChannel(channel: Channel): ChannelStatus {
  return {
    channel,
    signal: "yellow",
    summaryLine: "아직 살펴보는 중이에요. 조금만 기다려 주세요.",
    note: "진단이 끝나면 채널별로 더 정확히 알려드릴게요.",
    source: "unavailable",
    measurementLabel: "unavailable",
    evidence: { reason: "not_measured" },
  };
}

/** 채널의 미통과 항목 시급도(high 가중)로 신호등을 판정한다(내부 점수 — 외부 노출 0). */
function gapDensityToSignal(rows: PersistedEngineResultLike[]): Signal {
  if (rows.length === 0) return "green";
  const high = rows.filter((r) => r.priority === "high").length;
  if (high === 0) return rows.length <= 2 ? "green" : "yellow";
  if (high <= 2) return "yellow";
  return "red";
}

export function deriveChannelStatusesFromPersisted(
  rows: PersistedEngineResultLike[],
): ChannelStatus[] {
  if (rows.length === 0) {
    return (["naver", "google", "ai"] as const).map((c) => notMeasuredChannel(c));
  }

  const measurementRows = rows.filter(
    (row) =>
      row.code === BUSINESS_PRESENCE_MEASUREMENT_CODE ||
      row.code === LLM_VALIDATION_MEASUREMENT_CODE,
  );
  const signalRows = rows.filter(
    (row) =>
      row.code !== BUSINESS_PRESENCE_MEASUREMENT_CODE &&
      row.code !== LLM_VALIDATION_MEASUREMENT_CODE,
  );
  const naverRows = signalRows.filter((r) => r.channel === "naver");
  const googleRows = signalRows.filter((r) => r.channel === "google");
  const aiRows = signalRows.filter((r) => r.channel === "ai_citation");
  const businessPresence = getBusinessPresenceMeasurement(measurementRows);
  const llmValidation = getLlmValidationMeasurement(measurementRows);

  const naverSignal = gapDensityToSignal(naverRows);
  const googleSignal = gapDensityToSignal(googleRows);
  const aiRaw = gapDensityToSignal(aiRows);
  const aiSignal: Signal = aiRaw === "green" ? "yellow" : aiRaw;

  return [
    {
      channel: "naver",
      signal: naverSignal,
      summaryLine: naverViewLine(naverSignal),
      ...(businessPresence?.found !== undefined ? { found: businessPresence.found } : {}),
      source: businessPresence?.source ?? "engine_results",
      collectedAt:
        businessPresence?.collectedAt ??
        pickLatestTimestamp(naverRows.map((row) => row.collectedAt)),
      evidence:
        businessPresence?.payload ??
        naverRows.map((row) => row.evidence).filter((evidence) => evidence !== null),
      measurementLabel:
        businessPresence?.measurementLabel ?? (naverRows.length > 0 ? "estimated" : "unavailable"),
      ...(businessPresence
        ? {}
        : { note: "네이버 표면 수집이 없어서 준비도 기준으로 보여드려요." }),
    },
    {
      channel: "google",
      signal: googleSignal,
      summaryLine: googleViewLine(googleSignal),
      note: GOOGLE_PREVIEW_NOTE,
      source: googleRows.length > 0 ? "engine_results" : "unavailable",
      collectedAt: pickLatestTimestamp(googleRows.map((row) => row.collectedAt)),
      evidence: googleRows.map((row) => row.evidence).filter((evidence) => evidence !== null),
      measurementLabel: googleRows.length > 0 ? "estimated" : "unavailable",
    },
    llmValidation
      ? {
          ...deriveAiChannelStatus(llmValidation.payload),
          source: llmValidation.source,
          collectedAt: llmValidation.collectedAt,
          evidence: llmValidation.payload,
          measurementLabel: llmValidation.measurementLabel,
        }
      : {
          channel: "ai",
          signal: aiSignal,
          summaryLine: aiPersistedLine(aiSignal),
          found: false,
          note: "AI 실인용 측정이 없어 준비도 기준으로만 보여드려요.",
          source: aiRows.length > 0 ? "engine_results" : "unavailable",
          collectedAt: pickLatestTimestamp(aiRows.map((row) => row.collectedAt)),
          evidence: aiRows.map((row) => row.evidence).filter((evidence) => evidence !== null),
          measurementLabel: aiRows.length > 0 ? "estimated" : "unavailable",
        },
  ];
}

/** ai 채널(영속 실데이터) 신호 → 사장님 언어 한 줄(green 없음 — 게이팅). */
function aiPersistedLine(signal: Signal): string {
  switch (signal) {
    case "yellow":
      return "AI가 우리 가게를 조금씩 익히는 중이에요.";
    default:
      return "아직 AI가 우리 가게를 잘 몰라요. 지금부터 준비하면 돼요.";
  }
}
