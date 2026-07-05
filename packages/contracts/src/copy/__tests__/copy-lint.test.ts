/**
 * @TASK TASK-COPY-011 — copy QA lint gate
 * @SPEC docs/features/x-sag-diagnosis-engine/BACKLOG_FH_EXPANSION_DOCS.md#F.3.2
 */

import { describe, expect, it } from "vitest";
import { INDUSTRY_VOCAB } from "../industry-vocab.ko.js";
import { renderRuleCopy } from "../render.js";
import { RULE_COPY } from "../rule-copy.ko.js";

const SLOT_KEYS = [
	"title",
	"harm",
	"action_self",
	"action_pro",
	"cta",
] as const;
const INDUSTRIES = Object.keys(INDUSTRY_VOCAB) as Array<
	keyof typeof INDUSTRY_VOCAB
>;
const FORBIDDEN_ARTIFACTS = [
	"TODO",
	"FIXME",
	"Lorem",
	"lorem",
	"undefined",
	"null",
	"[",
	"]",
];

describe("copy lint gate", () => {
	it("all registered copy renders without unresolved template variables", () => {
		for (const ruleId of Object.keys(RULE_COPY)) {
			for (const industry of INDUSTRIES) {
				const rendered = renderRuleCopy(ruleId, industry);

				expect(rendered, `${ruleId}/${industry}`).not.toBeNull();
				expect(rendered?.unrenderedVars, `${ruleId}/${industry}`).toEqual([]);
			}
		}
	});

	it("all slots are free of common placeholder/debug artifacts", () => {
		for (const [ruleId, template] of Object.entries(RULE_COPY)) {
			for (const slot of SLOT_KEYS) {
				const text = template.slots[slot];
				for (const artifact of FORBIDDEN_ARTIFACTS) {
					expect(
						text,
						`${ruleId}.${slot} contains forbidden artifact ${artifact}`,
					).not.toContain(artifact);
				}
			}
		}
	});

	it("cta stays short enough for compact action buttons", () => {
		for (const [ruleId, template] of Object.entries(RULE_COPY)) {
			expect(template.slots.cta.length, `${ruleId}.cta`).toBeLessThanOrEqual(8);
		}
	});
});
