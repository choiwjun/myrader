/**
 * X-SAG Core Engine — nap-extractor 단위 테스트 (Phase 0 인프라)
 *
 * shared/nap-extractor.ts 의 전화/주소/업체명/지역코드 추출 직접 검증.
 * 결정적: AI/네트워크/시간 의존 없음.
 */

import { describe, expect, it } from "vitest";
import {
	areaCodeMatchesRegion,
	EXAMPLE_CONTEXT_PATTERN,
	extractAddresses,
	extractPhones,
	hasExampleContextAround,
	normalizeBusinessName,
} from "../nap-extractor.js";

// ===========================================================================
// extractPhones
// ===========================================================================

describe("extractPhones", () => {
	it("서울 02-xxxx-xxxx 형식을 추출한다", () => {
		const phones = extractPhones("문의: 02-1234-5678 입니다");
		expect(phones).toHaveLength(1);
		expect(phones[0]?.raw).toBe("02-1234-5678");
		expect(phones[0]?.normalized).toBe("0212345678");
		expect(phones[0]?.areaCode).toBe("02");
	});

	it("0XX 지역번호(031 등) 형식을 추출한다", () => {
		const phones = extractPhones("전화 031-123-4567");
		expect(phones).toHaveLength(1);
		expect(phones[0]?.normalized).toBe("0311234567");
		expect(phones[0]?.areaCode).toBe("031");
	});

	it("010 휴대폰 형식을 추출한다", () => {
		const phones = extractPhones("010-1234-5678 로 연락주세요");
		expect(phones).toHaveLength(1);
		expect(phones[0]?.normalized).toBe("01012345678");
		expect(phones[0]?.areaCode).toBe("010");
	});

	it("15xx 대표번호 형식을 추출한다 (areaCode = 대표번호 전체)", () => {
		const phones = extractPhones("대표번호 1588-1234");
		expect(phones).toHaveLength(1);
		expect(phones[0]?.raw).toBe("1588-1234");
		expect(phones[0]?.normalized).toBe("15881234");
		expect(phones[0]?.areaCode).toBe("1588");
	});

	it("normalized 기준 중복은 제거한다", () => {
		const phones = extractPhones("02-1234-5678 / 02 1234 5678");
		expect(phones).toHaveLength(1);
	});

	it("빈 입력은 빈 배열", () => {
		expect(extractPhones("")).toEqual([]);
	});
});

// ===========================================================================
// extractAddresses
// ===========================================================================

describe("extractAddresses", () => {
	it("도로명(로 + 번호) 주소를 road=true 로 추출한다", () => {
		const addrs = extractAddresses("테헤란로 152 에 위치");
		const road = addrs.find((a) => a.road);
		expect(road).toBeDefined();
		expect(road?.normalized).toBe("테헤란로 152");
	});

	it("길 / 대로 도로명도 인식한다", () => {
		const a1 = extractAddresses("강남대로 396");
		expect(a1.some((a) => a.road && a.normalized === "강남대로 396")).toBe(
			true,
		);
		const a2 = extractAddresses("봉은사로12길 5");
		expect(a2.some((a) => a.road)).toBe(true);
	});

	it("번호 포함 하이픈 도로명(테헤란로 1-2)도 인식한다", () => {
		const addrs = extractAddresses("테헤란로 1-2");
		expect(addrs.some((a) => a.road && a.normalized === "테헤란로 1-2")).toBe(
			true,
		);
	});

	it("region 인자는 정렬만 하고 필터링하지 않는다", () => {
		// region('강남') 포함 주소가 뒤에 등장하지만 정렬로 앞에 와야 한다.
		// 행정구('강남구')가 도로명 prefix 로 흡수되어 normalized 에 '강남' 이 포함됨.
		const text = "부산 해운대구 해운대로 10 그리고 서울 강남구 테헤란로 152";
		const addrs = extractAddresses(text, "강남");
		// 필터링 X → 두 주소 모두 존재
		expect(addrs).toHaveLength(2);
		// region('강남') 포함 주소가 맨 앞으로 정렬
		expect(addrs[0]?.normalized.includes("강남")).toBe(true);
		expect(addrs[1]?.normalized.includes("강남")).toBe(false);
	});

	it("region 으로 정렬해도 region 미포함 주소를 버리지 않는다", () => {
		const addrs = extractAddresses("부산 해운대구 해운대로 10", "강남");
		expect(addrs).toHaveLength(1);
		expect(addrs[0]?.normalized.includes("강남")).toBe(false);
	});

	it("빈 입력은 빈 배열", () => {
		expect(extractAddresses("")).toEqual([]);
	});
});

