/**
 * X-SAG Core Engine — NLP Analysis Types
 *
 * Phase P-A: 한국어 NLP 콘텐츠 분석 어댑터.
 *
 * 목적:
 * - 키워드 밀도, 토픽, 가독성, E-E-A-T, 의미적 관련성 평가.
 * - rule-based (정규식 + 휴리스틱) 또는 ChatMock (LLM) 활용.
 *
 * NlpResult 는 RuleContext.nlpResult 로 주입되어 NLP 룰 8개에서 사용된다.
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface NlpInput {
	url: string;
	title: string | null;
	description: string | null;
	/** 최대 8000자 권장. 호출자가 잘라서 전달. */
	bodyText: string;
	h1: string | null;
	h2: string[];
	targetKeywords: string[];
	industry: string;
	region: string;
}

// ---------------------------------------------------------------------------
// Result sub-types
// ---------------------------------------------------------------------------

export interface KeywordDensityItem {
	keyword: string;
	count: number;
	/** 0.0 ~ 1.0 (전체 단어 대비 비율) */
	density: number;
}

export interface TopNoun {
	word: string;
	count: number;
}

export interface NlpKeywordDensity {
	targetKeywords: KeywordDensityItem[];
	/** 상위 10개 명사 */
	topNouns: TopNoun[];
}

export interface NlpTopic {
	topic: string;
	/** 0.0 ~ 1.0 */
	relevance: number;
}

export interface NlpReadability {
	/** 평균 어절 수 */
	avgSentenceLength: number;
	/** 평균 문장 수 */
	avgParagraphLength: number;
	/** 0 ~ 100. 한국어 가독성 휴리스틱 점수 */
	score: number;
}

export interface NlpEeat {
	hasAuthor: boolean;
	hasExpertiseSignals: number;
	hasTrustSignals: number;
	hasFreshness: boolean;
	/** 0 ~ 100 */
	score: number;
}

export interface NlpSemanticRelevance {
	/** 0.0 ~ 1.0, 제목과 본문 의미 일치도 */
	titleBodyAlignment: number;
	/** 0.0 ~ 1.0, 키워드가 자연스러운 문장에 등장하는 비율 */
	keywordIntegration: number;
}

// ---------------------------------------------------------------------------
// Full result
// ---------------------------------------------------------------------------

export type NlpSource = "rule-based" | "chatmock" | "mock";

export interface NlpResult {
	keywordDensity: NlpKeywordDensity;
	topics: NlpTopic[];
	readability: NlpReadability;
	eeat: NlpEeat;
	semanticRelevance: NlpSemanticRelevance;
	source: NlpSource;
	/** ISO 8601 */
	analyzedAt: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface NlpProvider {
	readonly name: string;
	analyze(input: NlpInput): Promise<NlpResult>;
	isAvailable(): boolean;
}

// ---------------------------------------------------------------------------
// Phase R-C: Topic Clustering & Cross-Page Analysis
// ---------------------------------------------------------------------------

/** 단일 토픽 클러스터 — 공출현 그룹화된 명사 집합. */
export interface TopicCluster {
	topic: string;
	keywords: string[];
	pageCount: number;
	pageUrls: string[];
	/** 0~1, industry/targetKeywords 와의 관련성. */
	relevance: number;
	/** 0~1, 사이트 전체 단어 중 이 토픽 차지 비율. */
	coverage: number;
}

export interface TopicClusterResult {
	clusters: TopicCluster[];
	/** 누락된 권장 토픽 (industry 기준). */
	missingTopics: string[];
	/** 산만한 토픽 (industry 와 무관). */
	irrelevantTopics: string[];
	source: "rule-based" | "chatmock";
}

/** 사이트 전반 NLP 분석. */
export interface CrossPageAnalysis {
	totalPages: number;
	totalWords: number;
	/** 사이트 전반 토픽 분포. */
	topicDistribution: TopicCluster[];
	/** 페이지 간 중복 콘텐츠 비율 (Jaccard > 0.7 페어 비율). */
	duplicateContentRatio: number;
	/** 페이지당 평균 단어 수. */
	avgWordsPerPage: number;
	/** 키워드 카니발리제이션 — 같은 키워드 타겟팅하는 페이지 2개 이상. */
	cannibalization: Array<{ keyword: string; pages: string[] }>;
}
