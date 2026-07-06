// @TASK P1-R2 - 진단 잡 핸들러: x-sag runDiagnosisPipeline 배선 + 비용 게이팅
// @SPEC docs/planning/02-trd.md §2 (데이터소스·비용 게이팅) / §3 (잡 상태 → diagnosis)
// @SPEC docs/planning/07-coding-convention.md §2 (엔진 경계: @boina/engine 배럴 + contracts 타입만)
// @TEST apps/web/tests/diagnosis/diagnosis-pipeline.test.ts
//
// 잡 워커가 "diagnosis" 타입 잡을 집으면 이 핸들러가:
//   1. running 진입은 큐(JobQueue)가 처리 (핸들러는 상태 전이를 직접 만지지 않음).
//   2. 비용 게이팅: grounded llmValidation·SERP 는 cost-gate 통과 시에만 활성.
//      - 무료/테스트 경로: 게이트 차단 or 키 없음 → enableLlmValidation=false →
//        엔진은 mock provider/rule-based 로 완주(실 외부 호출 0).
//   3. runDiagnosisPipeline(@boina/engine 배럴) 실행 → DiagnosisPipelineOutput.
//   4. 산출 점수/요약을 diagnoses 행에 반영(reflectDiagnosisResult → completed).
//   5. throw 시 diagnoses.status=failed 로 반영 후 re-throw(큐가 failed 전이 + 에러 stamp).
//
// 엔진 경계(07 §2): @boina/engine 의 선언된 배럴 export(runDiagnosisPipeline)와
// @boina/contracts 타입으로만 통신한다. deep import 금지.

import type { Category, SourceType } from "@boina/contracts/enums";
import type { DbClient } from "@boina/db/client";
// 타입만 정적 import(빌드 시 erase) — 무거운 엔진 값(Playwright 등 server-only 의존)은
// 실행 시점에 lazy import 한다(07 §2 경계는 배럴 export 유지, 읽기 경로 비번들).
import type { DiagnosisPipelineInput, DiagnosisPipelineOutput } from "@boina/engine";
import type { Job, JobHandler } from "@boina/jobs";
import { type CostGate, type CostGateContext, defaultCostGate } from "@boina/jobs/gating";
import { isMockFallbackAllowed } from "../shared/runtime-env.js";
import {
  type CompetitorBusinessProfile,
  type SerpCompetitorDiscoverer,
  deriveCompetitorInput,
} from "./competitor-derivation.js";
import { mapCrawlFailureToReason } from "./crawl-failure.js";
import { buildPersistencePlan } from "./diagnosis-persistence.js";
import {
  type DiagnosisRepository,
  markDiagnosisFailed,
  reflectDiagnosisResult,
} from "./diagnosis-service.js";
import type { GapAnalyzerPort, GapInputLike, GapResultLike } from "./gap-service.js";
import { MockGapAnalyzer, buildMockAssetFaqs, buildMockDiagnosisOutput } from "./mock-pipeline.js";
import { persistDiagnosisArtifacts } from "./persistence-repository.js";
import { DEFAULT_DIAGNOSIS_TIMEOUT_MS, withTimeout } from "./with-timeout.js";

/**
 * production 에서 신뢰할 수 있는 경쟁사 신호가 전혀 없을 때(실 SERP/grounded 0)의 fail-fast 에러.
 * 개발/test 는 mock 샘플로 완주하므로 발생하지 않는다(runtime-env.isMockFallbackAllowed).
 * 핸들러가 이를 잡아 markDiagnosisFailed 로 전이한다(가짜 경쟁사 노출 0 — production 정직성).
 */
export class NoCompetitorDataInProductionError extends Error {
  constructor() {
    super(
      "diagnosis: no trusted competitor signal available in production (mock samples are disabled).",
    );
    this.name = "NoCompetitorDataInProductionError";
  }
}

