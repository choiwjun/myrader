/**
 * X-SAG Core Engine — 공유 텍스트 유틸 (Phase 0 인프라)
 *
 * POLICY § 7.1: 규칙 기반 정적 분석. 결정적·재현 가능. AI 호출 없음.
 *
 * splitSentences / DOT_PLACEHOLDER 는 기존 rules/aeo-rules.ts 에 있던 구현을
 * 이곳으로 이관한 단일 출처(single source of truth)다. aeo-rules.ts 는 back-compat
 * 목적으로 이 모듈에서 re-export 한다. 신규 룰은 이 모듈에서 직접 import 한다.
 */

// 본문에 등장하지 않는 사설 영역(PUA) 문자로 점을 임시 치환했다가 분할 후 복원한다.
export const DOT_PLACEHOLDER = "";

const ABBREVIATIONS = [
	"Dr",
	"Mr",
	"Mrs",
	"Ms",
	"Inc",
	"Ltd",
	"Co",
	"vs",
	"etc",
	"e.g",
	"i.e",
];

/**
 * 문장 분할. URL/이메일/도메인/영문 약어의 점을 placeholder 로 마스킹한 뒤
 * 문장-종결 부호(.!?。) + (공백|문자열 끝) 기준으로 나눈다. 분할 후 placeholder 복원.
 */
export function splitSentences(text: string): string[] {
	let masked = text;
	const maskDots = (s: string): string => s.replace(/\./g, DOT_PLACEHOLDER);
	// URL (http(s):// 또는 www. 형태) 의 점 마스킹
	masked = masked.replace(/https?:\/\/\S+|www\.\S+/gi, maskDots);
	// 이메일의 점 마스킹
	masked = masked.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, maskDots);
	// 도메인 형태(example.com 등) 의 점 마스킹 — scheme/www 없이 단독 등장하는 경우
	masked = masked.replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi, maskDots);
	// 약어 뒤의 점 마스킹 (Dr. / Inc. / e.g. 등, 대소문자 무시)
	for (const abbr of ABBREVIATIONS) {
		const escaped = abbr.replace(/\./g, "\\.");
		masked = masked.replace(new RegExp(`\\b${escaped}\\.`, "gi"), maskDots);
	}
	// 문장-종결 부호 + (공백 또는 문자열 끝) 기준 분할 후 placeholder 복원
	return masked
		.split(/[.!?。]+(?:\s+|$)/)
		.map((s) => s.split(DOT_PLACEHOLDER).join("."));
}

/**
 * pattern 의 등장 횟수.
 * - string: 대소문자 무시, non-overlapping
 * - RegExp: global 플래그를 강제하여 전체 매치 수 카운트
 */
export function countOccurrences(
	text: string,
	pattern: string | RegExp,
): number {
	if (typeof pattern === "string") {
		if (pattern.length === 0) return 0;
		const haystack = text.toLowerCase();
		const needle = pattern.toLowerCase();
		let count = 0;
		let pos = haystack.indexOf(needle);
		while (pos !== -1) {
			count++;
			pos = haystack.indexOf(needle, pos + needle.length);
		}
		return count;
	}
	const flags = pattern.flags.includes("g")
		? pattern.flags
		: `${pattern.flags}g`;
	const global = new RegExp(pattern.source, flags);
	let count = 0;
	while (global.exec(text) !== null) {
		count++;
		// zero-width 매치 무한 루프 방지
		if (global.lastIndex === 0) global.lastIndex++;
	}
	return count;
}

/**
 * headingStructure 에 keyword 가 (대소문자 무시) 포함된 heading 이 있으면 true.
 */
export function headingHasKeyword(
	headingStructure: { level: number; text: string }[] | undefined,
	kw: string,
): boolean {
	if (!headingStructure || headingStructure.length === 0) return false;
	if (kw.length === 0) return false;
	const kwLower = kw.toLowerCase();
	return headingStructure.some((h) => h.text.toLowerCase().includes(kwLower));
}

/**
 * pattern 이 등장하는 위치 주변(radius 자) 텍스트를 잘라 문장으로 분할하여 반환.
 * 매치마다 [start-radius, end+radius] 범위를 추출 후 splitSentences 로 나눈다.
 */
export function extractSentencesAround(
	text: string,
	pattern: string | RegExp,
	radius = 40,
): string[] {
	const indices: { start: number; end: number }[] = [];
	if (typeof pattern === "string") {
		if (pattern.length === 0) return [];
		const haystack = text.toLowerCase();
		const needle = pattern.toLowerCase();
		let pos = haystack.indexOf(needle);
		while (pos !== -1) {
			indices.push({ start: pos, end: pos + needle.length });
			pos = haystack.indexOf(needle, pos + needle.length);
		}
	} else {
		const flags = pattern.flags.includes("g")
			? pattern.flags
			: `${pattern.flags}g`;
		const global = new RegExp(pattern.source, flags);
		let m = global.exec(text);
		while (m !== null) {
			indices.push({ start: m.index, end: m.index + m[0].length });
			if (global.lastIndex === m.index) global.lastIndex++;
			m = global.exec(text);
		}
	}
	const out: string[] = [];
	for (const { start, end } of indices) {
		const from = Math.max(0, start - radius);
		const to = Math.min(text.length, end + radius);
		for (const s of splitSentences(text.slice(from, to))) {
			const trimmed = s.trim();
			if (trimmed.length > 0) out.push(trimmed);
		}
	}
	return out;
}
