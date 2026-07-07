/**
 * X-SAG Core Engine — sitemap.xml Fetcher & Parser (BACKLOG-G P3)
 *
 * 입력: baseUrl (origin 또는 절대 URL)
 * 출력: SitemapResult | null
 *
 * 동작 요약:
 *  1. `https://<origin>/sitemap.xml` 을 시도한다.
 *  2. 404 이면 `/robots.txt` 를 읽어 `Sitemap:` 디렉티브를 찾는다.
 *  3. 그래도 없으면 null 을 반환한다.
 *  4. sitemap-index 인 경우 첫 번째 child sitemap 1개만 fetch 한다 (재귀 1회).
 *     child 도 sitemap-index 이면 더 이상 따라가지 않고 그대로 반환한다 (무한 fetch 방지).
 *  5. 최대 1000 개 URL 만 수집한다.
 *
 * 제약:
 *  - 5s timeout, 5MB 응답 제한
 *  - cheerio xmlMode 로 파싱 (외부 의존 추가 없음)
 *  - 잘못된 XML / 네트워크 오류 → null (graceful)
 *  - SSRF 방지: validatePublicUrl 통과 못 하면 거부
 */

import * as cheerio from "cheerio";

import { fetchPublicUrl, validatePublicUrl } from "./utils/url.js";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export interface SitemapUrl {
	loc: string;
	lastmod?: string | undefined;
	priority?: number | undefined;
	changefreq?: string | undefined;
}

export interface SitemapResult {
	urls: SitemapUrl[];
	/** sitemap-index 인 경우 sub-sitemap URL 들 (재귀 중단 시에도 노출) */
	childSitemaps?: string[];
	source: "sitemap-index" | "sitemap";
	fetchedAt: string;
}

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const MAX_URLS = 1000;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB

const DEFAULT_UA =
	"Mozilla/5.0 (compatible; X-SAG-Bot/1.0; +https://X-SAG.com/bot)";

// ---------------------------------------------------------------------------
// fetchSitemap
// ---------------------------------------------------------------------------

/**
 * baseUrl 의 origin 에 대한 sitemap.xml 을 가져온다.
 *
 * 우선순위:
 *  1. `<origin>/sitemap.xml`
 *  2. `<origin>/robots.txt` 의 `Sitemap:` 디렉티브 (있으면 첫 번째 항목 사용)
 *  3. 둘 다 실패하면 null
 *
 * sitemap-index 의 경우 child sitemap 한 개를 추가로 fetch (재귀 1회).
 */
export async function fetchSitemap(
	baseUrl: string,
	options?: { timeoutMs?: number; userAgent?: string },
): Promise<SitemapResult | null> {
	const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const userAgent = options?.userAgent ?? DEFAULT_UA;

	let origin: string;
	try {
		const parsed = new URL(baseUrl);
		origin = `${parsed.protocol}//${parsed.host}`;
	} catch {
		return null;
	}

	// 1) <origin>/sitemap.xml 시도
	const primaryUrl = `${origin}/sitemap.xml`;
	let xml = await safeFetchText(primaryUrl, { timeoutMs, userAgent });

	// 2) 실패하면 robots.txt 의 Sitemap: 디렉티브 확인
	if (xml === null) {
		const robotsUrl = `${origin}/robots.txt`;
		const robotsTxt = await safeFetchText(robotsUrl, { timeoutMs, userAgent });
		if (robotsTxt === null) return null;

		const sitemapUrl = extractSitemapFromRobots(robotsTxt);
		if (!sitemapUrl) return null;

		// robots.txt 에 명시된 URL 도 SSRF 검증
		const validation = validatePublicUrl(sitemapUrl);
		if (!validation.ok) return null;

		xml = await safeFetchText(sitemapUrl, { timeoutMs, userAgent });
		if (xml === null) return null;
	}

	const parsed = parseSitemapXml(xml);

	// sitemap-index 인 경우 child 1회 재귀 (child 가 또 sitemap-index 면 stop)
	if (
		parsed.source === "sitemap-index" &&
		parsed.childSitemaps &&
		parsed.childSitemaps.length > 0
	) {
		const firstChild = parsed.childSitemaps[0];
		if (!firstChild) return parsed;

		const validation = validatePublicUrl(firstChild);
		if (!validation.ok) return parsed;

		const childXml = await safeFetchText(firstChild, { timeoutMs, userAgent });
		if (childXml === null) return parsed;

		const childParsed = parseSitemapXml(childXml);

		// child 도 sitemap-index → 재귀 중단, child 결과 그대로 반환 (urls 는 빈 배열)
		if (childParsed.source === "sitemap-index") {
			return childParsed;
		}

		// child 가 일반 sitemap → urls 를 1000 개로 truncate 후 반환
		return {
			urls: childParsed.urls.slice(0, MAX_URLS),
			source: "sitemap",
			fetchedAt: new Date().toISOString(),
		};
	}

	return parsed;
}

