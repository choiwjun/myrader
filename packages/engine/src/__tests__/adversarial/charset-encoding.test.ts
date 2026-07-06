/**
 * BACKLOG-G P5 — adversarial / charset & encoding 회귀 테스트.
 *
 * 검증 포인트:
 *  - meta charset / http-equiv content-type 다양한 표기 처리
 *  - BOM (UTF-8 ﻿, UTF-16 LE/BE) 페이로드도 throw 없음
 *  - 깨진 charset 선언이어도 한글이 정상 추출되는지 (Node fetch 디코딩 가정)
 *  - 혼합 인코딩 문자열도 graceful
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlSite } from "../../crawler.js";
import { expectNoCrash, mockParsedPage } from "./helpers.js";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function htmlBytesWithKoreanTitle(charsetDeclaration: string): Uint8Array {
	const encoder = new TextEncoder();
	const before = encoder.encode(`<html><head>${charsetDeclaration}<title>`);
	const koreanEucKr = new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb]);
	const after = encoder.encode("</title></head><body></body></html>");
	const bytes = new Uint8Array(before.length + koreanEucKr.length + after.length);
	bytes.set(before, 0);
	bytes.set(koreanEucKr, before.length);
	bytes.set(after, before.length + koreanEucKr.length);
	return bytes;
}

function supportsTextDecoderLabel(label: string): boolean {
	try {
		new TextDecoder(label);
		return true;
	} catch {
		return false;
	}
}

describe("charset-encoding — meta charset 표기", () => {
	it("UTF-8 charset meta (HTML5 short form) 처리", () => {
		const html = `<html><head><meta charset="utf-8"><title>UTF-8</title></head><body><h1>한글</h1></body></html>`;
		const page = mockParsedPage(html);
		expect(page.title).toBe("UTF-8");
		expect(page.h1).toBe("한글");
	});

	it("UTF-8 charset meta (대문자 UTF-8)", () => {
		const html = `<html><head><meta charset="UTF-8"><title>upper</title></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.title).toBe("upper");
	});

	it("UTF-8 charset meta (utf8 표기)", () => {
		const html = `<html><head><meta charset="utf8"><title>noDash</title></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.title).toBe("noDash");
	});

	it("http-equiv content-type 형태 (구버전)", () => {
		const html = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>old-style</title></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.title).toBe("old-style");
	});

	it("EUC-KR charset 선언이어도 throw 하지 않음 (실제 디코딩은 fetch 단계)", async () => {
		await expectNoCrash(() => {
			const html = `<html><head><meta charset="euc-kr"><title>EUC-KR 페이지</title></head><body><h1>한글</h1></body></html>`;
			const page = mockParsedPage(html);
			expect(page.title).toBe("EUC-KR 페이지");
		});
	});

	it("CP949 charset 선언이어도 throw 하지 않음", () => {
		const html = `<html><head><meta charset="cp949"><title>CP949</title></head><body></body></html>`;
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("Shift_JIS charset (일본어) 선언도 throw 안 함", () => {
		const html = `<html><head><meta charset="shift_jis"><title>일본어</title></head><body></body></html>`;
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("Big5 charset (중국어 번체) 선언도 throw 안 함", () => {
		const html = `<html><head><meta charset="big5"><title>중국어</title></head><body></body></html>`;
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("GB2312 charset (중국어 간체) 선언도 throw 안 함", () => {
		const html = `<html><head><meta charset="gb2312"><title>간체</title></head><body></body></html>`;
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("ISO-8859-1 charset 선언도 throw 안 함", () => {
		const html = `<html><head><meta charset="iso-8859-1"><title>ISO</title></head><body></body></html>`;
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("존재하지 않는 charset 선언 (asdf) 도 throw 안 함", () => {
		const html = `<html><head><meta charset="asdf"><title>잘못된 charset</title></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.title).toBe("잘못된 charset");
	});

	it("charset 이 비어 있어도 graceful", () => {
		const html = `<html><head><meta charset=""><title>empty</title></head><body></body></html>`;
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("charset 선언이 여러 개 있어도 throw 안 함", () => {
		const html = `<html><head>
      <meta charset="utf-8">
      <meta charset="euc-kr">
      <meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">
      <title>multi-charset</title>
    </head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.title).toBe("multi-charset");
	});

	it("body 안에 위치한 meta charset (잘못된 위치) 도 graceful", () => {
		const html = `<html><head><title>x</title></head><body><meta charset="utf-8"><h1>한글</h1></body></html>`;
		const page = mockParsedPage(html);
		expect(page.h1).toBe("한글");
	});
});

describe("charset-encoding — crawler byte decoding", () => {
	it("prefers Content-Type charset and decodes EUC-KR Korean response bytes", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string | URL | Request) => {
				const u = typeof url === "string" ? url : (url as URL).toString();
				if (u.endsWith("/robots.txt")) {
					return new Response("", { status: 404 });
				}
				return new Response(htmlBytesWithKoreanTitle(""), {
					status: 200,
					headers: { "content-type": "text/html; charset=euc-kr" },
				});
			}),
		);

		const result = await crawlSite("https://example.co.kr/", {
			maxPagesPerSite: 1,
			totalTimeoutMs: 5_000,
			useSitemap: false,
		});

		if (supportsTextDecoderLabel("euc-kr")) {
			expect(result.pages[0]?.title).toBe("한글");
		} else {
			expect(result.pages[0]?.title).not.toBeNull();
		}
	});

	it("uses early meta charset when Content-Type has no charset", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string | URL | Request) => {
				const u = typeof url === "string" ? url : (url as URL).toString();
				if (u.endsWith("/robots.txt")) {
					return new Response("", { status: 404 });
				}
				return new Response(
					htmlBytesWithKoreanTitle('<meta charset="euc-kr">'),
					{
						status: 200,
						headers: { "content-type": "text/html" },
					},
				);
			}),
		);

		const result = await crawlSite("https://example.co.kr/", {
			maxPagesPerSite: 1,
			totalTimeoutMs: 5_000,
			useSitemap: false,
		});

		if (supportsTextDecoderLabel("euc-kr")) {
			expect(result.pages[0]?.title).toBe("한글");
		} else {
			expect(result.pages[0]?.title).not.toBeNull();
		}
	});

	it("uses early http-equiv content-type meta charset when Content-Type has no charset", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string | URL | Request) => {
				const u = typeof url === "string" ? url : (url as URL).toString();
				if (u.endsWith("/robots.txt")) {
					return new Response("", { status: 404 });
				}
				return new Response(
					htmlBytesWithKoreanTitle(
						'<meta http-equiv="Content-Type" content="text/html; charset=euc-kr">',
					),
					{
						status: 200,
						headers: { "content-type": "text/html" },
					},
				);
			}),
		);

		const result = await crawlSite("https://example.co.kr/", {
			maxPagesPerSite: 1,
			totalTimeoutMs: 5_000,
			useSitemap: false,
		});

		if (supportsTextDecoderLabel("euc-kr")) {
			expect(result.pages[0]?.title).toBe("한글");
		} else {
			expect(result.pages[0]?.title).not.toBeNull();
		}
	});

	it("uses http-equiv meta charset and safely falls back for unsupported labels", async () => {
		const utf8Html =
			'<html><head><meta http-equiv="Content-Type" content="text/html; charset=unsupported-x"><title>한글</title></head><body></body></html>';

		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string | URL | Request) => {
				const u = typeof url === "string" ? url : (url as URL).toString();
				if (u.endsWith("/robots.txt")) {
					return new Response("", { status: 404 });
				}
				return new Response(new TextEncoder().encode(utf8Html), {
					status: 200,
					headers: { "content-type": "text/html" },
				});
			}),
		);

		const result = await crawlSite("https://example.co.kr/", {
			maxPagesPerSite: 1,
			totalTimeoutMs: 5_000,
			useSitemap: false,
		});

		expect(result.pages[0]?.title).toBe("한글");
	});
});

describe("charset-encoding — BOM 처리", () => {
	it("UTF-8 BOM (\\uFEFF) 으로 시작하는 HTML", () => {
		const html =
			"﻿<html><head><title>BOM-UTF8</title></head><body></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toBe("BOM-UTF8");
	});

	it("BOM + DOCTYPE 조합도 처리", () => {
		const html =
			"﻿<!DOCTYPE html><html><head><title>BOM-DOC</title></head><body></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toBe("BOM-DOC");
	});

	it("BOM 이 head 안에 있어도 graceful (잘못된 위치)", () => {
		const html =
			"<html><head>﻿<title>mid-BOM</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("zero-width-space (\\u200B) 가 포함된 title 도 처리", () => {
		const html = "<html><head><title>제​목</title></head><body></body></html>";
		const page = mockParsedPage(html);
		// 가시적으로 "제목" 처럼 보이지만 사이에 ZWS 가 있음
		expect(page.title).toContain("제");
		expect(page.title).toContain("목");
	});

	it("zero-width-joiner (\\u200D) 가 포함된 텍스트도 처리", () => {
		const html = "<html><head><title>가‍나</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});
});

describe("charset-encoding — 혼합 인코딩 / 특수 문자", () => {
	it("한글 + 영어 + 숫자 혼용 정상 처리", () => {
		const html =
			"<html><head><title>강남 Cafe 2024</title></head><body><h1>강남 카페</h1></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toBe("강남 Cafe 2024");
	});

	it("한글 + 한자 혼용 정상 처리", () => {
		const html =
			"<html><head><title>韓國 카페 漢字</title></head><body></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toBe("韓國 카페 漢字");
	});

	it("한글 + 일본어 + 중국어 혼용 정상 처리", () => {
		const html =
			"<html><head><title>한국어 日本語 中文</title></head><body></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toBe("한국어 日本語 中文");
	});

	it("이모지 (🍰☕📍) 포함 텍스트 처리", () => {
		const html =
			"<html><head><title>강남 카페 ☕🍰</title></head><body><h1>📍 강남역</h1></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toContain("☕");
		expect(page.title).toContain("🍰");
		expect(page.h1).toContain("📍");
	});

	it("Surrogate pair 이모지 (𝓗𝓮𝓵𝓵𝓸) 처리", () => {
		const html =
			"<html><head><title>𝓗𝓮𝓵𝓵𝓸 World</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("HTML entity (&amp; &lt; &gt; &quot;) 디코딩 처리", () => {
		const html =
			"<html><head><title>A &amp; B &lt;C&gt;</title></head><body></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toContain("A & B");
		expect(page.title).toContain("<C>");
	});

	it("Numeric entity (&#54620;&#44544;) 디코딩 처리 (한글)", () => {
		// &#54620; = 한, &#44544; = 글
		const html =
			"<html><head><title>&#54620;&#44544;</title></head><body></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toContain("한");
		expect(page.title).toContain("글");
	});

	it("Hex entity (&#xD55C;&#xAE00;) 디코딩 처리", () => {
		const html =
			"<html><head><title>&#xD55C;&#xAE00;</title></head><body></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toContain("한");
		expect(page.title).toContain("글");
	});

	it("RTL 마커 (\\u202E) 포함 텍스트도 throw 안 함 (XSS 우려)", async () => {
		await expectNoCrash(() => {
			const html =
				"<html><head><title>normal‮txt.exe</title></head><body></body></html>";
			mockParsedPage(html);
		});
	});

	it("LTR/RTL embed 마커 (\\u202A~\\u202E) 모두 처리", () => {
		const html =
			"<html><head><title>‪내부텍스트‬</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("Control character (\\u0000~\\u001F) 가 포함된 텍스트도 처리", () => {
		const html =
			"<html><head><title>beforeafter</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("매우 긴 한글 텍스트 (10,000자) 도 처리", () => {
		const longKorean = "한".repeat(10_000);
		const html = `<html><head><title>${longKorean}</title></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.title).toBeTruthy();
		if (page.title) expect(page.title.length).toBeGreaterThan(0);
	});

	it("4-byte UTF-8 문자 (古代漢字 𠮷) 도 처리", () => {
		const html = "<html><head><title>𠮷野家</title></head><body></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toContain("野家");
	});

	it("결합 문자 (한글 자모 분리) 처리 — ᄒ + ᅡ + ᆫ", () => {
		const html = "<html><head><title>한</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("NFC/NFD 정규화 차이가 있는 한글도 graceful", () => {
		// NFC: 한 (U+D55C), NFD: 한 (분해)
		const nfc = "한";
		const nfd = "한";
		const html = `<html><head><title>${nfc} ${nfd}</title></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.title).toContain(nfc);
	});

	it("non-breaking space (\\u00A0) 가 포함된 텍스트도 처리", () => {
		const html =
			"<html><head><title>강남 카페</title></head><body></body></html>";
		const page = mockParsedPage(html);
		expect(page.title).toContain("강남");
		expect(page.title).toContain("카페");
	});

	it("Tab (\\t) / Form feed (\\f) 가 포함된 텍스트도 처리", () => {
		const html =
			"<html><head><title>강남\t카페\f매장</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});
});

describe("charset-encoding — Content-Language / lang attribute", () => {
	it("html lang='ko' attribute 처리", () => {
		const html = `<html lang="ko"><head><title>x</title></head><body></body></html>`;
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("html lang='ko-KR' attribute 처리", () => {
		const html = `<html lang="ko-KR"><head><title>x</title></head><body></body></html>`;
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("잘못된 lang attribute (xx-YY-ZZ) 도 graceful", () => {
		const html = `<html lang="xx-YY-ZZ"><head><title>x</title></head><body></body></html>`;
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("lang attribute 가 비어있어도 graceful", () => {
		const html = `<html lang=""><head><title>x</title></head><body></body></html>`;
		expect(() => mockParsedPage(html)).not.toThrow();
	});
});
