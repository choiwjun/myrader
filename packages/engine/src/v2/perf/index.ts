/**
 * X-SAG Core Engine — v2/perf barrel export
 *
 * TRD § 19.2.3 LighthouseAdapter
 */

export type {
	LighthouseAdapter,
	LighthouseOptions,
	LighthouseResult,
} from "./types.js";
export { createLighthouseAdapter } from "./adapter.js";
export { MockLighthouseProvider } from "./providers/mock.js";
export { PageSpeedInsightsProvider } from "./providers/pagespeed.js";
