/**
 * X-SAG Core Engine — Scoring Engine v2.0.0 (MOD-SCORING, TASK-CORE-006, Phase M-A)
 *
 * TRD § 10.6 채점 알고리즘:
 *
 *   for each category (seo, aeo, geo, perf?):
 *     rawScore = 100
 *     for each triggered item (passed=false):
 *       deduction = impactScore × priorityWeight[item.priority]
 *       rawScore -= deduction
 *     rawScore = clamp(rawScore, 0, 100)
 *
 *   priorityWeight = { high: 0.20, medium: 0.10, low: 0.04 }
 *
 *   카테고리 가중치 v2.0.0 (PRD 기반 초기 추정값 — A/B 미검증, CATEGORY_WEIGHT_V2 @rationale 참조):
 *   - perf 포함 (Business 플랜): SEO×0.35 + AEO×0.25 + GEO×0.25 + PERF×0.15
 *   - perf 미포함 (Free/Basic):  SEO×(0.35/0.85) + AEO×(0.25/0.85) + GEO×(0.25/0.85)
 *     = SEO×0.4118 + AEO×0.2941 + GEO×0.2941
 *
 * POLICY § 10.3: scoringVersion semver 관리.
 * 재현성: 동일 입력 → 동일 점수 (룰 기반, AI 개입 없음).
 */

import type { Grade, HealthBand } from "@boina/contracts/enums";
import type { AnalyzerResult, RuleResult } from "./analyzers/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * 현행 채점 버전 = 2.1.0 (graded, 비포화). 실 SMB 검증(2026-05-30, N=61)에서 v2 차감모델이
 * 32/53 룰 통과한 정상 카페 사이트도 0점으로 만드는(empty shell 과 구분 불가) 결함이
 * 실증돼 graded 를 **기본 채점으로 승격**(DL-137). 사용자 명시 승인.
 *
 * @rationale SCORING_VERSION 은 **채점 알고리즘/가중치**(PRIORITY_WEIGHT, CATEGORY_WEIGHT_*,
 *   calcCategoryScore*, 차감 vs graded 모드)의 버전이다. 개별 룰의 pass/fail **판정 로직**이
 *   정밀화돼 일부 사이트 점수가 이동해도, RuleResult→점수 변환식과 가중치가 그대로면
 *   SCORING_VERSION 은 **올리지 않는다**. Phase 1 의미화 마이그레이션(GEO/AEO/SEO 룰 신호
 *   정밀화)은 알고리즘·가중치·룰개수·ruleId·ruleWeight·severity 를 일절 바꾸지 않았으므로
 *   2.1.0 을 유지한다(검증: phase1-score-stability.test.ts). 별도 rule-catalog 버전 마커는
 *   현재 코드베이스에 존재하지 않으며, 도입 여부는 **제품 결정**이다 — 룰 판정 변경 추적이
 *   필요해지면 RULE_CATALOG_VERSION 을 신설하고 DECISION_LOG 에 기록한다.
 */
export const SCORING_VERSION = "2.1.0" as const;

/**
 * 레거시 v2 차감모델 버전 (mode:"v2" 명시 시에만).
 *
 * @deprecated graded(2.1.0)가 기본 채점으로 승격됨(DL-137, 2026-05-30). v2 차감모델은
 *   정상 사이트도 0점으로 포화시키는 결함이 실증되어 신규 사용 금지다. 후방호환을 위해
 *   남겨두며, mode:"v2" 를 명시한 기존 호출자만 사용한다.
 * @todo 제거 일정은 **제품 결정**이다. mode:"v2" 잔존 호출자가 0이 되는 시점(또는 정해진
 *   제거일)에 ScoringMode 의 "v2" 분기와 함께 삭제하고 DECISION_LOG 에 기록한다.
 */
export const LEGACY_V2_SCORING_VERSION = "2.0.0" as const;

/**
 * WS6: 채점 모드 (비포화 vs 레거시 포화).
 * - "graded"(기본): 가중 통과율 — Σ(passed weight)/Σ(total weight)×100. [0,100] 변별적.
 * - "v2"(레거시, @deprecated): 무제한 차감 — 차감 합 100 초과 시 0 클램프(5룰 실패=0 포화,
 *   비변별). LEGACY_V2_SCORING_VERSION 참조. 신규 사용 금지, 제거 예정(제품 결정 대기).
 */
export type ScoringMode = "v2" | "graded";

/** @deprecated graded 가 기본 SCORING_VERSION 이 됨(2.1.0). 후방호환 별칭. */
export const GRADED_SCORING_VERSION = SCORING_VERSION;