// ---------------------------------------------------------------------------
// parseSitemapXml
// ---------------------------------------------------------------------------

/**
 * sitemap.xml 또는 sitemap-index XML 문자열을 파싱한다.
 *
 * 지원 형태:
 *  - `<urlset>` (일반 sitemap)
 *  - `<sitemapindex>` (sitemap-index)
 *  - xmlns prefix 가 있는 경우/없는 경우 모두 처리
 *
 * 잘못된 XML 이거나 인식 가능한 루트 요소가 없으면 빈 결과를 반환한다.
 */
export function parseSitemapXml(xml: string): SitemapResult {
	const fetchedAt = new Date().toISOString();
	const empty: SitemapResult = {
		urls: [],
		source: "sitemap",
		fetchedAt,
	};

	if (typeof xml !== "string" || xml.trim().length === 0) {
		return empty;
	}

	// 매우 큰 입력은 5MB 까지만 허용 (graceful slice)
	const safeXml =
		xml.length > MAX_RESPONSE_BYTES ? xml.slice(0, MAX_RESPONSE_BYTES) : xml;

	let $: ReturnType<typeof cheerio.load>;
	try {
		$ = cheerio.load(safeXml, { xmlMode: true });
	} catch {
		return empty;
	}

	// sitemap-index 우선 검사 (xmlns prefix 와 무관하게 localName 매칭)
	// cheerio xmlMode 에서는 태그 이름이 그대로 노출되므로
	// ns prefix (e.g. <sm:sitemapindex>) 도 localName="sitemapindex" 로 매칭한다.
	const indexRoot = findElement($, ["sitemapindex"]);
	if (indexRoot.length > 0) {
		const childSitemaps: string[] = [];
		findDescendants($, indexRoot, ["sitemap"]).each((_, el) => {
			const loc = textOfChild($, el, ["loc"]);
			if (loc) childSitemaps.push(loc);
		});

		return {
			urls: [],
			childSitemaps: childSitemaps.slice(0, MAX_URLS),
			source: "sitemap-index",
			fetchedAt,
		};
	}

	// 일반 sitemap (urlset)
	const urlsetRoot = findElement($, ["urlset"]);
	if (urlsetRoot.length === 0) {
		// 인식 못 함 → 빈 결과
		return empty;
	}

	const urls: SitemapUrl[] = [];
	findDescendants($, urlsetRoot, ["url"]).each((_, el) => {
		if (urls.length >= MAX_URLS) return false;
		const loc = textOfChild($, el, ["loc"]);
		if (!loc) return;

		const lastmod = textOfChild($, el, ["lastmod"]);
		const priorityRaw = textOfChild($, el, ["priority"]);
		const changefreq = textOfChild($, el, ["changefreq"]);

		let priority: number | undefined;
		if (priorityRaw.length > 0) {
			const n = Number.parseFloat(priorityRaw);
			if (Number.isFinite(n)) priority = n;
		}

		urls.push({
			loc,
			lastmod: lastmod.length > 0 ? lastmod : undefined,
			priority,
			changefreq: changefreq.length > 0 ? changefreq : undefined,
		});
		return;
	});

	return {
		urls,
		source: "sitemap",
		fetchedAt,
	};
}

// ---------------------------------------------------------------------------
// 내부 유틸
// ---------------------------------------------------------------------------

/**
 * cheerio root 에서 주어진 태그명 (대소문자 무시, namespace prefix 무시) 의 요소를 찾는다.
 *
 * 예: `findElement($, ["urlset"])` 는 `<urlset>`, `<ns:urlset>` 모두 매칭.
 */