/** 진단 잡 페이로드 — 엔진 입력에 필요한 비즈니스 프로파일 + 대상. */
export interface DiagnosisJobPayload {
  /** 반영할 diagnoses 행 id. */
  diagnosisId: string;
  /** 진단 대상 URL(또는 플랫폼 URL). */
  target: string;
  /** 진단 surface 유형 (기본 website). */
  sourceType?: SourceType;
  /** 엔진 분석에 필요한 비즈니스 프로파일. */
  businessProfile: {
    businessName: string;
    industry: string;
    region: string;
    mainServices: string[];
    targetKeywords: string[];
  };
  /** 분석 모듈(seo/aeo/geo …). */
  modules: Category[];
  /**
   * grounded LLM 가시성 검증(HERO 신호)을 이번 진단에서 요청하는지.
   * 요청해도 비용 게이트 통과 + 키 존재일 때만 실제 활성(무분별 호출 금지).
   * 기본 false — 무료/기본 경로는 엔진 mock/rule-based 로 완주(실외부호출 0).
   */
  requestLlmValidation?: boolean;
  /**
   * 역공학 갭(GapAnalyzer) 라이브 호출용 수동/mock competitorUrls.
   * FR-012 MVP: 실 SERP 자동발견 키 0(OQ-4 [OPEN]) — 수동 주입만. 비면 갭 0(추측 0).
   */
  competitorUrls?: string[];
}

/** 파이프라인 러너 시그니처(주입 가능 — 테스트 mock). 기본은 엔진 배럴 export. */
export type RunDiagnosisPipeline = (
  input: DiagnosisPipelineInput,
) => Promise<DiagnosisPipelineOutput>;

/**
 * 기본 파이프라인 러너 — 환경에 따라 실 엔진 또는 dev-mock 샘플을 반환한다.
 *
 * ★ 버그 수정(브라우저 실사용): dev 에서도 실 @boina/engine.runDiagnosisPipeline 을 호출해
 *   mock 후보의 가짜 place.naver.com URL 을 실제로 크롤하려다 죽어 모든 진단이 failed 였다
 *   (place-search·경쟁사는 mock 인데 진단 파이프라인 자체는 mock 이 아니었음). place-search·
 *   payment 가 이미 쓰는 동일 게이트(runtime-env.isMockFallbackAllowed)를 진단에도 적용한다.
 *
 * 분기(place-search/payment 와 동형):
 *   - isMockFallbackAllowed()(production 아님 = dev/test/실키없음) → 실 엔진 대신 mock 샘플
 *     DiagnosisPipelineOutput 반환(실 크롤/LLM/SERP 호출 0 — completed 완주, S2~S6 실데이터).
 *   - production → 실 @boina/engine 배럴 lazy import 해 실행(실 네이버/엔진).
 *
 * lazy import: 정적 import 를 피해 읽기/상태조회 경로가 무거운 엔진(Playwright 등)을 번들하지
 * 않게 한다(07 §2 경계: 선언된 배럴 export 인 runDiagnosisPipeline 만 사용 — deep import 금지).
 */
const defaultRunPipeline: RunDiagnosisPipeline = async (input) => {
  // dev/test/실키없음: 가짜 후보 URL 실크롤로 죽지 않도록 mock 샘플로 완주(외부호출 0).
  if (isMockFallbackAllowed()) {
    return buildMockDiagnosisOutput(input);
  }
  // production: 실 엔진(실 네이버/크롤/LLM). 실키·실측 경로 유지.
  const { runDiagnosisPipeline } = await import("@boina/engine");
  return runDiagnosisPipeline(input);
};

