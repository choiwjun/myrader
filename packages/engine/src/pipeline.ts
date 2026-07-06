/**
 * X-SAG Core Engine — Diagnosis Pipeline (TASK-CORE-006 통합)
 *
 * Full pipeline:
 *   1. crawlSite       → CrawlResult
 *   2. analyzePage     → SEO/AEO/GEO AnalyzerResult
 *   3. scoreDiagnosis  → ScoringOutput
 *   4. classifyResults → DiagnosisItem[]
 *   5. (optional) RecommendationEngine → enriched items
 *   6. build output
 *
 * TRD § 5.2: Core Engine 은 HTTP/DB 의존 없음.
 * 모든 AI 호출은 RecommendationEngine 경유 → fallback 보장.
 */

import { analyzeA11y, analyzePage } from "./analyzers/index.js";
import { analyzeBacklink } from "./analyzers/backlink.js";
import { analyzePerf } from "./analyzers/perf.js";
import { createA11yAnalyzer } from "./v2/a11y/analyzer.js";
import { createNlpAnalyzer } from "./v2/nlp/analyzer.js";
import type { NlpInput } from "./v2/nlp/types.js";
import { createLighthouseAdapter } from "./v2/perf/adapter.js";
import type { LighthouseResult } from "./v2/perf/types.js";
import { ChatMockAeoValidator } from "./v2/aeo-validator/index.js";
import type {
	AeoValidationInput,
	AeoValidator,
} from "./v2/aeo-validator/index.js";
import {
	aggregateRecommendedCompetitors,
	ChatMockGeoValidator,
} from "./v2/geo-validator/index.js";
import type {
	GeoValidationInput,
	GeoValidationResult,
	GeoValidator,
} from "./v2/geo-validator/index.js";
import {
	getActiveLlmProvider,
	getGroundingProviderChain,
	isGroundingEnabledByEnv,
	isLlmEnabled,
	providerSupportsGrounding,
} from "./v2/llm-provider/index.js";
import {
	classifyResults,
	getRecommendedExecutionOrder,
} from "./classification.js";
import { crawlSite } from "./crawler.js";
import {
	DEFAULT_STAGE_TIMEOUTS,
	withStageTimeout,
} from "./pipeline-stage-timeout.js";
import type { StageTimeoutBudgets } from "./pipeline-stage-timeout.js";
import {
	RecommendationEngine,
	RuleBasedProvider,
	buildDefaultProviderChain,
} from "./recommendation/index.js";
import type { RecommendationEngineOptions } from "./recommendation/index.js";
import {
	applyPlatformRuleScope,
	buildBusinessPresenceModel,
	businessPresenceToCrawlResult,
	fetchBusinessPresenceSurfaces,
	fetchPlatformPresence,
	inferSurfaceKind,
} from "./platform-presence/index.js";
import {
	LEGACY_V2_SCORING_VERSION,
	SCORING_VERSION,
	scoreDiagnosis,
} from "./scoring.js";
import type { ScoringMode } from "./scoring.js";
import { createBacklinkAdapter } from "./v2/backlink/adapter.js";
import type { BacklinkResult, BacklinkSignals } from "./v2/backlink/types.js";

