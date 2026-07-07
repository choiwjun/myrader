/**
 * X-SAG Core Engine — robots.txt utilities
 *
 * robots-parser 라이브러리를 사용하여 robots.txt 를 페치·파싱한다.
 * POLICY § 4.1: User-Agent `X-SAG-Bot` Disallow 룰을 따른다.
 * TRD § 10.1: 거부 경로는 분석 대상에서 제외, 사용자에게 표기.
 */

// robots-parser ships a CommonJS module; use namespace import for compatibility
import * as robotsParserModule from "robots-parser";
const robotsParser = ((robotsParserModule as unknown as { default?: unknown })
	.default ?? (robotsParserModule as unknown)) as (
	url: string,
	body: string,
) => {
	isAllowed: (url: string, ua?: string) => boolean | undefined;
};

import { fetchPublicUrl, validatePublicUrl } from "./url.js";

// ---------------------------------------------------------------------------
// RobotsRules
// ---------------------------------------------------------------------------

export interface RobotsRules {
	/** UA に対してこの URL が許可されているか */
	isAllowed(url: string): boolean;
	/** robots.txt のフェッチに失敗したか */
	fetchFailed: boolean;
	/** robots.txt が存在しない (404 など) */
	notFound: boolean;
}

// ---------------------------------------------------------------------------
// fetchRobots
// ---------------------------------------------------------------------------

const XSAG_UA = "X-SAG-Bot";

/**
 * origin の robots.txt を取得してパースする。
 *
 * - 取得失敗 (DNS error, timeout) → fetchFailed=true, 全許可として扱う (POLICY の明示ルールなし → 通過)
 * - 404 → notFound=true, 全許可
 * - 200 → robots-parser でパース
 *
 * @param origin - e.g. "https://example.com" (path なし)
 * @param userAgent - fetch 時の User-Agent ヘッダ
 * @param timeoutMs - fetch タイムアウト ms
 */
export async function fetchRobots(
	origin: string,
	userAgent: string,
	timeoutMs: number,
): Promise<RobotsRules> {
	const robotsUrl = `${origin.replace(/\/$/, "")}/robots.txt`;

	// SSRF 방지: robots.txt URL 도 검증 (TRD § 12.5)
	const validation = validatePublicUrl(robotsUrl);
	if (!validation.ok) {
		return makeFailed(true);
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let text: string;
	let status: number;

	try {
		const res = await fetchPublicUrl(robotsUrl, {
			headers: { "User-Agent": userAgent },
			signal: controller.signal,
		});
		status = res.status;

		if (status === 404) {
			return makeNotFound();
		}

		if (status >= 400) {
			// 4xx/5xx — treat as no robots.txt (all allowed)
			return makeNotFound();
		}

		// Content-length guard: cap 512KB for robots.txt
		const buf = await res.arrayBuffer();
		text = new TextDecoder().decode(buf.slice(0, 512 * 1024));
	} catch {
		// Network error or timeout
		return makeFailed(true);
	} finally {
		clearTimeout(timer);
	}

	const parser = robotsParser(robotsUrl, text);

	return {
		fetchFailed: false,
		notFound: false,
		isAllowed(url: string): boolean {
			// robots-parser の isAllowed は undefined を返すことがある (= 許可と解釈)
			const result = parser.isAllowed(url, XSAG_UA);
			return result !== false;
		},
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFailed(fetchFailed: boolean): RobotsRules {
	return {
		fetchFailed,
		notFound: false,
		isAllowed: () => true,
	};
}

function makeNotFound(): RobotsRules {
	return {
		fetchFailed: false,
		notFound: true,
		isAllowed: () => true,
	};
}
