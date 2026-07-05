/**
 * BACKLOG-G P5 — adversarial / CJK 엣지 케이스 회귀 테스트.
 *
 * 검증 포인트:
 *  - 한자/일본어/한글 혼합, 전각/반각, 이모지, 결합 문자, RTL 마커
 *  - wordCount 계산이 한국어 어절 기준에서도 합리적
 *  - bodyText 정규화 (공백 압축) 가 CJK 텍스트에서도 동작
 *  - title 길이 측정이 surrogate pair 를 깨지 않게
 */

import { describe, expect, it } from "vitest";
import { mockParsedPage } from "./helpers.js";

const BASE = "https://example.co.kr/";

describe("CJK edge — 한자 표기", () => {
	it("순수 한자 (중국어) title", () => {
		const page = mockParsedPage(
			"<html><head><title>北京大學</title></head><body></body></html>",
		);
		expect(page.title).toBe("北京大學");
	});

	it("일본어 hiragana + katakana title", () => {
		const page = mockParsedPage(
			"<html><head><title>こんにちは カフェ</title></head><body></body></html>",
		);
		expect(page.title).toBe("こんにちは カフェ");
	});

	it("한글 + 한자 (한국식 한자혼용)", () => {
		const page = mockParsedPage(
			"<html><head><title>서울特別市 강남區</title></head><body></body></html>",
		);
		expect(page.title).toBe("서울特別市 강남區");
	});

	it("한글 + 일본어 한자 (じ)", () => {
		const page = mockParsedPage(
			"<html><head><title>강남 가じ</title></head><body></body></html>",
		);
		expect(page.title).toBe("강남 가じ");
	});

	it("한글 자모 분리 입력 (NFD form)", () => {
		const decomposed = "한"; // ᄒ + ᅡ + ᆫ → 한 (NFD)
		const page = mockParsedPage(
			`<html><head><title>${decomposed}글</title></head><body></body></html>`,
		);
		expect(page.title).toContain("글");
	});

	it("CJK Extension A (\\u3400~\\u4DBF) 문자", () => {
		const page = mockParsedPage(
			"<html><head><title>㐀㐁㐂</title></head><body></body></html>",
		);
		expect(page.title).toBe("㐀㐁㐂");
	});

	it("CJK Compatibility Ideographs (\\uF900~)", () => {
		const page = mockParsedPage(
			"<html><head><title>豈更車</title></head><body></body></html>",
		);
		expect(page.title).toBeTruthy();
	});

	it("Hangul Jamo (\\u1100~\\u11FF)", () => {
		const page = mockParsedPage(
			"<html><head><title>ᄀᄂᄃᄅᄆ</title></head><body></body></html>",
		);
		expect(page.title).toBeTruthy();
	});
});

describe("CJK edge — 전각/반각", () => {
	it("전각 영문/숫자 (ＡＢＣ１２３)", () => {
		const page = mockParsedPage(
			"<html><head><title>ＡＢＣ１２３</title></head><body></body></html>",
		);
		expect(page.title).toBe("ＡＢＣ１２３");
	});

	it("반각 카타카나 (ｱｲｳｴｵ)", () => {
		const page = mockParsedPage(
			"<html><head><title>ｱｲｳｴｵ</title></head><body></body></html>",
		);
		expect(page.title).toBe("ｱｲｳｴｵ");
	});

	it("전각 공백 (\\u3000) 도 정상 처리", () => {
		const page = mockParsedPage(
			"<html><head><title>강남　카페</title></head><body></body></html>",
		);
		expect(page.title).toContain("강남");
		expect(page.title).toContain("카페");
	});

	it("전각 punctuation (。、！？) 처리", () => {
		const page = mockParsedPage(
			"<html><head><title>안녕。카페！</title></head><body></body></html>",
		);
		expect(page.title).toContain("。");
		expect(page.title).toContain("！");
	});
});

