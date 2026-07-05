// @TASK 수정R2-A-2 - 진단 경쟁사 산출 (파이프라인 산출 → competitors 원자료) + dev 샘플 + production fail-fast
// @SPEC docs/planning/04-database-design.md §4 (competitors/gap_rows/actions 일관 기록)
// @SPEC docs/planning/07-coding-convention.md §4 (점수 비노출 — 이름/순위/출처만)
// @SPEC x-sag-FR012-competitor-gap-wiring-spec.md (경쟁사 → GapResult)
// @TEST apps/web/tests/diagnosis/competitor-derivation.test.ts
//
// 배경(출시차단): /find enqueue 가 competitorUrls/naverCompetitorTop 을 안 보내서,
// 영속화가 competitors/gap_rows/actions 를 빈 배열로 만들어 S3/S4/S5 가 빈 화면이 되었다.
//
// 이 모듈은 잡 핸들러가 "정상 진단 완주 시 S3(경쟁)·S4(갭)·S5(행동)가 실데이터로 채워지도록"
// 경쟁사 원자료를 산출한다. 엔진 소스는 수정하지 않고(호출만), 엔진이 이미 주는 신호
// (llmValidation.competitors=grounded GPT 경쟁사)를 활용한다.
//
// ★ SERP 자동발견(OQ-4 착수): grounded 신호가 없는 운영 진단(무명 가게 등)에서 엔진의
//   SERP(@boina/engine/v2/serp) + CompetitorDiscovery(@boina/engine/v2/competitor)로 경쟁사를
//   자동 발견한다. SERP provider 가용(SERPAPI_KEY 또는 NAVER_CLIENT_ID/SECRET, 또는 X_SAG_SERP)
//   일 때만 활성 — 미구성/발견 0 이면 가짜 경쟁사 대신 fail-fast(정직성 유지).
//   실키 없는 개발/test 에선 mock 샘플 경쟁사로 S3~S6 를 렌더한다(엔진 SERP import 0).

import type { DiagnosisPipelineOutput } from "@boina/engine";
import { isMockFallbackAllowed } from "../shared/runtime-env.js";
import type { NaverCompetitorTop } from "./diagnosis-persistence.js";

/** 잡 핸들러가 영속화에 넘길 경쟁사 입력(naver_serp 실측/샘플). competitorUrls 는 GapAnalyzer 트리거. */
export interface DerivedCompetitorInput {
  /** naver_serp 출처 경쟁사(실측 또는 dev 샘플). competitors 테이블 원자료. */
  naverCompetitorTop: NaverCompetitorTop[];
  /** GapAnalyzer 라이브 호출 트리거용 URL(competitorUrls). 비면 gap_rows 0. */
  competitorUrls: string[];
}

/** 핸들러가 알아야 하는 최소 비즈니스 프로파일(샘플 경쟁사 라벨 생성용 — 추측 데이터 아님, 형식 라벨). */
export interface CompetitorBusinessProfile {
  businessName: string;
  industry: string;
  region: string;
  targetKeywords: string[];
}

/**
 * 개발/test 에서 S3~S6 가 실데이터로 렌더되도록 산출하는 샘플 경쟁사.
 *
 * 정직성: 이 값은 "실제 경쟁사 이름"이 아니라 *명백한 샘플 라벨*이다(접두사 "(샘플)").
 * 실 SERP 자동발견(OQ-4)은 [OPEN] 이므로, 개발/test 환경에서만 파이프라인 완주 UX 를
 * 검증하기 위한 데모 데이터다. production 에서는 절대 생성하지 않는다(fail-fast).
 */
export function buildSampleNaverCompetitors(
  profile: CompetitorBusinessProfile,
): NaverCompetitorTop[] {
  const keyword = (profile.targetKeywords[0] ?? profile.industry ?? "검색").trim();
  // 결정적(고정) 3건 — 순위 1~3. 이름은 샘플임을 명시(실 업체명 사칭 0).
  return [
    { name: `(샘플) ${keyword} 1위 가게`, rank: 1, query: keyword, source: "naver_serp" },
    { name: `(샘플) ${keyword} 2위 가게`, rank: 2, query: keyword, source: "naver_serp" },
    { name: `(샘플) ${keyword} 3위 가게`, rank: 3, query: keyword, source: "naver_serp" },
  ];
}

/**
 * 파이프라인 산출(grounded llmValidation.competitors)에서 신뢰 경쟁사 보유 여부를 본다.
 * grounded=true + competitors 1건 이상이면 "실 경쟁사 신호 있음".
 */
export function hasRealCompetitorSignal(output: DiagnosisPipelineOutput): boolean {
  const llm = output.llmValidation;
  return llm?.grounded === true && (llm.competitors?.length ?? 0) > 0;
}

/**
 * SERP 자동발견 함수 시그니처(주입 가능 — 테스트 격리). 운영에서 신뢰 경쟁사 신호가 없을 때
 * 엔진 SERP/CompetitorDiscovery 로 경쟁사를 자동 발견한다. 발견 0/불가면 빈 배열(→ fail-fast).
 */
export type SerpCompetitorDiscoverer = (
  profile: CompetitorBusinessProfile,
  selfUrl?: string,
) => Promise<NaverCompetitorTop[]>;

