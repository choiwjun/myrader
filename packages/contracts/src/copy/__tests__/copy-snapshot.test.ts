/**
 * @TASK TASK-COPY-011 - copy regression snapshots
 * @SPEC docs/features/x-sag-diagnosis-engine/BACKLOG_FH_EXPANSION_DOCS.md#F.3.2
 */

import { describe, expect, it } from "vitest";
import { INDUSTRY_VOCAB } from "../industry-vocab.ko.js";
import { renderRuleCopy } from "../render.js";
import { RULE_COPY } from "../rule-copy.ko.js";

const industries = Object.keys(INDUSTRY_VOCAB).sort() as Array<
	keyof typeof INDUSTRY_VOCAB
>;

describe("copy regression snapshots", () => {
	it("snapshots all rendered copy slots for every registered industry", () => {
		const snapshot = Object.fromEntries(
			Object.keys(RULE_COPY)
				.sort()
				.map((ruleId) => [
					ruleId,
					Object.fromEntries(
						industries.map((industry) => {
							const rendered = renderRuleCopy(ruleId, industry);
							expect(rendered, `${ruleId}/${industry}`).not.toBeNull();
							return [
								industry,
								{
									priority: rendered?.priority,
									templateVersion: rendered?.templateVersion,
									fallbackToGeneral: rendered?.fallbackToGeneral,
									slots: rendered?.rendered,
								},
							];
						}),
					),
				]),
		);

		expect(snapshot).toMatchSnapshot();
	});
});
