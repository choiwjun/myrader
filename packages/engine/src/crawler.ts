/**
 * X-SAG Core Engine — URL Crawler (MOD-CRAWLER, TRD § 10.1)
 *
 * 입력: startUrl + CrawlOptions
 * 출력: CrawlResult (pages: ParsedPage[])
 *
 * POLICY § 4.2 제약:
 *  - User-Agent: Mozilla/5.0 (compatible; X-SAG-Bot/1.0; +https://X-SAG.com/bot)
 *  - perDomainConcurrency: 1
 *  - requestIntervalMs: 1000
 *  - maxResponseBytes: 5MB
 *  - responseTimeoutMs: 15000
 *  - maxPagesPerSite: 50 (BACKLOG-G P3, 2026-05-22 — POLICY § 4.2 후속 업데이트 필요)
 *  - totalTimeoutMs: 60000
 *
 * SSRF 방지 (TRD § 10.1, § 12.5):
 *  - validatePublicUrl 통과하지 않으면 크롤 거부
 *  - 리다이렉트 최대 3회
 */

import type { CrawlFailureReason } from "@boina/contracts/enums";
import { parseHtml } from "./parser.js";
import { fetchSitemap } from "./sitemap.js";
import type { SitemapUrl } from "./sitemap.js";
import { DEFAULT_CRAWL_OPTIONS } from "./types.js";
import type { CrawlOptions, CrawlResult, ParsedPage } from "./types.js";
import { fetchRobots } from "./utils/robots.js";
import { isSameDomain, normalizeUrl, validatePublicUrl } from "./utils/url.js";
import { createJsRenderAdapter } from "./v2/js-render/adapter.js";
import type { JsRenderAdapter } from "./v2/js-render/types.js";

/**
 * JsRenderAdapter 팩토리 (테스트 주입 가능).
 * BACKLOG-G P3 (TASK-CORE-016, 2026-05-22): 기본은 `createJsRenderAdapter()` 가
 * playwright 가용 여부를 감지해 Playwright 또는 Mock 을 반환한다.
 */
type JsRenderAdapterFactory = () => JsRenderAdapter;
let jsRenderAdapterFactory: JsRenderAdapterFactory = createJsRenderAdapter;

/**
 * 테스트 전용 — JS 렌더링 어댑터 팩토리를 교체한다.
 * 운영 코드에서는 호출하지 않는다.
 */
export function __setJsRenderAdapterFactory(
	factory: JsRenderAdapterFactory | null,
): void {
	jsRenderAdapterFactory = factory ?? createJsRenderAdapter;
}

/**
 * BACKLOG-G P3 — sitemap fetch 함수 (테스트 주입 가능).
 * 기본은 `./sitemap.ts` 의 `fetchSitemap`.
 */
type SitemapFetcher = typeof fetchSitemap;
let sitemapFetcher: SitemapFetcher = fetchSitemap;

/**
 * 테스트 전용 — sitemap fetcher 를 교체한다.
 * null 을 넘기면 기본값으로 복원한다.
 */
export function __setSitemapFetcher(fn: SitemapFetcher | null): void {
	sitemapFetcher = fn ?? fetchSitemap;
}

// ---------------------------------------------------------------------------
// Priority URL patterns (TRD § 10.1: /about, /services, /faq, /contact 우선)
// ---------------------------------------------------------------------------
const PRIORITY_PATH_PATTERNS = [
	/\/faq/i,
	/\/about/i,
	/\/services?/i,
	/\/contact/i,
	/\/products?/i,
];

function urlPriority(url: string): number {
	try {
		const path = new URL(url).pathname;
		for (let i = 0; i < PRIORITY_PATH_PATTERNS.length; i++) {
			const pattern = PRIORITY_PATH_PATTERNS[i];
			if (pattern?.test(path)) return i;
		}
	} catch {
		// ignore
	}
	return PRIORITY_PATH_PATTERNS.length;
}

type JsRenderContext =
	| { type: "disabled" }
	| { type: "available"; adapter: JsRenderAdapter }
	| { type: "unavailable"; reason: string | undefined };

function createJsRenderContext(options: CrawlOptions): JsRenderContext {
	if (!options.enableJsRendering) return { type: "disabled" };

	try {
		const adapter = jsRenderAdapterFactory();
		if (adapter.isAvailable()) {
			return { type: "available", adapter };
		}
		return { type: "unavailable", reason: undefined };
	} catch (err) {
		return {
			type: "unavailable",
			reason: err instanceof Error ? err.message : String(err),
		};
	}
}

