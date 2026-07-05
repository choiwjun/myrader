/**
 * X-SAG Core Engine — A11Y 규칙 카탈로그
 *
 * Phase R-D: WCAG 2.1 AA 기반 접근성 룰 15개.
 *
 * 룰들은 RuleContext.a11yResult 가 있을 때만 실질 평가하고,
 * 없으면 informational(passed=true) 로 처리한다.
 *
 * 각 X-SAG 룰은 axe-core ruleId 를 1~2개씩 매핑한다.
 *
 * 카테고리: 모두 "a11y" — 점수 미포함 (informational).
 * ruleWeight: high=10, medium=6, low=3.
 *
 * 룰 목록 (15개):
 *  A11Y-COLOR-CONTRAST-001   color-contrast              (high)
 *  A11Y-IMAGE-ALT-001        image-alt                   (high)
 *  A11Y-FORM-LABEL-001       label                       (high)
 *  A11Y-BUTTON-NAME-001      input-button-name           (high)
 *  A11Y-LINK-NAME-001        link-name                   (high)
 *  A11Y-DOC-LANG-001         html-has-lang/html-lang-valid (medium)
 *  A11Y-DOC-TITLE-001        document-title              (medium)
 *  A11Y-HEADING-ORDER-001    heading-order               (medium)
 *  A11Y-LANDMARK-001         landmark-one-main           (medium)
 *  A11Y-FOCUS-VISIBLE-001    focus-order-semantics       (medium, incomplete)
 *  A11Y-ARIA-VALID-001       aria-allowed-attr           (medium)
 *  A11Y-LIST-001             list                        (low)
 *  A11Y-TABINDEX-001         tabindex                    (low)
 *  A11Y-AUTOPLAY-001         autoplay                    (low)
 *  A11Y-FOCUS-ORDER-001      focusable-content           (low, incomplete)
 */

import type { A11yResult, A11yViolation } from "../../v2/a11y/types.js";
import type { Rule, RuleResult } from "../types.js";

// ---------------------------------------------------------------------------
// 공통: a11yResult 없을 때 반환할 informational placeholder
// ---------------------------------------------------------------------------

function a11yUnavailable(
	ruleId: string,
	title: string,
	severity: "high" | "medium" | "low",
	weight: number,
): RuleResult {
	return {
		ruleId,
		category: "a11y",
		passed: true,
		severity,
		title,
		description: "접근성 분석 결과가 없어 평가를 건너뜁니다.",
		evidence: ["a11yResult 미제공 — axe-core 또는 cheerio-static 어댑터 필요"],
		recommendation:
			"접근성 분석을 활성화하려면 axe-core(권장) 또는 cheerio 기반 정적 분석 어댑터를 연결하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: weight,
	};
}

function findViolation(
	result: A11yResult,
	...axeRuleIds: string[]
): A11yViolation | null {
	for (const v of result.violations) {
		if (axeRuleIds.includes(v.ruleId)) return v;
	}
	return null;
}

// ---------------------------------------------------------------------------
// A11Y-COLOR-CONTRAST-001: 본문 텍스트 대비 WCAG AA 4.5:1
// ---------------------------------------------------------------------------

export const a11yColorContrast001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-COLOR-CONTRAST-001";
	const title = "본문 색상 대비 WCAG AA (4.5:1 이상)";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "high", 10);

	const v = findViolation(a11y, "color-contrast");
	// cheerio-static 는 color-contrast 를 incomplete 처리. 결과가 없으면 passed=true.
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "high",
		title,
		description: passed
			? "본문 색상 대비가 WCAG AA(4.5:1) 기준을 충족합니다 (또는 정적 분석으로 판단 불가)."
			: `${v?.affectedNodes ?? 0}개 요소의 텍스트 색상 대비가 4.5:1 미만입니다.`,
		evidence: v
			? [
					`axe-core: ${v.ruleId}`,
					`affectedNodes: ${v.affectedNodes}`,
					`helpUrl: ${v.helpUrl}`,
				]
			: ["color-contrast 위반 없음 (또는 정적 분석 불가)"],
		recommendation:
			"본문 텍스트와 배경의 색상 대비를 4.5:1 이상으로 설정하세요. https://webaim.org/resources/contrastchecker/ 에서 측정 가능.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// A11Y-IMAGE-ALT-001: 모든 img 에 alt