/** TRD § 10.6 priorityWeight */
const PRIORITY_WEIGHT: Record<"high" | "medium" | "low", number> = {
	high: 0.2,
	medium: 0.1,
	low: 0.04,
};

/**
 * 카테고리 가중치 v2.0.0 (perf 포함 시).
 *
 * @rationale 이 값(SEO 0.35 / AEO 0.25 / GEO 0.25 / PERF 0.15)은 **PRD 기반의
 *   초기 추정 가중치**이며, 아직 경험적(A/B·회귀) 검증을 거치지 않았다.
 *   출처·검증 현황: docs/features/x-sag-diagnosis-engine/BACKLOG_G_ENGINE_QUALITY.md
 *   ("스코어링: 임의 가중치(PRD 기반), A/B 검증은 Tier 4 이후").
 *   GEO 룰 가중치 재조정은 GEO_VALIDATION.md(회귀분석, P-C 예정)에서 추적한다.
 * @todo 가중치 변경은 **제품 결정**이다(임의 변경 금지). A/B·회귀 결과가 나오면
 *   이 상수와 SCORING_VERSION 을 함께 갱신하고 DECISION_LOG 에 기록한다.
 */
const CATEGORY_WEIGHT_V2 = {
	seo: 0.35,
	aeo: 0.25,
	geo: 0.25,
	perf: 0.15,
} as const;

/**
 * perf 미포함 시 SEO/AEO/GEO 합계(0.85)로 재정규화한 가중치.
 * seo: 0.35/0.85 ≈ 0.41176, aeo: 0.25/0.85 ≈ 0.29412, geo: 0.25/0.85 ≈ 0.29412
 */