async function parseFetchedPage(
	fetchResult: FetchSuccess,
	options: CrawlOptions,
	jsRenderContext: JsRenderContext,
): Promise<ParsedPage> {
	const staticPage = parseHtml(
		fetchResult.html,
		fetchResult.url,
		fetchResult.statusCode,
		{
			contentLanguageHeader: fetchResult.contentLanguageHeader,
			httpProtocol: fetchResult.httpProtocol,
			redirectChainLength: fetchResult.redirectChainLength,
		},
	);

	if (jsRenderContext.type === "disabled") return staticPage;

	if (jsRenderContext.type === "unavailable") {
		console.warn(
			"[crawler] enableJsRendering=true but the JS render adapter is unavailable. Falling back to static HTML.",
			jsRenderContext.reason ?? "",
		);
		return {
			...staticPage,
			failureReason: "JS_RENDER_FAILED" as CrawlFailureReason,
		};
	}

	try {
		const rendered = await jsRenderContext.adapter.fetchRendered(
			fetchResult.url,
			{
				userAgent: options.userAgent,
				blockResources: ["image", "font", "stylesheet", "media"],
				timeoutMs: 30_000,
			},
		);
		return parseHtml(rendered.html, rendered.finalUrl, rendered.statusCode, {
			contentLanguageHeader: fetchResult.contentLanguageHeader,
			httpProtocol: fetchResult.httpProtocol,
			redirectChainLength: fetchResult.redirectChainLength,
		});
	} catch (err) {
		console.warn(
			"[crawler] JS rendering failed. Falling back to static HTML.",
			err instanceof Error ? err.message : String(err),
		);
		return {
			...staticPage,
			failureReason: "JS_RENDER_FAILED" as CrawlFailureReason,
		};
	}
}

// ---------------------------------------------------------------------------
// crawlSite
// ---------------------------------------------------------------------------

/**
 * 지정한 URL 을 시작점으로 사이트를 크롤하고 ParsedPage[] 를 반환한다.
 *
 * 에러는 throw 하지 않고 CrawlResult.failureReason 으로 반환한다.
 */