// ---------------------------------------------------------------------------

export const a11yImageAlt001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-IMAGE-ALT-001";
	const title = "이미지 대체 텍스트(alt) 제공";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "high", 10);

	const v = findViolation(a11y, "image-alt");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "high",
		title,
		description: passed
			? "모든 이미지에 alt 속성이 적절히 설정되어 있습니다."
			: `${v?.affectedNodes ?? 0}개 이미지에 alt 속성이 없습니다.`,
		evidence: v
			? [`axe-core: ${v.ruleId}`, `affectedNodes: ${v.affectedNodes}`]
			: ["image-alt 위반 없음"],
		recommendation:
			"모든 <img> 에 alt 속성을 추가하세요. 의미 있는 이미지는 내용을 설명하는 텍스트, 장식 이미지는 alt='' 또는 role='presentation'.",
		actionType: "snippet_action",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// A11Y-FORM-LABEL-001: 입력 폼에 label 연결
// ---------------------------------------------------------------------------

export const a11yFormLabel001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-FORM-LABEL-001";
	const title = "폼 입력 요소 라벨 연결";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "high", 10);

	const v = findViolation(a11y, "label");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "high",
		title,
		description: passed
			? "모든 폼 입력 요소에 label 이 연결되어 있습니다."
			: `${v?.affectedNodes ?? 0}개 입력 요소에 label 이 없습니다.`,
		evidence: v
			? [`axe-core: ${v.ruleId}`, `affectedNodes: ${v.affectedNodes}`]
			: ["label 위반 없음"],
		recommendation:
			"각 <input>/<textarea>/<select> 에 <label for='id'> 또는 aria-label 을 연결하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// A11Y-BUTTON-NAME-001: button 에 텍스트
// ---------------------------------------------------------------------------

export const a11yButtonName001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-BUTTON-NAME-001";
	const title = "버튼 텍스트 또는 aria-label 제공";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "high", 10);

	const v = findViolation(a11y, "input-button-name", "button-name");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "high",
		title,
		description: passed
			? "모든 버튼에 식별 가능한 텍스트가 있습니다."
			: `${v?.affectedNodes ?? 0}개 버튼에 텍스트/aria-label 이 없습니다.`,
		evidence: v
			? [`axe-core: ${v.ruleId}`, `affectedNodes: ${v.affectedNodes}`]
			: ["button-name 위반 없음"],
		recommendation:
			"<button> 안에 텍스트를 넣거나 aria-label='작업 설명' 을 추가하세요. 아이콘 버튼은 aria-label 필수.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// A11Y-LINK-NAME-001: a 에 텍스트
// ---------------------------------------------------------------------------

export const a11yLinkName001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-LINK-NAME-001";
	const title = "링크 텍스트 또는 aria-label 제공";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "high", 10);

	const v = findViolation(a11y, "link-name");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "high",
		title,
		description: passed
			? "모든 링크에 식별 가능한 텍스트가 있습니다."
			: `${v?.affectedNodes ?? 0}개 링크에 텍스트/aria-label 이 없습니다.`,
		evidence: v
			? [`axe-core: ${v.ruleId}`, `affectedNodes: ${v.affectedNodes}`]
			: ["link-name 위반 없음"],
		recommendation:
			"각 <a> 에 텍스트를 넣거나, 이미지 링크는 alt 또는 aria-label 로 링크 목적을 설명하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// A11Y-DOC-LANG-001: <html lang="..."> 설정
// ---------------------------------------------------------------------------

export const a11yDocLang001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-DOC-LANG-001";
	const title = "문서 언어(html lang) 설정";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "medium", 6);

	const v = findViolation(a11y, "html-has-lang", "html-lang-valid");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "medium",
		title,
		description: passed
			? "<html lang='ko'> 가 올바르게 설정되어 있습니다."
			: "<html> 태그에 lang 속성이 없거나 유효하지 않습니다.",
		evidence: v
			? [`axe-core: ${v.ruleId}`, `affectedNodes: ${v.affectedNodes}`]
			: ["html-has-lang/html-lang-valid 위반 없음"],
		recommendation:
			"<html lang='ko'> (한국어 사이트) 와 같이 lang 속성을 설정해 스크린리더가 정확한 발음으로 읽도록 하세요.",
		actionType: "snippet_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// A11Y-DOC-TITLE-001: <title> 존재
