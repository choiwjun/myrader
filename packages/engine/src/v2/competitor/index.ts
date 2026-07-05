/**
 * X-SAG Core Engine — v2/competitor barrel export
 *
 * TRD § 19.2.4 CompetitorDiscoveryEngine
 * POLICY § 22: SERP 기반 경쟁사 자동 발견
 */

export type {
	DiscoveredCompetitor,
	DiscoveryInput,
	DiscoveryResult,
	DiscoverySignalSource,
} from "./types.js";
export { CompetitorDiscoveryEngine } from "./discovery.js";
export { rankCompetitors, computePopularityScore } from "./ranker.js";