export async function crawlSite(
	startUrl: string,
	opts?: Partial<CrawlOptions>,
): Promise<CrawlResult> {
	const options: CrawlOptions = { ...DEFAULT_CRAWL_OPTIONS, ...opts };
	const startedAt = new Date().toISOString();

	// ---------------------------------------------------------------------------
	// 1. URL 정규화 + SSRF 검증
	// ---------------------------------------------------------------------------
	const normalizedStart = normalizeUrl(startUrl);
	const ssrf = validatePublicUrl(normalizedStart);
	if (!ssrf.ok) {
		return makeFailResult(startedAt, "DNS_FAILED", ssrf.reason);
	}

	let origin: string;
	try {
		const parsed = new URL(normalizedStart);
		origin = `${parsed.protocol}//${parsed.host}`;
	} catch {
		return makeFailResult(startedAt, "DNS_FAILED", "URL 파싱 실패");
	}

	// ---------------------------------------------------------------------------
	// 2. robots.txt 조회
	// ---------------------------------------------------------------------------
	const robots = await fetchRobots(
		origin,
		options.userAgent,
		options.responseTimeoutMs,
	);

	// robots.txt 가 메인 URL 을 차단하는 경우 → ROBOTS_BLOCK_ALL
	if (
		!robots.fetchFailed &&
		!robots.notFound &&
		!robots.isAllowed(normalizedStart)
	) {
		return makeFailResult(startedAt, "ROBOTS_BLOCK_ALL");
	}

	// ---------------------------------------------------------------------------
	// 총 타임아웃 AbortController
	// ---------------------------------------------------------------------------
	const totalController = new AbortController();
	const totalTimer = setTimeout(
		() => totalController.abort(),
		options.totalTimeoutMs,
	);

	const pages: ParsedPage[] = [];
	let partialResult = false;
	let globalFailureReason: CrawlFailureReason | undefined;
	let sitemapUsed = false;
	let sitemapUrls: SitemapUrl[] = [];

	try {
		// ---------------------------------------------------------------------------
		// 2.5. sitemap.xml 조회 (BACKLOG-G P3)
		//
		//   useSitemap=true (기본) 인 경우 sitemap.xml 을 시도해 URL 목록을
		//   가져온다. 실패 시 sitemapUsed=false 로 두고 기존 BFS 동작으로 폴백한다.
		//   sitemap fetch 자체는 totalTimeoutMs 와 별개의 5s 내부 timeout 으로 제한된다.
		// ---------------------------------------------------------------------------
		const useSitemap = options.useSitemap ?? true;
		if (useSitemap && !totalController.signal.aborted) {
			try {
				const sm = await sitemapFetcher(normalizedStart, {
					userAgent: options.userAgent,
				});
				if (sm && sm.urls.length > 0) {
					sitemapUsed = true;
					sitemapUrls = sm.urls;
				}
			} catch {
				// sitemap fetch 예외 → 조용히 BFS 폴백
				sitemapUsed = false;
				sitemapUrls = [];
			}
		}

		// ---------------------------------------------------------------------------
		// 3. 메인 페이지 fetch
		// ---------------------------------------------------------------------------
		const mainResult = await fetchPage(
			normalizedStart,
			options,
			totalController.signal,
		);

		if (mainResult.type === "error") {
			globalFailureReason = mainResult.reason;
			return {
				pages: [],
				partialResult: false,
				failureReason: globalFailureReason,
				startedAt,
				completedAt: new Date().toISOString(),
				sitemapUsed,
			};
		}

		// ---------------------------------------------------------------------------
		// 4. 메인 페이지 파싱 (+ JS 렌더링)
		//
		// BACKLOG-G P3 (TASK-CORE-016, 2026-05-22):
		//   enableJsRendering=true 인 경우 정적 HTML 을 1차 파싱한 뒤 Playwright
		//   어댑터로 재렌더링한 HTML 을 사용해 mainPage 를 덮어쓴다.
		//
		//   Playwright 가 설치되어 있지 않거나(어댑터의 isAvailable() === false)
		//   render 호출이 실패하면, 정적 파싱 결과를 그대로 사용하되
		//   failureReason="JS_RENDER_FAILED" 를 mainPage 에 세팅한다 (POLICY § 24
		//   폴백 — 정적 분석으로 진단 계속).
		// ---------------------------------------------------------------------------
		const jsRenderContext = createJsRenderContext(options);
		const mainPage = await parseFetchedPage(
			mainResult,
			options,
			jsRenderContext,
		);

		pages.push(mainPage);

		// ---------------------------------------------------------------------------
		// 5. 후보 URL 선정 (BACKLOG-G P3)
		//
		//   sitemap 발견 시 — sitemap URL 을 priority 내림차순으로 사용.
		//   sitemap 미발견 / useSitemap=false — 기존 BFS (mainPage.internalLinks) 사용.
		//
		//   공통 필터: SSRF / same-domain / robots.txt disallow 차단.
		//   robots.txt disallow 와 sitemap URL 충돌 시 disallow 우선 (POLICY § 4.1).
		// ---------------------------------------------------------------------------
		if (pages.length < options.maxPagesPerSite) {
			let candidateUrls: string[];

			if (sitemapUsed && sitemapUrls.length > 0) {
				// sitemap URL: priority 내림차순 (priority 없으면 0 으로 간주)
				candidateUrls = [...sitemapUrls]
					.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
					.map((u) => u.loc)
					.filter((u) => {
						const v = validatePublicUrl(u);
						if (!v.ok) return false;
						if (!isSameDomain(u, normalizedStart)) return false;
						if (!robots.isAllowed(u)) return false;
						return true;
					});
			} else {
				candidateUrls = mainPage.internalLinks
					.filter((u) => {
						const v = validatePublicUrl(u);
						if (!v.ok) return false;
						if (!isSameDomain(u, normalizedStart)) return false;
						if (!robots.isAllowed(u)) return false;
						return true;
					})
					.sort((a, b) => urlPriority(a) - urlPriority(b));
			}

			// ---------------------------------------------------------------------------
			// 6. 순차 페이지 크롤 (perDomainConcurrency=1, requestIntervalMs 간격)
			// ---------------------------------------------------------------------------
			const visited = new Set<string>([normalizedStart]);

			for (const url of candidateUrls) {
				if (pages.length >= options.maxPagesPerSite) break;
				if (visited.has(url)) continue;
				visited.add(url);

				// totalTimeoutMs 초과 체크
				if (totalController.signal.aborted) {
					partialResult = true;
					globalFailureReason = "TIMEOUT";
					break;
				}

				// 요청 간 간격 (POLICY § 4.2)
				await sleep(options.requestIntervalMs);

				if (totalController.signal.aborted) {
					partialResult = true;
					globalFailureReason = "TIMEOUT";
					break;
				}

				const result = await fetchPage(url, options, totalController.signal);

				if (result.type === "error") {
					// 개별 페이지 실패 → partialResult = true, 계속 진행
					const failedPage = parseHtml(
						"",
						result.url ?? url,
						result.statusCode ?? 0,
						{
							failureReason: result.reason,
							contentLanguageHeader: result.contentLanguageHeader,
							httpProtocol: result.httpProtocol,
							redirectChainLength: result.redirectChainLength,
						},
					);
					pages.push(failedPage);
					partialResult = true;
					continue;
				}

				const page = await parseFetchedPage(result, options, jsRenderContext);
				pages.push(page);
			}
		}
	} catch (err) {
		if (totalController.signal.aborted) {
			partialResult = pages.length > 0;
			globalFailureReason = "TIMEOUT";
		} else {
			// 예상치 못한 에러 — DNS_FAILED 로 처리
			globalFailureReason = "DNS_FAILED";
		}
	} finally {
		clearTimeout(totalTimer);
	}

	return {
		pages,
		partialResult,
		failureReason: globalFailureReason,
		startedAt,
		completedAt: new Date().toISOString(),
		sitemapUsed,
	};
}