function findElement(
	$: ReturnType<typeof cheerio.load>,
	tagNames: string[],
): ReturnType<ReturnType<typeof cheerio.load>> {
	// 1차: 직접 태그명으로 찾기 (xmlns 가 default 인 경우 cheerio 가 그대로 매칭)
	for (const name of tagNames) {
		const direct = $(name);
		if (direct.length > 0) return direct;
	}

	// 2차: namespace prefix 가 있는 경우 (e.g. <ns:urlset>) — 전체를 훑어서 localName 매칭
	const matched: unknown[] = [];
	$("*").each((_, el) => {
		if (matchesLocalName(el, tagNames)) matched.push(el);
	});

	// cheerio Cheerio collection 으로 wrap
	return $(matched as Parameters<ReturnType<typeof cheerio.load>>[0]);
}

/**
 * 주어진 root 컬렉션의 자손 요소 중 localName 매칭되는 요소를 모두 찾는다.
 * (ns prefix 가 있는 경우 prefix 를 제외한 이름으로 비교)
 */
function findDescendants(
	$: ReturnType<typeof cheerio.load>,
	root: ReturnType<ReturnType<typeof cheerio.load>>,
	tagNames: string[],
): ReturnType<ReturnType<typeof cheerio.load>> {
	// 1차: 직접 태그명 매칭 시도
	for (const name of tagNames) {
		const direct = root.find(name);
		if (direct.length > 0) return direct;
	}
	// 2차: localName 매칭으로 fallback
	const matched: unknown[] = [];
	root.find("*").each((_, el) => {
		if (matchesLocalName(el, tagNames)) matched.push(el);
	});
	return $(matched as Parameters<ReturnType<typeof cheerio.load>>[0]);
}

/**
 * 단일 요소의 직접 자식 중 localName 매칭되는 요소의 텍스트를 반환한다.
 * 없으면 빈 문자열.
 */
function textOfChild(
	$: ReturnType<typeof cheerio.load>,
	parent: unknown,
	tagNames: string[],
): string {
	const $parent = $(parent as Parameters<ReturnType<typeof cheerio.load>>[0]);
	// 1차: 직접 태그명 시도
	for (const name of tagNames) {
		const found = $parent.find(name).first();
		if (found.length > 0) return found.text().trim();
	}
	// 2차: localName 매칭
	let result = "";
	$parent.find("*").each((_, el) => {
		if (result) return false;
		if (matchesLocalName(el, tagNames)) {
			result = $(el).text().trim();
			if (result) return false;
		}
		return;
	});
	return result;
}

/**
 * cheerio 노드의 tagName (또는 .name) 의 localName 이 주어진 후보들 중 하나와 매칭되는지.
 */
function matchesLocalName(el: unknown, tagNames: string[]): boolean {
	const elTag =
		(el as { tagName?: string; name?: string }).tagName ??
		(el as { name?: string }).name ??
		"";
	const localName = elTag.includes(":")
		? (elTag.split(":").pop() ?? elTag)
		: elTag;
	return tagNames.some((t) => t.toLowerCase() === localName.toLowerCase());
}

/**
 * robots.txt 본문에서 첫 번째 `Sitemap:` 디렉티브 값을 추출한다.
 * 없으면 null.
 */
function extractSitemapFromRobots(robotsTxt: string): string | null {
	const lines = robotsTxt.split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
		const m = trimmed.match(/^sitemap\s*:\s*(\S+)/i);
		if (m?.[1]) return m[1];
	}
	return null;
}

/**
 * 단일 URL 을 텍스트로 fetch 한다.
 *
 * - timeout 초과 / 네트워크 오류 / 4xx / 5xx → null
 * - 5MB 응답 제한 (초과분은 slice)
 * - SSRF 방지: validatePublicUrl 통과 못 하면 null
 */
async function safeFetchText(
	url: string,
	opts: { timeoutMs: number; userAgent: string },
): Promise<string | null> {
	const validation = validatePublicUrl(url);
	if (!validation.ok) return null;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

	try {
		const res = await fetchPublicUrl(url, {
			headers: { "User-Agent": opts.userAgent },
			signal: controller.signal,
		});

		if (res.status >= 400) return null;

		const buf = await res.arrayBuffer();
		const sliced =
			buf.byteLength > MAX_RESPONSE_BYTES
				? buf.slice(0, MAX_RESPONSE_BYTES)
				: buf;
		return new TextDecoder().decode(sliced);
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
