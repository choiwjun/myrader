import type {
	BusinessPresenceSurfaceKind,
	PlatformLimitation,
} from "@boina/contracts/diagnosis";
import type { SourceType } from "@boina/contracts/enums";
import { parseHtml } from "../parser.js";
import type { CrawlResult, ParsedPage } from "../types.js";
import type {
	AdaptPlatformHtmlInput,
	BusinessPresence,
	BusinessPresenceModel,
	BusinessPresenceSignals,
	BusinessPresenceSurface,
	BusinessPresenceSurfaceInput,
	FetchPlatformPresenceInput,
	FetchPlatformPresenceResult,
	PlatformSourceType,
} from "./types.js";

export const PLATFORM_SOURCE_LABELS: Record<SourceType, string> = {
	website: "홈페이지",
	naver_place: "네이버 플레이스",
	naver_blog: "네이버 블로그",
	instagram: "인스타그램",
	kakao_place: "카카오 플레이스",
	youtube: "유튜브",
	facebook: "페이스북",
	other_platform: "플랫폼 페이지",
};

const ADAPTER_NAMES: Record<PlatformSourceType, string> = {
	naver_place: "naver-place-static-html",
	naver_blog: "naver-blog-static-html",
	instagram: "instagram-public-html",
	kakao_place: "kakao-place-static-html",
	youtube: "youtube-public-html",
	facebook: "facebook-public-html",
	other_platform: "generic-platform-html",
};

export function inferSurfaceKind(
	sourceType: SourceType,
	sourceUrl: string,
): BusinessPresenceSurfaceKind {
	if (sourceType === "website") return "website";
	if (sourceType === "naver_blog") return "blog";
	if (sourceType === "instagram" || sourceType === "facebook") return "social";
	if (sourceType === "youtube") return "video";

	const normalized = `${sourceUrl}`.toLowerCase();
	let host = "";
	let path = normalized;
	try {
		const url = new URL(sourceUrl);
		host = url.hostname.toLowerCase();
		path = `${url.pathname}${url.search}${url.hash}`.toLowerCase();
	} catch {
		host = normalized;
	}

	if (
		host.includes("booking.") ||
		host.includes("catchtable") ||
		host.includes("tabling") ||
		host.includes("reservation") ||
		path.includes("booking") ||
		path.includes("reservation") ||
		path.includes("%ec%98%88%ec%95%bd")
	) {
		return "reservation";
	}
	if (
		host.includes("review") ||
		host.includes("reviews") ||
		path.includes("review") ||
		path.includes("reviews") ||
		path.includes("%eb%a6%ac%eb%b7%b0")
	) {
		return "review";
	}
	if (
		isPlaceDetailSurface(sourceType, host, path)
	) {
		return "place";
	}
	if (
		host.includes("maps.") ||
		host.includes("map.") ||
		path.includes("/maps") ||
		path.includes("cid=")
	) {
		return "map";
	}
	if (sourceType === "naver_place" || sourceType === "kakao_place") {
		return "place";
	}
	return "other";
}

function isPlaceDetailSurface(
	sourceType: SourceType,
	host: string,
	path: string,
): boolean {
	if (sourceType === "naver_place") {
		return (
			host === "place.naver.com" ||
			host.endsWith(".place.naver.com") ||
			(host === "map.naver.com" && path.includes("/entry/place"))
		);
	}
	if (sourceType === "kakao_place") {
		return host === "place.map.kakao.com" || host === "place.kakao.com";
	}
	return false;
}