// ---------------------------------------------------------------------------
// fetchPage — 단일 페이지 fetch
// ---------------------------------------------------------------------------

type FetchSuccess = {
	type: "success";
	html: string;
	url: string;
	statusCode: number;
	contentLanguageHeader: string | null;
	httpProtocol: ParsedPage["httpProtocol"];
	redirectChainLength: number;
};

type FetchError = {
	type: "error";
	reason: CrawlFailureReason;
	message?: string;
	url?: string;
	statusCode?: number;
	contentLanguageHeader?: string | null;
	httpProtocol?: ParsedPage["httpProtocol"];
	redirectChainLength?: number;
};

async function fetchPage(
	url: string,
	options: CrawlOptions,
	parentSignal: AbortSignal,
): Promise<FetchSuccess | FetchError> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), options.responseTimeoutMs);

	// 부모 abort 에 연동
	const onParentAbort = () => controller.abort();
	parentSignal.addEventListener("abort", onParentAbort, { once: true });

	try {
		let res: Response;
		try {
			res = await fetch(url, {
				headers: { "User-Agent": options.userAgent },
				signal: controller.signal,
				redirect: "manual",
			});
		} catch (err: unknown) {
			return classifyFetchError(err);
		} finally {
			clearTimeout(timer);
			parentSignal.removeEventListener("abort", onParentAbort);
		}

		// redirect 처리 (최대 3회: TRD § 10.1)
		let finalRes = res;
		let redirectCount = 0;
		let finalUrl = url;

		while (
			[301, 302, 303, 307, 308].includes(finalRes.status) &&
			redirectCount < 3
		) {
			const location = finalRes.headers.get("location");
			if (!location) break;

			let nextUrl: string;
			try {
				nextUrl = new URL(location, finalUrl).toString();
			} catch {
				break;
			}

			const ssrf = validatePublicUrl(nextUrl);
			if (!ssrf.ok) {
				return {
					type: "error",
					reason: "CONNECTION_REFUSED",
					message: ssrf.reason,
				};
			}

			const redirectController = new AbortController();
			const redirectTimer = setTimeout(
				() => redirectController.abort(),
				options.responseTimeoutMs,
			);
			parentSignal.addEventListener("abort", () => redirectController.abort(), {
				once: true,
			});

			try {
				finalRes = await fetch(nextUrl, {
					headers: { "User-Agent": options.userAgent },
					signal: redirectController.signal,
					redirect: "manual",
				});
				finalUrl = nextUrl;
				redirectCount++;
			} catch (err: unknown) {
				return classifyFetchError(err);
			} finally {
				clearTimeout(redirectTimer);
			}
		}

		// HTTP 상태 코드 처리
		const statusCode = finalRes.status;
		const contentLanguageHeader = finalRes.headers.get("content-language");

		if (statusCode >= 500) {
			return {
				type: "error",
				reason: "HTTP_5xx",
				url: finalUrl,
				statusCode,
				contentLanguageHeader,
				httpProtocol: null,
				redirectChainLength: redirectCount,
			};
		}
		if (statusCode >= 400) {
			return {
				type: "error",
				reason: "HTTP_4xx",
				url: finalUrl,
				statusCode,
				contentLanguageHeader,
				httpProtocol: null,
				redirectChainLength: redirectCount,
			};
		}

		// 응답 크기 제한 (POLICY § 4.2: 5MB)
		// Fetch Response exposes bytes only after read in this runtime path; the slice
		// below remains the enforcement point before handing HTML to the parser.

		const buffer = await finalRes.arrayBuffer();
		const sliced =
			buffer.byteLength > options.maxResponseBytes
				? buffer.slice(0, options.maxResponseBytes)
				: buffer;
		const html = decodeHtmlBytes(sliced, finalRes.headers.get("content-type"));

		return {
			type: "success",
			html,
			url: finalUrl,
			statusCode,
			contentLanguageHeader,
			httpProtocol: null,
			redirectChainLength: redirectCount,
		};
	} catch (err: unknown) {
		clearTimeout(timer);
		parentSignal.removeEventListener("abort", onParentAbort);
		return classifyFetchError(err);
	}
}

