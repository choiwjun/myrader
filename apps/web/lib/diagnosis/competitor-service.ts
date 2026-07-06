// @TASK P2-R3 - competitor 변환·정직성 (전달 레이어: DiagnosisJson → 실측 라이벌)
// @SPEC specs/domain/resources.yaml (competitor: id/name/channel/beatsMe/rank/source)
// @SPEC specs/screens/vs-competitor.yaml (S3: 손실 프레이밍 / source 배지 / 익명화)
// @SPEC docs/planning/07-coding-convention.md §4 (점수 비노출·인과 단정·전문용어 0)
// @SPEC docs/planning/05-design-system.md §1-A/§5 (라이벌 비교·손실 프레이밍·응원 톤)
// @SPEC packages/contracts/src/diagnosis.ts (NaverCompetitor / LlmCompetitor 정직성 원칙)
// @TEST apps/web/tests/diagnosis/competitor-service.test.ts
//
// 책임(REQ-003, S3): 진단 산출(DiagnosisJson)의 naverPresence.competitorTop(실측 SERP) +
// llmValidation.competitors(grounded AI)를 "실측 라이벌(누가)" 카드로 "번역"한다.
//
// 정직성 가드(07 §4 — 양보 불가):
//   1. '실측 라이벌(누가)'만 — '어떻게(역공학 갭)'는 P2-R4 gapItem 담당(명확히 구분).
//   2. source 1:1 대응 — naver_serp→channel naver, gpt_grounded→channel ai. 추측 경쟁사 금지.
//      contracts 가 이미 신뢰 소스(실 SERP 랭킹 / grounded 구조화 추출)만 채우므로,
//      여기서는 그 신뢰 항목을 그대로 번역만 한다(휴리스틱 추출명 재생성 0).
//   3. beatsMe — competitorTop/competitors 는 정의상 "내 대신/나보다 위" 항목이므로 true.
//      (손실 프레이밍 카드 트리거.) 인과 단정("따라하면 1위")은 카피에 0건.
//   4. 익명화 옵션 — anonymize=true 면 실명 비노출(마스킹). 경쟁사 비방·오인 금지.
//   5. 신뢰 추출 실패(미존재/빈/grounded=false)면 카드 생략(빈 배열) — 추측 경쟁사 표시 0.
//   6. 전문용어(SERP/grounded/snippet) UI 카피 노출 0. 점수(number) 노출 0.
//
// 이 모듈은 순수 함수다 — 무거운 엔진 배럴(@boina/engine 등)을 끌고 오지 않고
// contracts 타입(DiagnosisJson)만 의존한다(P2-R2 channel-status-service 와 동형).

import type { DiagnosisJson, LlmValidation, NaverPresence } from "@boina/contracts/diagnosis";

/** 경쟁사 출처(실측 채널) — contracts 의 신뢰 소스 리터럴과 1:1. */
export type CompetitorSource = "naver_serp" | "gpt_grounded";

/** 경쟁사가 앞서는 채널 — source 와 1:1(naver_serp→naver, gpt_grounded→ai). */
export type CompetitorChannel = "naver" | "ai";

/**
 * 화면(S3)용 실측 라이벌 — resources.yaml competitor 필드와 1:1.
 * 점수 원본/추측 이름은 이 객체에 절대 담지 않는다(07 §4). source 로 출처 정직 표기.
 */
export interface Competitor {
  /** UUID v4 (런타임 생성 — 영속화 전 화면 식별자). */
  id: string;
  /** 경쟁사 이름(익명화 옵션 시 마스킹). 신뢰 소스 실명만. */
  name: string;
  /** naver | ai — 어디서 앞서는지(source 와 1:1). */
  channel: CompetitorChannel;
  /** true = 옆집이 나보다 위(손실 프레이밍 트리거). competitorTop/competitors 는 정의상 true. */
  beatsMe: boolean;
  /** 노출 순위(naver_serp 만, 1-based). 선택. */
  rank?: number;
  /** naver_serp | gpt_grounded — 실측 출처(정직 표기용). */
  source: CompetitorSource;
  /** evidence sheet 용 수집 시각(ISO 8601). */
  collectedAt?: string;
  /** evidence sheet 용 원근거(raw/structured). */
  evidence?: unknown;
  /** measured | estimated | unavailable */
  measurementLabel?: "measured" | "estimated" | "unavailable";
}