/**
 * 기본 GapAnalyzer 로더 — 환경에 따라 실 엔진 또는 dev-mock 폴백 GapAnalyzer 를 배선한다.
 *
 * - production: 잠든 엔진 v2/gap 배럴(@boina/engine/v2/gap)을 lazy import 해 실 GapAnalyzer 사용
 *   (07 §2 경계: 선언된 서브경로 export(./v2/gap)만 — deep import 0). runPipeline 패턴과 동형.
 * - dev/test/실키없음(isMockFallbackAllowed): 앱層 MockGapAnalyzer 사용(엔진 동적 import 0).
 *
 * ★ import 는 **문자열 리터럴**(`@boina/engine/v2/gap`)로 고정한다 — 변수 specifier 동적
 *   import 은 webpack 이 "request of a dependency is an expression"으로 정적 분석/번들에 실패해
 *   프로덕션 런타임에서 모듈 해석이 깨질 수 있다(감사 적발). 위 runDiagnosisPipeline 의
 *   `import("@boina/engine")` 리터럴 패턴과 동형. dev 는 MockGapAnalyzer 로 우회(이 경로 미진입).
 */
async function loadDefaultGapAnalyzer(): Promise<GapAnalyzerPort> {
  // dev/test/실키없음: 앱層 폴백을 쓴다(엔진 동적 import 0).
  if (isMockFallbackAllowed()) {
    return new MockGapAnalyzer();
  }
  // production: 실 엔진 GapAnalyzer(선언된 v2/gap 배럴 lazy import — 문자열 리터럴 고정).
  const mod = (await import("@boina/engine/v2/gap")) as unknown as {
    GapAnalyzer: new () => { analyze(input: GapInputLike): GapResultLike };
  };
  const instance = new mod.GapAnalyzer();
  return { analyze: (input) => instance.analyze(input) };
}

/** 핸들러 의존성(주입) — 저장소·파이프라인·비용 게이트·영속화 DB·GapAnalyzer. */
export interface DiagnosisHandlerDeps {
  repo: DiagnosisRepository;
  /** 기본: @boina/engine runDiagnosisPipeline. 테스트는 mock 주입(실외부호출 0). */
  runPipeline?: RunDiagnosisPipeline;
  /** 기본: @boina/jobs defaultCostGate. 게이트 차단 시 grounded/llm 비활성. */
  costGate?: CostGate;
  /**
   * 영속화 대상 DB(04 §4 5종 테이블 insert). 미주입이면 영속화 생략(점수/요약만 반영 —
   * 기존 동작 호환, 단위 테스트 보호). 주입 시 진단 산출을 5종 테이블에 일관 기록한다.
   */
  db?: DbClient;
  /**
   * GapAnalyzer 주입(테스트 mock). 기본: 잠든 엔진 v2/gap 배럴 lazy import(loadDefaultGapAnalyzer).
   */
  gapAnalyzer?: GapAnalyzerPort;
  /**
   * SERP 경쟁사 자동발견자 주입(테스트). 기본: defaultSerpCompetitorDiscoverer
   * (운영에서 grounded 신호 없을 때 엔진 v2/serp+v2/competitor lazy import — OQ-4 착수).
   */
  discoverSerp?: SerpCompetitorDiscoverer;
  /**
   * 핸들러 전체 타임아웃(ms). 초과 시 markDiagnosisFailed(reason=TIMEOUT) 후 re-throw.
   * 기본 DEFAULT_DIAGNOSIS_TIMEOUT_MS(엔진 스테이지 예산 + 영속화 여유).
   */
  timeoutMs?: number;
}

/**
 * 이번 진단에서 비용 발생 작업(grounded llmValidation)을 켤지 게이트로 판단한다.
 *
 * 정책:
 *  - requestLlmValidation 미요청 → 무조건 false(무분별 호출 금지, TRD §2 게이팅).
 *  - 요청 → cost-gate 통과 시에만 true. 차단(예산/쿼터/캐시)이면 false.
 * (실 LLM provider 키 유무는 엔진 isLlmEnabled() 가 추가로 가드 — 키 없으면
 *  enableLlmValidation=true 라도 mock 으로 동작하여 실 호출 0.)
 */
async function decideLlmValidation(
  costGate: CostGate,
  payload: DiagnosisJobPayload,
): Promise<boolean> {
  if (!payload.requestLlmValidation) return false;
  const ctx: CostGateContext = {
    operation: "llm_validation",
    diagnosisId: payload.diagnosisId,
  };
  const decision = await costGate(ctx);
  return decision.allowed;
}

