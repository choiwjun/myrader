/**
 * X-SAG Core Engine — LocalBusiness JSON-LD Snippet Generator
 *
 * TASK-CORE-009: schema.org LocalBusiness 구조화 데이터
 * TRD § 10.9
 * POLICY § 7.1: 규칙 기반, 결정적 출력, aiGenerated=false
 */

import type { SnippetInput, SnippetOutput } from "./types.js";

export function localBusiness(input: SnippetInput): SnippetOutput {
	const p = input.businessProfile;

	// Build openingHours array (schema.org format: "Mo-Fr 09:00-18:00")
	const openingHours: string[] = [];
	if (p.operatingHours && p.operatingHours.length > 0) {
		for (const oh of p.operatingHours) {
			openingHours.push(`${oh.day} ${oh.open}-${oh.close}`);
		}
	}

	const schema: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "LocalBusiness",
		name: p.businessName,
		address: {
			"@type": "PostalAddress",
			addressCountry: "KR",
			addressRegion: p.region,
			streetAddress: p.address ?? "",
		},
		url: p.websiteUrl,
		...(p.phone ? { telephone: p.phone } : {}),
		...(p.email ? { email: p.email } : {}),
		...(openingHours.length > 0 ? { openingHours } : {}),
		areaServed: p.region,
		priceRange: "₩₩",
	};

	const code = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;

	return {
		type: "LOCAL_BUSINESS",
		format: "json-ld",
		code,
		installGuide:
			"이 코드를 홈페이지 `<head>` 태그 안에 추가합니다. 모든 페이지에 적용하거나, 업체 정보가 잘 드러나는 메인 페이지에 우선 적용하세요.",
		installLocation: "head",
		vendorInstruction:
			"홈페이지 업체에 다음 코드를 `<head>` 안에 삽입해달라고 요청하세요. 코드 위치는 </head> 태그 바로 앞이 좋습니다.",
		verifyMethod:
			"Google Rich Results Test (https://search.google.com/test/rich-results) 에서 페이지 URL을 입력해 LocalBusiness 구조화 데이터가 인식되는지 확인하세요.",
		aiGenerated: false,
	};
}