const CATEGORY_WEIGHT_NO_PERF = {
	seo: 0.35 / 0.85,
	aeo: 0.25 / 0.85,
	geo: 0.25 / 0.85,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoringInput {
	seo: AnalyzerResult;
	aeo: AnalyzerResult;
	geo: AnalyzerResult;
	/** perf는 선택. Business 플랜에서만 측정. */
	perf?: AnalyzerResult;
}

export interface ScoringOutput {
	seoScore: number;
	aeoScore: number;
	geoScore: number;
	/** null/undefined이면 미측정 (Free/Basic 플랜). 하위 호환을 위해 optional. */
	perfScore?: number | null;
	overallScore: number;
	scoringVersion: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clamps a number between min and max (inclusive).
 */
function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
export function isScoredRule(result: RuleResult): boolean {
	if (result.ruleWeight <= 0) return false;
	if (result.ruleId.startsWith("NLP-")) return false;
	if (
		result.scoreImpact === "informational" ||
		result.scoreImpact === "not_applicable" ||
		result.scoreImpact === "unavailable"
	) {
		return false;
	}
	return true;
}


/**
 * Calculates a single category score from its rule results.
 *
 * For each failed rule (passed=false):
 *   deduction = ruleWeight × impactFactor × priorityWeight
 *   rawScore -= deduction
 *
 * ruleWeight in RuleResult is already a per-rule constant (0-10).
 * We map it to an impactScore (0-100) by multiplying by 10.
 * priorityWeight then scales by item importance.
 *
 * Implementation note: TRD § 10.6 references "impactScore" as a per-rule
 * constant already embedded in RuleResult.ruleWeight (0-10 scale).
 * We treat ruleWeight * 10 as the impactScore in 0-100 range,
 * then apply priorityWeight deduction coefficient.
 *
 * Example: ruleWeight=10 (high, SEO_TITLE_MISSING), priority=high
 *   deduction = 10 * 10 * 0.20 = 20 points
 */
function calcCategoryScore(results: RuleResult[]): number {
	let rawScore = 100;

	for (const result of results) {
		if (!isScoredRule(result)) continue;
		if (result.passed) continue;

		const impactScore = result.ruleWeight * 10; // 0-100 range
		const priorityWeight = PRIORITY_WEIGHT[result.severity];
		const deduction = impactScore * priorityWeight;

		rawScore -= deduction;
	}

	return clamp(Math.round(rawScore), 0, 100);
}

/**
 * WS6 비포화(graded) 채점: 가중 통과율.
 *   score = 100 × Σ(passed rule weight) / Σ(all rule weight)
 * weight = ruleWeight×10×priorityWeight (v2 차감과 동일한 중요도 척도를 재사용 — 새 임계값 발명 없음).
 * 차감 누적이 아니라 통과 비율이라 [0,100] 경계가 자연스럽고, 일부만 실패해도 0 으로 무너지지 않아
 * SMB 하단에서 변별이 생긴다(예: 32/53 통과 → 0 이 아니라 의미 있는 양수).
 * 룰 0개(비요청 모듈)면 0.
 */
function calcCategoryScoreGraded(results: RuleResult[]): number {
	let earned = 0;
	let total = 0;
	for (const result of results) {
		if (!isScoredRule(result)) continue;

		const weight = result.ruleWeight * 10 * PRIORITY_WEIGHT[result.severity];
		total += weight;
		if (result.passed) earned += weight;
	}
	if (total === 0) return 0;
	return clamp(Math.round((100 * earned) / total), 0, 100);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculates SEO/AEO/GEO(/perf) category scores and overall weighted score.
 *
 * v2.0.0 변경:
 * - ScoringInput.perf optional (Business 플랜 전용)
 * - ScoringOutput.perfScore: number | null
 * - 가중치: SEO35/AEO25/GEO25/PERF15
 * - perf 미포함 시 나머지 3개 가중치 재정규화
 *
 * @param input - Analyzer results for all categories (perf optional)
 * @returns Scores object with per-category and overall scores
 */
export interface ScoreDiagnosisOptions {
	/** 채점 모드. 기본 "graded"(2.1.0). "v2"는 명시 opt-in 레거시 차감모델. */
	mode?: ScoringMode;
}

export function scoreDiagnosis(
	input: ScoringInput,
	options: ScoreDiagnosisOptions = {},
): ScoringOutput {
	const mode = options.mode ?? "graded";
	const calc = mode === "graded" ? calcCategoryScoreGraded : calcCategoryScore;
	const seoScore = calc(input.seo.results);
	const aeoScore = calc(input.aeo.results);
	const geoScore = calc(input.geo.results);
	const perfScore = input.perf != null ? calc(input.perf.results) : null;

	let overallScore: number;
	if (perfScore !== null) {
		// perf 포함: SEO×0.35 + AEO×0.25 + GEO×0.25 + PERF×0.15
		overallScore = Math.round(
			seoScore * CATEGORY_WEIGHT_V2.seo +
				aeoScore * CATEGORY_WEIGHT_V2.aeo +
				geoScore * CATEGORY_WEIGHT_V2.geo +
				perfScore * CATEGORY_WEIGHT_V2.perf,
		);
	} else {
		// perf 미포함: 3개 가중치 재정규화
		overallScore = Math.round(
			seoScore * CATEGORY_WEIGHT_NO_PERF.seo +
				aeoScore * CATEGORY_WEIGHT_NO_PERF.aeo +
				geoScore * CATEGORY_WEIGHT_NO_PERF.geo,
		);
	}

	return {
		seoScore,
		aeoScore,
		geoScore,
		perfScore,
		overallScore: clamp(overallScore, 0, 100),
		scoringVersion:
			mode === "graded" ? SCORING_VERSION : LEGACY_V2_SCORING_VERSION,
	};
}

// ---------------------------------------------------------------------------
// Grade 매핑 (POLICY § 11.1)
// ---------------------------------------------------------------------------

/**
 * 점수 (0-100) → POLICY § 11 등급 매핑.
 *
 * 등급 경계 (TRD § 7.2 scores.grade 와 일치):
 *   - 0-39:    "poor"
 *   - 40-59:   "low"
 *   - 60-79:   "fair"
 *   - 80-100:  "good"
 *
 * 비정상 입력 (NaN / Infinity / 음수) 은 가장 보수적인 "poor" 로 폴백.
 * 100 초과 값은 "good" 으로 매핑한다 (상한 클립 없이도 안전).
 *
 * 본 함수는 순수 결정적 함수로, 동일 입력 → 동일 출력.
 * 기존 인라인 grade 계산 (`overall >= 80 ? "good" : ...`) 의 정식 대체 구현이다.
 */
export function scoreToGrade(score: number): Grade {
	// 비정상 값 가드 — NaN / -Infinity / 음수 → "poor"
	if (!Number.isFinite(score) || score < 0) return "poor";
	if (score >= 80) return "good";
	if (score >= 60) return "fair";
	if (score >= 40) return "low";
	return "poor";
}

/**
 * Maps a score to the SCREEN-004 v2.0 health band labels.
 *
 * HealthBand is intentionally separate from Grade: 40-59 maps to "weak"
 * for cards, while the scoring grade for that range remains "low".
 */
export function scoreToHealthBand(score: number): HealthBand {
	if (!Number.isFinite(score) || score < 0) return "poor";
	if (score >= 80) return "good";
	if (score >= 60) return "fair";
	if (score >= 40) return "weak";
	return "poor";
}