/** payload → 엔진 DiagnosisPipelineInput 매핑 (contracts 타입 경계). */
function toPipelineInput(
  payload: DiagnosisJobPayload,
  enableLlmValidation: boolean,
): DiagnosisPipelineInput {
  return {
    startUrl: payload.target,
    sourceType: payload.sourceType ?? "website",
    businessProfile: payload.businessProfile,
    modules: payload.modules,
    scoringMode: "graded",
    // 무료/기본 경로: AI 추천·grounded 는 게이트 통과 시에만.
    enableAiRecommendation: false,
    enableLlmValidation,
  };
}

/** 산출물에서 한 줄 요약을 만든다(점수 비노출 — 신호등/항목 수 기반). */
function buildSummaryText(output: DiagnosisPipelineOutput): string {
  const issueCount = output.items.length;
  if (output.partialResult) {
    return "진단을 일부만 수집했어요. 다시 시도하면 더 정확해져요.";
  }
  if (issueCount === 0) {
    return "큰 문제는 발견되지 않았어요.";
  }
  return `개선할 항목 ${issueCount}개를 찾았어요.`;
}

/**
 * 진단 산출(DiagnosisPipelineOutput)을 04 §4 5종 테이블에 영속화한다(매퍼 → repository).
 *
 * - GapAnalyzer: 주입(테스트 mock) 우선, 없으면 잠든 엔진 v2/gap 배럴 lazy import(라이브 배선).
 * - assetInput: business 프로필(industry→category)로 생성물 입력 구성. FAQ 미보유면 snippet 생략(추측 0).
 * - competitorUrls: 수동/mock(실 SERP 자동발견 0). 비면 gap_rows 0.
 *
 * 점수(impactScore)는 engine_results 에 내부 저장만 — API/UI 응답엔 절대 노출하지 않는다(07 §4).
 */
async function persistArtifacts(
  db: DbClient,
  deps: DiagnosisHandlerDeps,
  payload: DiagnosisJobPayload,
  output: DiagnosisPipelineOutput,
): Promise<void> {
  const analyzer = deps.gapAnalyzer ?? (await loadDefaultGapAnalyzer());
  const bp = payload.businessProfile;

  // ★ 경쟁사 산출(수정R2-A-2): /find 가 competitorUrls 를 안 보내도 S3~S5 가 실데이터로 채워지게.
  //   - 실 grounded 경쟁사 신호가 있으면 그 이름으로 GapAnalyzer 를 트리거한다.
  //   - dev/test 는 샘플 naver_serp 경쟁사를 산출(S3~S6 렌더). production+실신호 0 → fail-fast.
  const profile: CompetitorBusinessProfile = {
    businessName: bp.businessName,
    industry: bp.industry,
    region: bp.region,
    targetKeywords: bp.targetKeywords,
  };
  // 경쟁사 산출: grounded 신호 → (dev)샘플 → (운영)SERP 자동발견(OQ-4) → 그래도 0 이면 fail-fast.
  const derived = await deriveCompetitorInput(output, profile, {
    selfUrl: payload.target,
    discoverSerp: deps.discoverSerp,
  });
  if (derived.hasNoCompetitorData) {
    // production 에서 신뢰 경쟁사 0(SERP 미구성/발견 0) → 가짜 데이터 노출 대신 fail-fast.
    throw new NoCompetitorDataInProductionError();
  }

  // payload.competitorUrls(수동/명시 주입, 테스트)가 있으면 우선 사용(하위호환), 없으면 산출값.
  const competitorUrls =
    payload.competitorUrls && payload.competitorUrls.length > 0
      ? payload.competitorUrls
      : derived.competitorUrls;

  const plan = buildPersistencePlan({
    diagnosisId: payload.diagnosisId,
    reportId: payload.diagnosisId,
    websiteUrl: payload.target,
    output,
    competitorUrls,
    // naver_serp 실측/샘플 경쟁사 → competitors 테이블(gpt_grounded 는 매퍼가 output.llmValidation 에서 별도 추출).
    naverCompetitorTop: derived.naverCompetitorTop,
    analyzer,
    assetInput: {
      businessName: bp.businessName,
      category: bp.industry,
      region: bp.region,
      // dev/실키없음: 샘플 FAQ 를 넣어 생성물 4종(snippet 포함)을 채운다(S6 실데이터). FAQ 본문은
      // "(샘플)" 표기로 정직성 유지. production 은 FAQ 미보유면 snippet 생략(추측 0) — 무영향.
      ...(isMockFallbackAllowed() ? { faqs: buildMockAssetFaqs(bp.businessName) } : {}),
    },
  });
  await persistDiagnosisArtifacts(db, plan);
}

