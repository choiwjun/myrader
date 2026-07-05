/**
 * X-SAG Core Engine — BreadcrumbList JSON-LD Snippet Generator
 *
 * TASK-CORE-009: schema.org BreadcrumbList 구조화 데이터
 * TRD § 10.9
 * POLICY § 7.1: 규칙 기반, 결정적 출력, aiGenerated=false
 */

import type { SnippetInput, SnippetOutput } from "./types.js";

export function breadcrumb(input: SnippetInput): SnippetOutput {
	const breadcrumbs = input.breadcrumbs ?? [];
	const p = input.businessProfile;

	// 빵 부스러기가 없으면 기본 홈 → 업체명 구조 제공
	const items =
		breadcrumbs.length > 0
			? breadcrumbs
			: [
					{ name: "홈", url: p.websiteUrl },
					{ name: p.businessName, url: p.websiteUrl },
				];

	const itemListElement = items.map((item, idx) => ({
		"@type": "ListItem",
		position: idx + 1,
		name: item.name,
		item: item.url,
	}));

	const schema: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement,
	};

	const code = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;

	return {
		type: "BREADCRUMB",
		format: "json-ld",
		code,
		installGuide:
			"이 코드를 각 페이지의 `<head>` 태그 안에 추가합니다. 브레드크럼은 Google 검색 결과 URL 위에 탐색 경로로 표시될 수 있습니다.",
		installLocation: "head",
		vendorInstruction:
			"홈페이지 업체에 다음 코드를 각 페이지 `<head>` 안에 삽입해달라고 요청하세요. 페이지별로 breadcrumb 경로를 맞게 수정해야 합니다.",
		verifyMethod:
			"Google Rich Results Test (https://search.google.com/test/rich-results) 에서 페이지 URL을 입력해 BreadcrumbList가 인식되는지 확인하세요.",
		aiGenerated: false,
	};
}