/** 변환 옵션 — 익명화 등 노출 정책(resources.yaml/05 규율). */
export interface CompetitorOptions {
  /** true 면 실명 비노출(마스킹). 기본 false(실명 노출). */
  anonymize?: boolean;
  /** stored llmValidation raw evidence(있으면 AI 경쟁사 카드 근거에 sampleQuery/mentionedInQueries 연결). */
  llmMeasurement?: LlmValidation;
}

// ---------------------------------------------------------------------------
// 입력 — 전달 레이어가 손에 든 진단 원자료(둘 다 선택; 신뢰 소스만 들어온다)
// ---------------------------------------------------------------------------

export interface CompetitorInput {
  /** 네이버 실측 노출(competitorTop 포함). 없으면 naver 경쟁사 0. */
  naver?: NaverPresence;
  /** AI grounded 측정(competitors 포함). grounded=false 면 AI 경쟁사 0(게이팅). */
  llm?: LlmValidation;
}

// ---------------------------------------------------------------------------
// 핵심 변환: 신뢰 소스 → Competitor[] (추측 0)
// ---------------------------------------------------------------------------

/**
 * 진단 원자료의 신뢰 경쟁사(naverPresence.competitorTop + llmValidation.competitors)를
 * S3 실측 라이벌 카드로 번역한다.
 *
 * 정직성:
 *   - naver_serp 는 실 SERP 랭킹 항목(내 업체 제외) — channel naver, rank 보존.
 *   - gpt_grounded 는 grounded 구조화 추출 항목(내 업체 제외) — channel ai.
 *     grounded=false(학습기억 모드)면 실측이 아니므로 AI 경쟁사를 산출하지 않는다(게이팅).
 *   - 이름이 비거나 공백뿐이면 제외(틀린/빈 이름 노출 < 생략).
 *   - 둘 다 없으면 빈 배열(카드 생략 — 추측 경쟁사 표시 0).
 *
 * beatsMe 는 둘 다 true: 이 배열들은 정의상 "내 대신 추천/나보다 위" 항목이다.
 */