/**
 * 진단 잡 핸들러를 만든다(의존성 주입).
 *
 * 큐 계약(@boina/jobs): 성공 반환 → 큐가 completed 전이, throw → 큐가 failed 전이.
 * 핸들러는 비즈니스 로직(파이프라인 실행 + diagnoses 행 반영)만 수행하고,
 * 실패 시 diagnoses.status=failed 를 직접 반영한 뒤 re-throw 한다(큐도 failed stamp).
 */
export function buildDiagnosisHandler(deps: DiagnosisHandlerDeps): JobHandler<DiagnosisJobPayload> {
  const runPipeline = deps.runPipeline ?? defaultRunPipeline;
  const costGate = deps.costGate ?? defaultCostGate;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_DIAGNOSIS_TIMEOUT_MS;
  const { repo, db } = deps;

  return async (job: Job<DiagnosisJobPayload>): Promise<void> => {
    const payload = job.payload;
    const diagnosisId = payload.diagnosisId;

    if (!diagnosisId) {
      throw new Error("diagnosis job payload missing diagnosisId");
    }

    try {
      if (!payload.businessProfile) {
        throw new Error("diagnosis job payload missing businessProfile");
      }
      // ★ 타임아웃(수정R2-A-3): 핸들러 전체를 상한 시간으로 감싼다. 초과 시 DiagnosisTimeoutError →
      //   catch 에서 markDiagnosisFailed(reason=TIMEOUT). 멈춘 외부 의존이 잡을 영구 running 으로
      //   고착시키지 못하게 한다(고착 방지). 엔진 자체 스테이지 타임아웃과 중첩되는 상위 가드.
      await withTimeout(async () => {
        // [비용 게이팅] grounded llmValidation 은 게이트 통과 시에만 활성.
        const enableLlmValidation = await decideLlmValidation(costGate, payload);

        // 엔진 파이프라인 실행 (07 §2 경계: 배럴 export + contracts 타입).
        const output = await runPipeline(toPipelineInput(payload, enableLlmValidation));

        // [04 §4 영속화] DB 주입 시 진단 산출을 5종 테이블에 일관 기록한다(engine_result→…→action).
        // 경쟁사 산출(FR-012/수정R2-A-2): grounded/샘플 경쟁사 → GapResult → gap_rows → actions.
        if (db) {
          await persistArtifacts(db, deps, payload, output);
        }

        // DiagnosisJson 산출 → diagnoses 행 반영(completed + overallScore + completedAt).
        await reflectDiagnosisResult(repo, diagnosisId, {
          overallScore: output.scores.overallScore,
          summaryText: buildSummaryText(output),
        });
      }, timeoutMs);
    } catch (err) {
      // 실패 반영: diagnoses.status=failed (+ 가능하면 crawlFailureReason; 타임아웃이면 TIMEOUT).
      await markDiagnosisFailed(repo, diagnosisId, {
        crawlFailureReason: mapCrawlFailureToReason(err),
      });
      // 큐도 failed 로 전이 + 에러 메시지 stamp 하도록 re-throw.
      throw err;
    }
  };
}
