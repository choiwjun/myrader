/**
 * X-SAG Core Engine v2 — Mobile Diagnosis Helper
 *
 * RenderResult 를 모바일-특화 검증으로 확장.
 * viewport meta, 가로 스크롤, 터치 타겟, 폰트 크기 검사.
 *
 * Phase O-C: 모바일/태블릿 emulation + 디바이스별 진단 차이 검증
 */

import type { DeviceId } from "./devices.js";
import { getDevicePreset } from "./devices.js";
import type { RenderResult } from "./types.js";

// ---------------------------------------------------------------------------
// MobileDiagnosisInput — 모바일 진단 입력
// ---------------------------------------------------------------------------

export interface MobileDiagnosisInput {
	/** 진단 대상 URL */
	url: string;
	/** 진단 디바이스 (예: "iphone-14", "galaxy-s24") */
	device: DeviceId;
	/** true = 이미지/폰트 차단 (성능 테스트용) */
	blockResources?: boolean;
}

// ---------------------------------------------------------------------------
// MobileDiagnosisResult — 모바일 진단 결과
// ---------------------------------------------------------------------------

export interface MobileDiagnosisResult {
	/** 진단에 사용된 디바이스 ID */
	device: DeviceId;
	/** Playwright RenderResult 원본 */
	renderResult: RenderResult;
	/** <meta name="viewport"> 내용 (없으면 null) */
	viewportMeta: string | null;
	/** 가로 스크롤 필요 여부 (false = 반응형 O) */
	hasHorizontalScroll: boolean;
	/** 터치 타겟 크기 문제 수 (width × height < 48×48) */
	tapTargetIssues: number;
	/** 본문 폰트 크기 분석: { tooSmall: N, total: M } */
	textReadability: {
		/** 12px 미만 텍스트 수 */
		tooSmall: number;
		/** 분석한 총 텍스트 요소 수 */
		total: number;
	};
	/** viewport meta가 없거나 device-width 미포함 */
	missingViewportMeta: boolean;
	/** 분석 완료 시각 (ISO 8601) */
	analyzedAt: string;
}

// ---------------------------------------------------------------------------
// Mobile Diagnosis Implementation
// ---------------------------------------------------------------------------

/**
 * 렌더링된 HTML을 모바일 관점에서 진단.
 * 실제 환경에서는 Playwright page 객체 필요.
 * 여기서는 HTML 파싱 기반 정적 분석만 수행.
 *
 * @param renderResult Playwright RenderResult
 * @param input 진단 입력 (device ID 포함)
 * @returns MobileDiagnosisResult
 */