import type {
	DiagnosisItem,
	PlatformLimitation,
} from "@boina/contracts/diagnosis";
import type { Category, SourceType } from "@boina/contracts/enums";
import type { ScoringOutput } from "./scoring.js";
import type { CrawlOptions, CrawlResult } from "./types.js";
import type {
	BusinessPresence,
	BusinessPresenceModel,
	BusinessPresenceSurface,
	BusinessPresenceSurfaceInput,
	PlatformSourceType,
} from "./platform-presence/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiagnosisPipelineInput {
	startUrl: string;
	sourceType?: SourceType;
	businessProfile: {
		businessName: string;
		industry: string;
		region: string;
		mainServices: string[];
		targetKeywords: string[];
	};
	modules: Category[];
	businessSurfaceUrls?: BusinessPresenceSurfaceInput[];
	/** Enables live automated fetches for non-website platform URLs. Default true for core callers; production workers gate this by env/policy. */
	enablePlatformLiveFetch?: boolean;
	/** Source types explicitly approved for live public HTML fetch in the current environment. */
	platformLiveFetchAllowlist?: PlatformSourceType[];
	crawlOpts?: Partial<CrawlOptions>;
	/** AI 추천 문구 생성 활성화. 기본 false — rule-based 만 사용. */
	enableAiRecommendation?: boolean;
	/** Recommendation quality metadata generation. Default false. */
	enableRecommendationQualityCheck?: boolean;
	/** Recommendation quality pass threshold. Default 70. */
	recommendationQualityThreshold?: number;
	/**
	 * 백링크/도메인 권위 분석 활성화. 기본 false.
	 * 활성화 시 휴리스틱 어댑터로 BacklinkResult 를 계산하여
	 * backlink 카테고리 items 를 출력에 포함한다.
	 * 점수(seoScore/aeoScore/geoScore/overallScore)에는 영향 없음.
	 */
	enableBacklinkAnalysis?: boolean;
	/**
	 * 접근성(WCAG 2.1 AA) 자동 분석 활성화. 기본 false.
	 * 활성화 시 mainPage.rawHtml 을 A11yProvider 에 전달하고,
	 * a11y 카테고리 items 를 출력에 포함한다.
	 * 점수(seoScore/aeoScore/geoScore/overallScore)에는 영향 없음 (score-neutral).
	 * POLICY § 4.4/§ 8.4: rawHtml 은 분석 후 파이프라인 밖으로 전달하지 않는다.
	 */
	enableA11yAnalysis?: boolean;
	/**
	 * Lighthouse Core Web Vitals 성능 분석 활성화. 기본 false.
	 * 활성화 시 PageSpeed Insights API (또는 mock) 로 LighthouseResult 를 계산하고,
	 * perf 카테고리 items 를 출력에 포함하며 scores.perfScore 를 채운다.
	 * 점수(seoScore/aeoScore/geoScore/overallScore)에는 영향 없음 (score-neutral).
	 * 임계값이 한국 SMB 대상으로 미캘리브레이션 상태 — informational 전용.
	 * XSAG_ENABLE_PERF_ANALYSIS env 플래그로 워커에서 제어 (별도 외부 API 비용/지연).
	 */
	enablePerfAnalysis?: boolean;
	/**
	 * NLP 콘텐츠 분석 활성화. 기본 false.
	 * 활성화 시 mainPage 텍스트를 NlpProvider(rule-based 또는 ChatMock)로 분석하여
	 * ctx.nlpResult 를 채운다 — NLP 룰(NLP-* ruleId)이 실질 평가를 수행한다.
	 * 비활성화 시 nlpResult=undefined → NLP 룰은 passed=true(정보 부족)로 처리된다.
	 *
	 * SCORE-NEUTRAL 보장:
	 *   NLP- 룰은 scoring.ts 의 isScoredRule() helper 에서 점수 산식 밖으로 제외된다.
	 *   NLP 활성화 여부에 관계없이 seoScore/aeoScore/geoScore/overallScore 는 동일하다.
	 *   NLP 실패 항목은 output.items 에만 surfacing 된다 (informational).
	 *
	 * XSAG_ENABLE_NLP_ANALYSIS env 플래그로 워커에서 제어.
	 */
	enableNlpAnalysis?: boolean;
	/**
	 * WS5a: 실 LLM 가시성 검증(geo/aeo)을 informational 로 실행. 기본 false.
	 * 활성 + isLlmEnabled() 일 때만 동작하며, 결과는 `output.llmValidation` 에만 담긴다.
	 * **점수(seoScore/aeoScore/geoScore/overallScore)에는 영향 없음 (score-neutral).**
	 * 비용/지연: provider별 다수 호출 — 온디맨드(정밀 스캔) 용도 (D6). 그라운딩은
	 * XSAG_LLM_GROUNDING(WS5c)을 따른다 — OFF 면 학습기억 측정임을 disclaimer 로 명시.
	 */
	enableLlmValidation?: boolean;
	/**
	 * WS6: 채점 모드. 기본 "graded"(2.1.0). "v2"는 명시 opt-in 레거시 차감모델.
	 * 점수 산출에만 영향 — 룰/크롤/항목은 동일.
	 */
	scoringMode?: ScoringMode;
	/**
	 * GAP 3: 스테이지별 타임아웃 예산(ms). 한 스테이지가 전체 예산을 잡아먹지 않도록
	 * crawl/analyze/score/recommend 각각을 격리한다 (perf 스테이지의 Promise.race
	 * 격리 패턴과 동일). 미지정 시 보수적 기본값 사용 — 기존 동작 호환.
	 *   기본: crawl 120s, analyze 60s, score 10s, recommend 60s.
	 * 개별 키만 override 가능 (부분 지정 시 나머지는 기본값).
	 */
	stageTimeouts?: Partial<StageTimeoutBudgets>;
}

/**
 * grounded GPT 가 내 업체 대신 추천한 경쟁 업체 1건 (정직성 — 결정적 구조화 추출).
 * contracts LlmCompetitor 와 1:1 매핑된다. source 는 "gpt_grounded" 고정.
 */
export interface LlmValidationCompetitor {
	name: string;
	mentionedInQueries: number;
	sampleQuery?: string;
	source: "gpt_grounded";
}

/**
 * WS5a: 실 LLM 가시성 신호 (informational, 점수 미반영).
 * grounded=false 면 학습기억(브랜드 친숙도) 측정 — 예측 타당성 근거 아님(WS5c/WS8).
 */
export interface LlmValidationSignal {
	provider: string;
	grounded: boolean;
	disclaimer: string;
	geo: { mentionRate: number; directMentionRate: number } | null;
	aeo: { appearanceRate: number; prominenceScore: number } | null;
	/**
	 * (additive, optional) grounded GPT 가 내 업체 대신 추천한 경쟁 업체 top N(빈도순).
	 *
	 * 정직성: grounded=true 이고 geo 검증기 citation 의 `recommendedBusinesses`
	 * (결정적 구조화 추출)에서 집계된 항목만 채운다. grounded=false 거나 구조화 추출
	 * 결과가 없으면 필드 자체를 생략한다(빈 배열도 생략 — 이름 생략 > 틀린 이름).
	 * GeoCitation.mentionedCompetitors(정규식 휴리스틱)는 절대 사용하지 않는다.
	 */
	competitors?: LlmValidationCompetitor[];
}