export function deriveCompetitors(
  input: CompetitorInput,
  options: CompetitorOptions = {},
): Competitor[] {
  const anonymize = options.anonymize === true;
  const result: Competitor[] = [];

  // naver_serp 실측 — rank 오름차순(상위 우선) 안정 정렬.
  const naverTop = input.naver?.competitorTop ?? [];
  const sortedNaver = [...naverTop].sort((a, b) => a.rank - b.rank);
  let naverIdx = 0;
  for (const c of sortedNaver) {
    const name = cleanName(c.name);
    if (!name) continue; // 빈/공백 이름은 제외(추측 금지).
    result.push({
      id: makeUuidV4(),
      name: anonymize ? anonName("naver", naverIdx) : name,
      channel: "naver",
      beatsMe: true,
      rank: c.rank,
      source: "naver_serp",
    });
    naverIdx += 1;
  }

  // gpt_grounded AI — grounded=true 일 때만(게이팅). 빈도순은 contracts 가 보장(빈도순 정렬).
  const groundedCited = input.llm?.grounded === true;
  const llmComps = groundedCited ? (input.llm?.competitors ?? []) : [];
  let aiIdx = 0;
  for (const c of llmComps) {
    const name = cleanName(c.name);
    if (!name) continue; // 빈/공백 이름은 제외(추측 금지).
    result.push({
      id: makeUuidV4(),
      name: anonymize ? anonName("ai", aiIdx) : name,
      channel: "ai",
      beatsMe: true,
      source: "gpt_grounded",
      // rank 는 naver_serp 전용(AI 추천은 순위 개념 아님) — 발명 금지로 미부착.
    });
    aiIdx += 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 손실 프레이밍 헤드라인 (있으면 손실·응원 톤 / 없으면 응원)
// ---------------------------------------------------------------------------

/**
 * S3 loss_headline — beatsMe 경쟁사 유무로 손실/응원 메시지를 구성한다.
 *
 * 정직성: 손실은 사실 기반(beatsMe 경쟁사 실재)일 때만. 없을 땐 손실 단정 금지 →
 * "아직 비교 데이터를 못 모았어요"(중립, 측정 부재). 실측 우위일 때만 칭찬.
 * 인과 단정·전문용어·점수 0. 경쟁사 비방 0(이름 미언급).
 */
export function buildLossHeadline(competitors: Competitor[]): string {
  const beating = competitors.filter((c) => c.beatsMe);
  if (beating.length === 0) {
    // 측정 부재 ≠ 실측 우위 — 정직하게 "아직 비교 못 함"으로 표시(승리 단정 금지).
    return "아직 옆집 비교 데이터를 못 모았어요. 진단이 완료되면 보여드릴게요.";
  }
  // 채널을 사장님 언어로 — 손실을 앞에, 응원 톤으로.
  const hasNaver = beating.some((c) => c.channel === "naver");
  const hasAi = beating.some((c) => c.channel === "ai");
  if (hasNaver && hasAi) {
    return "옆집은 네이버에도, AI에도 먼저 보여요. 우리도 같이 채워봐요.";
  }
  if (hasAi) {
    return "옆집은 AI가 먼저 추천하고 있어요. 우리 가게도 같이 준비해봐요.";
  }
  return "옆집은 네이버에서 먼저 보이고 있어요. 우리도 같이 채워봐요.";
}

// ---------------------------------------------------------------------------
// source 배지 (출처 정직 표기 — 사장님 언어, 과장 0)
// ---------------------------------------------------------------------------

/**
 * source → 사장님 언어 출처 배지(S3 source_badge).
 * 정직성: 어디서 나온 비교인지 정직하게(과장 0, 전문용어 0).
 */
export function sourceToBadge(source: CompetitorSource): string {
  switch (source) {
    case "naver_serp":
      return "네이버 검색에서 확인했어요";
    case "gpt_grounded":
      return "AI에게 직접 물어 확인했어요";
  }
}

// ---------------------------------------------------------------------------
// 통합: DiagnosisJson → Competitor[] (전체 원자료가 있을 때)
// ---------------------------------------------------------------------------

/**
 * 진단 산출(DiagnosisJson)을 S3 실측 라이벌로 번역한다.
 * 전체 DiagnosisJson 이 있는 경로(잡 핸들러·미래 영속화)용.
 */
export function deriveCompetitorsFromDiagnosis(
  diagnosis: DiagnosisJson,
  options: CompetitorOptions = {},
): Competitor[] {
  return deriveCompetitors(
    { naver: diagnosis.meta.naverPresence, llm: diagnosis.meta.llmValidation },
    options,
  );
}

// ---------------------------------------------------------------------------
// route(view) 경로용: persisted competitors 부재 시 정직 폴백
// ---------------------------------------------------------------------------
//
// 저장된 competitors/measurement 가 없는 read 경로(route)는 "신뢰 경쟁사 없음"을 정직하게
// 노출한다 — 추측 경쟁사 0(빈 배열) + 응원 헤드라인.
// 저장된 competitors 가 있으면 deriveCompetitorViewFromPersisted 를 쓴다.

/** route(view) 폴백 결과 — 화면이 그대로 렌더. */
export interface CompetitorViewResult {
  competitors: Competitor[];
  /** 손실/응원 헤드라인(빈 배열이면 응원). */
  headline: string;
}

/**
 * 저장된 competitors 없이(view 만으로) 실측 라이벌을 산출한다(v1 정직 폴백).
 *
 * 정직성: 신뢰 경쟁사 원자료가 없으면 추측 경쟁사를 만들지 않는다(빈 배열 = 카드 생략).
 * 헤드라인은 손실 단정 금지 → 측정 부재 표시("아직 비교 데이터를 못 모았어요" — 승리 단정 0).
 * 점수/전문용어/인과 0.
 */
export function deriveCompetitorViewFromView(): CompetitorViewResult {
  const competitors: Competitor[] = [];
  return { competitors, headline: buildLossHeadline(competitors) };
}

// ---------------------------------------------------------------------------
// route(view) 경로용: 영속화된 competitors → S3 실측 라이벌 (실데이터 경로)
// ---------------------------------------------------------------------------
//
// 04 §4 영속화 이후: competitors(신뢰 소스만 — naver_serp/gpt_grounded)가 DB 에 기록되므로,
// route 는 추측 폴백 대신 실데이터로 라이벌 카드를 렌더한다. 점수 비노출 — source 로 출처 정직 표기.

/** 영속화된 competitor 한 줄(앱層 — persistence-repository 가 반환). */
export interface PersistedCompetitorLike {
  name: string;
  source: "naver_serp" | "gpt_grounded" | "manual";
  serpRank: number | null;
  collectedAt: string;
}

/**
 * 영속화된 competitors → S3 실측 라이벌(실데이터 경로 — 추측 0).
 *
 * 정직성: 신뢰 소스(naver_serp 실측 / gpt_grounded grounded 추출)만 저장돼 있으므로 그대로 번역만 한다.
 *   - source manual 은 신뢰 채널이 아니므로 카드에서 제외(추측 경쟁사 표시 0).
 *   - 이름이 비면 제외. beatsMe 는 정의상 true(저장된 건 "내 대신/나보다 위"). 익명화 옵션 지원.
 */
export function deriveCompetitorViewFromPersisted(
  rows: PersistedCompetitorLike[],
  options: CompetitorOptions = {},
): CompetitorViewResult {
  const anonymize = options.anonymize === true;
  const competitors: Competitor[] = [];
  let naverIdx = 0;
  let aiIdx = 0;
  const naver = rows
    .filter((r) => r.source === "naver_serp")
    .sort((a, b) => (a.serpRank ?? 0) - (b.serpRank ?? 0));
  const ai = rows.filter((r) => r.source === "gpt_grounded");
  for (const r of naver) {
    const name = cleanName(r.name);
    if (!name) continue;
    const c: Competitor = {
      id: makeUuidV4(),
      name: anonymize ? anonName("naver", naverIdx) : name,
      channel: "naver",
      beatsMe: true,
      source: "naver_serp",
      collectedAt: r.collectedAt,
      evidence: { serpRank: r.serpRank },
      measurementLabel: "measured",
    };
    if (r.serpRank !== null) c.rank = r.serpRank;
    competitors.push(c);
    naverIdx += 1;
  }
  for (const r of ai) {
    const name = cleanName(r.name);
    if (!name) continue;
    const matchedEvidence = options.llmMeasurement?.competitors?.find(
      (candidate) => cleanName(candidate.name) === name,
    );
    competitors.push({
      id: makeUuidV4(),
      name: anonymize ? anonName("ai", aiIdx) : name,
      channel: "ai",
      beatsMe: true,
      source: "gpt_grounded",
      collectedAt: r.collectedAt,
      evidence: matchedEvidence ?? { name },
      measurementLabel: "measured",
    });
    aiIdx += 1;
  }
  return { competitors, headline: buildLossHeadline(competitors) };
}

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

/** 이름 정규화 — 양끝 공백 제거. 빈/공백뿐이면 빈 문자열(제외 신호). */
function cleanName(raw: string): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** 익명화 표시 이름(실명 비노출, 비방·오인 금지 — 중립 라벨). */
function anonName(channel: CompetitorChannel, idx: number): string {
  const where = channel === "naver" ? "네이버" : "AI";
  return idx === 0 ? `${where}에서 앞선 옆집` : `${where}에서 앞선 옆집 ${idx + 1}`;
}

/**
 * UUID v4 생성(런타임 화면 식별자). crypto.randomUUID 우선, 미지원 환경 폴백.
 * 영속화 ID 가 아니다(원자료 미영속화 — id 는 화면 키 용도).
 */
function makeUuidV4(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // 폴백(테스트/구형 런타임): v4 형식 보장.
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[(Math.floor(Math.random() * 16) & 0x3) | 0x8] as string;
    else out += hex[Math.floor(Math.random() * 16)] as string;
  }
  return out;
}
