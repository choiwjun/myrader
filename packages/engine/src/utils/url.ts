import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * X-SAG Core Engine — URL utilities
 *
 * SSRF 방지 (TRD § 10.1, § 12.5):
 *  - RFC1918 사설 IP (10/8, 172.16/12, 192.168/16)
 *  - Link-local (169.254/16)
 *  - Loopback (127/8)
 *  - IPv6 로컬 (::1, fc00::/7)
 *  - Cloud metadata endpoint (169.254.169.254, metadata.google.internal)
 *  - file://, javascript:, data:, ftp:// 차단
 */

// ---------------------------------------------------------------------------
// normalizeUrl
// ---------------------------------------------------------------------------

/**
 * 입력 URL 을 정규화한다.
 * - protocol 이 없으면 https:// 추가
 * - trailing slash 정규화 (pathname 이 "/" 만이면 유지, 하위 경로 trailing slash 제거)
 */
export function normalizeUrl(input: string): string {
	const trimmed = input.trim();

	// Protocol 보정
	const withProto = /^https?:\/\//i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	let url: URL;
	try {
		url = new URL(withProto);
	} catch {
		// 파싱 실패 시 원본 반환 (validatePublicUrl 에서 걸러짐)
		return withProto;
	}

	// trailing slash 정규화: pathname 이 "/" 이면 그대로, 그 외 마지막 "/" 제거
	if (url.pathname !== "/" && url.pathname.endsWith("/")) {
		url.pathname = url.pathname.replace(/\/+$/, "");
	}

	return url.toString();
}

// ---------------------------------------------------------------------------
// isSameDomain
// ---------------------------------------------------------------------------

/**
 * 두 URL 이 동일 hostname 인지 비교한다.
 * www 접두어는 무시한다 (www.example.com == example.com).
 */
export function isSameDomain(a: string, b: string): boolean {
	try {
		const hostA = new URL(a).hostname.replace(/^www\./, "");
		const hostB = new URL(b).hostname.replace(/^www\./, "");
		return hostA === hostB;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// isPrivateIp — SSRF 방지 핵심
// ---------------------------------------------------------------------------

/**
 * 호스트가 사설/로컬 IP 또는 내부 메타데이터 주소인 경우 true 를 반환한다.
 *
 * 체크 대상:
 *  - 127.x.x.x (loopback)
 *  - 10.x.x.x (RFC1918)
 *  - 172.16-31.x.x (RFC1918)
 *  - 192.168.x.x (RFC1918)
 *  - 169.254.x.x (Link-local / AWS metadata)
 *  - ::1 (IPv6 loopback)
 *  - fc00::/7 — fc00:: ~ fdff:: (IPv6 ULA)
 *  - "localhost" 호스트명
 *  - "metadata.google.internal"
 */
function ipv4FromMappedIpv6(ipv6Raw: string): string | null {
	const mapped = /^::ffff:(.+)$/i.exec(ipv6Raw);
	if (!mapped?.[1]) return null;

	const tail = mapped[1];
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(tail)) return tail;

	const hexParts = tail.split(":");
	if (
		hexParts.length === 2 &&
		hexParts.every((part) => /^[0-9a-f]{1,4}$/i.test(part))
	) {
		const high = Number.parseInt(hexParts[0] ?? "", 16);
		const low = Number.parseInt(hexParts[1] ?? "", 16);
		return [
			(high >> 8) & 0xff,
			high & 0xff,
			(low >> 8) & 0xff,
			low & 0xff,
		].join(".");
	}

	return null;
}

export function isPrivateIp(host: string): boolean {
	const h = host.toLowerCase().trim();

	// 호스트명 직접 차단
	if (h === "localhost" || h === "metadata.google.internal") return true;

	// IPv6 루프백
	if (h === "::1" || h === "[::1]") return true;

	// IPv6 ULA (fc00::/7 — fc or fd prefix)
	// 브래킷 제거 후 체크
	const ipv6Raw = h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;
	if (/^(fc|fd)/i.test(ipv6Raw)) return true;
	if (/^fe80:/i.test(ipv6Raw)) return true;
	const mappedIpv4 = ipv4FromMappedIpv6(ipv6Raw);
	if (mappedIpv4 && isPrivateIp(mappedIpv4)) return true;

	// IPv4 체크
	const ipv4Match = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (ipv4Match) {
		const [, aStr, bStr] = ipv4Match;
		const a = Number(aStr);
		const b = Number(bStr);
		if (a === 127) return true; // 127.x.x.x loopback
		if (a === 10) return true; // 10.x.x.x RFC1918
		if (a === 172 && b >= 16 && b <= 31) return true; // 172.16-31.x.x RFC1918
		if (a === 192 && b === 168) return true; // 192.168.x.x RFC1918
		if (a === 169 && b === 254) return true; // 169.254.x.x Link-local
		if (a === 0) return true;
		if (a === 100 && b >= 64 && b <= 127) return true;
		if (a === 198 && (b === 18 || b === 19)) return true;
		if (a >= 224) return true;
	}

	return false;
}

// ---------------------------------------------------------------------------
// validatePublicUrl — SSRF 게이트
// ---------------------------------------------------------------------------

export type UrlValidationResult = { ok: true } | { ok: false; reason: string };
export type HostnameResolution = { address: string; family?: number };
export type HostnameResolver = (hostname: string) => Promise<HostnameResolution[]>;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

let hostnameResolver: HostnameResolver = defaultHostnameResolver;

async function defaultHostnameResolver(hostname: string): Promise<HostnameResolution[]> {
	const records = await lookup(hostname, { all: true, verbatim: true });
	return records.map((record) => ({
		address: record.address,
		family: record.family,
	}));
}

export function __setHostnameResolverForTests(resolver: HostnameResolver | null): void {
	hostnameResolver = resolver ?? defaultHostnameResolver;
}


/**
 * URL 이 안전하고 공개 HTTP/HTTPS URL 인지 검증한다.
 *
 * 실패 조건 (TRD § 12.5):
 *  - HTTP/HTTPS 이외의 scheme (file://, javascript:, data:, ftp://, etc.)
 *  - 사설 IP 또는 localhost
 *  - 유효하지 않은 URL 구조
 */
export function validatePublicUrl(url: string): UrlValidationResult {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false, reason: `URL 파싱 실패: ${url}` };
	}

	// Scheme 체크
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return {
			ok: false,
			reason: `허용되지 않는 scheme: ${parsed.protocol}. http 또는 https 만 허용됩니다.`,
		};
	}

	const hostname = parsed.hostname;

	// 빈 hostname 차단
	if (!hostname) {
		return { ok: false, reason: "hostname 이 비어 있습니다." };
	}

	// 사설 IP / localhost 차단
	if (isPrivateIp(hostname)) {
		return {
			ok: false,
			reason: `사설 IP 또는 내부 호스트는 허용되지 않습니다: ${hostname}`,
		};
	}

	return { ok: true };
}