// ---------------------------------------------------------------------------

export const a11yDocTitle001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-DOC-TITLE-001";
	const title = "페이지 제목(title) 존재";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "medium", 6);

	const v = findViolation(a11y, "document-title");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "medium",
		title,
		description: passed
			? "페이지 <title> 이 설정되어 있습니다."
			: "페이지 <title> 이 없습니다 (스크린리더가 페이지를 식별하지 못함).",
		evidence: v ? [`axe-core: ${v.ruleId}`] : ["document-title 위반 없음"],
		recommendation:
			"<title>업체명 | 페이지 주제</title> 형식으로 모든 페이지에 고유한 제목을 설정하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// A11Y-HEADING-ORDER-001: H1 → H2 → H3 위계
// ---------------------------------------------------------------------------

export const a11yHeadingOrder001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-HEADING-ORDER-001";
	const title = "헤딩(H1~H6) 위계 순서";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "medium", 6);

	const v = findViolation(a11y, "heading-order");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "medium",
		title,
		description: passed
			? "헤딩 위계가 H1 → H2 → H3 순서로 올바르게 구성되어 있습니다."
			: `${v?.affectedNodes ?? 0}곳에서 헤딩 위계가 건너뛰어졌습니다(예: H1 → H3).`,
		evidence: v
			? [`axe-core: ${v.ruleId}`, `affectedNodes: ${v.affectedNodes}`]
			: ["heading-order 위반 없음"],
		recommendation:
			"헤딩은 H1 → H2 → H3 순서대로 한 단계씩만 내려가도록 작성하세요. 디자인용 글자 크기는 CSS 로 조절.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// A11Y-LANDMARK-001: main/nav/footer 랜드마크
// ---------------------------------------------------------------------------

export const a11yLandmark001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-LANDMARK-001";
	const title = "주요 영역에 landmark(main 등) 사용";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "medium", 6);

	const v = findViolation(a11y, "landmark-one-main");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "medium",
		title,
		description: passed
			? "<main> 또는 role='main' 랜드마크가 설정되어 있습니다."
			: "<main> 랜드마크가 없어 스크린리더 사용자가 본문으로 바로 점프하지 못합니다.",
		evidence: v ? [`axe-core: ${v.ruleId}`] : ["landmark-one-main 위반 없음"],
		recommendation:
			"본문 영역을 <main>...</main> 으로 감싸고, 보조 메뉴는 <nav>, 하단 정보는 <footer> 로 구성하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// A11Y-FOCUS-VISIBLE-001: focus 인디케이터 (incomplete by static)
// ---------------------------------------------------------------------------

export const a11yFocusVisible001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-FOCUS-VISIBLE-001";
	const title = "키보드 포커스 표시(focus indicator)";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "medium", 6);

	// 정적 분석으로는 판단 어려움 — axe-core focus-order-semantics 가 위반으로 잡으면 실패.
	const v = findViolation(a11y, "focus-order-semantics");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "medium",
		title,
		description: passed
			? "포커스 인디케이터 관련 정적 위반이 발견되지 않았습니다 (수동 확인 권장)."
			: "포커스 인디케이터 또는 포커스 순서에 위반이 발견되었습니다.",
		evidence: v
			? [`axe-core: ${v.ruleId}`]
			: ["focus-order-semantics 위반 없음 (정적 분석 한계)"],
		recommendation:
			"CSS 에 :focus-visible 스타일을 설정해 키보드 사용자가 현재 포커스를 알 수 있게 하세요. outline: none 사용 시 대체 스타일 필수.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// A11Y-ARIA-VALID-001: aria 속성 유효성
// ---------------------------------------------------------------------------

export const a11yAriaValid001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-ARIA-VALID-001";
	const title = "ARIA 속성 유효성";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "medium", 6);

	const v = findViolation(
		a11y,
		"aria-allowed-attr",
		"aria-valid-attr",
		"aria-valid-attr-value",
	);
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "medium",
		title,
		description: passed
			? "모든 ARIA 속성이 유효합니다."
			: `${v?.affectedNodes ?? 0}곳에 알 수 없거나 잘못된 ARIA 속성이 있습니다.`,
		evidence: v
			? [`axe-core: ${v.ruleId}`, `affectedNodes: ${v.affectedNodes}`]
			: ["aria-allowed-attr 위반 없음"],
		recommendation:
			"사용된 모든 aria-* 속성이 WAI-ARIA 1.2 표준 속성인지 확인하세요. 예: aria-labl(오타) → aria-label.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// A11Y-LIST-001: ul/ol 자식은 li 만