// ===========================================================================
// normalizeBusinessName
// ===========================================================================

describe("normalizeBusinessName", () => {
	it("korean 은 공백 정리, ascii 는 라틴/숫자 소문자만", () => {
		const n = normalizeBusinessName("  Le  Signal  카페  ");
		expect(n.korean).toBe("Le Signal 카페");
		expect(n.ascii).toBe("lesignal");
	});

	it("variants 는 빈 값 제외 + 중복 제거된 변형 모음", () => {
		const n = normalizeBusinessName("테스트 카페");
		// korean, noSpace(테스트카페), lower(=korean, 한글이라 동일), koreanOnly(테스트카페), ascii('')
		expect(n.variants).toContain("테스트 카페");
		expect(n.variants).toContain("테스트카페");
		// ascii 는 빈 문자열이므로 variants 에 포함되지 않음
		expect(n.variants).not.toContain("");
		// 중복 제거 — 고유 값
		expect(new Set(n.variants).size).toBe(n.variants.length);
	});

	it("영문 브랜드는 ascii variant 를 포함한다", () => {
		const n = normalizeBusinessName("Acme Co");
		expect(n.ascii).toBe("acmeco");
		expect(n.variants).toContain("acmeco");
	});
});

// ===========================================================================
// areaCodeMatchesRegion
// ===========================================================================

describe("areaCodeMatchesRegion", () => {
	it("02 ↔ 서울 은 true", () => {
		expect(areaCodeMatchesRegion("02", "서울")).toBe(true);
		expect(areaCodeMatchesRegion("02", "강남")).toBe(true);
	});

	it("알려진 지역번호인데 region 불일치면 false", () => {
		expect(areaCodeMatchesRegion("02", "부산")).toBe(false);
		expect(areaCodeMatchesRegion("051", "서울")).toBe(false);
	});

	it("알 수 없는 지역번호는 통과(true)", () => {
		expect(areaCodeMatchesRegion("099", "서울")).toBe(true);
	});

	it("휴대폰/대표번호는 지역 무관 true", () => {
		expect(areaCodeMatchesRegion("010", "부산")).toBe(true);
		expect(areaCodeMatchesRegion("1588", "부산")).toBe(true);
	});

	it("빈 입력은 true (과탐 방지)", () => {
		expect(areaCodeMatchesRegion("", "서울")).toBe(true);
		expect(areaCodeMatchesRegion("02", "")).toBe(true);
		expect(areaCodeMatchesRegion("02", "   ")).toBe(true);
	});
});

// ===========================================================================
// hasExampleContextAround + EXAMPLE_CONTEXT_PATTERN
// ===========================================================================

describe("EXAMPLE_CONTEXT_PATTERN / hasExampleContextAround", () => {
	it("예시/example/demo 등 키워드를 매칭한다", () => {
		expect(EXAMPLE_CONTEXT_PATTERN.test("예시: 02-0000-0000")).toBe(true);
		expect(EXAMPLE_CONTEXT_PATTERN.test("for example")).toBe(true);
		expect(EXAMPLE_CONTEXT_PATTERN.test("sample data")).toBe(true);
		expect(EXAMPLE_CONTEXT_PATTERN.test("실제 매장 전화")).toBe(false);
	});

	it("매치 인덱스 주변 radius 안에 예시 문맥이 있으면 true", () => {
		const text = "예시) 전화번호는 02-1234-5678 형식입니다";
		const idx = text.indexOf("02-1234");
		expect(hasExampleContextAround(text, idx)).toBe(true);
	});

	it("예시 문맥이 멀리 있으면(radius 밖) false", () => {
		const text = `${"가".repeat(100)} 02-1234-5678 ${"나".repeat(100)} 예시`;
		const idx = text.indexOf("02-1234");
		expect(hasExampleContextAround(text, idx, 10)).toBe(false);
	});

	it("빈 입력/음수 인덱스는 false", () => {
		expect(hasExampleContextAround("", 0)).toBe(false);
		expect(hasExampleContextAround("예시 02", -1)).toBe(false);
	});
});
