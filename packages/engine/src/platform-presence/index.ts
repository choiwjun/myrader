export {
	PLATFORM_SOURCE_LABELS,
	adaptPlatformHtml,
	buildBusinessPresenceModel,
	businessPresenceToCrawlResult,
	businessPresenceToSurface,
	fetchBusinessPresenceSurfaces,
	fetchPlatformPresence,
	inferSurfaceKind,
} from "./adapters.js";
export { applyPlatformRuleScope, getPlatformRuleScope } from "./rule-scope.js";
export type {
	AdaptPlatformHtmlInput,
	BusinessPresence,
	BusinessPresenceModel,
	BusinessPresenceSignals,
	BusinessPresenceSurface,
	BusinessPresenceSurfaceInput,
	BusinessPresenceSurfaceStatus,
	FetchPlatformPresenceInput,
	FetchPlatformPresenceResult,
	PlatformImprovementStatus,
	PlatformMeasurementStatus,
	PlatformRuleScope,
	PlatformScoreEffect,
	PlatformSourceType,
} from "./types.js";