export async function validatePublicUrlForFetch(
	url: string,
	resolver: HostnameResolver = hostnameResolver,
): Promise<UrlValidationResult> {
	const syntax = validatePublicUrl(url);
	if (!syntax.ok) return syntax;

	const parsed = new URL(url);
	const hostname = parsed.hostname;

	if (isIP(hostname)) {
		return isPrivateIp(hostname)
			? {
					ok: false,
					reason: `resolved private IP is not allowed: ${hostname}`,
				}
			: { ok: true };
	}

	let addresses: HostnameResolution[];
	try {
		addresses = await resolver(hostname);
	} catch {
		return { ok: false, reason: `DNS lookup failed: ${hostname}` };
	}

	if (addresses.length === 0) {
		return { ok: false, reason: `DNS lookup returned no records: ${hostname}` };
	}

	const blocked = addresses.find((record) => isPrivateIp(record.address));
	if (blocked) {
		return {
			ok: false,
			reason: `resolved private IP is not allowed: ${hostname} -> ${blocked.address}`,
		};
	}

	return { ok: true };
}

export async function fetchPublicUrl(
	url: string,
	init: RequestInit = {},
	options?: {
		fetchImpl?: typeof fetch;
		maxRedirects?: number;
		resolver?: HostnameResolver;
	},
): Promise<Response> {
	const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
	const maxRedirects = options?.maxRedirects ?? 3;
	const resolver = options?.resolver ?? hostnameResolver;
	let currentUrl = url;
	let method = init.method;
	let body = init.body;

	for (let redirects = 0; redirects <= maxRedirects; redirects++) {
		const validation = await validatePublicUrlForFetch(currentUrl, resolver);
		if (!validation.ok) {
			throw new Error(validation.reason);
		}

		const response = await fetchImpl(currentUrl, {
			...init,
			method,
			body,
			redirect: "manual",
		});

		if (!REDIRECT_STATUSES.has(response.status)) {
			return response;
		}

		const location = response.headers.get("location");
		if (!location) return response;
		if (redirects === maxRedirects) {
			throw new Error("maximum redirect count exceeded");
		}

		currentUrl = new URL(location, currentUrl).toString();
		if (response.status === 303) {
			method = "GET";
			body = undefined;
		}
	}

	throw new Error("maximum redirect count exceeded");
}
