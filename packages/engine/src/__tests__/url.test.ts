/**
 * Unit tests — utils/url.ts
 *
 * SSRF 방지 (TRD § 12.5): localhost, 127.0.0.1, 10.x.x.x, 192.168.x.x, ::1 모두 거부.
 * public.com 통과.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	__setHostnameResolverForTests,
	fetchPublicUrl,
	isPrivateIp,
	isSameDomain,
	normalizeUrl,
	validatePublicUrl,
	validatePublicUrlForFetch,
} from "../utils/url.js";

afterEach(() => {
	__setHostnameResolverForTests(null);
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// normalizeUrl
// ---------------------------------------------------------------------------

describe("normalizeUrl", () => {
	it("protocol 이 없으면 https:// 를 추가한다", () => {
		expect(normalizeUrl("example.com")).toBe("https://example.com/");
	});

	it("http:// 프로토콜은 그대로 유지한다", () => {
		expect(normalizeUrl("http://example.com")).toBe("http://example.com/");
	});

	it("trailing slash 가 있는 하위 경로에서 slash 를 제거한다", () => {
		expect(normalizeUrl("https://example.com/path/")).toBe(
			"https://example.com/path",
		);
	});

	it("루트 경로의 trailing slash 는 유지한다", () => {
		expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
	});

	it("앞뒤 공백을 제거한다", () => {
		expect(normalizeUrl("  https://example.com  ")).toBe(
			"https://example.com/",
		);
	});
});

// ---------------------------------------------------------------------------
// isSameDomain
// ---------------------------------------------------------------------------

describe("isSameDomain", () => {
	it("동일 도메인은 true 를 반환한다", () => {
		expect(
			isSameDomain("https://example.com/page", "https://example.com/other"),
		).toBe(true);
	});

	it("www 접두어는 무시한다", () => {
		expect(
			isSameDomain("https://www.example.com/a", "https://example.com/b"),
		).toBe(true);
	});

	it("다른 도메인은 false 를 반환한다", () => {
		expect(isSameDomain("https://example.com/", "https://other.com/")).toBe(
			false,
		);
	});
});

// ---------------------------------------------------------------------------
// isPrivateIp — SSRF 방지 핵심
// ---------------------------------------------------------------------------

describe("isPrivateIp", () => {
	// ---- 차단 대상 ----

	it("127.0.0.1 (loopback) 을 차단한다", () => {
		expect(isPrivateIp("127.0.0.1")).toBe(true);
	});

	it("127.x.x.x 전체를 차단한다", () => {
		expect(isPrivateIp("127.255.255.255")).toBe(true);
	});

	it("10.0.0.0 (RFC1918) 을 차단한다", () => {
		expect(isPrivateIp("10.0.0.0")).toBe(true);
	});

	it("10.100.200.50 (RFC1918) 을 차단한다", () => {
		expect(isPrivateIp("10.100.200.50")).toBe(true);
	});

	it("192.168.1.1 (RFC1918) 을 차단한다", () => {
		expect(isPrivateIp("192.168.1.1")).toBe(true);
	});

	it("192.168.0.0 (RFC1918) 을 차단한다", () => {
		expect(isPrivateIp("192.168.0.0")).toBe(true);
	});

	it("172.16.0.1 (RFC1918) 을 차단한다", () => {
		expect(isPrivateIp("172.16.0.1")).toBe(true);
	});

	it("172.31.255.255 (RFC1918 상한) 을 차단한다", () => {
		expect(isPrivateIp("172.31.255.255")).toBe(true);
	});

	it("169.254.169.254 (AWS metadata) 를 차단한다", () => {
		expect(isPrivateIp("169.254.169.254")).toBe(true);
	});

	it("::1 (IPv6 loopback) 을 차단한다", () => {
		expect(isPrivateIp("::1")).toBe(true);
	});

	it("[::1] (브래킷 포함 IPv6 loopback) 을 차단한다", () => {
		expect(isPrivateIp("[::1]")).toBe(true);
	});

	it("localhost 를 차단한다", () => {
		expect(isPrivateIp("localhost")).toBe(true);
	});

	it("metadata.google.internal 을 차단한다", () => {
		expect(isPrivateIp("metadata.google.internal")).toBe(true);
	});

	it("fc00:: (IPv6 ULA) 를 차단한다", () => {
		expect(isPrivateIp("fc00::1")).toBe(true);
	});

	it("fd00:: (IPv6 ULA) 를 차단한다", () => {
		expect(isPrivateIp("fd12:3456:789a::1")).toBe(true);
	});

	it("fe80:: (IPv6 link-local) 를 차단한다", () => {
		expect(isPrivateIp("fe80::1")).toBe(true);
	});

	it("IPv4-mapped IPv6 private 주소를 차단한다", () => {
		expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
		expect(isPrivateIp("::ffff:7f00:1")).toBe(true);
	});

	it("0.0.0.0/8, CGNAT, benchmarking, multicast 대역을 차단한다", () => {
		expect(isPrivateIp("0.0.0.0")).toBe(true);
		expect(isPrivateIp("100.64.0.1")).toBe(true);
		expect(isPrivateIp("198.18.0.1")).toBe(true);
		expect(isPrivateIp("224.0.0.1")).toBe(true);
	});

	// ---- 허용 대상 ----

	it("1.1.1.1 (Cloudflare public DNS) 을 허용한다", () => {
		expect(isPrivateIp("1.1.1.1")).toBe(false);
	});

	it("8.8.8.8 (Google public DNS) 을 허용한다", () => {
		expect(isPrivateIp("8.8.8.8")).toBe(false);
	});

	it("IPv4-mapped IPv6 public 주소를 허용한다", () => {
		expect(isPrivateIp("::ffff:0808:0808")).toBe(false);
	});

	it("172.15.0.1 (RFC1918 범위 밖) 을 허용한다", () => {
		expect(isPrivateIp("172.15.0.1")).toBe(false);
	});

	it("172.32.0.1 (RFC1918 범위 밖) 을 허용한다", () => {
		expect(isPrivateIp("172.32.0.1")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// validatePublicUrl — SSRF 게이트
// ---------------------------------------------------------------------------

describe("validatePublicUrl", () => {
	// ---- 통과 ----

	it("https://public.com → ok: true", () => {
		expect(validatePublicUrl("https://public.com")).toEqual({ ok: true });
	});

	it("http://example.co.kr → ok: true", () => {
		expect(validatePublicUrl("http://example.co.kr")).toEqual({ ok: true });
	});

	it("https://my-shop.kr/services → ok: true", () => {
		expect(validatePublicUrl("https://my-shop.kr/services")).toEqual({
			ok: true,
		});
	});

	// ---- 차단 — 사설 IP ----

	it("http://localhost → 거부", () => {
		const result = validatePublicUrl("http://localhost");
		expect(result.ok).toBe(false);
	});

	it("http://127.0.0.1 → 거부", () => {
		const result = validatePublicUrl("http://127.0.0.1");
		expect(result.ok).toBe(false);
	});

	it("http://10.0.0.1 → 거부", () => {
		const result = validatePublicUrl("http://10.0.0.1");
		expect(result.ok).toBe(false);
	});

	it("http://192.168.1.1 → 거부", () => {
		const result = validatePublicUrl("http://192.168.1.1");
		expect(result.ok).toBe(false);
	});

	it("http://[::1] → 거부", () => {
		const result = validatePublicUrl("http://[::1]");
		expect(result.ok).toBe(false);
	});

	it("http://[::ffff:127.0.0.1] → 거부", () => {
		const result = validatePublicUrl("http://[::ffff:127.0.0.1]");
		expect(result.ok).toBe(false);
	});

	// ---- 차단 — 허용되지 않는 scheme ----

	it("file:///etc/passwd → 거부", () => {
		const result = validatePublicUrl("file:///etc/passwd");
		expect(result.ok).toBe(false);
	});

	it("javascript:alert(1) → 거부", () => {
		const result = validatePublicUrl("javascript:alert(1)");
		expect(result.ok).toBe(false);
	});

	it("ftp://example.com → 거부", () => {
		const result = validatePublicUrl("ftp://example.com");
		expect(result.ok).toBe(false);
	});

	it("data:text/html,<h1>hi</h1> → 거부", () => {
		const result = validatePublicUrl("data:text/html,<h1>hi</h1>");
		expect(result.ok).toBe(false);
	});

	// ---- 차단 — 잘못된 URL ----

	it("빈 문자열 → 거부", () => {
		const result = validatePublicUrl("");
		expect(result.ok).toBe(false);
	});

	it("not-a-url → 거부", () => {
		const result = validatePublicUrl("not-a-url");
		expect(result.ok).toBe(false);
	});
});

describe("validatePublicUrlForFetch", () => {
	it("blocks public-looking hostnames that resolve to private IPs", async () => {
		const result = await validatePublicUrlForFetch(
			"https://rebind.example.com/",
			async () => [{ address: "127.0.0.1", family: 4 }],
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toContain("127.0.0.1");
		}
	});

	it("allows hostnames only when all resolved addresses are public", async () => {
		await expect(
			validatePublicUrlForFetch("https://public.example.com/", async () => [
				{ address: "93.184.216.34", family: 4 },
			]),
		).resolves.toEqual({ ok: true });
	});
});

describe("fetchPublicUrl", () => {
	it("revalidates redirects before following them", async () => {
		const fetchImpl = vi.fn(async (url: string | URL | Request) => {
			const current = String(url);
			if (current === "https://public.example.com/start") {
				return new Response("", {
					status: 302,
					headers: { location: "http://127.0.0.1/admin" },
				});
			}
			return new Response("private data", { status: 200 });
		}) as typeof fetch;

		await expect(
			fetchPublicUrl(
				"https://public.example.com/start",
				{},
				{
					fetchImpl,
					resolver: async () => [{ address: "93.184.216.34", family: 4 }],
				},
			),
		).rejects.toThrow(/127\.0\.0\.1/);

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(fetchImpl).not.toHaveBeenCalledWith(
			"http://127.0.0.1/admin",
			expect.anything(),
		);
	});
});
