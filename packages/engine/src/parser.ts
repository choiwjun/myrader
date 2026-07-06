/**
 * X-SAG Core Engine — HTML Parser (MOD-PARSER, TRD § 10.2)
 *
 * 정적 HTML → ParsedPage 구조 메타데이터.
 * Cheerio 사용. POLICY § 4.4: bodyText 는 ParsedPage 에만 — 상위 호출자가 저장 금지.
 */

import type { CrawlFailureReason } from "@boina/contracts/enums";
import * as cheerio from "cheerio";
import { getSchemaNodes, isFaqPageNode } from "./analyzers/shared/schema-validator.js";
import type { ParsedPage } from "./types.js";
import { isSameDomain, normalizeUrl } from "./utils/url.js";

export interface ParseHtmlOptions {
	failureReason?: CrawlFailureReason | undefined;
	contentLanguageHeader?: string | null | undefined;
	httpProtocol?: ParsedPage["httpProtocol"] | undefined;
	redirectChainLength?: number | null | undefined;
}

// ---------------------------------------------------------------------------
// parseHtml
// ---------------------------------------------------------------------------

/**
 * HTML 문자열을 파싱하여 ParsedPage 를 반환한다.
 *
 * @param html       원시 HTML 문자열
 * @param baseUrl    페이지 URL (절대 URL 해석 기준)
 * @param statusCode HTTP 응답 상태 코드
 * @param failureReason 크롤 실패 사유 (있을 경우)
 */