/**
 * 기본 SERP 경쟁사 발견자 — 엔진 v2/serp + v2/competitor 배럴을 lazy import(문자열 리터럴,
 * webpack 정적분석 보존)해 자동 발견한다(OQ-4 착수).
 *
 * - SERP provider 가용(createSerpAdapter().isAvailable())일 때만 발견을 수행한다. 미구성
 *   (UnavailableSerpProvider)이면 빈 배열 → 호출부가 fail-fast 유지(가짜 경쟁사 0).
 * - 실패(키 오류/네트워크/쿼터)는 진단을 깨지 않는다 — 빈 배열로 흡수(정직 fail-fast 경로).
 * - 발견 경쟁사는 SERP 출처이므로 naver_serp 로 라벨한다(competitors.source enum 내 SERP 계열).
 * - dev/test 는 이 경로에 진입하지 않는다(deriveCompetitorInput 이 그 전에 샘플로 분기).
 */
export const defaultSerpCompetitorDiscoverer: SerpCompetitorDiscoverer = async (
  profile,
  selfUrl,
) => {
  try {
    const { createSerpAdapter } = await import("@boina/engine/v2/serp");
    const adapter = createSerpAdapter();
    if (!adapter.isAvailable()) return [];

    const { CompetitorDiscoveryEngine } = await import("@boina/engine/v2/competitor");
    const result = await new CompetitorDiscoveryEngine(adapter).discover({
      industry: profile.industry,
      region: profile.region,
      targetKeywords: profile.targetKeywords,
      topN: 3,
      excludeUrls: selfUrl ? [selfUrl] : [],
    });

    const query = (profile.targetKeywords[0] ?? profile.industry ?? "검색").trim();
    return result.competitors
      .map((c, i) => ({
        name: (c.name ?? "").trim(),
        rank: typeof c.rank === "number" ? c.rank : i + 1,
        query,
        source: "naver_serp" as const,
      }))
      .filter((c) => c.name.length > 0);
  } catch {
    // SERP 실패는 진단을 깨지 않는다 — 빈 결과 → fail-fast 경로(정직성).
    return [];
  }
};

/**
 * 진단 잡의 경쟁사 입력을 산출한다(엔진 소스 무수정 — 호출 결과만 활용).
 *
 * 우선순위:
 *  1) 실 신호(grounded GPT 경쟁사)가 있으면 → naver_serp 샘플 없이 그 이름을 competitorUrls 로 승계.
 *  2) mock fallback 허용(dev/test) → 샘플 naver_serp 경쟁사 산출(S3~S6 실데이터, 엔진 SERP import 0).
 *  3) production + 실 신호 없음 → ★ SERP 자동발견(OQ-4) 시도. 발견되면 경쟁사 채움.
 *  4) production + SERP 미구성/발견 0 → hasNoCompetitorData=true 로 호출부(핸들러)가 fail-fast.
 *
 * @param opts.selfUrl 자기 매장 URL(SERP 발견에서 제외).
 * @param opts.discoverSerp SERP 발견자 주입(테스트). 미주입 시 defaultSerpCompetitorDiscoverer.
 * @returns 경쟁사 입력 + production 데이터 부재 신호.
 */
export async function deriveCompetitorInput(
  output: DiagnosisPipelineOutput,
  profile: CompetitorBusinessProfile,
  opts: { selfUrl?: string; discoverSerp?: SerpCompetitorDiscoverer } = {},
): Promise<DerivedCompetitorInput & { hasNoCompetitorData: boolean }> {
  // (1) 실 grounded 경쟁사 신호: naver_serp 샘플 없이, GapAnalyzer 트리거만 그 이름으로 채운다.
  if (hasRealCompetitorSignal(output)) {
    const names = (output.llmValidation?.competitors ?? [])
      .map((c) => c.name.trim())
      .filter((n) => n.length > 0);
    return {
      naverCompetitorTop: [],
      competitorUrls: names.map((n) => `gpt_grounded:${n}`),
      hasNoCompetitorData: false,
    };
  }

  // (2) dev/test: 샘플 경쟁사로 S3~S6 실데이터 렌더(엔진 SERP import 0).
  if (isMockFallbackAllowed()) {
    const sample = buildSampleNaverCompetitors(profile);
    return {
      naverCompetitorTop: sample,
      // GapAnalyzer 트리거: 샘플 경쟁사 이름을 competitorUrls 로 승계(gap_rows/actions 산출).
      competitorUrls: sample.map((c) => `naver_serp:${c.name}`),
      hasNoCompetitorData: false,
    };
  }

  // (3) production + 실 신호 없음 → SERP 자동발견 시도(OQ-4 착수). 발견되면 경쟁사 채움.
  const discover = opts.discoverSerp ?? defaultSerpCompetitorDiscoverer;
  const discovered = await discover(profile, opts.selfUrl);
  if (discovered.length > 0) {
    return {
      naverCompetitorTop: discovered,
      competitorUrls: discovered.map((c) => `naver_serp:${c.name}`),
      hasNoCompetitorData: false,
    };
  }

  // (4) production + SERP 미구성/발견 0 → 데이터 부재(핸들러가 fail-fast, 가짜 경쟁사 0).
  return { naverCompetitorTop: [], competitorUrls: [], hasNoCompetitorData: true };
}
