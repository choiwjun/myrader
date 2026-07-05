import type {
	BusinessPresenceSurfaceKind,
	PlatformLimitation,
} from "@boina/contracts/diagnosis";
import type { SourceType } from "@boina/contracts/enums";
import type { ParsedPage } from "../types.js";

export type PlatformSourceType = Exclude<SourceType, "website">;

export type PlatformMeasurementStatus =
	| "observable"
	| "partially_observable"
	| "not_observable";

export type PlatformImprovementStatus =
	| "platform_editable"
	| "owner_controlled"
	| "reference_only";

export type PlatformScoreEffect = "scored" | "reweighted" | "ignored";

export interface PlatformRuleScope {
	measurement: PlatformMeasurementStatus;
	improvement: PlatformImprovementStatus;
	scoreEffect: PlatformScoreEffect;
	reason: string;
}

export interface BusinessPresenceSignals {
	local: {
		address: string | null;
		openingHours: string | null;
		regionHints: string[];
	};
	contact: {
		phone: string | null;
		bookingHint: boolean;
	};
	content: {
		serviceKeywords: string[];
		recentContentHint: boolean;
	};
	trust: {
		reviewHint: boolean;
		photoHint: boolean;
	};
}

export interface BusinessPresence {
	sourceType: PlatformSourceType;
	surfaceKind: BusinessPresenceSurfaceKind;
	sourceLabel: string;
	sourceUrl: string;
	name: string | null;
	description: string | null;
	rawText: string;
	signals: BusinessPresenceSignals;
	limitations: PlatformLimitation[];
	provenance: {
		url: string;
		collectedAt: string;
		adapter: string;
		confidence: "low" | "medium" | "high";
	};
	normalizedPage: ParsedPage;
}

export type BusinessPresenceSurfaceStatus = "fetched" | "skipped" | "failed";

export interface BusinessPresenceSurfaceInput {
	sourceType: SourceType;
	url: string;
	surfaceKind?: BusinessPresenceSurfaceKind;
}

export interface BusinessPresenceSurface {
	sourceType: SourceType;
	surfaceKind?: BusinessPresenceSurfaceKind;
	url: string;
	status: BusinessPresenceSurfaceStatus;
	sourceLabel: string;
	name?: string | null;
	description?: string | null;
	confidence?: "low" | "medium" | "high";
	services: string[];
	limitations: PlatformLimitation[];
}

export interface BusinessPresenceModel {
	primarySourceType: SourceType;
	primaryUrl: string;
	canonicalName: string | null;
	services: string[];
	surfaces: BusinessPresenceSurface[];
	limitations: PlatformLimitation[];
}

export interface AdaptPlatformHtmlInput {
	sourceType: PlatformSourceType;
	sourceUrl: string;
	html: string;
	collectedAt?: string;
}

export interface FetchPlatformPresenceInput {
	sourceType: PlatformSourceType;
	sourceUrl: string;
	fetchImpl?: typeof fetch;
}

export interface FetchPlatformPresenceResult {
	presence: BusinessPresence | null;
	limitations: PlatformLimitation[];
}