export function parseHtml(
	html: string,
	baseUrl: string,
	statusCode: number,
	failureReasonOrOptions?: CrawlFailureReason | ParseHtmlOptions,
): ParsedPage {
	const options: ParseHtmlOptions =
		typeof failureReasonOrOptions === "object"
			? failureReasonOrOptions
			: { failureReason: failureReasonOrOptions };
	const $ = cheerio.load(html);

	// ---------------------------------------------------------------------------
	// title
	// ---------------------------------------------------------------------------
	const title = $("title").first().text().trim() || null;
	const htmlLang = $("html").attr("lang")?.trim() || null;

	// ---------------------------------------------------------------------------
	// meta 태그 수집 (name/property → content)
	// ---------------------------------------------------------------------------
	const meta: Record<string, string> = {};
	$("meta").each((_, el) => {
		const name =
			$(el).attr("name") || $(el).attr("property") || $(el).attr("http-equiv");
		const content = $(el).attr("content");
		if (name && content !== undefined) {
			meta[name.toLowerCase()] = content;
		}
	});

	const description = meta.description ?? null;
	const robotsMeta = meta.robots ?? null;

	// Phase O-D — lastModified: og:updated_time / article:modified_time 우선,
	// 그 외 last-modified meta 도 fallback
	const lastModified =
		meta["article:modified_time"] ??
		meta["og:updated_time"] ??
		meta["last-modified"] ??
		null;

	// ---------------------------------------------------------------------------
	// h1, h2, h3 + document-order headingStructure
	// ---------------------------------------------------------------------------
	const h1 = $("h1").first().text().trim() || null;
	const h2: string[] = [];
	const h3: string[] = [];
	const headingStructure: { level: number; text: string }[] = [];
	$("h1,h2,h3,h4,h5,h6").each((_, el) => {
		const tagName = el.tagName.toLowerCase();
		const level = Number(tagName.slice(1));
		const text = $(el).text().trim();
		if (!text) return;
		headingStructure.push({ level, text });
		if (level === 2) h2.push(text);
		if (level === 3) h3.push(text);
	});

	// -------------------------------------------------------------------------
	// Phase O-D — <ul>/<ol>/<table> 요소 개수
	// -------------------------------------------------------------------------
	const listTableCount = {
		ul: $("ul").length,
		ol: $("ol").length,
		table: $("table").length,
	};

	// ---------------------------------------------------------------------------
	// canonical
	// ---------------------------------------------------------------------------
	const canonicalHref = $('link[rel="canonical"]').attr("href") ?? null;
	let canonicalUrl: string | null = null;
	if (canonicalHref) {
		try {
			canonicalUrl = new URL(canonicalHref, baseUrl).toString();
		} catch {
			canonicalUrl = canonicalHref;
		}
	}

	// ---------------------------------------------------------------------------
	// <link> 요소 수집 (rel/href/hreflang) — SEO-HREFLANG-001 / SEO-PAGINATION-001 실측용
	// rel 은 소문자 정규화, 속성 없으면 null.
	// ---------------------------------------------------------------------------
	const linkTags: {
		rel: string | null;
		href: string | null;
		hreflang: string | null;
	}[] = [];
	$("link").each((_, el) => {
		const rel = $(el).attr("rel");
		const href = $(el).attr("href");
		const hreflang = $(el).attr("hreflang");
		linkTags.push({
			rel: rel ? rel.trim().toLowerCase() : null,
			href: href ? href.trim() : null,
			hreflang: hreflang ? hreflang.trim() : null,
		});
	});

	// ---------------------------------------------------------------------------
	// bodyText — visible text (script/style 제외)
	// POLICY § 4.4: 저장 금지. 상위 호출자가 분석 후 폐기해야 함.
	// ---------------------------------------------------------------------------
	// ---------------------------------------------------------------------------
	// JSON-LD schema — script タグが削除される前に収集する
	// ---------------------------------------------------------------------------
	// NOTE: この処理は script/style の remove() より前に行う必要がある
	const schemaJsonLd: unknown[] = [];
	$('script[type="application/ld+json"]').each((_, el) => {
		const raw = $(el).html() ?? "";
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				schemaJsonLd.push(...parsed);
			} else {
				schemaJsonLd.push(parsed);
			}
		} catch {
			// 파싱 실패 시 skip (TRD § 10.2)
		}
	});

	$("script, style, noscript").remove();

	const textBlocks: { tag: string; text: string }[] = [];
	$(
		"body h1,body h2,body h3,body h4,body h5,body h6,body p,body li,body blockquote,body figcaption,body td,body th,body dt,body dd",
	).each((_, el) => {
		const tag = el.tagName.toLowerCase();
		const text = $(el).text().replace(/\s+/g, " ").trim();
		if (text) textBlocks.push({ tag, text });
	});
	const paragraphs = textBlocks
		.filter((block) => block.tag === "p")
		.map((block) => block.text);

	const bodyText = $("body").text().replace(/\s+/g, " ").trim();

	// ---------------------------------------------------------------------------
	// wordCount — 공백 split + 한국어 어절 포함 (1차: 단순 split)
	// ---------------------------------------------------------------------------
	const wordCount = bodyText
		? bodyText.split(/\s+/).filter((w) => w.length > 0).length
		: 0;

	// ---------------------------------------------------------------------------
	// 링크 추출 (a[href])
	// ---------------------------------------------------------------------------
	const internalLinks: string[] = [];
	const externalLinks: string[] = [];
	const contactLinks: NonNullable<ParsedPage["contactLinks"]> = [];

	$("a[href]").each((_, el) => {
		const href = $(el).attr("href")?.trim();
		if (!href) return;

		const hrefLower = href.toLowerCase();
		if (hrefLower.startsWith("mailto:") || hrefLower.startsWith("tel:")) {
			const kind = hrefLower.startsWith("mailto:") ? "mailto" : "tel";
			const value = href.slice(kind.length + 1).split(/[?#]/, 1)[0] ?? "";
			contactLinks.push({
				kind,
				href,
				value,
				text: $(el).text().replace(/\s+/g, " ").trim(),
			});
			return;
		}

		if (hrefLower.startsWith("javascript:")) return;
		if (href.startsWith("#")) return;


		let absolute: string;
		try {
			absolute = new URL(href, baseUrl).toString();
		} catch {
			return;
		}

		// http/https 만 수집
		if (!/^https?:\/\//i.test(absolute)) return;

		if (isSameDomain(absolute, baseUrl)) {
			internalLinks.push(normalizeUrl(absolute));
		} else {
			externalLinks.push(absolute);
		}
	});

	// ---------------------------------------------------------------------------
	// images
	// ---------------------------------------------------------------------------
	const images: {
		src: string;
		alt: string | null;
		loading?: string | undefined;
		width?: string | undefined;
		height?: string | undefined;
	}[] = [];
	$("img").each((_, el) => {
		const src = $(el).attr("src");
		if (!src) return;
		let absoluteSrc = src;
		try {
			absoluteSrc = new URL(src, baseUrl).toString();
		} catch {
			// keep as-is
		}
		const alt = $(el).attr("alt") ?? null;
		// commit 512973d: img loading/width/height 속성 노출 (SEO-IMG-LAZY / SEO-IMG-DIMENSIONS 실측용).
		// 속성이 없으면 undefined (빈 문자열도 "선언 안 함"으로 취급).
		const loadingRaw = $(el).attr("loading");
		const widthRaw = $(el).attr("width");
		const heightRaw = $(el).attr("height");
		images.push({
			src: absoluteSrc,
			alt,
			loading: loadingRaw ? loadingRaw.trim().toLowerCase() : undefined,
			width: widthRaw ? widthRaw.trim() : undefined,
			height: heightRaw ? heightRaw.trim() : undefined,
		});
	});

	// ---------------------------------------------------------------------------
	// hasSchema, hasFAQ
	// ---------------------------------------------------------------------------
	const hasSchema = schemaJsonLd.length > 0;

	// FAQPage schema 여부 (@graph / nested array 포함)
	const hasFaqSchema = getSchemaNodes(schemaJsonLd).some(isFaqPageNode);

	// H2/H3 텍스트에 FAQ 관련 키워드 포함 여부
	const faqKeywords = /자주\s*묻는\s*질문|FAQ|Q&A/i;
	const hasFaqHeading =
		h2.some((t) => faqKeywords.test(t)) ||
		h3.some((t) => faqKeywords.test(t));

	const hasFAQ = hasFaqSchema || hasFaqHeading;

	// ---------------------------------------------------------------------------
	// Result
	// ---------------------------------------------------------------------------
	return {
		url: baseUrl,
		statusCode,
		title,
		description,
		h1,
		h2,
		meta,
		bodyText,
		wordCount,
		internalLinks: dedupe(internalLinks),
		externalLinks: dedupe(externalLinks),
		images,
		schemaJsonLd,
		hasFAQ,
		hasSchema,
		canonicalUrl,
		robotsMeta,
		failureReason: options.failureReason,
		// Phase O-D optional 필드
		headingStructure,
		textBlocks,
		paragraphs,
		contactLinks,
		h3,
		linkTags,
		listTableCount,
		lastModified,
		contentLanguageHeader: options.contentLanguageHeader ?? null,
		httpProtocol: options.httpProtocol ?? null,
		redirectChainLength: options.redirectChainLength ?? null,
		htmlLang,
		// TRANSIENT: raw HTML for a11y analysis only — POLICY § 4.4/§ 8.4: never persisted, never sent to AI
		rawHtml: html,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dedupe(arr: string[]): string[] {
	return [...new Set(arr)];
}
