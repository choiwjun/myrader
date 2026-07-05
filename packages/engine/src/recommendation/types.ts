/**
 * X-SAG Core Engine — Recommendation Types (TASK-CORE-007)
 *
 * TRD § 10.7 / § 9.5 AI fallback chain 인터페이스.
 */

import type { DiagnosisItem } from "@boina/contracts/diagnosis";
import type { RuleResult } from "../analyzers/types.js";
import type { CostMeter } from "./cost-meter.js";

// ---------------------------------------------------------------------------
// Business context for AI prompt construction
// ---------------------------------------------------------------------------

export interface BusinessContext {
	businessName: string;
	industry: string;
	region: string;
	mainServices: string[];
}

// ---------------------------------------------------------------------------
// RecommendationInput / Output
// ---------------------------------------------------------------------------

export interface RecommendationInput {
	/** 규칙 기반 초기 안 (classification 결과) */
	item: DiagnosisItem;
	/** 업체 컨텍스트 (AI 프롬프트에 주입) */
	context: BusinessContext;
	/** 원본 규칙 결과 (룰 기반 fallback용) */
	ruleResult?: RuleResult;
}

export interface RecommendationOutput {
	/** 사용자 친화 개선 설명 */
	body: string;
	/** 예시 문구 (0-3건) */
	examples: string[];
	/** POLICY § 7.2: AI 생성 여부 */
	aiGenerated: boolean;
	/** 사용된 provider */
	provider: "chatmock" | "openai" | "gemini" | "anthropic" | "rule-based";
	/** 사용된 모델명 (AI provider인 경우) */
	model?: string;
	/** 추정 비용 USD (토큰 기반 추정) */
	costUsd?: number;
	/** Phase P-C: 품질 검수 점수 (0~100). 검수가 수행된 경우에만 설정. */
	qualityScore?: number;
	/** Phase P-C: 발견된 품질 문제 목록. */
	qualityIssues?: string[];
	/** Phase P-C: 개선 버전이 적용되었는지 여부. */
	wasImproved?: boolean;
}

// ---------------------------------------------------------------------------
// RecommendationProvider — 각 AI/룰 provider가 구현해야 하는 인터페이스
// ---------------------------------------------------------------------------

export interface RecommendationProvider {
	/** provider 식별자 */
	readonly name: string;
	/** API 키 등 필수 조건 충족 여부 */
	isAvailable(): boolean;
	/**
	 * 추천 문구 생성.
	 * 실패 시 throw (fallback chain이 다음 provider로 넘어감).
	 */
	generate(input: RecommendationInput): Promise<RecommendationOutput>;
}

// ---------------------------------------------------------------------------
// RecommendationEngineOptions
// ---------------------------------------------------------------------------

export interface RecommendationEngineOptions {
	/** 순서대로 시도할 providers */
	providers: RecommendationProvider[];
	/**
	 * 일일 AI 비용 상한 (USD).
	 * 초과 시 자동으로 rule-based 로 downgrade.
	 * 기본: ENV AI_DAILY_BUDGET_USD (없으면 50).
	 */
	dailyCostCapUsd?: number;
	/**
	 * REM-A5: AI 비용 미터 주입.
	 * 미주입 시 InMemoryCostMeter 자동 생성 (개발/단일 인스턴스).
	 * 프로덕션은 RedisCostMeter 주입 권장.
	 */
	costMeter?: CostMeter;
	/**
	 * REM-A5: 예산 알람 콜백 (80% / 100% 도달 시).
	 * API 레이어에서 observability.captureWarning / captureError 주입.
	 */
	onBudgetAlert?: (
		level: "warning" | "error",
		payload: Record<string, unknown>,
	) => void;
	/**
	 * Phase P-C: 품질 검수 활성화.
	 * `true` 시 추천 생성 직후 QualityChecker 가 실행되며, 점수가 임계치 미만이면
	 * `improvedRecommendation` 으로 본문을 교체한다. 기본 false (기존 동작 유지).
	 */
	enableQualityCheck?: boolean;
	/**
	 * Phase P-C: 품질 검수 임계치 (0~100). 기본 70.
	 * 점수가 이 값 미만이고 개선 버전이 존재하면 교체.
	 */
	qualityCheckThreshold?: number;
	/**
	 * Phase P-C: 품질 검수기 (선택 주입).
	 * 미주입 시 RuleBased 휴리스틱만 사용하는 기본 checker 가 자동 구성된다.
	 * 외부에서 LLM provider 를 결합한 checker 를 주입하면 LLM 검수가 활성화된다.
	 *
	 * 인터페이스는 의존성 사이클 방지를 위해 인라인 구조로 정의:
	 *   check(input): Promise<{ qualityScore, issues, improvedRecommendation?, passed, ... }>
	 */
	qualityChecker?: {
		check(input: {
			ruleId: string;
			recommendation: string;
			context: BusinessContext;
		}): Promise<{
			qualityScore: number;
			issues: string[];
			improvedRecommendation?: string;
			passed: boolean;
		}>;
	};
}
