/**
 * X-SAG Core Engine v2 — AEO Validator 타입 정의
 *
 * AEO(Answer Engine Optimization) 룰 실증 검증 시스템 (Phase P4).
 * LLM 에게 일반적인 "정보/지식" 질의를 보내고, 응답이 우리 비즈니스를
 * 답변 소스(answer source) 로 인용하는지 측정한다.
 *
 * GEO 와의 개념적 차이:
 *   - GEO: "<지역> + <업종>" 같은 로컬 컨텍스트에서 매장이 언급되는가?
 *   - AEO: "<업종> 어떻게 골라요?" 같은 How-to/What-is 질문에서
 *          우리 브랜드가 답변의 근거/추천처로 인용되는가?
 *
 * 추가로 AEO 는 "프로미넌스(prominence)" 를 측정한다 —
 * 응답에서 처음 등장한 위치가 빠를수록 높은 점수.
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** AEO 검증 대상 사이트/비즈니스 정보 */
export interface AeoValidationInput {
	/** 사이트 URL */
	url: string;
	/** 비즈니스/매장명 */
	businessName: string;
	/** 업종 (예: "치과", "이커머스 SaaS", "법무법인") */
	industry: string;
	/** 주요 서비스 목록 (예: ["임플란트", "교정"]) */
	mainServices: string[];
	/** 타겟 키워드 목록 (FAQ/How-to 토픽 등) */
	targetKeywords: string[];
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/** LLM 질의 facet (검증하려는 측면) */
export type AeoQueryFacet =
	| "how-to"
	| "what-is"
	| "best-of"
	| "price"
	| "service-howto";

/** AEO LLM 질의 */
export interface AeoQuery {
	/** 실제 질의문 (How-to / What-is / Best-X 등 정보 요청형) */
	query: string;
	/** 이 질의가 검증하려는 측면 */
	facet: AeoQueryFacet;
	/** 기대하는 인용 스니펫/패턴 (선택) — 응답이 이 패턴을 포함하면 가산점 */
	expectedSnippet?: string;
}

// ---------------------------------------------------------------------------
// Citation
// ---------------------------------------------------------------------------

/** 응답 내 비즈니스 언급의 맥락(컨텍스트) */
export type AeoMentionContext =
	/** 1순위 추천 / 답변의 주된 근거로 인용 */
	| "primary"
	/** 다른 후보들과 함께 리스트의 일부로 언급 */
	| "in-list"
	/** 일반 본문에서 부수적으로 언급 */
	| "incidental"
	/** 부정적/비판적 맥락에서 언급 */
	| "negative"
	/** 언급 없음 */
	| "none";

/** LLM 응답 1건의 AEO 인용 분석 결과 */
export interface AeoCitation {
	/** 질의문 */
	query: string;
	/** 질의 facet */
	facet: AeoQueryFacet;
	/** LLM 응답 (최대 2000자) */
	llmResponse: string;
	/** 응답에 비즈니스명이 언급되었는지 */
	mentioned: boolean;
	/** 첫 언급 위치의 문자 인덱스 (-1 이면 미언급) */
	firstMentionIndex: number;
	/** 위치 기반 프로미넌스 점수 (0~1, 1=최상단 언급, 0=미언급 또는 말미) */
	prominence: number;
	/** 응답에 URL/도메인이 명시적으로 인용되었는지 */
	urlCited: boolean;
	/** 언급 맥락 */
	context: AeoMentionContext;
	/** 측정 시각 (ISO 8601) */
	measuredAt: string;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** AEO 메트릭 — Profound 의 "Appearance Rate" 와 유사 */
export interface AeoMetrics {
	/** 전체 질의 중 비즈니스가 언급된 비율 (0~1) */
	appearanceRate: number;
	/** 평균 프로미넌스 점수 (0~1) — 위치 가중 평균 */
	prominenceScore: number;
	/** URL/도메인이 명시적으로 인용된 질의 비율 (0~1) */
	citationRate: number;
}

/** AEO 검증 데이터 소스 */
export type AeoValidationSource = "chatmock" | "mock";

/** AEO 검증 결과 */
export interface AeoValidationResult {
	/** 대상 URL */
	url: string;
	/** 대상 비즈니스명 */
	businessName: string;
	/** 인용 분석 결과 (질의별) */
	citations: AeoCitation[];
	/** 집계 메트릭 */
	metrics: AeoMetrics;
	/** 데이터 소스 */
	source: AeoValidationSource;
	/** 검증 완료 시각 (ISO 8601) */
	validatedAt: string;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/** AEO 검증기 인터페이스 */
export interface AeoValidator {
	/** 어댑터 식별자 */
	readonly name: string;
	/**
	 * 검증 실행.
	 * @param input 검증 대상 비즈니스 정보
	 * @param queries 사용자 정의 질의 (선택, 기본은 generateDefaultAeoQueries)
	 */
	validate(
		input: AeoValidationInput,
		queries?: AeoQuery[],
	): Promise<AeoValidationResult>;
	/** 현재 환경에서 사용 가능한지 확인 */
	isAvailable(): boolean;
}