describe("CJK edge — 이모지 + 보조 평면", () => {
	it("BMP 외부 이모지 (📍🍰☕) 도 정상", () => {
		const page = mockParsedPage(
			"<html><head><title>강남 카페 ☕🍰</title></head><body><h1>📍 강남역 5번 출구</h1></body></html>",
		);
		expect(page.title).toContain("☕");
		expect(page.h1).toContain("📍");
	});

	it("Emoji + ZWJ sequence (👨‍👩‍👧) 처리", () => {
		const page = mockParsedPage(
			"<html><head><title>👨‍👩‍👧 가족 카페</title></head><body></body></html>",
		);
		expect(page.title).toContain("가족");
	});

	it("Skin tone modifier 가 붙은 이모지 (👍🏽) 처리", () => {
		const page = mockParsedPage(
			"<html><head><title>👍🏽 추천</title></head><body></body></html>",
		);
		expect(page.title).toContain("추천");
	});

	it("Flag emoji (🇰🇷🇯🇵🇨🇳) 처리", () => {
		const page = mockParsedPage(
			"<html><head><title>🇰🇷 한국 카페</title></head><body></body></html>",
		);
		expect(page.title).toContain("한국 카페");
	});

	it("Variation Selector (\\uFE0F) 가 붙은 이모지 처리", () => {
		const page = mockParsedPage(
			"<html><head><title>☕️ 카페</title></head><body></body></html>",
		);
		expect(page.title).toContain("카페");
	});

	it("Mathematical Alphanumeric Symbols (𝐀𝐁𝐂) 처리", () => {
		const page = mockParsedPage(
			"<html><head><title>𝐀𝐁𝐂 강조</title></head><body></body></html>",
		);
		expect(page.title).toContain("강조");
	});
});

describe("CJK edge — wordCount / bodyText", () => {
	it("한국어 문장 wordCount — 어절 기준", () => {
		const html =
			"<html><head><title>t</title></head><body><p>강남 카페 핸드드립 커피 전문점</p></body></html>";
		const page = mockParsedPage(html);
		// 공백 split 5어절
		expect(page.wordCount).toBe(5);
	});

	it("한국어 + 영어 혼합 wordCount", () => {
		const html =
			"<html><head><title>t</title></head><body><p>강남 카페 hand drip cafe</p></body></html>";
		const page = mockParsedPage(html);
		expect(page.wordCount).toBe(5);
	});

	it("일본어 문장도 공백 어절로 카운트", () => {
		const html =
			"<html><head><title>t</title></head><body><p>こんにちは カフェ です</p></body></html>";
		const page = mockParsedPage(html);
		expect(page.wordCount).toBe(3);
	});

	it("중국어 (공백 없음) 는 단일 어절로 카운트", () => {
		const html =
			"<html><head><title>t</title></head><body><p>北京大學中文系</p></body></html>";
		const page = mockParsedPage(html);
		// 공백이 없으므로 1 어절
		expect(page.wordCount).toBe(1);
	});

	it("bodyText 공백 압축 — 다중 공백 → 단일 공백", () => {
		const html =
			"<html><head><title>t</title></head><body><p>강남    카페    매장</p></body></html>";
		const page = mockParsedPage(html);
		expect(page.bodyText).toBe("강남 카페 매장");
	});

	it("bodyText 공백 압축 — 줄바꿈/탭도 단일 공백", () => {
		const html =
			"<html><head><title>t</title></head><body><p>강남\n\n카페\t\t매장</p></body></html>";
		const page = mockParsedPage(html);
		expect(page.bodyText).toBe("강남 카페 매장");
	});

	it("bodyText 가 매우 긴 한국어도 처리 (1MB 한글)", () => {
		const longKorean = "안녕하세요 ".repeat(100_000);
		const html = `<html><head><title>t</title></head><body><p>${longKorean}</p></body></html>`;
		const page = mockParsedPage(html);
		expect(page.wordCount).toBeGreaterThan(50_000);
	});

	it("wordCount 가 NaN/Infinity 가 아님 (빈 본문 → 0)", () => {
		const html = "<html><head><title>t</title></head><body></body></html>";
		const page = mockParsedPage(html);
		expect(Number.isFinite(page.wordCount)).toBe(true);
		expect(page.wordCount).toBe(0);
	});

	it("wordCount 가 자연수 (정수, 음수 아님)", () => {
		const html =
			"<html><head><title>t</title></head><body><p>a b c</p></body></html>";
		const page = mockParsedPage(html);
		expect(Number.isInteger(page.wordCount)).toBe(true);
		expect(page.wordCount).toBeGreaterThanOrEqual(0);
	});
});

