/**
 * X-SAG Core Engine — Snippet Generator Registry
 *
 * TASK-CORE-009: 7가지 스니펫 생성기 레지스트리 및 공개 API
 * TRD § 10.9
 */

import type { SnippetType } from "@boina/contracts/enums";
import { breadcrumb } from "./breadcrumb.js";
import { faqHtml } from "./faq-html.js";
import { faqSchema } from "./faq-schema.js";
import { llmsTxt } from "./llms-txt.js";
import { localBusiness } from "./local-business.js";
import { organization } from "./organization.js";
import { service } from "./service.js";

export type { SnippetInput, SnippetOutput, SnippetGenerator } from "./types.js";

// ---------------------------------------------------------------------------
// SNIPPET_GENERATORS — SnippetType → Generator 매핑
// ---------------------------------------------------------------------------

export const SNIPPET_GENERATORS: Record<
	SnippetType,
	(
		input: import("./types.js").SnippetInput,
	) => import("./types.js").SnippetOutput
> = {
	LOCAL_BUSINESS: localBusiness,
	ORGANIZATION: organization,
	SERVICE: service,
	FAQ_SCHEMA: faqSchema,
	BREADCRUMB: breadcrumb,
	LLMS_TXT: llmsTxt,
	FAQ_HTML: faqHtml,
};

// ---------------------------------------------------------------------------
// generateSnippet — 단일 스니펫 생성
// ---------------------------------------------------------------------------

export function generateSnippet(
	type: SnippetType,
	input: import("./types.js").SnippetInput,
): import("./types.js").SnippetOutput {
	const gen = SNIPPET_GENERATORS[type];
	if (!gen) throw new Error(`Unknown snippet type: ${type}`);
	return gen(input);
}

// ---------------------------------------------------------------------------
// generateMany — 복수 스니펫 생성
// ---------------------------------------------------------------------------

export function generateMany(
	types: SnippetType[],
	input: import("./types.js").SnippetInput,
): import("./types.js").SnippetOutput[] {
	return types.map((t) => generateSnippet(t, input));
}