export function adaptPlatformHtml(
	input: AdaptPlatformHtmlInput,
): BusinessPresence {
	const parsedPage = parseHtml(input.html, input.sourceUrl, 200);
	const rawText = parsedPage.bodyText;
	const name = cleanTitle(
		parsedPage.h1 ??
			parsedPage.meta["og:title"] ??
			parsedPage.title ??
			null,
		input.sourceType,
	);
	const description =
		parsedPage.description ??
		parsedPage.meta["og:description"] ??
		firstUsefulSentence(rawText);
	const signals = extractSignals(rawText, description ?? "");
	const normalizedPage = enrichParsedPage(parsedPage, name, description, signals);
	const surfaceKind = inferSurfaceKind(input.sourceType, input.sourceUrl);

	return {
		sourceType: input.sourceType,
		surfaceKind,
		sourceLabel: PLATFORM_SOURCE_LABELS[input.sourceType],
		sourceUrl: input.sourceUrl,
		name,
		description,
		rawText,
		signals,
		limitations: buildAdapterLimitations(input.sourceType),
		provenance: {
			url: input.sourceUrl,
			collectedAt: input.collectedAt ?? new Date().toISOString(),
			adapter: ADAPTER_NAMES[input.sourceType],
			confidence: confidenceForSource(input.sourceType, rawText),
		},
		normalizedPage,
	};
}

export async function fetchPlatformPresence(
	input: FetchPlatformPresenceInput,
): Promise<FetchPlatformPresenceResult> {
	const fetchImpl = input.fetchImpl ?? globalThis.fetch;
	try {
		const response = await fetchImpl(input.sourceUrl, {
			headers: {
				"user-agent":
					"Mozilla/5.0 (compatible; X-SAG-Bot/1.0; +https://X-SAG.com/bot)",
			},
		});
		if (!response.ok) {
			return {
				presence: null,
				limitations: [
					{
						code: "PLATFORM_FETCH_FAILED",
						message: `${PLATFORM_SOURCE_LABELS[input.sourceType]} 공개 페이지 응답을 가져오지 못했습니다. HTTP ${response.status}`,
						affectedCategories: ["seo", "aeo", "geo"],
					},
				],
			};
		}

		const html = await response.text();
		return {
			presence: adaptPlatformHtml({
				sourceType: input.sourceType,
				sourceUrl: input.sourceUrl,
				html,
			}),
			limitations: [],
		};
	} catch {
		return {
			presence: null,
			limitations: [
				{
					code: "PLATFORM_FETCH_UNAVAILABLE",
					message: `${PLATFORM_SOURCE_LABELS[input.sourceType]} 공개 페이지 접근이 제한되어 부분 진단으로 처리했습니다.`,
					affectedCategories: ["seo", "aeo", "geo"],
				},
			],
		};
	}
}

export function businessPresenceToCrawlResult(
	presence: BusinessPresence,
): CrawlResult {
	const timestamp = presence.provenance.collectedAt;
	return {
		pages: [presence.normalizedPage],
		partialResult: true,
		startedAt: timestamp,
		completedAt: timestamp,
	};
}

export async function fetchBusinessPresenceSurfaces(
	inputs: BusinessPresenceSurfaceInput[],
): Promise<BusinessPresenceSurface[]> {
	const surfaces: BusinessPresenceSurface[] = [];

	for (const input of dedupeSurfaceInputs(inputs)) {
		if (input.sourceType === "website") {
			surfaces.push(referenceWebsiteSurface(input));
			continue;
		}

		const result = await fetchPlatformPresence({
			sourceType: input.sourceType,
			sourceUrl: input.url,
		});
		if (result.presence) {
			surfaces.push(businessPresenceToSurface(result.presence));
		} else {
			surfaces.push(failedPlatformSurface(input, result.limitations));
		}
	}

	return surfaces;
}

export function businessPresenceToSurface(
	presence: BusinessPresence,
): BusinessPresenceSurface {
	return {
		sourceType: presence.sourceType,
		surfaceKind: presence.surfaceKind,
		url: presence.sourceUrl,
		status: "fetched",
		sourceLabel: presence.sourceLabel,
		name: presence.name,
		description: presence.description,
		confidence: presence.provenance.confidence,
		services: presence.signals.content.serviceKeywords,
		limitations: presence.limitations,
	};
}

