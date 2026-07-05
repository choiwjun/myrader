/**
 * X-SAG Core Engine — v2/nlp barrel export
 *
 * Phase P-A: 한국어 NLP 콘텐츠 분석 (ChatMock + rule-based 폴백).
 */

export type {
	CrossPageAnalysis,
	KeywordDensityItem,
	NlpEeat,
	NlpInput,
	NlpKeywordDensity,
	NlpProvider,
	NlpReadability,
	NlpResult,
	NlpSemanticRelevance,
	NlpSource,
	NlpTopic,
	TopicCluster,
	TopicClusterResult,
	TopNoun,
} from "./types.js";

export { createNlpAnalyzer, NlpAnalyzerChain } from "./analyzer.js";
export { RuleBasedNlpProvider } from "./providers/rule-based.js";
export { ChatMockNlpProvider } from "./providers/chatmock.js";
export { MockNlpProvider } from "./providers/mock.js";

// Phase R-C: 한국어 형태소 분석기 + 토픽 클러스터링
export { KoreanMorphologyAnalyzer } from "./providers/korean-morphology.js";
export type {
	ExtractNounsOptions,
	MorphologyResult,
	MorphologyVerbItem,
	MorphologyWordItem,
} from "./providers/korean-morphology.js";

export { TopicClusterAnalyzer, INDUSTRY_TOPICS } from "./topic-cluster.js";
export type { TopicInput, TopicInputPage } from "./topic-cluster.js";

export { analyzeCrossPage } from "./cross-page-analyzer.js";