// ---------------------------------------------------------------------------
// classifyFetchError
// ---------------------------------------------------------------------------

function classifyFetchError(err: unknown): FetchError {
	if (err instanceof Error) {
		const msg = err.message.toLowerCase();
		if (
			err.name === "AbortError" ||
			msg.includes("abort") ||
			msg.includes("timeout")
		) {
			return { type: "error", reason: "TIMEOUT" };
		}
		if (
			msg.includes("econnrefused") ||
			msg.includes("connection refused") ||
			msg.includes("network error") ||
			msg.includes("failed to fetch")
		) {
			return { type: "error", reason: "CONNECTION_REFUSED" };
		}
		if (
			msg.includes("enotfound") ||
			msg.includes("getaddrinfo") ||
			msg.includes("dns") ||
			msg.includes("name or service not known")
		) {
			return { type: "error", reason: "DNS_FAILED" };
		}
	}
	return { type: "error", reason: "CONNECTION_REFUSED" };
}

function decodeHtmlBytes(bytes: ArrayBuffer, contentType: string | null): string {
	const declaredCharset =
		extractCharset(contentType) ?? extractEarlyMetaCharset(bytes);
	return decodeWithFallback(bytes, declaredCharset);
}

function extractCharset(value: string | null | undefined): string | null {
	if (!value) return null;
	const match = value.match(/charset\s*=\s*["']?\s*([^;"'\s]+)/i);
	return match?.[1]?.trim() || null;
}

function extractEarlyMetaCharset(bytes: ArrayBuffer): string | null {
	const prefix = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4096));
	let ascii = "";
	for (const byte of prefix) {
		ascii += byte <= 0x7f ? String.fromCharCode(byte) : " ";
	}

	const metaTags = ascii.match(/<meta\b[^>]*>/gi) ?? [];
	for (const tag of metaTags) {
		const directCharset = tag.match(/\bcharset\s*=\s*["']?\s*([^"'\s/>]+)/i);
		if (directCharset?.[1]) return directCharset[1].trim();

		if (/http-equiv\s*=\s*["']?content-type["']?/i.test(tag)) {
			const contentTypeCharset = extractCharset(tag);
			if (contentTypeCharset) return contentTypeCharset;
		}
	}

	return null;
}

function decodeWithFallback(bytes: ArrayBuffer, charset: string | null): string {
	if (charset) {
		try {
			return new TextDecoder(charset).decode(bytes);
		} catch {
			// Unsupported charset label: safely fall back to UTF-8 below.
		}
	}

	return new TextDecoder("utf-8").decode(bytes);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeFailResult(
	startedAt: string,
	reason: CrawlFailureReason,
	_message?: string,
): CrawlResult {
	return {
		pages: [],
		partialResult: false,
		failureReason: reason,
		startedAt,
		completedAt: new Date().toISOString(),
		sitemapUsed: false,
	};
}