describe("CJK edge — 한글 URL / link 텍스트", () => {
	it("한글 path 가 포함된 internal link", () => {
		const html = `<html><head><title>t</title></head><body><a href="/메뉴">메뉴</a></body></html>`;
		const page = mockParsedPage(html, BASE);
		expect(page.internalLinks.length).toBeGreaterThan(0);
	});

	it("Punycode 도메인 (xn--) external link", () => {
		// xn--3e0b707e (한국 IDN 예시 도메인) — URL 생성 자체는 항상 성공
		const html = `<html><head><title>t</title></head><body><a href="https://xn--3e0b707e.example/">한국</a></body></html>`;
		const page = mockParsedPage(html, BASE);
		// 외부 도메인이므로 externalLinks 에 포함되어야 한다
		expect(page.externalLinks.length).toBeGreaterThan(0);
	});

	it("한글 도메인 (URL.toString 정규화 후) 처리", () => {
		const html = `<html><head><title>t</title></head><body><a href="https://한국.kr/페이지">link</a></body></html>`;
		expect(() => mockParsedPage(html, BASE)).not.toThrow();
	});
});

describe("CJK edge — 이미지 alt 텍스트", () => {
	it("한글 alt 텍스트 정상 추출", () => {
		const html = `<html><head><title>t</title></head><body><img src="/i.png" alt="강남 카페 로고"></body></html>`;
		const page = mockParsedPage(html);
		expect(page.images[0]?.alt).toBe("강남 카페 로고");
	});

	it("일본어 + 이모지 alt 텍스트", () => {
		const html = `<html><head><title>t</title></head><body><img src="/i.png" alt="カフェ ☕"></body></html>`;
		const page = mockParsedPage(html);
		expect(page.images[0]?.alt).toContain("カフェ");
		expect(page.images[0]?.alt).toContain("☕");
	});

	it("alt 가 비어있어도 (alt='') 정상 처리", () => {
		const html = `<html><head><title>t</title></head><body><img src="/i.png" alt=""></body></html>`;
		const page = mockParsedPage(html);
		expect(page.images[0]?.alt).toBe("");
	});

	it("alt 가 없으면 null", () => {
		const html = `<html><head><title>t</title></head><body><img src="/i.png"></body></html>`;
		const page = mockParsedPage(html);
		expect(page.images[0]?.alt).toBeNull();
	});
});

describe("CJK edge — meta description 한글", () => {
	it("매우 긴 한글 description (1000자) 도 truncation 없이 추출", () => {
		const longDesc = "강남".repeat(500); // 1000 글자
		const html = `<html><head><title>t</title><meta name="description" content="${longDesc}"></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.description?.length).toBe(1000);
	});

	it("한글 description + HTML entity 혼용 처리", () => {
		const html = `<html><head><title>t</title><meta name="description" content="강남 &amp; 송파 카페 정보"></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.description).toContain("&");
	});

	it("description 에 줄바꿈 (\\n) 포함되어도 처리", () => {
		const html = `<html><head><title>t</title><meta name="description" content="강남\n카페\n정보"></head><body></body></html>`;
		const page = mockParsedPage(html);
		expect(page.description).toBeTruthy();
	});
});

describe("CJK edge — 결합 문자 / 이상한 유니코드", () => {
	it("combining diacritical mark (á = a + ́) 처리", () => {
		const html = "<html><head><title>café</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("Devanagari (नमस्ते) 처리", () => {
		const html =
			"<html><head><title>नमस्ते 강남</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("Arabic (مرحبا) RTL 처리", () => {
		const html =
			"<html><head><title>مرحبا 강남</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("Hebrew (שלום) RTL 처리", () => {
		const html =
			"<html><head><title>שלום 강남</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("RTL override (\\u202E) 가 포함된 title (XSS 시도) 도 graceful", () => {
		const html =
			"<html><head><title>normal‮txt.exe</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("LRE/RLE/PDF 마커도 graceful", () => {
		const html =
			"<html><head><title>‪left‬embed‫right‬</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});

	it("Tag character (\\uE0000~) 도 처리", () => {
		const html =
			"<html><head><title>tag1chars</title></head><body></body></html>";
		expect(() => mockParsedPage(html)).not.toThrow();
	});
});
