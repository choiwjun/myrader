/**
 * X-SAG Core Engine — Organization JSON-LD Snippet Generator
 *
 * TASK-CORE-009: schema.org Organization 구조화 데이터
 * TRD § 10.9
 * POLICY § 7.1: 규칙 기반, 결정적 출력, aiGenerated=false
 */

import type { SnippetInput, SnippetOutput } from "./types.js";

export function organization(input: SnippetInput): SnippetOutput {
	const p = input.businessProfile;

	const schema: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: p.businessName,
		url: p.websiteUrl,
		logo: {
			"@type": "ImageObject",
			url: `${p.websiteUrl.replace(/\/$/, "")}/logo.png`,
		},
		// SNS 링크 입력이 없으므로 빈 배열
		sameAs: [],
		...(p.address
			? {
					address: {
						"@type": "PostalAddress",
						addressCountry: "KR",
						addressRegion: p.region,
						streetAddress: p.address,
					},
				}
			: {}),
		...(p.phone ? { telephone: p.phone } : {}),
		...(p.email ? { email: p.email } : {}),
		areaServed: p.region,
	};

	const code = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;

	return {
		type: "ORGANIZATION",
		format: "json-ld",
		code,
		installGuide:
			"이 코드를 홈페이지 `<head>` 태그 안에 추가합니다. 브랜드/회사 정보를 검색엔진이 인식하는 데 도움이 됩니다.",
		installLocation: "head",
		vendorInstruction:
			"홈페이지 업체에 다음 코드를 `<head>` 안에 삽입해달라고 요청하세요. 코드 위치는 </head> 태그 바로 앞이 좋습니다.",
		verifyMethod:
			"Google Rich Results Test (https://search.google.com/test/rich-results) 또는 Schema.org Validator (https://validator.schema.org) 에서 Organization 항목이 인식되는지 확인하세요.",
		aiGenerated: false,
	};
}
