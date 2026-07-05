/**
 * X-SAG Core Engine — v2/serp barrel export
 *
 * TRD § 19.2.1 SerpAdapter
 * POLICY § 22: SERP 데이터 수집
 */

export type {
	SerpAdapter,
	SerpCompetitor,
	SerpDevice,
	SerpQuery,
	SerpResult,
	SerpSource,
	PopularitySignals,
} from "./types.js";
export { createSerpAdapter } from "./adapter.js";
export { MockSerpProvider } from "./providers/mock.js";
export { NaverSerpProvider } from "./providers/naver.js";
export { SerpApiProvider } from "./providers/serpapi.js";
