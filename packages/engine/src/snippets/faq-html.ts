/**
 * X-SAG Core Engine — FAQ HTML 섹션 Snippet Generator
 *
 * TASK-CORE-009: 마이크로데이터 포함 FAQ HTML 섹션
 * TRD § 10.9
 * POLICY § 7.1: 규칙 기반, 결정적 출력, aiGenerated=false
 */

import type { SnippetInput, SnippetOutput } from "./types.js";

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function faqHtml(input: SnippetInput): SnippetOutput {
	const faqs = input.faqs ?? [];
	const p = input.businessProfile;

	const items =
		faqs.length > 0
			? faqs
					.map(
						(faq) =>
							`  <div itemprop="mainEntity" itemscope itemtype="https://schema.org/Question">
    <h3 itemprop="name">${escapeHtml(faq.question)}</h3>
    <div itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer">
      <p itemprop="text">${escapeHtml(faq.answer)}</p>
    </div>
  </div>`,
					)
					.join("\n")
			: "  <!-- FAQ 항목이 없습니다. faqs 배열에 질문/답변을 추가하세요. -->";

	const code = `<section itemscope itemtype="https://schema.org/FAQPage" aria-label="${escapeHtml(p.businessName)} 자주 묻는 질문">
  <h2>자주 묻는 질문 (FAQ)</h2>
${items}
</section>`;

	return {
		type: "FAQ_HTML",
		format: "html",
		code,
		installGuide:
			"위 HTML 코드를 FAQ 콘텐츠가 있는 페이지의 `<body>` 안 적절한 위치에 추가합니다. JSON-LD FAQ 스키마와 함께 사용하면 효과가 더 좋습니다.",
		installLocation: "body",
		vendorInstruction:
			"홈페이지 업체에 다음 HTML 코드를 FAQ 섹션이 있는 페이지 본문(body) 안에 삽입해달라고 요청하세요.",
		verifyMethod:
			"Schema.org Validator (https://validator.schema.org) 에서 페이지 URL을 입력하거나 HTML 코드를 붙여넣어 FAQPage 마이크로데이터가 인식되는지 확인하세요.",
		aiGenerated: false,
	};
}