export function buildBusinessPresenceModel(input: {
	primarySourceType: SourceType;
	primaryUrl: string;
	primaryPresence?: BusinessPresence | null;
	surfaces?: BusinessPresenceSurface[];
	limitations?: PlatformLimitation[];
}): BusinessPresenceModel {
	const primarySurface = input.primaryPresence
		? businessPresenceToSurface(input.primaryPresence)
		: referenceSurface({
				sourceType: input.primarySourceType,
				url: input.primaryUrl,
			});
	const surfaces = dedupeSurfaces([
		primarySurface,
		...(input.surfaces ?? []),
	]);
	const canonicalName =
		surfaces.find((surface) => surface.name && surface.name.trim().length > 0)
			?.name ?? null;
	const services = [
		...new Set(surfaces.flatMap((surface) => surface.services ?? [])),
	].slice(0, 20);
	const limitations = dedupeLimitations([
		...(input.limitations ?? []),
		...surfaces.flatMap((surface) => surface.limitations ?? []),
	]);

	return {
		primarySourceType: input.primarySourceType,
		primaryUrl: input.primaryUrl,
		canonicalName,
		services,
		surfaces,
		limitations,
	};
}

function enrichParsedPage(
	page: ParsedPage,
	name: string | null,
	description: string | null,
	signals: BusinessPresenceSignals,
): ParsedPage {
	const localBusiness = {
		"@context": "https://schema.org",
		"@type": "LocalBusiness",
		name,
		description,
		address: signals.local.address,
		telephone: signals.contact.phone,
		openingHours: signals.local.openingHours,
	};

	return {
		...page,
		title: name ?? page.title,
		description,
		h1: name ?? page.h1,
		bodyText: page.bodyText,
		wordCount: page.wordCount,
		schemaJsonLd: [localBusiness, ...page.schemaJsonLd],
		hasSchema: true,
		canonicalUrl: null,
	};
}

function buildAdapterLimitations(sourceType: PlatformSourceType): PlatformLimitation[] {
	const label = PLATFORM_SOURCE_LABELS[sourceType];
	return [
		{
			code: "PLATFORM_PUBLIC_HTML_ONLY",
			message: `${label}의 공개 HTML과 메타데이터에서 확인 가능한 신호만 수집했습니다.`,
			affectedCategories: ["seo", "aeo", "geo"],
		},
		{
			code: "PLATFORM_EDIT_SCOPE_LIMITED",
			message: `${label}에서 직접 수정할 수 없는 기술 항목은 점수 감점이 아닌 참고 제한으로 처리합니다.`,
			affectedCategories: ["seo", "aeo", "geo"],
		},
	];
}

function cleanTitle(
	value: string | null,
	sourceType: PlatformSourceType,
): string | null {
	if (!value) return null;
	const sourceLabel = PLATFORM_SOURCE_LABELS[sourceType];
	return value
		.replace(new RegExp(`\\s*[-|]\\s*${escapeRegExp(sourceLabel)}\\s*$`, "i"), "")
		.trim();
}

function firstUsefulSentence(text: string): string | null {
	const sentence = text
		.split(/[.!?\n]/)
		.map((part) => part.trim())
		.find((part) => part.length >= 20);
	return sentence ?? null;
}

function extractSignals(
	rawText: string,
	description: string,
): BusinessPresenceSignals {
	const text = `${rawText} ${description}`;
	const phone = text.match(/(?:0\d{1,2}-\d{3,4}-\d{4}|010-\d{4}-\d{4})/)?.[0] ?? null;
	const address =
		text.match(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n.。]{5,40}/)?.[0]?.trim() ??
		null;
	const openingHours =
		text.match(/(?:영업시간|운영시간|매일|월|화|수|목|금|토|일)[^\n.。]{0,40}\d{1,2}:\d{2}[^\n.。]{0,20}/)?.[0]?.trim() ??
		null;
	const matchedKeywords = [
		...new Set(text.match(/[가-힣A-Za-z0-9]{2,20}/g) ?? []),
	].filter((word) => !["서울", "강남구", "영업시간", "방문자"].includes(word));
	const serviceSignalWords = [
		"coffee",
		"brunch",
		"dessert",
		"beans",
		"menu",
		"booking",
		"reservation",
		"review",
		"reviews",
		"photos",
	].filter((word) => matchedKeywords.includes(word));
	const serviceKeywords = [
		...serviceSignalWords,
		...matchedKeywords.filter((word) => !serviceSignalWords.includes(word)),
	].slice(0, 12);

	return {
		local: {
			address,
			openingHours,
			regionHints: address ? [address.split(/\s+/)[0] ?? address] : [],
		},
		contact: {
			phone,
			bookingHint: /예약|booking/i.test(text),
		},
		content: {
			serviceKeywords,
			recentContentHint: /최근|오늘|이번|업데이트|게시|영상|블로그/i.test(text),
		},
		trust: {
			reviewHint: /리뷰|별점|후기|평점/i.test(text),
			photoHint: /사진|이미지|photo|image/i.test(text),
		},
	};
}