export function diagnoseMobileFromHtml(
	renderResult: RenderResult,
	input: MobileDiagnosisInput,
): MobileDiagnosisResult {
	const device = getDevicePreset(input.device);
	const html = renderResult.html;

	// -----------------------------------------------------------------------
	// 1. viewport meta 추출
	// -----------------------------------------------------------------------
	const viewportMatch = html.match(
		/<meta\s+name=["']viewport["']\s+content=["']([^"']*)["']/i,
	);
	const viewportMeta: string | null = viewportMatch?.[1] ?? null;
	const missingViewportMeta =
		!viewportMeta ||
		(!viewportMeta.includes("width=device-width") &&
			!viewportMeta.includes("width=100%"));

	// -----------------------------------------------------------------------
	// 2. 가로 스크롤 검증 (정적 분석)
	// viewport width를 초과하는 요소 감지
	// -----------------------------------------------------------------------
	const hasHorizontalScroll = detectHorizontalScroll(
		html,
		device.viewport.width,
	);

	// -----------------------------------------------------------------------
	// 3. 터치 타겟 크기 검증
	// <a>, <button>, <input type="button"> 등의 최소 크기 (48×48px) 확인
	// -----------------------------------------------------------------------
	const tapTargetIssues = countTapTargetIssues(html);

	// -----------------------------------------------------------------------
	// 4. 텍스트 가독성 (폰트 크기)
	// inline style 또는 class 내 font-size < 12px 검사
	// -----------------------------------------------------------------------
	const textReadability = analyzeTextReadability(html);

	return {
		device: input.device,
		renderResult,
		viewportMeta,
		hasHorizontalScroll,
		tapTargetIssues,
		textReadability,
		missingViewportMeta,
		analyzedAt: new Date().toISOString(),
	};
}

// ---------------------------------------------------------------------------
// Helper: 가로 스크롤 감지
// ---------------------------------------------------------------------------

function detectHorizontalScroll(html: string, viewportWidth: number): boolean {
	// 간단한 휴리스틱:
	// 1. overflow-x: hidden 없으면 위험
	// 2. fixed/absolute 요소의 width > viewportWidth 확인
	// 3. table width > viewportWidth 확인

	// <style> 내 overflow-x: hidden 체크
	const hasOverflowXHidden = /<style[^>]*>[\s\S]*?overflow-x:\s*hidden/i.test(
		html,
	);

	// <table width="1200"> 또는 <table style="width: 1200px"> 패턴
	const tableMatches = html.match(/<table[^>]*>/gi);
	if (tableMatches) {
		for (const tableTag of tableMatches) {
			// width 속성 직접 확인 (예: width="1200")
			const widthAttrMatch = tableTag.match(/width=["']?(\d+)/i);
			if (widthAttrMatch?.[1]) {
				const width = Number.parseInt(widthAttrMatch[1], 10);
				if (width > viewportWidth) {
					return true;
				}
			}
			// style 속성 내 width 확인 (예: style="width: 1200px")
			const styleMatch = tableTag.match(/style=["']([^"']*)["']/i);
			if (styleMatch?.[1]) {
				const widthPxMatch = styleMatch[1].match(/width[:\s]*(\d+)/i);
				if (widthPxMatch?.[1]) {
					const width = Number.parseInt(widthPxMatch[1], 10);
					if (width > viewportWidth) {
						return true;
					}
				}
			}
		}
	}

	// <div style="width: 1000px"> 또는 <div style="width:1000px"> 패턴
	const divMatches = html.match(/<div[^>]*style=["']([^"']*)["']/gi);
	if (divMatches) {
		for (const divTag of divMatches) {
			const styleMatch = divTag.match(/style=["']([^"']*)["']/i);
			if (styleMatch?.[1]) {
				const widthMatch = styleMatch[1].match(/width[:\s]*(\d+)p?x?/i);
				if (widthMatch?.[1]) {
					const width = Number.parseInt(widthMatch[1], 10);
					if (width > viewportWidth) {
						return true;
					}
				}
			}
		}
	}

	return false;
}

// ---------------------------------------------------------------------------
// Helper: 터치 타겟 크기 검사
// ---------------------------------------------------------------------------

function countTapTargetIssues(html: string): number {
	let issues = 0;

	// <button> 태그 수집
	const buttons = html.match(/<button[^>]*>/gi) || [];
	for (const btn of buttons) {
		if (isTapTargetTooSmall(btn)) {
			issues++;
		}
	}

	// <a> 태그 수집
	const anchors = html.match(/<a[^>]*>/gi) || [];
	for (const anchor of anchors) {
		// href가 있는 실제 링크만
		if (/href=["']/i.test(anchor) && isTapTargetTooSmall(anchor)) {
			issues++;
		}
	}

	// <input type="button"> 등
	const inputs = html.match(/<input[^>]*type=["']button["'][^>]*>/gi) || [];
	for (const inp of inputs) {
		if (isTapTargetTooSmall(inp)) {
			issues++;
		}
	}

	return issues;
}

function isTapTargetTooSmall(element: string): boolean {
	// 최소 크기: 48×48px
	// padding 포함 계산은 생략하고, 명시적 width/height만 확인

	const widthMatch = element.match(/width[:\s]*["']?(\d+)/i);
	const heightMatch = element.match(/height[:\s]*["']?(\d+)/i);

	if (widthMatch?.[1] && heightMatch?.[1]) {
		const w = Number.parseInt(widthMatch[1], 10);
		const h = Number.parseInt(heightMatch[1], 10);
		return w < 48 || h < 48;
	}

	// 명시적 크기가 없으면 일반적으로 패스 (기본 폰트 크기면 충분)
	return false;
}

// ---------------------------------------------------------------------------
// Helper: 텍스트 가독성 분석
// ---------------------------------------------------------------------------

function analyzeTextReadability(html: string): {
	tooSmall: number;
	total: number;
} {
	let total = 0;
	let tooSmall = 0;

	// 간단한 휴리스틱: <p>, <span>, <li> 등 일반 텍스트 요소의 font-size 검사

	// inline style="font-size: Xpx" 패턴
	const inlineMatch = html.match(
		/<(?:p|span|li|div|article|section)[^>]*style=["']([^"']*?)["']/gi,
	);
	if (inlineMatch) {
		for (const match of inlineMatch) {
			total++;
			const fontSizeMatch = match.match(/font-size[:\s]*(\d+)px/i);
			if (fontSizeMatch?.[1]) {
				const size = Number.parseInt(fontSizeMatch[1], 10);
				if (size < 12) {
					tooSmall++;
				}
			}
		}
	}

	// class 기반은 CSS 파싱이 필요하므로 여기서는 생략
	// (Playwright 실 환경에서는 window.getComputedStyle 사용)

	// 최소 1개 이상 분석한 경우만 반환
	return { tooSmall: Math.max(0, tooSmall), total: Math.max(1, total) };
}

// ---------------------------------------------------------------------------
// Validation Functions
// ---------------------------------------------------------------------------

/**
 * MobileDiagnosisResult 유효성 검증.
 * @returns 통과 여부
 */
export function isValidMobileDiagnosis(result: MobileDiagnosisResult): boolean {
	return (
		result.device !== undefined &&
		result.renderResult !== undefined &&
		typeof result.hasHorizontalScroll === "boolean" &&
		typeof result.tapTargetIssues === "number" &&
		result.textReadability.total >= 0 &&
		result.textReadability.tooSmall >= 0 &&
		typeof result.missingViewportMeta === "boolean"
	);
}
