/**
 * X-SAG Core Engine v2 — Rule Semantic Validator 타입 정의
 *
 * Wave 4 (P5) 사전 구현: 진단 룰의 "의미적 정합성" 을 LLM 으로 검토하는 시스템.
 *
 * 목적:
 *   각 룰의 [의도(intent)] 와 [구현(implementationHint)] 이 일치하는지,
 *   사용자에게 가치 있는 검사인지, 모호하지 않은지를 LLM 이 검토한다.
 *   휴리스틱이 아닌 "리뷰어" 역할 — 룰 정의 자체의 품질을 측정한다.
 *
 * GEO Validator 와 분리되는 이유:
 *   GEO Validator: 사이트가 LLM 응답에 등장하는지 (외부 시그널 측정).
 *   Rule Semantic Validator: 룰 정의가 잘 설계됐는지 (내부 메타 검토).
 */

// ---------------------------------------------------------------------------
// RuleDescriptor — 검토 대상 룰의 메타 정보
// ---------------------------------------------------------------------------

/**
 * 룰 검토용 디스크립터.
 *
 * Rule 함수를 직접 LLM 에 보낼 수는 없으므로,
 * 인간이 읽을 수 있는 의도/구현 요약을 추출해 전달한다.
 */
export interface RuleDescriptor {
	/** 룰 ID (예: "SEO-TITLE-001") */
	ruleId: string;
	/** 카테고리 (seo|aeo|geo|...) */
	category: string;
	/** 룰의 사용자 친화 제목 (예: "페이지 제목 길이 적절성 (10~60자)") */
	title: string;
	/** 룰이 무엇을 검사하는지 사용자 설명 (RuleResult.description 등) */
	description: string;
	/**
	 * 한 문장으로 표현된 룰 의도.
	 * 예: "Title 태그가 50자 이내인지 검사"
	 */
	intent: string;
	/**
	 * 실제 구현 방식 요약.
	 * 예: "$('title').text().length <= 50"
	 */
	implementationHint: string;
}

// ---------------------------------------------------------------------------
// RuleSemanticIssue — LLM 이 발견한 의미적 문제 1건
// ---------------------------------------------------------------------------

export type RuleSemanticSeverity = "info" | "warn" | "critical";

export interface RuleSemanticIssue {
	/** 검토 대상 룰 ID */
	ruleId: string;
	/** 문제 심각도 — info(권고), warn(개선 필요), critical(설계 오류) */
	severity: RuleSemanticSeverity;
	/**
	 * LLM 이 발견한 의미적 불일치 또는 모호함.
	 * 예: "Intent 가 SEO 친화성을 측정한다고 하지만 구현은 단순 글자수만 본다"
	 */
	issue: string;
	/**
	 * 개선 방향 제안.
	 * 예: "키워드 적합성, 검색 의도 매칭도 함께 검토할 것"
	 */
	suggestion: string;
}

// ---------------------------------------------------------------------------
// RuleSemanticReport — 전체 검토 결과
// ---------------------------------------------------------------------------

export interface RuleSemanticReport {
	/** 입력으로 받은 전체 룰 수 */
	totalRules: number;
	/** 실제 LLM 이 검토 완료한 룰 수 (parse fail 배치는 reviewed 에서 제외) */
	reviewed: number;
	/** 발견된 의미적 이슈 목록 */
	issues: RuleSemanticIssue[];
	/** 사람이 읽기 좋은 1~2줄 요약 (예: "30개 룰 중 4개에 의미적 이슈 발견") */
	summary: string;
	/** 검토 완료 시각 (ISO 8601) */
	validatedAt: string;
	/** 데이터 소스 식별자 — "chatmock" | "mock" 등 */
	source: string;
}

// ---------------------------------------------------------------------------
// RuleSemanticValidator — 검증기 인터페이스
// ---------------------------------------------------------------------------

export interface RuleSemanticValidator {
	/** 어댑터 식별자 (예: "chatmock", "mock") */
	readonly name: string;
	/** 현재 환경에서 사용 가능한지 확인 */
	isAvailable(): boolean;
	/**
	 * 룰 디스크립터 목록을 LLM 으로 검토하고 리포트를 반환한다.
	 *
	 * 구현 가이드:
	 *   - 배치(batchSize) 단위로 LLM 호출
	 *   - 일부 배치가 실패해도 나머지는 계속 진행
	 *   - 결과는 입력 순서를 유지할 의무는 없지만 ruleId 기준 매칭 가능해야 함
	 */
	validate(rules: RuleDescriptor[]): Promise<RuleSemanticReport>;
}