function confidenceForSource(
	sourceType: PlatformSourceType,
	rawText: string,
): "low" | "medium" | "high" {
	if (rawText.length < 80) return "low";
	if (sourceType === "instagram" || sourceType === "facebook") return "medium";
	return "high";
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeSurfaceInputs(
	inputs: BusinessPresenceSurfaceInput[],
): BusinessPresenceSurfaceInput[] {
	const seen = new Set<string>();
	const deduped: BusinessPresenceSurfaceInput[] = [];
	for (const input of inputs) {
		const key = `${input.sourceType}:${input.url}`;
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(input);
	}
	return deduped;
}

function dedupeSurfaces(
	surfaces: BusinessPresenceSurface[],
): BusinessPresenceSurface[] {
	const seen = new Set<string>();
	const deduped: BusinessPresenceSurface[] = [];
	for (const surface of surfaces) {
		const key = `${surface.sourceType}:${surface.url}`;
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(surface);
	}
	return deduped;
}

function dedupeLimitations(
	limitations: PlatformLimitation[],
): PlatformLimitation[] {
	const seen = new Set<string>();
	const deduped: PlatformLimitation[] = [];
	for (const limitation of limitations) {
		const key = `${limitation.code}:${limitation.message}`;
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(limitation);
	}
	return deduped;
}

function referenceSurface(
	input: BusinessPresenceSurfaceInput,
): BusinessPresenceSurface {
	if (input.sourceType === "website") return referenceWebsiteSurface(input);
	return {
		sourceType: input.sourceType,
		surfaceKind: input.surfaceKind ?? inferSurfaceKind(input.sourceType, input.url),
		url: input.url,
		status: "skipped",
		sourceLabel: PLATFORM_SOURCE_LABELS[input.sourceType],
		services: [],
		limitations: [
			{
				code: "BUSINESS_SURFACE_REFERENCE_ONLY",
				message:
					"This platform surface is linked to the business presence model, but was not fetched in this run.",
				affectedCategories: ["seo", "aeo", "geo"],
			},
		],
	};
}

function referenceWebsiteSurface(
	input: BusinessPresenceSurfaceInput,
): BusinessPresenceSurface {
	return {
		sourceType: "website",
		surfaceKind: "website",
		url: input.url,
		status: "skipped",
		sourceLabel: PLATFORM_SOURCE_LABELS.website,
		services: [],
		limitations: [
			{
				code: "BUSINESS_SURFACE_WEBSITE_REFERENCE_ONLY",
				message:
					"The website URL is tracked as an owned surface; detailed website signals come from analyzed pages.",
				affectedCategories: ["seo", "aeo", "geo"],
			},
		],
	};
}

function failedPlatformSurface(
	input: BusinessPresenceSurfaceInput,
	limitations: PlatformLimitation[],
): BusinessPresenceSurface {
	return {
		sourceType: input.sourceType,
		surfaceKind: input.surfaceKind ?? inferSurfaceKind(input.sourceType, input.url),
		url: input.url,
		status: "failed",
		sourceLabel: PLATFORM_SOURCE_LABELS[input.sourceType],
		services: [],
		limitations,
	};
}
