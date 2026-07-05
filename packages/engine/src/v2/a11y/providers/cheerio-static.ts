/**
 * X-SAG Core Engine — Cheerio-based Static A11Y Provider (fallback)
 *
 * Phase R-D: jsdom/axe-core 없이 cheerio 만으로 핵심 WCAG 2.1 AA 룰을 정적 검사.
 * - axe-core 와 호환되는 ruleId/helpUrl 형식 유지 → 룰 매핑 코드 재사용.
 * - 한계: color-contrast / focus-visible 등 CSS·동적 검사는 incomplete 로 기록.
 *
 * POLICY § 7.1: 결정적·재현 가능.
 *
 * 검사 룰 (axe-core ID 기준):
 *  - image-alt           : img 태그에 alt 누락
 *  - input-button-name   : button 에 텍스트/aria-label 누락
 *  - label               : input 에 label/aria-label 누락
 *  - link-name           : a 태그에 텍스트/aria-label 누락
 *  - document-title      : <title> 누락 또는 공백
 *  - html-has-lang       : <html lang="..."> 누락
 *  - html-lang-valid     : lang 값이 유효하지 않음 (간단 패턴)
 *  - heading-order       : H1 → H2 → H3 위계 위반
 *  - landmark-one-main   : <main> 또는 role="main" 없음
 *  - list                : <ul>/<ol> 자식이 <li> 가 아닌 경우
 *  - tabindex            : tabindex > 0 사용
 *  - aria-allowed-attr   : 알 수 없는 aria-* 속성 (보수적 검사)
 *  - autoplay            : <video autoplay> 또는 <audio autoplay>
 *  - meta-viewport       : viewport meta 의 user-scalable=no
 *  - duplicate-id        : 중복된 id 속성
 *
 * incomplete 처리:
 *  - color-contrast (CSS 분석 필요)
 *  - focus-order-semantics / focusable-content (DOM 트리 동적 분석 필요)
 */

import { load } from "cheerio";
import type {
	A11yInput,
	A11yProvider,
	A11yResult,
	A11yViolation,
} from "../types.js";

interface RuleSpec {
	ruleId: string;
	description: string;
	impact: A11yViolation["impact"];
	wcagTags: string[];
}

const RULE_SPECS: Record<string, RuleSpec> = {
	"image-alt": {
		ruleId: "image-alt",
		description: "Images must have alternate text",
		impact: "serious",
		wcagTags: ["wcag2a", "wcag111"],
	},
	"input-button-name": {
		ruleId: "input-button-name",
		description: "Buttons must have discernible text",
		impact: "serious",
		wcagTags: ["wcag2a", "wcag412"],
	},
	label: {
		ruleId: "label",
		description: "Form elements must have labels",
		impact: "critical",
		wcagTags: ["wcag2a", "wcag332", "wcag131"],
	},
	"link-name": {
		ruleId: "link-name",
		description: "Links must have discernible text",
		impact: "serious",
		wcagTags: ["wcag2a", "wcag244", "wcag412"],
	},
	"document-title": {
		ruleId: "document-title",
		description: "Documents must have a title",
		impact: "serious",
		wcagTags: ["wcag2a", "wcag242"],
	},
	"html-has-lang": {
		ruleId: "html-has-lang",
		description: "<html> element must have a lang attribute",
		impact: "serious",
		wcagTags: ["wcag2a", "wcag311"],
	},
	"html-lang-valid": {
		ruleId: "html-lang-valid",
		description:
			"<html> element must have a valid value for the lang attribute",
		impact: "serious",
		wcagTags: ["wcag2a", "wcag311"],
	},
	"heading-order": {
		ruleId: "heading-order",
		description: "Heading levels should only increase by one",
		impact: "moderate",
		wcagTags: ["best-practice"],
	},
	"landmark-one-main": {
		ruleId: "landmark-one-main",
		description: "Document should have one main landmark",
		impact: "moderate",
		wcagTags: ["best-practice"],
	},
	list: {
		ruleId: "list",
		description:
			"<ul> and <ol> must only directly contain <li>, <script>, or <template> elements",
		impact: "serious",
		wcagTags: ["wcag2a", "wcag131"],
	},
	tabindex: {
		ruleId: "tabindex",
		description: "tabindex attribute value should not be greater than 0",
		impact: "serious",
		wcagTags: ["best-practice"],
	},
	"aria-allowed-attr": {
		ruleId: "aria-allowed-attr",
		description: "ARIA attributes must be valid",
		impact: "serious",
		wcagTags: ["wcag2a", "wcag412"],
	},
	autoplay: {
		ruleId: "autoplay",
		description: "audio and video must not autoplay without a way to pause",
		impact: "moderate",
		wcagTags: ["wcag2a", "wcag142"],
	},
	"meta-viewport": {
		ruleId: "meta-viewport",
		description: "Zooming and scaling must not be disabled",
		impact: "critical",
		wcagTags: ["wcag2aa", "wcag144"],
	},
	"duplicate-id": {
		ruleId: "duplicate-id",
		description: "id attribute value must be unique",
		impact: "minor",
		wcagTags: ["wcag2a", "wcag411"],
	},
};

