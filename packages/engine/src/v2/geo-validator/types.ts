/**
 * X-SAG Core Engine v2 — GEO Validator 타입 정의
 *
 * GEO 룰 실증 검증 시스템 (Phase P-B).
 * LLM에게 직접 질의해서 사이트 인용 여부 측정 (Profound-style).
 *
 * 기존 19개 GEO 룰은 휴리스틱 — 본 모듈은 LLM 응답 데이터로 룰 효과성 검증.
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** 검증 대상 사이트 정보 */
export interface GeoValidationInput {
	/** 사이트 URL */
	url: string;
	/** 비즈니스/매장명 */
	businessName: string;
	/** 업종 (예: "카페", "한식당", "미용실") */
	industry: string;
	/** 지역 (예: "서울 강남", "부산 해운대") */
	region: string;
	/** 타겟 키워드 목록 (서비스/메뉴 등) */
	targetKeywords: string[];
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/** LLM 질의 facet (검증하려는 측면) */
export type GeoQueryFacet =
	| "brand-mention"
	| "industry-region"
	| "service-recommendation"
	| "comparative";

/** LLM 질의 */
export interface GeoQuery {
	/** 실제 질의문 */
	query: string;
	/** 이 질의가 검증하려는 측면 */
	facet: GeoQueryFacet;
}

// ---------------------------------------------------------------------------
// Citation
// ---------------------------------------------------------------------------

/** LLM 응답 1건의 인용 분석 결과 */
export interface GeoCitation {
	/** 질의문 */
	query: string;
	/** 질의 facet */
	facet: GeoQueryFacet;
	/** LLM 응답 (최대 2000자) */
	llmResponse: string;
	/** 응답에 사이트 또는 매장명이 등장하는지 */
	hasMention: boolean;
	/** 응답에 URL/도메인이 등장하는지 */
	hasUrl: boolean;
	/** 직접 인용 패턴 (예: "X 매장은...", "X 카페에서는...") */
	isDirectMention: boolean;
	/**
	 * 같이 언급된 경쟁사/매장 목록.
	 *
	 * ⚠️ 정규식 휴리스틱(`([가-힣A-Za-z0-9]{2,15})\s?(업종키워드)`) 추출 결과 —
	 * 신뢰도 낮음. 메트릭(competitorCount) 집계용 내부 신호로만 쓴다.
	 * **절대 사용자에게 "이름"으로 노출하지 않는다** (틀린 이름 노출 < 이름 생략).
	 * 사용자 노출용 경쟁사명은 `recommendedBusinesses`(결정적 구조화 추출)만 사용한다.
	 */
	mentionedCompetitors: string[];
	/**
	 * grounded 응답에서 **결정적 구조화 추출**로 얻은 추천 업체명 목록(내 업체 제외).
	 *
	 * 정직성 원칙: 모델에게 추천 업체를 결정적으로 파싱 가능한 구조(번호 목록 + 마커 라인)로
	 * 출력하도록 프롬프트에서 요청하고, 그 블록만 결정적 파서로 추출한다. 자유 산문에서
	 * 정규식으로 긁어내지 않는다(LLM 창의성 추가 금지). 구조화 블록이 없거나 파싱 실패면
	 * 빈 배열로 graceful degrade. 이 필드만 LlmValidation.competitors 로 흘려보낸다.
	 *
	 * grounded=false(학습기억 모드)에서는 항상 빈 배열 — 그라운딩 없는 답변은 추천 근거가 아님.
	 */
	recommendedBusinesses: string[];
	/** 측정 시각 (ISO 8601) */
	measuredAt: string;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** 룰 효과성 추정 */
export interface RuleEffectivenessEstimate {
	/** GEO 룰 ID (예: "GEO_FAQ_SCHEMA") */
	ruleId: string;
	/** 룰 통과 시 인용 확률 변화 추정 (-1.0 ~ +1.0) */
	expectedCorrelation: number;
}

/** 인용 메트릭 */
export interface GeoCitationMetrics {
	/** 전체 질의 중 매장명 언급 비율 (0~1) */
	mentionRate: number;
	/** URL/도메인 언급 비율 (0~1) */
	urlRate: number;
	/** 직접 인용 비율 (0~1) */
	directMentionRate: number;
	/** 같이 등장한 경쟁사 수 평균 */
	competitorCount: number;
}

/** GEO 검증 데이터 소스 */
export type GeoValidationSource = "chatmock" | "mock";

/** GEO 검증 결과 */
export interface GeoValidationResult {
	/** 대상 URL */
	url: string;
	/** 대상 매장명 */
	businessName: string;
	/** 인용 분석 결과 (질의별) */
	citations: GeoCitation[];
	/** 집계 메트릭 */
	metrics: GeoCitationMetrics;
	/** 룰 효과성 추정 (선택적) */
	ruleEffectiveness?: RuleEffectivenessEstimate[];
	/** 데이터 소스 */
	source: GeoValidationSource;
	/** 검증 완료 시각 (ISO 8601) */
	validatedAt: string;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/** GEO 검증기 인터페이스 */
export interface GeoValidator {
	/** 어댑터 식별자 */
	readonly name: string;
	/**
	 * 검증 실행.
	 * @param input 검증 대상 사이트 정보
	 * @param queries 사용자 정의 질의 (선택, 기본은 generateDefaultQueries)
	 */
	validate(
		input: GeoValidationInput,
		queries?: GeoQuery[],
	): Promise<GeoValidationResult>;
	/** 현재 환경에서 사용 가능한지 확인 */
	isAvailable(): boolean;
}
