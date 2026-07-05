import type { BusinessPresenceSurfaceKind } from "@boina/contracts/diagnosis";
import type { SourceType } from "@boina/contracts/enums";
import type { RuleResult } from "../analyzers/types.js";
import type { PlatformRuleScope } from "./types.js";

const WEBSITE_SCOPE: PlatformRuleScope = {
	measurement: "observable",
	improvement: "owner_controlled",
	scoreEffect: "scored",
	reason: "Owned website rules are fully scoreable on website sources.",
};

const PLATFORM_EDITABLE_SCOPE: PlatformRuleScope = {
	measurement: "observable",
	improvement: "platform_editable",
	scoreEffect: "scored",
	reason: "This signal can usually be improved through public profile or content fields.",
};

const REFERENCE_ONLY_SCOPE: PlatformRuleScope = {
	measurement: "observable",
	improvement: "reference_only",
	scoreEffect: "ignored",
	reason: "This is controlled by the third-party platform and should not reduce the business score.",
};

const PARTIAL_SCOPE: PlatformRuleScope = {
	measurement: "partially_observable",
	improvement: "platform_editable",
	scoreEffect: "reweighted",
	reason: "The platform exposes partial public evidence for this signal.",
};

const REFERENCE_ONLY_PREFIXES = [
	"SEO-CANONICAL",
	"SEO-ROBOTS",
	"SEO-SITEMAP",
	"SEO-XML-SITEMAP",
	"PERF-",
	"MOBILE-",
	"BACKLINK-CANONICAL",
];

const PLATFORM_EDITABLE_PREFIXES = [
	"GEO-",
	"AEO-",
	"SEO-TITLE",
	"SEO-META",
	"SEO-OG",
	"SEO-IMG-ALT",
];

const SURFACE_NATIVE_PREFIXES: Partial<
	Record<BusinessPresenceSurfaceKind, string[]>
> = {
	map: ["GEO-MAP", "GEO-DIRECTIONS", "GEO-REGION", "GEO-CONTACT"],
	review: ["GEO-SOCIAL-PROOF", "GEO-REVIEW", "AEO-TESTIMONIAL"],
	reservation: ["SEO-CTA", "AEO-PROCESS", "AEO-CONTACT-DIRECT", "GEO-CONTACT"],
};

const PARTIAL_SCOPE_RULE_WEIGHT_FACTOR = 0.5;

function reweightPartialPlatformRule(result: RuleResult): number {
	if (result.ruleWeight <= 0) return 0;
	return Math.max(1, Math.ceil(result.ruleWeight * PARTIAL_SCOPE_RULE_WEIGHT_FACTOR));
}

export function getPlatformRuleScope(
	sourceType: SourceType,
	ruleId: string,
	surfaceKind?: BusinessPresenceSurfaceKind,
): PlatformRuleScope {
	if (sourceType === "website") return WEBSITE_SCOPE;
	if (REFERENCE_ONLY_PREFIXES.some((prefix) => ruleId.startsWith(prefix))) {
		return REFERENCE_ONLY_SCOPE;
	}
	if (surfaceKind !== undefined && isSurfaceSpecificKind(surfaceKind)) {
		return isNativeSurfaceRule(surfaceKind, ruleId)
			? PLATFORM_EDITABLE_SCOPE
			: REFERENCE_ONLY_SCOPE;
	}
	if (PLATFORM_EDITABLE_PREFIXES.some((prefix) => ruleId.startsWith(prefix))) {
		return PLATFORM_EDITABLE_SCOPE;
	}
	return PARTIAL_SCOPE;
}

export function applyPlatformRuleScope(
	sourceType: SourceType,
	results: RuleResult[],
	options: { surfaceKind?: BusinessPresenceSurfaceKind } = {},
): RuleResult[] {
	if (sourceType === "website") return results;

	return results.map((result) => {
		const scope = getPlatformRuleScope(
			sourceType,
			result.ruleId,
			options.surfaceKind,
		);
		if (scope.scoreEffect === "scored") {
			return result;
		}

		if (scope.scoreEffect === "reweighted") {
			return {
				...result,
				ruleWeight: reweightPartialPlatformRule(result),
				evidence: [...result.evidence, "platform_scope: reweighted", scope.reason],
				recommendation: `${result.recommendation} 단, 이 항목은 플랫폼 공개 데이터에서 부분적으로만 확인되므로 홈페이지 기준보다 낮은 가중치로 반영합니다.`,
			};
		}

		return {
			...result,
			passed: true,
			severity: "low",
			expectedImpact: "low",
			ruleWeight: 0,
			evidence: [
				...result.evidence,
				"platform_scope: reference_only",
				scope.reason,
			],
			recommendation: `${result.recommendation} 단, 이 항목은 플랫폼이 통제하는 영역이라 점수 감점 대신 참고 제한으로만 표시합니다.`,
		};
	});
}

function isSurfaceSpecificKind(
	surfaceKind: BusinessPresenceSurfaceKind,
): boolean {
	return (
		surfaceKind === "map" ||
		surfaceKind === "review" ||
		surfaceKind === "reservation"
	);
}

function isNativeSurfaceRule(
	surfaceKind: BusinessPresenceSurfaceKind,
	ruleId: string,
): boolean {
	return (
		SURFACE_NATIVE_PREFIXES[surfaceKind]?.some((prefix) =>
			ruleId.startsWith(prefix),
		) ?? false
	);
}