export interface DiagnosisPipelineOutput {
	crawlResult: CrawlResult;
	scores: ScoringOutput;
	items: DiagnosisItem[];
	recommendations: {
		itemId: string;
		body: string;
		aiGenerated: boolean;
		qualityScore?: number;
		qualityIssues?: string[];
		wasImproved?: boolean;
	}[];
	partialResult: boolean;
	platformLimitations: PlatformLimitation[];
	businessPresence: BusinessPresenceModel;
	/** WS5a: informational 실 LLM 가시성 신호 (enableLlmValidation + isLlmEnabled 시). */
	llmValidation?: LlmValidationSignal;
}

// ---------------------------------------------------------------------------
// runDiagnosisPipeline
// ---------------------------------------------------------------------------

/**
 * Executes the full diagnosis pipeline end-to-end.
 *
 * @param input - Pipeline configuration and business profile
 * @returns DiagnosisPipelineOutput with scores, items, and recommendations
 */
export async function runDiagnosisPipeline(
	input: DiagnosisPipelineInput,
): Promise<DiagnosisPipelineOutput> {
	const {
		startUrl,
		sourceType = "website",
		businessProfile,
		modules,
		businessSurfaceUrls = [],
		enablePlatformLiveFetch = true,
		platformLiveFetchAllowlist = [],
		crawlOpts,
		enableAiRecommendation = false,
		enableRecommendationQualityCheck = false,
		recommendationQualityThreshold,
		enableBacklinkAnalysis = false,
		enableA11yAnalysis = false,
		enablePerfAnalysis = false,
		enableNlpAnalysis = false,
		enableLlmValidation = false,
		scoringMode,
		stageTimeouts,
	} = input;
	const platformLimitations = [...buildPlatformLimitations(sourceType)];
	// GAP 3: 스테이지별 예산 — 부분 override 시 나머지는 기본값.
	const budgets: StageTimeoutBudgets = {
		...DEFAULT_STAGE_TIMEOUTS,
		...stageTimeouts,
	};

	// ---------------------------------------------------------------------------
	// Step 1: Crawl (GAP 3: crawl 예산으로 격리 — 느린/멈춘 크롤이 전체 예산을 잠식 X)
	// ---------------------------------------------------------------------------
	let primaryPresence: BusinessPresence | null = null;
	let crawlResult: CrawlResult;
	if (sourceType === "website") {
		crawlResult = await withStageTimeout(
			"crawl",
			budgets.crawl,
			() => crawlSite(startUrl, crawlOpts),
			() => emptyCrawlResult(),
		);
	} else {
		const platformCrawlResult = await withStageTimeout(
			"crawl",
			budgets.crawl,
			() =>
				fetchPlatformCrawlResult({
					sourceType,
					startUrl,
					platformLimitations,
					enablePlatformLiveFetch,
					platformLiveFetchAllowlist,
				}),
			() => ({ crawlResult: emptyCrawlResult(), presence: null }),
		);
		primaryPresence = platformCrawlResult.presence;
		crawlResult = platformCrawlResult.crawlResult;
	}
	const businessPresence = await buildPipelineBusinessPresence({
		sourceType,
		startUrl,
		primaryPresence,
		businessSurfaceUrls,
		enablePlatformLiveFetch,
		platformLiveFetchAllowlist,
		platformLimitations,
	});
	const primarySurfaceKind =
		sourceType === "website"
			? "website"
			: primaryPresence?.surfaceKind ?? inferSurfaceKind(sourceType, startUrl);

	// If crawl completely failed (no pages), return empty result
	const pages = crawlResult.pages;
	if (pages.length === 0) {
		return {
			crawlResult,
			scores: buildEmptyScores(scoringMode),
			items: [],
			recommendations: [],
			partialResult: true,
			platformLimitations,
			businessPresence,
		};
	}

	// ---------------------------------------------------------------------------
	// Step 2: Analyze
	// ---------------------------------------------------------------------------
	const mainPage = pages.find((p) => p?.url === startUrl) ?? pages[0];
	if (!mainPage) {
		// No pages crawled — return empty pipeline output
		return {
			crawlResult,
			scores: buildEmptyScores(scoringMode),
			items: [],
			recommendations: [],
			partialResult: true,
			platformLimitations,
			businessPresence,
		};
	}
	// ---------------------------------------------------------------------------
	// Step 2a: Backlink analysis (optional, score-neutral)
	// ---------------------------------------------------------------------------
	let backlinkResult: BacklinkResult | undefined;
	if (enableBacklinkAnalysis) {
		try {
			const domain = new URL(startUrl).hostname;
			const socialMetaCount = Object.keys(mainPage.meta).filter(
				(k) => k.startsWith("og:") || k.startsWith("twitter:"),
			).length;
			const canonicalConsistency = pages
				.filter((p) => p.canonicalUrl != null)
				.every((p) => {
					try {
						return new URL(p.canonicalUrl as string).hostname === domain;
					} catch {
						return false;
					}
				});
			const contentLengthScore = Math.min(mainPage.wordCount, 500) / 5; // 0-100
			const signals = {
				httpsEnforced: startUrl.startsWith("https://"),
				hsts: false,
				sitemapPresent: crawlResult.sitemapUsed ?? false,
				robotsTxtPresent: false,
				structuredDataCount: mainPage.schemaJsonLd.length,
				socialMetaCount,
				canonicalConsistency,
				contentLengthScore,
			};
			const adapter = createBacklinkAdapter();
			const heuristic = adapter as { computeFromSignals?: (domain: string, signals: BacklinkSignals) => BacklinkResult };
			backlinkResult =
				typeof heuristic.computeFromSignals === "function"
					? heuristic.computeFromSignals(domain, signals)
					: await adapter.analyze({ url: startUrl, domain });
		} catch {
			// FAIL-SOFT: leave backlinkResult undefined, pipeline continues normally
		}
	}

	// ---------------------------------------------------------------------------
	// Step 2b: A11Y analysis (optional, score-neutral)
	// POLICY § 4.4/§ 8.4: rawHtml is consumed here and never forwarded beyond this block.
	// ---------------------------------------------------------------------------
	let a11yResult: import("./v2/a11y/types.js").A11yResult | undefined;
	if (enableA11yAnalysis) {
		try {
			const a11yAnalyzer = await createA11yAnalyzer();
			a11yResult = await a11yAnalyzer.analyze({
				html: mainPage.rawHtml ?? "",
				url: mainPage.url,
			});
		} catch {
			// FAIL-SOFT: leave a11yResult undefined, pipeline still completes normally
		}
	}

	// ---------------------------------------------------------------------------
	// Step 2c: PERF / Lighthouse analysis (optional, score-neutral, informational).
	// XSAG_ENABLE_PERF_ANALYSIS gates this in the worker (separate from
	// XSAG_ENABLE_INFORMATIONAL_RULES) because PageSpeed API adds latency & cost.
	// Timeout: 30 s — a slow / failed PageSpeed call must NOT hang the pipeline.
	// ---------------------------------------------------------------------------
	let lighthouseResult: LighthouseResult | undefined;
	if (enablePerfAnalysis) {
		try {
			const lh = createLighthouseAdapter();
			if (lh.isAvailable()) {
				const PERF_TIMEOUT_MS = 30_000;
				let perfTimer: NodeJS.Timeout | undefined;
				lighthouseResult = await Promise.race<LighthouseResult | undefined>([
					lh.measure(startUrl, { strategy: "mobile", locale: "ko" }),
					new Promise<undefined>((resolve) => {
						perfTimer = setTimeout(() => resolve(undefined), PERF_TIMEOUT_MS);
					}),
				]);
				if (perfTimer) clearTimeout(perfTimer);
			}
		} catch {
			// FAIL-SOFT: leave lighthouseResult undefined, pipeline still completes normally
		}
	}

	// ---------------------------------------------------------------------------
	// Step 2d: NLP analysis (optional, SCORE-NEUTRAL via scoring.ts isScoredRule).
	// RuleBasedNlpProvider is always available (no env key required).
	// Fail-soft: NLP failure does NOT block the pipeline; rules fall back to passed=true.
	// XSAG_ENABLE_NLP_ANALYSIS gates this in the worker.
	// ---------------------------------------------------------------------------
	let nlpResult: import("./v2/nlp/types.js").NlpResult | undefined;
	if (enableNlpAnalysis) {
		try {
			const nlpAnalyzer = createNlpAnalyzer();
			const nlpInput: NlpInput = {
				url: mainPage.url,
				title: mainPage.title,
				description: mainPage.description,
				bodyText: mainPage.bodyText.slice(0, 8000),
				h1: mainPage.h1,
				h2: mainPage.h2,
				targetKeywords: businessProfile.targetKeywords,
				industry: businessProfile.industry,
				region: businessProfile.region,
			};
			nlpResult = await nlpAnalyzer.analyze(nlpInput);
		} catch {
			// FAIL-SOFT: leave nlpResult undefined, NLP rules pass-by-default
		}
	}

	const ctx = {
		pages,
		mainPage,
		businessProfile,
		...(backlinkResult !== undefined && { backlinkResult }),
		...(a11yResult !== undefined && { a11yResult }),
		...(lighthouseResult !== undefined && { lighthouseResult }),
		...(nlpResult !== undefined && { nlpResult }),
		...(crawlResult.sitemapUsed !== undefined && { sitemapUsed: crawlResult.sitemapUsed }),
	};

	// Run only requested modules
	// GAP 3: analyze 예산으로 격리. analyzePage 자체는 동기지만, 스테이지 격리
	// 일관성을 위해 동일 헬퍼로 감싼다 (한 스테이지가 전체 예산을 잠식 X).
	const requestedModules = new Set(modules);
	const analysisResult = await withStageTimeout(
		"analyze",
		budgets.analyze,
		async () => analyzePage(ctx),
		() => analyzePage(ctx),
	);

	// Build placeholder empty results for non-requested modules
	const seoResult = requestedModules.has("seo")
		? {
				...analysisResult.seo,
				results: applyPlatformRuleScope(sourceType, analysisResult.seo.results, {
					surfaceKind: primarySurfaceKind,
				}),
			}
		: { category: "seo" as const, results: [] };
	const aeoResult = requestedModules.has("aeo")
		? {
				...analysisResult.aeo,
				results: applyPlatformRuleScope(sourceType, analysisResult.aeo.results, {
					surfaceKind: primarySurfaceKind,
				}),
			}
		: { category: "aeo" as const, results: [] };
	const geoResult = requestedModules.has("geo")
		? {
				...analysisResult.geo,
				results: applyPlatformRuleScope(sourceType, analysisResult.geo.results, {
					surfaceKind: primarySurfaceKind,
				}),
			}
		: { category: "geo" as const, results: [] };

	// ---------------------------------------------------------------------------
	// Step 3: Score
	// ---------------------------------------------------------------------------
	// NLP- rules are excluded inside scoring.ts via isScoredRule(), keeping
	// score participation policy in one place for graded and legacy v2 modes.
	// GAP 3: score 예산으로 격리 (scoreDiagnosis 는 동기 — 일관성 위해 동일 헬퍼 사용).
	const scoreInput = {
		seo: seoResult,
		aeo: aeoResult,
		geo: geoResult,
	};
	const scores = await withStageTimeout(
		"score",
		budgets.score,
		async () => scoreDiagnosis(scoreInput, { mode: scoringMode }),
		() => scoreDiagnosis(scoreInput, { mode: scoringMode }),
	);

	// ---------------------------------------------------------------------------
	// Step 4: Classify
	// ---------------------------------------------------------------------------
	// Backlink, A11Y, and PERF results appended AFTER scoring to keep scores
	// identical (score-neutral). Overall score = seo/aeo/geo only.
	const backlinkAnalysisResult =
		enableBacklinkAnalysis ? analyzeBacklink(ctx) : null;

	// A11Y results appended AFTER scoring — score-neutral (informational only).
	const a11yAnalysisResult = enableA11yAnalysis ? analyzeA11y(ctx) : null;

	// PERF results appended AFTER scoring — score-neutral (informational only).
	// lighthouseResult injected into ctx above; rules return informational when absent.
	const perfAnalysisResult = enablePerfAnalysis ? analyzePerf(ctx) : null;

	// perfScore: Lighthouse performance score (0-100) for informational display.
	// Populated from lighthouseResult when perf analysis ran successfully.
	const perfScore: number | null =
		enablePerfAnalysis && lighthouseResult !== undefined
			? lighthouseResult.performance
			: null;

	// Merge scores with optional perfScore (informational; does NOT affect overall).
	const outputScores = {
		...scores,
		perfScore,
	};

	const allRuleResults = [
		...seoResult.results,
		...aeoResult.results,
		...geoResult.results,
		...(backlinkAnalysisResult ? backlinkAnalysisResult.results : []),
		...(a11yAnalysisResult ? a11yAnalysisResult.results : []),
		...(perfAnalysisResult ? perfAnalysisResult.results : []),
	];

	const items = getRecommendedExecutionOrder(classifyResults(allRuleResults));

	// ---------------------------------------------------------------------------
	// Step 5: Recommendations
	// ---------------------------------------------------------------------------
	const qualityOptions: Pick<
		RecommendationEngineOptions,
		"enableQualityCheck" | "qualityCheckThreshold"
	> = { enableQualityCheck: enableRecommendationQualityCheck };
	if (recommendationQualityThreshold !== undefined) {
		qualityOptions.qualityCheckThreshold = recommendationQualityThreshold;
	}

	const recommendationEngine = buildRecommendationEngine(
		enableAiRecommendation,
		qualityOptions,
	);

	const ruleResultMap = new Map(allRuleResults.map((r) => [r.ruleId, r]));

	// GAP 3: recommend 예산으로 격리. 타임아웃 시 그때까지 누적된 추천을 반환한다
	// (recommendations 배열은 in-place 누적 — fallback 도 동일 참조를 돌려줌, 부분 보존).
	const recommendations: DiagnosisPipelineOutput["recommendations"] = [];
	await withStageTimeout(
		"recommend",
		budgets.recommend,
		async () => {
			for (const item of items) {
				const ruleResult = ruleResultMap.get(item.code);
				const output = await recommendationEngine.recommend({
					item,
					context: {
						businessName: businessProfile.businessName,
						industry: businessProfile.industry,
						region: businessProfile.region,
						mainServices: businessProfile.mainServices,
					},
					...(ruleResult !== undefined && { ruleResult }),
				});

				const recommendation: DiagnosisPipelineOutput["recommendations"][number] =
					{
						itemId: item.id,
						body: output.body,
						aiGenerated: output.aiGenerated,
					};
				if (output.qualityScore !== undefined) {
					recommendation.qualityScore = output.qualityScore;
				}
				if (output.qualityIssues !== undefined) {
					recommendation.qualityIssues = output.qualityIssues;
				}
				if (output.wasImproved !== undefined) {
					recommendation.wasImproved = output.wasImproved;
				}
				recommendations.push(recommendation);
			}
			return recommendations;
		},
		// 타임아웃 fallback: 그때까지 모인 부분 추천 보존.
		() => recommendations,
	);

	// ---------------------------------------------------------------------------
	// Step 5b: LLM visibility validation (WS5a, optional, SCORE-NEUTRAL, informational)
	// Runs AFTER scoring — result lands only in output.llmValidation, never in scores.
	// Gated by enableLlmValidation + isLlmEnabled() (real provider). Fail-soft.
	// Grounding follows XSAG_LLM_GROUNDING (WS5c); OFF => learned-memory measurement.
	// ---------------------------------------------------------------------------
	let llmValidation: LlmValidationSignal | undefined;
	if (enableLlmValidation) {
		const grounded = isGroundingEnabledByEnv();
		// 안정성(오너 요청): grounding provider 폴백 체인 — 기본 openai → gemini.
		// 1순위가 쿼터/인증 실패(systemic 429/401/403)로 측정 못 하면 다음 provider 로 폴백.
		// 키가 하나도 없으면 기존 단일 활성 provider(chatmock 등)로 폴백.
		const chain = getGroundingProviderChain();
		const providers =
			chain.length > 0 ? chain : isLlmEnabled() ? [getActiveLlmProvider()] : [];
		const geoInput = {
			url: startUrl,
			businessName: businessProfile.businessName,
			industry: businessProfile.industry,
			region: businessProfile.region,
			targetKeywords: businessProfile.targetKeywords,
		};
		const aeoInput = {
			url: startUrl,
			businessName: businessProfile.businessName,
			industry: businessProfile.industry,
			mainServices: businessProfile.mainServices,
			targetKeywords: businessProfile.targetKeywords,
		};
		for (const provider of providers) {
			try {
				const useGrounding =
					grounded && providerSupportsGrounding(provider.id);
				const result = await buildLlmValidationSignal({
					provider: provider.id,
					grounded: useGrounding,
					geoValidator: new ChatMockGeoValidator({
						providerConfig: provider,
						grounding: useGrounding,
					}),
					aeoValidator: new ChatMockAeoValidator({
						providerConfig: provider,
						grounding: useGrounding,
					}),
					geoInput,
					aeoInput,
				});
				// 측정 성공(geo/aeo 중 하나라도 채워짐)이면 채택. 둘 다 null(provider 실패)이면 다음 provider 폴백.
				if (result.geo !== null || result.aeo !== null) {
					llmValidation = result;
					break;
				}
			} catch {
				// 이 provider 실패 → 다음 provider 시도 (FAIL-SOFT)
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Step 6: Output
	// ---------------------------------------------------------------------------
	return {
		crawlResult,
		scores: outputScores,
		items,
		recommendations,
		partialResult: crawlResult.partialResult,
		platformLimitations,
		businessPresence,
		...(llmValidation !== undefined && { llmValidation }),
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 크롤 실패/타임아웃 시의 빈 CrawlResult (partialResult=true). */
function emptyCrawlResult(): CrawlResult {
	const now = new Date().toISOString();
	return { pages: [], partialResult: true, startedAt: now, completedAt: now };
}

function buildEmptyScores(mode?: ScoringMode): ScoringOutput {
	return {
		seoScore: 0,
		aeoScore: 0,
		geoScore: 0,
		perfScore: null,
		overallScore: 0,
		scoringVersion:
			mode === "v2" ? LEGACY_V2_SCORING_VERSION : SCORING_VERSION,
	};
}

const LLM_VALIDATION_DISCLAIMER =
	"실 LLM 가시성 신호(정보성) — 진단 점수에 미반영. 그라운딩 OFF 면 학습기억(브랜드 친숙도) 측정이라 예측 타당성 근거가 아니다(WS5c/WS8).";

/**
 * WS5a: geo/aeo 검증기를 병렬 실행해 informational LLM 가시성 신호를 만든다.
 * 검증기를 주입받으므로 (실 호출 없이) 단위 테스트 가능. 개별 실패는 fail-soft(null).
 */
export async function buildLlmValidationSignal(params: {
	provider: string;
	grounded: boolean;
	geoValidator: GeoValidator;
	aeoValidator: AeoValidator;
	geoInput: GeoValidationInput;
	aeoInput: AeoValidationInput;
	/** top N 추천 경쟁사 상한 (기본 3 — 손실 프레이밍 티저용). */
	competitorTopN?: number;
}): Promise<LlmValidationSignal> {
	const [geoRes, aeoRes] = await Promise.all([
		params.geoValidator.validate(params.geoInput).catch(() => null),
		params.aeoValidator.validate(params.aeoInput).catch(() => null),
	]);

	// 정직성: grounded 일 때만, 그리고 결정적 구조화 추출(recommendedBusinesses)에서
	// 집계된 경쟁사만 surfacing 한다. grounded=false 거나 추출 결과 없으면 competitors 생략.
	const competitors = buildLlmCompetitors(
		params.grounded,
		geoRes,
		params.competitorTopN ?? 3,
	);

	return {
		provider: params.provider,
		grounded: params.grounded,
		disclaimer: LLM_VALIDATION_DISCLAIMER,
		geo: geoRes
			? {
					mentionRate: geoRes.metrics.mentionRate,
					directMentionRate: geoRes.metrics.directMentionRate,
				}
			: null,
		aeo: aeoRes
			? {
					appearanceRate: aeoRes.metrics.appearanceRate,
					prominenceScore: aeoRes.metrics.prominenceScore,
				}
			: null,
		...(competitors.length > 0 ? { competitors } : {}),
	};
}

/**
 * geo 검증 결과의 citation 들에서 grounded 추천 경쟁사 top N 을 만든다.
 *
 * 정직성 가드 (3중):
 *   1. grounded=false 면 무조건 빈 배열 — 학습기억 모드는 추천 근거가 아님.
 *   2. citation.recommendedBusinesses(결정적 구조화 추출)만 집계 — 정규식 휴리스틱 금지.
 *   3. source 는 항상 "gpt_grounded" 고정 — contracts 의 z.literal 가드와 일치.
 *
 * @returns LlmValidationCompetitor[] (빈도순, top N). 신뢰 항목 없으면 빈 배열.
 */
function buildLlmCompetitors(
	grounded: boolean,
	geoRes: GeoValidationResult | null,
	topN: number,
): LlmValidationCompetitor[] {
	if (!grounded || !geoRes) return [];
	const aggregated = aggregateRecommendedCompetitors(geoRes.citations, topN);
	return aggregated.map((c) => ({
		name: c.name,
		mentionedInQueries: c.mentionedInQueries,
		...(c.sampleQuery ? { sampleQuery: c.sampleQuery } : {}),
		source: "gpt_grounded" as const,
	}));
}

/**
 * Builds the recommendation engine.
 *
 * - enableAiRecommendation=false: rule-based only (deterministic, no API calls)
 * - enableAiRecommendation=true:
 *     RecommendationEngine default provider chain을 사용한다.
 *     `LLM_PROVIDER` 명시 모드, ChatMock 자동 감지, real-provider availability,
 *     rule-based fallback 정책은 recommendation 모듈 한 곳에서만 결정한다.
 *
 * 기존 `enableAiRecommendation` API 는 그대로 유지된다 — 라우터는 내부에서만 참고한다.
 */
function buildRecommendationEngine(
	enableAi: boolean,
	qualityOptions: Pick<
		RecommendationEngineOptions,
		"enableQualityCheck" | "qualityCheckThreshold"
	> = {},
): RecommendationEngine {
	if (!enableAi) {
		return new RecommendationEngine({
			providers: [new RuleBasedProvider()],
			...qualityOptions,
		});
	}

	return new RecommendationEngine({
		providers: buildDefaultProviderChain(),
		...qualityOptions,
	});
}

function getPlatformSourceLabel(sourceType: SourceType): string {
	const labels: Record<SourceType, string> = {
		website: "홈페이지",
		naver_place: "네이버 플레이스",
		naver_blog: "네이버 블로그",
		instagram: "인스타그램",
		kakao_place: "카카오 플레이스",
		youtube: "유튜브",
		facebook: "페이스북",
		other_platform: "플랫폼 페이지",
	};
	return labels[sourceType];
}

function buildPlatformLimitations(sourceType: SourceType): PlatformLimitation[] {
	if (sourceType === "website") return [];

	const sourceLabel = getPlatformSourceLabel(sourceType);
	return [
		{
			code: "PLATFORM_LIMITED_EVIDENCE",
			message: `${sourceLabel} URL은 플랫폼 정책, 로그인, 동적 렌더링 제한 때문에 자체 홈페이지보다 확인 가능한 증거가 적습니다.`,
			affectedCategories: ["seo", "aeo", "geo"],
		},
		{
			code: "PLATFORM_CONTROL_LIMITED",
			message:
				"플랫폼 내에서 직접 수정할 수 없는 항목은 실패로 단정하지 않고 개선 제한 사항으로 해석해야 합니다.",
			affectedCategories: ["seo", "aeo", "geo"],
		},
	];
}

async function fetchPlatformCrawlResult(input: {
	sourceType: Exclude<SourceType, "website">;
	startUrl: string;
	platformLimitations: PlatformLimitation[];
	enablePlatformLiveFetch: boolean;
	platformLiveFetchAllowlist: PlatformSourceType[];
}): Promise<{ crawlResult: CrawlResult; presence: BusinessPresence | null }> {
	const {
		sourceType,
		startUrl,
		platformLimitations,
		enablePlatformLiveFetch,
		platformLiveFetchAllowlist,
	} = input;
	const collectionDecision = getLiveHtmlCollectionDecision(
		sourceType,
		enablePlatformLiveFetch,
		platformLiveFetchAllowlist,
	);
	if (!collectionDecision.allowed) {
		const now = new Date().toISOString();
		platformLimitations.push({
			code: collectionDecision.code,
			message: collectionDecision.message,
			affectedCategories: ["seo", "aeo", "geo"],
		});
		return {
			crawlResult: {
				pages: [],
				partialResult: true,
				startedAt: now,
				completedAt: now,
			},
			presence: null,
		};
	}

	const result = await fetchPlatformPresence({
		sourceType,
		sourceUrl: startUrl,
	});
	platformLimitations.push(...result.limitations);

	if (!result.presence) {
		const now = new Date().toISOString();
		return {
			crawlResult: {
				pages: [],
				partialResult: true,
				startedAt: now,
				completedAt: now,
			},
			presence: null,
		};
	}

	platformLimitations.push(...result.presence.limitations);
	return {
		crawlResult: businessPresenceToCrawlResult(result.presence),
		presence: result.presence,
	};
}

async function buildPipelineBusinessPresence(input: {
	sourceType: SourceType;
	startUrl: string;
	primaryPresence: BusinessPresence | null;
	businessSurfaceUrls: BusinessPresenceSurfaceInput[];
	enablePlatformLiveFetch: boolean;
	platformLiveFetchAllowlist: PlatformSourceType[];
	platformLimitations: PlatformLimitation[];
}): Promise<BusinessPresenceModel> {
	const additionalSurfaceInputs = input.businessSurfaceUrls.filter(
		(surface) =>
			!(
				surface.sourceType === input.sourceType &&
				surface.url === input.startUrl
			),
	);
	const allowedSurfaceInputs: BusinessPresenceSurfaceInput[] = [];
	const skippedSurfaces: BusinessPresenceSurface[] = [];
	for (const surface of additionalSurfaceInputs) {
		if (surface.sourceType === "website") {
			skippedSurfaces.push(
				buildSkippedBusinessSurface(
					surface,
					"BUSINESS_SURFACE_WEBSITE_REFERENCE_ONLY",
					"The website URL is tracked as an owned surface; detailed website signals come from analyzed pages.",
				),
			);
			continue;
		}
		const decision = getLiveHtmlCollectionDecision(
			surface.sourceType,
			input.enablePlatformLiveFetch,
			input.platformLiveFetchAllowlist,
		);
		if (decision.allowed) {
			allowedSurfaceInputs.push(surface);
		} else {
			skippedSurfaces.push(
				buildSkippedBusinessSurface(surface, decision.code, decision.message),
			);
		}
	}
	const surfaces: BusinessPresenceSurface[] = [
		...(await fetchBusinessPresenceSurfaces(allowedSurfaceInputs)),
		...skippedSurfaces,
	];
	return buildBusinessPresenceModel({
		primarySourceType: input.sourceType,
		primaryUrl: input.startUrl,
		primaryPresence: input.primaryPresence,
		surfaces,
		limitations: input.platformLimitations,
	});
}

const HTML_FETCH_PROHIBITED_PLATFORM_SOURCES = new Set<PlatformSourceType>([
	"instagram",
	"facebook",
	"youtube",
]);

function getLiveHtmlCollectionDecision(
	sourceType: PlatformSourceType,
	enablePlatformLiveFetch: boolean,
	allowlist: PlatformSourceType[],
): { allowed: true } | { allowed: false; code: string; message: string } {
	if (!enablePlatformLiveFetch) {
		return {
			allowed: false,
			code: "PLATFORM_LIVE_FETCH_DISABLED",
			message:
				"Platform live collection is disabled until crawl policy review enables automated collection for this environment.",
		};
	}
	if (HTML_FETCH_PROHIBITED_PLATFORM_SOURCES.has(sourceType)) {
		return {
			allowed: false,
			code: "PLATFORM_HTML_FETCH_NOT_ALLOWED",
			message:
				"Public HTML collection is not allowed for this platform source. Use an approved official API or manual evidence instead.",
		};
	}
	if (!allowlist.includes(sourceType)) {
		return {
			allowed: false,
			code: "PLATFORM_LIVE_FETCH_NOT_APPROVED",
			message:
				"Platform live collection is enabled, but this source type is not in the approved live-fetch allowlist.",
		};
	}
	return { allowed: true };
}

function buildSkippedBusinessSurface(
	surface: BusinessPresenceSurfaceInput,
	code: string,
	message: string,
): BusinessPresenceSurface {
	return {
		sourceType: surface.sourceType,
		surfaceKind:
			surface.surfaceKind ?? inferSurfaceKind(surface.sourceType, surface.url),
		url: surface.url,
		status: "skipped",
		sourceLabel: getPlatformSourceLabel(surface.sourceType),
		services: [],
		limitations: [
			{
				code,
				message,
				affectedCategories: ["seo", "aeo", "geo"],
			},
		],
	};
}
