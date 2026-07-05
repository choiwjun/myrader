/**
 * BACKLOG-G P5 — adversarial / robots.txt 엣지 케이스 회귀 테스트.
 *
 * 검증 포인트:
 *  - robots-parser 라이브러리가 다양한 robots.txt 페이로드에 throw 하지 않음
 *  - fetchRobots() 의 fetch 실패 / 404 / 5xx 동작
 *  - SSRF 차단 — localhost, 사설 IP 의 robots.txt 는 fetchFailed
 *  - 빈 robots, "Disallow: /" only, 충돌 규칙 등 edge case
 *
 * NOTE: fetchRobots() 자체는 network fetch 를 호출하므로,
 *       network 의존 케이스는 vi.fn() 으로 mock 한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRobots } from "../../utils/robots.js";
import { expectNoCrash } from "./helpers.js";

// robots-parser 직접 사용 — adversarial 페이로드를 parser 에 직접 던져본다
import * as robotsParserModule from "robots-parser";
const robotsParser = ((robotsParserModule as unknown as { default?: unknown })
	.default ?? (robotsParserModule as unknown)) as (
	url: string,
	body: string,
) => {
	isAllowed: (url: string, ua?: string) => boolean | undefined;
};

describe("robots-edge — robots-parser 다양한 페이로드", () => {
	it("완전히 빈 robots.txt — 모든 URL 허용", () => {
		const parser = robotsParser("https://example.com/robots.txt", "");
		expect(parser.isAllowed("https://example.com/page", "X-SAG-Bot")).not.toBe(
			false,
		);
	});

	it("공백/개행만 있는 robots.txt", () => {
		const parser = robotsParser(
			"https://example.com/robots.txt",
			"\n\n\t  \r\n",
		);
		expect(parser.isAllowed("https://example.com/page", "X-SAG-Bot")).not.toBe(
			false,
		);
	});

	it("모든 User-agent 차단 (Disallow: /)", () => {
		const body = "User-agent: *\nDisallow: /";
		const parser = robotsParser("https://example.com/robots.txt", body);
		expect(parser.isAllowed("https://example.com/page", "X-SAG-Bot")).toBe(
			false,
		);
	});

	it("Allow: / 가 명시되면 허용", () => {
		const body = "User-agent: *\nAllow: /\nDisallow:";
		const parser = robotsParser("https://example.com/robots.txt", body);
		expect(parser.isAllowed("https://example.com/page", "X-SAG-Bot")).not.toBe(
			false,
		);
	});

	it("X-SAG-Bot 명시적 차단", () => {
		const body =
			"User-agent: X-SAG-Bot\nDisallow: /\n\nUser-agent: *\nAllow: /";
		const parser = robotsParser("https://example.com/robots.txt", body);
		expect(parser.isAllowed("https://example.com/page", "X-SAG-Bot")).toBe(
			false,
		);
	});

	it("다른 봇 차단, X-SAG-Bot 은 fallback (*) 으로 허용", () => {
		const body = "User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nAllow: /";
		const parser = robotsParser("https://example.com/robots.txt", body);
		expect(parser.isAllowed("https://example.com/page", "X-SAG-Bot")).not.toBe(
			false,
		);
	});

	it("특정 path 만 차단", () => {
		const body = "User-agent: *\nDisallow: /admin\nDisallow: /private/";
		const parser = robotsParser("https://example.com/robots.txt", body);
		expect(parser.isAllowed("https://example.com/page", "X-SAG-Bot")).not.toBe(
			false,
		);
		expect(parser.isAllowed("https://example.com/admin/x", "X-SAG-Bot")).toBe(
			false,
		);
		expect(parser.isAllowed("https://example.com/private/x", "X-SAG-Bot")).toBe(
			false,
		);
	});

	it("Allow + Disallow 충돌 규칙 (더 긴 매치가 우선)", () => {
		const body = "User-agent: *\nAllow: /public\nDisallow: /";
		const parser = robotsParser("https://example.com/robots.txt", body);
		// /public 은 allow, 그 외는 disallow
		expect(
			parser.isAllowed("https://example.com/public", "X-SAG-Bot"),
		).not.toBe(false);
		expect(parser.isAllowed("https://example.com/other", "X-SAG-Bot")).toBe(
			false,
		);
	});

	it("주석 (#) 만 있는 robots.txt", () => {
		const body = "# comment only\n# another comment";
		const parser = robotsParser("https://example.com/robots.txt", body);
		expect(parser.isAllowed("https://example.com/page", "X-SAG-Bot")).not.toBe(
			false,
		);
	});

	it("malformed robots.txt (잘못된 키워드) 에도 throw 안 함", async () => {
		await expectNoCrash(() => {
			const body =
				"RandomKey: value\nAnotherKey: x\nUser-agent: *\nNotADirective: y\nDisallow: /";
			const parser = robotsParser("https://example.com/robots.txt", body);
			parser.isAllowed("https://example.com/page", "X-SAG-Bot");
		});
	});

	it("매우 긴 robots.txt (10,000 줄) 도 처리", () => {
		let body = "User-agent: *\n";
		for (let i = 0; i < 10_000; i++) {
			body += `Disallow: /path-${i}/\n`;
		}
		const parser = robotsParser("https://example.com/robots.txt", body);
		expect(parser.isAllowed("https://example.com/page", "X-SAG-Bot")).not.toBe(
			false,
		);
		expect(
			parser.isAllowed("https://example.com/path-5000/x", "X-SAG-Bot"),
		).toBe(false);
	});

	it("Sitemap 지시어가 있어도 isAllowed 에는 영향 없음", () => {
		const body =
			"User-agent: *\nDisallow:\n\nSitemap: https://example.com/sitemap.xml";
		const parser = robotsParser("https://example.com/robots.txt", body);
		expect(parser.isAllowed("https://example.com/page", "X-SAG-Bot")).not.toBe(
			false,
		);
	});

	it("Crawl-delay 지시어가 있어도 isAllowed 에는 영향 없음", () => {
		const body = "User-agent: *\nCrawl-delay: 10\nDisallow:";
		const parser = robotsParser("https://example.com/robots.txt", body);
		expect(parser.isAllowed("https://example.com/page", "X-SAG-Bot")).not.toBe(
			false,
		);
	});

	it("Disallow: 패턴에 wildcard (*) 사용", () => {
		const body = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /private/*";
		const parser = robotsParser("https://example.com/robots.txt", body);
		expect(parser.isAllowed("https://example.com/file.pdf", "X-SAG-Bot")).toBe(
			false,
		);
		expect(parser.isAllowed("https://example.com/private/x", "X-SAG-Bot")).toBe(
			false,
		);
		expect(
			parser.isAllowed("https://example.com/normal", "X-SAG-Bot"),
		).not.toBe(false);
	});

	it("URL 이 query string 을 가져도 isAllowed 정확히 동작", () => {
		const body = "User-agent: *\nDisallow: /admin";
		const parser = robotsParser("https://example.com/robots.txt", body);
		expect(
			parser.isAllowed("https://example.com/admin?id=1", "X-SAG-Bot"),
		).toBe(false);
		expect(
			parser.isAllowed("https://example.com/page?q=admin", "X-SAG-Bot"),
		).not.toBe(false);
	});

	it("UTF-8 BOM 으로 시작하는 robots.txt 도 처리", async () => {
		await expectNoCrash(() => {
			const body = "﻿User-agent: *\nDisallow:";
			const parser = robotsParser("https://example.com/robots.txt", body);
			parser.isAllowed("https://example.com/page", "X-SAG-Bot");
		});
	});
});

describe("robots-edge — fetchRobots() 동작 (mock fetch)", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("404 응답 → notFound=true, 모든 URL 허용", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 404,
			arrayBuffer: async () => new ArrayBuffer(0),
		} as unknown as Response);

		const rules = await fetchRobots(
			"https://public-test.example.com",
			"ua",
			5000,
		);
		expect(rules.notFound).toBe(true);
		expect(rules.fetchFailed).toBe(false);
		expect(rules.isAllowed("https://public-test.example.com/page")).toBe(true);
	});

	it("500 응답 → notFound 처리 (전부 허용)", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 500,
			arrayBuffer: async () => new ArrayBuffer(0),
		} as unknown as Response);

		const rules = await fetchRobots(
			"https://public-test.example.com",
			"ua",
			5000,
		);
		expect(rules.notFound).toBe(true);
		expect(rules.isAllowed("https://public-test.example.com/page")).toBe(true);
	});

	it("network error (DNS) → fetchFailed=true, 모든 URL 허용", async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));

		const rules = await fetchRobots(
			"https://public-test.example.com",
			"ua",
			5000,
		);
		expect(rules.fetchFailed).toBe(true);
		expect(rules.isAllowed("https://public-test.example.com/page")).toBe(true);
	});

	it("SSRF 차단 — localhost 의 robots.txt 는 fetchFailed", async () => {
		const rules = await fetchRobots("http://localhost:8080", "ua", 5000);
		expect(rules.fetchFailed).toBe(true);
	});

	it("SSRF 차단 — 127.0.0.1 의 robots.txt 는 fetchFailed", async () => {
		const rules = await fetchRobots("http://127.0.0.1", "ua", 5000);
		expect(rules.fetchFailed).toBe(true);
	});

	it("SSRF 차단 — 192.168.x.x 의 robots.txt 는 fetchFailed", async () => {
		const rules = await fetchRobots("http://192.168.1.1", "ua", 5000);
		expect(rules.fetchFailed).toBe(true);
	});

	it("SSRF 차단 — 10.x.x.x 의 robots.txt 는 fetchFailed", async () => {
		const rules = await fetchRobots("http://10.0.0.1", "ua", 5000);
		expect(rules.fetchFailed).toBe(true);
	});

	it("200 응답 + body 가 빈 robots.txt 면 모두 허용", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 200,
			arrayBuffer: async () => new TextEncoder().encode("").buffer,
		} as unknown as Response);

		const rules = await fetchRobots(
			"https://public-test.example.com",
			"ua",
			5000,
		);
		expect(rules.fetchFailed).toBe(false);
		expect(rules.notFound).toBe(false);
		expect(rules.isAllowed("https://public-test.example.com/page")).toBe(true);
	});

	it("200 응답 + Disallow: / 면 isAllowed=false", async () => {
		const body = "User-agent: *\nDisallow: /";
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 200,
			arrayBuffer: async () => new TextEncoder().encode(body).buffer,
		} as unknown as Response);

		const rules = await fetchRobots(
			"https://public-test.example.com",
			"ua",
			5000,
		);
		expect(rules.isAllowed("https://public-test.example.com/page")).toBe(false);
	});

	it("응답 본문이 1MB 를 초과해도 512KB 만 사용 (cap 동작)", async () => {
		// 512KB 까지만 디코딩되도록 robots.txt 가 잘려도 throw 안 함
		const body = "Hello\n".repeat(200_000); // ~1.2MB
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 200,
			arrayBuffer: async () => new TextEncoder().encode(body).buffer,
		} as unknown as Response);

		const rules = await fetchRobots(
			"https://public-test.example.com",
			"ua",
			5000,
		);
		expect(rules.fetchFailed).toBe(false);
	});

	it("timeout (AbortError) 도 fetchFailed=true 로 처리", async () => {
		globalThis.fetch = vi
			.fn()
			.mockRejectedValue(
				Object.assign(new Error("aborted"), { name: "AbortError" }),
			);

		const rules = await fetchRobots(
			"https://public-test.example.com",
			"ua",
			100,
		);
		expect(rules.fetchFailed).toBe(true);
	});
});