// ---------------------------------------------------------------------------

export const a11yList001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-LIST-001";
	const title = "목록 구조(ul/ol → li)";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "low", 3);

	const v = findViolation(a11y, "list");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "low",
		title,
		description: passed
			? "모든 ul/ol 목록의 자식이 li 입니다."
			: `${v?.affectedNodes ?? 0}곳의 ul/ol 에 li 가 아닌 자식이 있습니다.`,
		evidence: v
			? [`axe-core: ${v.ruleId}`, `affectedNodes: ${v.affectedNodes}`]
			: ["list 위반 없음"],
		recommendation:
			"<ul>/<ol> 의 직접 자식은 반드시 <li> 여야 합니다. <div>로 감싸지 마세요.",
		actionType: "snippet_action",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// A11Y-TABINDEX-001: tabindex > 0 회피
// ---------------------------------------------------------------------------

export const a11yTabindex001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-TABINDEX-001";
	const title = "tabindex > 0 사용 회피";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "low", 3);

	const v = findViolation(a11y, "tabindex");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "low",
		title,
		description: passed
			? "tabindex 값이 0 이하로 자연스러운 포커스 순서를 따릅니다."
			: `${v?.affectedNodes ?? 0}곳에서 tabindex > 0 이 사용되었습니다.`,
		evidence: v
			? [`axe-core: ${v.ruleId}`, `affectedNodes: ${v.affectedNodes}`]
			: ["tabindex 위반 없음"],
		recommendation:
			"tabindex 는 0(자연 순서) 또는 -1(스크립트 포커스용) 만 사용하세요. 양수는 포커스 순서를 어지럽힙니다.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// A11Y-AUTOPLAY-001: autoplay 미디어 회피
// ---------------------------------------------------------------------------

export const a11yAutoplay001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-AUTOPLAY-001";
	const title = "비디오/오디오 자동 재생 회피";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "low", 3);

	const v = findViolation(a11y, "autoplay", "audio-caption", "video-caption");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "low",
		title,
		description: passed
			? "자동 재생되는 비디오/오디오가 없거나 controls 가 설정되어 있습니다."
			: `${v?.affectedNodes ?? 0}곳에서 controls 없이 autoplay 가 설정되었습니다.`,
		evidence: v
			? [`axe-core: ${v.ruleId}`, `affectedNodes: ${v.affectedNodes}`]
			: ["autoplay 위반 없음"],
		recommendation:
			"<video>/<audio> 에 autoplay 를 쓰지 말거나, 반드시 controls 와 muted 를 함께 설정해 사용자가 중단할 수 있게 하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// A11Y-FOCUS-ORDER-001: focus 순서 자연스러움 (incomplete by static)
// ---------------------------------------------------------------------------

export const a11yFocusOrder001: Rule = (ctx): RuleResult => {
	const ruleId = "A11Y-FOCUS-ORDER-001";
	const title = "포커스 순서 자연스러움";
	const a11y: A11yResult | undefined = ctx.a11yResult;
	if (!a11y) return a11yUnavailable(ruleId, title, "low", 3);

	const v = findViolation(a11y, "focusable-content", "focus-order-semantics");
	const passed = !v;
	return {
		ruleId,
		category: "a11y",
		passed,
		severity: "low",
		title,
		description: passed
			? "포커스 순서 관련 정적 위반이 발견되지 않았습니다."
			: `${v?.affectedNodes ?? 0}곳에서 포커스 순서 문제가 발견되었습니다.`,
		evidence: v
			? [`axe-core: ${v.ruleId}`, `affectedNodes: ${v.affectedNodes}`]
			: ["focusable-content 위반 없음 (정적 분석 한계)"],
		recommendation:
			"DOM 순서가 화면의 시각적 순서와 일치하도록 HTML 구조를 정리하세요. CSS order/float 로 순서를 바꾸지 마세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};