const INCOMPLETE_RULES = [
	"color-contrast",
	"focus-order-semantics",
	"focusable-content",
];

function helpUrl(ruleId: string): string {
	return `https://dequeuniversity.com/rules/axe/4.10/${ruleId}`;
}

export class CheerioStaticA11yProvider implements A11yProvider {
	readonly name = "cheerio-static" as const;

	isAvailable(): boolean {
		return true;
	}

	async analyze(input: A11yInput): Promise<A11yResult> {
		const $ = load(input.html);
		const violations: A11yViolation[] = [];
		let passes = 0;

		// --- image-alt ---
		const imgsMissingAlt = $("img").filter((_, el) => {
			const $el = $(el);
			const alt = $el.attr("alt");
			const role = $el.attr("role");
			return alt === undefined && role !== "presentation" && role !== "none";
		});
		pushIf(violations, "image-alt", imgsMissingAlt.length);
		if (imgsMissingAlt.length === 0) passes++;

		// --- input-button-name ---
		const buttonsMissingName = $("button").filter((_, el) => {
			const $el = $(el);
			const text = ($el.text() || "").trim();
			const aria = $el.attr("aria-label");
			const ariaLabelledby = $el.attr("aria-labelledby");
			const title = $el.attr("title");
			return !text && !aria && !ariaLabelledby && !title;
		});
		// <input type="button|submit|reset"> 도 검사
		const inputButtonsMissingName = $(
			'input[type="button"], input[type="submit"], input[type="reset"]',
		).filter((_, el) => {
			const $el = $(el);
			const value = $el.attr("value");
			const aria = $el.attr("aria-label");
			const ariaLabelledby = $el.attr("aria-labelledby");
			return !value && !aria && !ariaLabelledby;
		});
		const totalButtonsMissingName =
			buttonsMissingName.length + inputButtonsMissingName.length;
		pushIf(violations, "input-button-name", totalButtonsMissingName);
		if (totalButtonsMissingName === 0) passes++;

		// --- label (form input) ---
		const labeledIds = new Set<string>();
		$("label[for]").each((_, el) => {
			const f = $(el).attr("for");
			if (f) labeledIds.add(f);
		});
		const inputsMissingLabel = $(
			'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select',
		).filter((_, el) => {
			const $el = $(el);
			const id = $el.attr("id");
			const aria = $el.attr("aria-label");
			const ariaLabelledby = $el.attr("aria-labelledby");
			const wrapped = $el.parents("label").length > 0;
			const labeledByFor = id !== undefined && labeledIds.has(id);
			return !aria && !ariaLabelledby && !wrapped && !labeledByFor;
		});
		pushIf(violations, "label", inputsMissingLabel.length);
		if (inputsMissingLabel.length === 0) passes++;

		// --- link-name ---
		const linksMissingName = $("a").filter((_, el) => {
			const $el = $(el);
			const text = ($el.text() || "").trim();
			const aria = $el.attr("aria-label");
			const ariaLabelledby = $el.attr("aria-labelledby");
			const title = $el.attr("title");
			const imgWithAlt =
				$el.find("img[alt]").filter((_2, im) => {
					return ($(im).attr("alt") || "").trim().length > 0;
				}).length > 0;
			return !text && !aria && !ariaLabelledby && !title && !imgWithAlt;
		});
		pushIf(violations, "link-name", linksMissingName.length);
		if (linksMissingName.length === 0) passes++;

		// --- document-title ---
		const titleEl = $("title").first();
		const titleText = (titleEl.text() || "").trim();
		if (!titleText) {
			pushIf(violations, "document-title", 1);
		} else {
			passes++;
		}

		// --- html-has-lang ---
		const htmlLang = $("html").attr("lang");
		if (!htmlLang || htmlLang.trim().length === 0) {
			pushIf(violations, "html-has-lang", 1);
		} else {
			passes++;
			// --- html-lang-valid ---
			const valid = /^[a-zA-Z]{2,3}([-_][a-zA-Z0-9]{2,8})*$/.test(
				htmlLang.trim(),
			);
			if (!valid) {
				pushIf(violations, "html-lang-valid", 1);
			} else {
				passes++;
			}
		}

		// --- heading-order ---
		const headings: number[] = [];
		$("h1, h2, h3, h4, h5, h6").each((_, el) => {
			const t = el.tagName?.toLowerCase() ?? "";
			const n = Number.parseInt(t.replace("h", ""), 10);
			if (!Number.isNaN(n)) headings.push(n);
		});
		let headingOrderViolations = 0;
		for (let i = 1; i < headings.length; i++) {
			const prev = headings[i - 1] ?? 0;
			const curr = headings[i] ?? 0;
			if (curr > prev + 1) headingOrderViolations++;
		}
		pushIf(violations, "heading-order", headingOrderViolations);
		if (headingOrderViolations === 0) passes++;

		// --- landmark-one-main ---
		const mains = $('main, [role="main"]').length;
		if (mains < 1) {
			pushIf(violations, "landmark-one-main", 1);
		} else {
			passes++;
		}

		// --- list (ul/ol direct children non-li) ---
		let listViolations = 0;
		$("ul, ol").each((_, el) => {
			const directChildren = $(el).children();
			directChildren.each((_2, child) => {
				const tag =
					(child as { tagName?: string }).tagName?.toLowerCase() ?? "";
				if (tag !== "li" && tag !== "script" && tag !== "template") {
					listViolations++;
				}
			});
		});
		pushIf(violations, "list", listViolations);
		if (listViolations === 0) passes++;

		// --- tabindex > 0 ---
		const badTabindex = $("[tabindex]").filter((_, el) => {
			const v = Number.parseInt($(el).attr("tabindex") || "0", 10);
			return !Number.isNaN(v) && v > 0;
		}).length;
		pushIf(violations, "tabindex", badTabindex);
		if (badTabindex === 0) passes++;

		// --- aria-allowed-attr (보수적: 'aria-' 로 시작하지만 알려진 속성이 아닌 경우) ---
		const knownAria = new Set([
			"aria-label",
			"aria-labelledby",
			"aria-describedby",
			"aria-hidden",
			"aria-expanded",
			"aria-controls",
			"aria-current",
			"aria-disabled",
			"aria-required",
			"aria-invalid",
			"aria-pressed",
			"aria-checked",
			"aria-selected",
			"aria-live",
			"aria-atomic",
			"aria-busy",
			"aria-haspopup",
			"aria-owns",
			"aria-activedescendant",
			"aria-level",
			"aria-modal",
			"aria-multiline",
			"aria-multiselectable",
			"aria-orientation",
			"aria-placeholder",
			"aria-readonly",
			"aria-relevant",
			"aria-roledescription",
			"aria-rowcount",
			"aria-rowindex",
			"aria-rowspan",
			"aria-colcount",
			"aria-colindex",
			"aria-colspan",
			"aria-sort",
			"aria-valuemax",
			"aria-valuemin",
			"aria-valuenow",
			"aria-valuetext",
			"aria-autocomplete",
			"aria-keyshortcuts",
			"aria-flowto",
			"aria-dropeffect",
			"aria-grabbed",
			"aria-errormessage",
			"aria-details",
			"aria-posinset",
			"aria-setsize",
		]);
		let invalidAria = 0;
		$("*").each((_, el) => {
			const attribs =
				(el as { attribs?: Record<string, string> }).attribs ?? {};
			for (const attr of Object.keys(attribs)) {
				if (attr.startsWith("aria-") && !knownAria.has(attr)) {
					invalidAria++;
				}
			}
		});
		pushIf(violations, "aria-allowed-attr", invalidAria);
		if (invalidAria === 0) passes++;

		// --- autoplay ---
		const autoplay = $("video[autoplay], audio[autoplay]").filter((_, el) => {
			// controls 가 있으면 OK
			return $(el).attr("controls") === undefined;
		}).length;
		pushIf(violations, "autoplay", autoplay);
		if (autoplay === 0) passes++;

		// --- meta-viewport (user-scalable=no 또는 maximum-scale=1) ---
		const viewport = $('meta[name="viewport"]').attr("content") || "";
		const viewportBad =
			/user-scalable\s*=\s*no/i.test(viewport) ||
			/maximum-scale\s*=\s*1(?:\.0)?\b/i.test(viewport);
		if (viewportBad) {
			pushIf(violations, "meta-viewport", 1);
		} else {
			passes++;
		}

		// --- duplicate-id ---
		const idCounts = new Map<string, number>();
		$("[id]").each((_, el) => {
			const id = $(el).attr("id");
			if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
		});
		let duplicateIds = 0;
		for (const count of idCounts.values()) {
			if (count > 1) duplicateIds += count - 1;
		}
		pushIf(violations, "duplicate-id", duplicateIds);
		if (duplicateIds === 0) passes++;

		const totalRules = passes + violations.length + INCOMPLETE_RULES.length;
		const incomplete = INCOMPLETE_RULES.length;
		const aaViolations = violations.filter((v) =>
			v.wcagTags.some((t) => t === "wcag2aa" || t === "wcag21aa"),
		).length;
		const aaPasses = passes; // 보수적: 통과한 모든 룰을 AA 후보로 카운트.
		const wcag21AaCompliance =
			aaPasses + aaViolations === 0 ? 1 : aaPasses / (aaPasses + aaViolations);

		return {
			violations,
			passes,
			incomplete,
			inapplicable: 0,
			totalRules,
			wcag21AaCompliance,
			source: "cheerio-static",
			measuredAt: new Date().toISOString(),
		};
	}
}

function pushIf(
	violations: A11yViolation[],
	ruleId: string,
	affectedNodes: number,
): void {
	if (affectedNodes <= 0) return;
	const spec = RULE_SPECS[ruleId];
	if (!spec) return;
	violations.push({
		ruleId: spec.ruleId,
		impact: spec.impact,
		description: spec.description,
		helpUrl: helpUrl(spec.ruleId),
		affectedNodes,
		wcagTags: spec.wcagTags,
	});
}
