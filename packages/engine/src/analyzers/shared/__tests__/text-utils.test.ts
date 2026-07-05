/**
 * X-SAG Core Engine — text-utils 단위 테스트 (Phase 0 인프라)
 *
 * shared/text-utils.ts 의 문장 분할 / 카운트 / heading / 주변 추출 직접 검증.
 * 결정적: AI/네트워크/시간 의존 없음.
 */

import { describe, expect, it } from "vitest";
import {
	countOccurrences,
	DOT_PLACEHOLDER,
	extractSentencesAround,
	headingHasKeyword,
	splitSentences,
} from "../text-utils.js";

// ===========================================================================
// splitSentences
// ===========================================================================

describe("splitSentences", () => {
	it("실제 문장 경계(.!?。)에서 분할한다", () => {
		const out = splitSentences("첫 문장입니다. 두 번째 문장! 세 번째? 끝.");
		// 끝 종결부호 뒤 빈 토큰이 trailing 으로 남는다
		expect(out).toEqual(["첫 문장입니다", "두 번째 문장", "세 번째", "끝", ""]);
	});

	it("URL(example.com / https://...) 의 점에서는 분할하지 않는다", () => {
		expect(splitSentences("Visit example.com for info. Then call us.")).toEqual([
			"Visit example.com for info",
			"Then call us",
			"",
		]);
		expect(splitSentences("See https://a.b.c/x.y now. Done.")).toEqual([
			"See https://a.b.c/x.y now",
			"Done",
			"",
		]);
	});

	it("이메일의 점에서는 분할하지 않는다", () => {
		expect(splitSentences("Email me at a.b@c.com please. Thanks.")).toEqual([
			"Email me at a.b@c.com please",
			"Thanks",
			"",
		]);
	});

	it("약어(Dr./Inc.)의 점에서는 분할하지 않는다", () => {
		expect(splitSentences("Dr. Kim works at Inc. today. Next one.")).toEqual([
			"Dr. Kim works at Inc. today",
			"Next one",
			"",
		]);
	});

	it("DOT_PLACEHOLDER 는 마스킹 후 복원되어 결과에 남지 않는다", () => {
		const out = splitSentences("example.com 안내. 끝.");
		for (const s of out) {
			expect(s.includes(DOT_PLACEHOLDER)).toBe(false);
		}
		expect(out[0]).toContain("example.com");
	});
});

// ===========================================================================
// countOccurrences
// ===========================================================================

describe("countOccurrences", () => {
	it("문자열 패턴은 대소문자 무시 + non-overlapping", () => {
		expect(countOccurrences("aAaA", "a")).toBe(4);
		// non-overlapping: 'aaaa' 안의 'aa' 는 2회
		expect(countOccurrences("aaaa", "aa")).toBe(2);
		expect(countOccurrences("Seoul SEOUL seoul", "seoul")).toBe(3);
	});

	it("빈 문자열 패턴은 0", () => {
		expect(countOccurrences("abc", "")).toBe(0);
	});

	it("RegExp 패턴은 global 을 강제하여 전체 매치 수를 센다", () => {
		expect(countOccurrences("a1b2c3", /\d/)).toBe(3);
		// 이미 global 인 경우도 동일
		expect(countOccurrences("a1b2c3", /\d/g)).toBe(3);
	});

	it("매치가 없으면 0", () => {
		expect(countOccurrences("abc", "z")).toBe(0);
		expect(countOccurrences("abc", /\d/)).toBe(0);
	});
});

// ===========================================================================
// headingHasKeyword
// ===========================================================================

describe("headingHasKeyword", () => {
	it("대소문자 무시하고 keyword 포함 heading 을 찾는다", () => {
		const headings = [
			{ level: 2, text: "오시는 길" },
			{ level: 3, text: "MENU 안내" },
		];
		expect(headingHasKeyword(headings, "오시는")).toBe(true);
		expect(headingHasKeyword(headings, "menu")).toBe(true);
		expect(headingHasKeyword(headings, "예약")).toBe(false);
	});

	it("undefined / 빈 배열 / 빈 keyword 는 안전하게 false", () => {
		expect(headingHasKeyword(undefined, "x")).toBe(false);
		expect(headingHasKeyword([], "x")).toBe(false);
		expect(headingHasKeyword([{ level: 1, text: "h" }], "")).toBe(false);
	});
});

// ===========================================================================
// extractSentencesAround
// ===========================================================================

describe("extractSentencesAround", () => {
	it("문자열 패턴 주변 radius 텍스트를 문장으로 잘라 반환한다", () => {
		const out = extractSentencesAround(
			"앞부분 키워드 뒷부분입니다. 다음.",
			"키워드",
			5,
		);
		expect(out.length).toBeGreaterThan(0);
		expect(out.some((s) => s.includes("키워드"))).toBe(true);
		// trim 되어 빈 문자열은 포함되지 않는다
		expect(out.every((s) => s.length > 0)).toBe(true);
	});

	it("RegExp 패턴도 지원한다", () => {
		const out = extractSentencesAround("전화 02-1234-5678 입니다", /\d{4}/, 10);
		expect(out.length).toBeGreaterThan(0);
	});

	it("매치가 없거나 빈 문자열 패턴이면 빈 배열", () => {
		expect(extractSentencesAround("hello world", "없는단어")).toEqual([]);
		expect(extractSentencesAround("hello world", "")).toEqual([]);
	});
});
