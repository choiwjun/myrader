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
	}

	return false;
}

// ---------------------------------------------------------------------------
// validatePublicUrl — SSRF 게이트
// ---------------------------------------------------------------------------

export type UrlValidationResult = { ok: true } | { ok: false; reason: string };

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
