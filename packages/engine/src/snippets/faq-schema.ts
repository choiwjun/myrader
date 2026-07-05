/**
 * X-SAG Core Engine — FAQPage JSON-LD Snippet Generator
 *
 * TASK-CORE-009: schema.org FAQPage 구조화 데이터
 * TRD § 10.9
 * POLICY § 7.1: 규칙 기반, 결정적 출력, aiGenerated=false
 */

import type { SnippetInput, SnippetOutput } from "./types.js";

export function faqSchema(input: SnippetInput): SnippetOutput {
	const faqs = input.faqs ?? [];

	const mainEntity = faqs.map((faq) => ({
		"@type": "Question",
		name: faq.question,
		acceptedAnswer: {
			"@type": "Answer",
			text: faq.answer,
		},
	}));

	const schema: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity,
	};

	const code = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;

	return {
		type: "FAQ_SCHEMA",
		format: "json-ld",
		code,
		installGuide:
			"이 코드를 FAQ가 있는 페이지의 `<head>` 태그 안에 추가합니다. Google 검색 결과에서 FAQ 리치 스니펫으로 노출될 수 있습니다.",
		installLocation: "head",
		vendorInstruction:
			"홈페이지 업체에 다음 코드를 FAQ 페이지의 `<head>` 안에 삽입해달라고 요청하세요.",
		verifyMethod:
			"Google Rich Results Test (https://search.google.com/test/rich-results) 에서 FAQ 페이지 URL을 입력해 FAQ 리치 결과가 인식되는지 확인하세요.",
		aiGenerated: false,
	};
}
