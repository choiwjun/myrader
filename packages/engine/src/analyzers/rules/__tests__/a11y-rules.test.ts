/**
 * Phase R-D — a11y-rules tests
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { A11yResult, A11yViolation } from "../../../v2/a11y/types.js";
import type { RuleContext } from "../../types.js";
import {
	a11yAriaValid001,
	a11yAutoplay001,
	a11yButtonName001,
	a11yColorContrast001,
	a11yDocLang001,
	a11yDocTitle001,
	a11yFocusOrder001,
	a11yFocusVisible001,
	a11yFormLabel001,
	a11yHeadingOrder001,
	a11yImageAlt001,
	a11yLandmark001,
	a11yLinkName001,
	a11yList001,
	a11yTabindex001,
} from "../a11y-rules.js";

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://example.co.kr/",
		statusCode: 200,
		title: "테스트",
		description: "테스트 설명",
		h1: "테스트",
		h2: [],
		meta: {},
		bodyText: "",
		wordCount: 100,
		internalLinks: [],
		externalLinks: [],
		images: [],
		schemaJsonLd: [],
		hasFAQ: false,
		hasSchema: false,
		canonicalUrl: null,
		robotsMeta: null,
		...overrides,
	};
}

function viol(
	ruleId: string,
	affectedNodes = 1,
	wcagTags: string[] = ["wcag2a"],
): A11yViolation {
	return {
		ruleId,
		impact: "serious",
		description: ruleId,
		helpUrl: `https://dequeuniversity.com/rules/axe/4.10/${ruleId}`,
		affectedNodes,
		wcagTags,
	};
}

function makeA11y(violations: A11yViolation[] = []): A11yResult {
	return {
		violations,
		passes: 15 - violations.length,
		incomplete: 0,
		inapplicable: 0,
		totalRules: 15,
		wcag21AaCompliance: violations.length === 0 ? 1 : 0.5,
		source: "mock",
		measuredAt: "2026-01-01T00:00:00.000Z",
	};
}

function makeCtx(a11y?: A11yResult): RuleContext {
	const mainPage = makePage();
	return {
		pages: [mainPage],
		mainPage,
		businessProfile: {
			businessName: "테스트",
			industry: "테스트",
			region: "강남",
			mainServices: ["서비스1"],
			targetKeywords: ["k1"],
		},
		...(a11y ? { a11yResult: a11y } : {}),
	};
}

// ---------------------------------------------------------------------------
// 1. A11Y-COLOR-CONTRAST-001
// ---------------------------------------------------------------------------
describe("A11Y-COLOR-CONTRAST-001", () => {
	it("passes when no color-contrast violation", () => {
		const r = a11yColorContrast001(makeCtx(makeA11y()));
		expect(r.ruleId).toBe("A11Y-COLOR-CONTRAST-001");
		expect(r.category).toBe("a11y");
		expect(r.passed).toBe(true);
	});
	it("fails when color-contrast violation present", () => {
		const r = a11yColorContrast001(
			makeCtx(makeA11y([viol("color-contrast", 5)])),
		);
		expect(r.passed).toBe(false);
	});
	it("informational when no a11yResult", () => {
		expect(a11yColorContrast001(makeCtx()).passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 2. A11Y-IMAGE-ALT-001
// ---------------------------------------------------------------------------
describe("A11Y-IMAGE-ALT-001", () => {
	it("passes when no image-alt violation", () => {
		expect(a11yImageAlt001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when image-alt violation present", () => {
		expect(
			a11yImageAlt001(makeCtx(makeA11y([viol("image-alt", 3)]))).passed,
		).toBe(false);
	});
	it("informational when no a11yResult", () => {
		expect(a11yImageAlt001(makeCtx()).passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 3. A11Y-FORM-LABEL-001
// ---------------------------------------------------------------------------
describe("A11Y-FORM-LABEL-001", () => {
	it("passes when no label violation", () => {
		expect(a11yFormLabel001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when label violation present", () => {
		expect(a11yFormLabel001(makeCtx(makeA11y([viol("label", 2)]))).passed).toBe(
			false,
		);
	});
});

// ---------------------------------------------------------------------------
// 4. A11Y-BUTTON-NAME-001
// ---------------------------------------------------------------------------
describe("A11Y-BUTTON-NAME-001", () => {
	it("passes when no input-button-name/button-name violation", () => {
		expect(a11yButtonName001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when input-button-name violation present", () => {
		expect(
			a11yButtonName001(makeCtx(makeA11y([viol("input-button-name", 1)])))
				.passed,
		).toBe(false);
	});
	it("fails when button-name violation present", () => {
		expect(
			a11yButtonName001(makeCtx(makeA11y([viol("button-name", 1)]))).passed,
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 5. A11Y-LINK-NAME-001
// ---------------------------------------------------------------------------
describe("A11Y-LINK-NAME-001", () => {
	it("passes when no link-name violation", () => {
		expect(a11yLinkName001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when link-name violation present", () => {
		expect(
			a11yLinkName001(makeCtx(makeA11y([viol("link-name", 4)]))).passed,
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 6. A11Y-DOC-LANG-001
// ---------------------------------------------------------------------------
describe("A11Y-DOC-LANG-001", () => {
	it("passes when no html-has-lang/html-lang-valid violation", () => {
		expect(a11yDocLang001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when html-has-lang violation", () => {
		expect(
			a11yDocLang001(makeCtx(makeA11y([viol("html-has-lang")]))).passed,
		).toBe(false);
	});
	it("fails when html-lang-valid violation", () => {
		expect(
			a11yDocLang001(makeCtx(makeA11y([viol("html-lang-valid")]))).passed,
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 7. A11Y-DOC-TITLE-001
// ---------------------------------------------------------------------------
describe("A11Y-DOC-TITLE-001", () => {
	it("passes when no document-title violation", () => {
		expect(a11yDocTitle001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when document-title violation present", () => {
		expect(
			a11yDocTitle001(makeCtx(makeA11y([viol("document-title")]))).passed,
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 8. A11Y-HEADING-ORDER-001
// ---------------------------------------------------------------------------
describe("A11Y-HEADING-ORDER-001", () => {
	it("passes when no heading-order violation", () => {
		expect(a11yHeadingOrder001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when heading-order violation present", () => {
		expect(
			a11yHeadingOrder001(makeCtx(makeA11y([viol("heading-order", 2)]))).passed,
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 9. A11Y-LANDMARK-001
// ---------------------------------------------------------------------------
describe("A11Y-LANDMARK-001", () => {
	it("passes when no landmark-one-main violation", () => {
		expect(a11yLandmark001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when landmark-one-main violation present", () => {
		expect(
			a11yLandmark001(makeCtx(makeA11y([viol("landmark-one-main")]))).passed,
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 10. A11Y-FOCUS-VISIBLE-001
// ---------------------------------------------------------------------------
describe("A11Y-FOCUS-VISIBLE-001", () => {
	it("passes when no focus-order-semantics violation", () => {
		expect(a11yFocusVisible001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when focus-order-semantics violation present", () => {
		expect(
			a11yFocusVisible001(makeCtx(makeA11y([viol("focus-order-semantics")])))
				.passed,
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 11. A11Y-ARIA-VALID-001
// ---------------------------------------------------------------------------
describe("A11Y-ARIA-VALID-001", () => {
	it("passes when no aria-* violation", () => {
		expect(a11yAriaValid001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when aria-allowed-attr violation present", () => {
		expect(
			a11yAriaValid001(makeCtx(makeA11y([viol("aria-allowed-attr", 2)])))
				.passed,
		).toBe(false);
	});
	it("fails when aria-valid-attr violation present", () => {
		expect(
			a11yAriaValid001(makeCtx(makeA11y([viol("aria-valid-attr")]))).passed,
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 12. A11Y-LIST-001
// ---------------------------------------------------------------------------
describe("A11Y-LIST-001", () => {
	it("passes when no list violation", () => {
		expect(a11yList001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when list violation present", () => {
		expect(a11yList001(makeCtx(makeA11y([viol("list")]))).passed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 13. A11Y-TABINDEX-001
// ---------------------------------------------------------------------------
describe("A11Y-TABINDEX-001", () => {
	it("passes when no tabindex violation", () => {
		expect(a11yTabindex001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when tabindex violation present", () => {
		expect(a11yTabindex001(makeCtx(makeA11y([viol("tabindex")]))).passed).toBe(
			false,
		);
	});
});

// ---------------------------------------------------------------------------
// 14. A11Y-AUTOPLAY-001
// ---------------------------------------------------------------------------
describe("A11Y-AUTOPLAY-001", () => {
	it("passes when no autoplay violation", () => {
		expect(a11yAutoplay001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when autoplay violation present", () => {
		expect(a11yAutoplay001(makeCtx(makeA11y([viol("autoplay")]))).passed).toBe(
			false,
		);
	});
});

// ---------------------------------------------------------------------------
// 15. A11Y-FOCUS-ORDER-001
// ---------------------------------------------------------------------------
describe("A11Y-FOCUS-ORDER-001", () => {
	it("passes when no focusable-content violation", () => {
		expect(a11yFocusOrder001(makeCtx(makeA11y())).passed).toBe(true);
	});
	it("fails when focusable-content violation present", () => {
		expect(
			a11yFocusOrder001(makeCtx(makeA11y([viol("focusable-content")]))).passed,
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 통합: 카테고리 일관성
// ---------------------------------------------------------------------------
describe("A11Y rules — meta", () => {
	it("all rules return category='a11y'", () => {
		const ctx = makeCtx(makeA11y());
		const rules = [
			a11yColorContrast001,
			a11yImageAlt001,
			a11yFormLabel001,
			a11yButtonName001,
			a11yLinkName001,
			a11yDocLang001,
			a11yDocTitle001,
			a11yHeadingOrder001,
			a11yLandmark001,
			a11yFocusVisible001,
			a11yAriaValid001,
			a11yList001,
			a11yTabindex001,
			a11yAutoplay001,
			a11yFocusOrder001,
		];
		for (const r of rules) {
			expect(r(ctx).category).toBe("a11y");
		}
	});

	it("all rules are informational when a11yResult missing", () => {
		const ctx = makeCtx();
		const rules = [
			a11yColorContrast001,
			a11yImageAlt001,
			a11yFormLabel001,
			a11yButtonName001,
			a11yLinkName001,
			a11yDocLang001,
			a11yDocTitle001,
			a11yHeadingOrder001,
			a11yLandmark001,
			a11yFocusVisible001,
			a11yAriaValid001,
			a11yList001,
			a11yTabindex001,
			a11yAutoplay001,
			a11yFocusOrder001,
		];
		for (const r of rules) {
			const result = r(ctx);
			expect(result.passed).toBe(true);
			expect(result.evidence[0]).toMatch(/미제공/);
		}
	});
});
