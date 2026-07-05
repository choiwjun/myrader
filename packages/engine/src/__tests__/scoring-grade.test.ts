/**
 * X-SAG Core Engine — scoreToGrade 단위 테스트 (Audit 2 C.4)
 *
 * 검증 범위:
 *   - 4개 등급 밴드 (poor/low/fair/good) 의 대표값
 *   - 정확한 경계값 (39/40/59/60/79/80/100)
 *   - 비정상 입력 (NaN / Infinity / -Infinity / 음수) → graceful "poor"
 *
 * POLICY § 11.1 / TRD § 7.2 scores.grade 와 1:1 매칭.
 */

import type { Grade } from "@boina/contracts/enums";
import { describe, expect, it } from "vitest";
import { scoreToGrade } from "../scoring.js";

// ---------------------------------------------------------------------------
// 1. 밴드별 대표값
// ---------------------------------------------------------------------------

describe("scoreToGrade — 밴드별 대표값", () => {
	it('80~100 점은 모두 "good"', () => {
		const samples = [80, 85, 90, 95, 100];
		for (const score of samples) {
			expect(scoreToGrade(score)).toBe<Grade>("good");
		}
	});

	it('60~79 점은 모두 "fair"', () => {
		const samples = [60, 65, 70, 75, 79];
		for (const score of samples) {
			expect(scoreToGrade(score)).toBe<Grade>("fair");
		}
	});

	it('40~59 점은 모두 "low"', () => {
		const samples = [40, 45, 50, 55, 59];
		for (const score of samples) {
			expect(scoreToGrade(score)).toBe<Grade>("low");
		}
	});

	it('0~39 점은 모두 "poor"', () => {
		const samples = [0, 1, 10, 20, 30, 39];
		for (const score of samples) {
			expect(scoreToGrade(score)).toBe<Grade>("poor");
		}
	});
});

// ---------------------------------------------------------------------------
// 2. 경계값 — 39/40, 59/60, 79/80
// ---------------------------------------------------------------------------

describe("scoreToGrade — 경계값", () => {
	it('39점 → "poor" (poor 상한)', () => {
		expect(scoreToGrade(39)).toBe<Grade>("poor");
	});

	it('40점 → "low" (low 하한)', () => {
		expect(scoreToGrade(40)).toBe<Grade>("low");
	});

	it('59점 → "low" (low 상한)', () => {
		expect(scoreToGrade(59)).toBe<Grade>("low");
	});

	it('60점 → "fair" (fair 하한)', () => {
		expect(scoreToGrade(60)).toBe<Grade>("fair");
	});

	it('79점 → "fair" (fair 상한)', () => {
		expect(scoreToGrade(79)).toBe<Grade>("fair");
	});

	it('80점 → "good" (good 하한)', () => {
		expect(scoreToGrade(80)).toBe<Grade>("good");
	});

	it('100점 → "good" (good 상한)', () => {
		expect(scoreToGrade(100)).toBe<Grade>("good");
	});
});

// ---------------------------------------------------------------------------
// 3. 비정상 입력 가드 — graceful "poor"
// ---------------------------------------------------------------------------

describe('scoreToGrade — 비정상 입력은 "poor" 폴백', () => {
	it('NaN → "poor"', () => {
		expect(scoreToGrade(Number.NaN)).toBe<Grade>("poor");
	});

	it('+Infinity → "poor" (Number.isFinite 가드)', () => {
		expect(scoreToGrade(Number.POSITIVE_INFINITY)).toBe<Grade>("poor");
	});

	it('-Infinity → "poor"', () => {
		expect(scoreToGrade(Number.NEGATIVE_INFINITY)).toBe<Grade>("poor");
	});

	it('음수 (-1) → "poor"', () => {
		expect(scoreToGrade(-1)).toBe<Grade>("poor");
	});

	it('음수 (-100) → "poor"', () => {
		expect(scoreToGrade(-100)).toBe<Grade>("poor");
	});

	it('0 → "poor" (정상 경계, 음수 가드와 구분)', () => {
		expect(scoreToGrade(0)).toBe<Grade>("poor");
	});
});

// ---------------------------------------------------------------------------
// 4. 결정성 — 동일 입력 → 동일 출력
// ---------------------------------------------------------------------------

describe("scoreToGrade — 결정성", () => {
	it("동일 입력에 대해 항상 동일 결과 반환", () => {
		for (const score of [0, 39, 40, 59, 60, 79, 80, 100]) {
			const first = scoreToGrade(score);
			const second = scoreToGrade(score);
			const third = scoreToGrade(score);
			expect(first).toBe(second);
			expect(second).toBe(third);
		}
	});
});
