/**
 * X-SAG Core Engine — Service JSON-LD Snippet Generator
 *
 * TASK-CORE-009: schema.org Service / ItemList 구조화 데이터
 * 각 mainService 마다 Service 항목 생성 → ItemList 로 묶음
 * TRD § 10.9
 * POLICY § 7.1: 규칙 기반, 결정적 출력, aiGenerated=false
 */

import type { SnippetInput, SnippetOutput } from "./types.js";

export function service(input: SnippetInput): SnippetOutput {
	const p = input.businessProfile;
	const services = p.mainServices ?? [];

	let schema: Record<string, unknown>;

	if (services.length === 0) {
		// 빈 services 처리: 빈 ItemList
		schema = {
			"@context": "https://schema.org",
			"@type": "ItemList",
			name: `${p.businessName} 서비스 목록`,
			itemListElement: [],
		};
	} else if (services.length === 1) {
		// 단일 서비스: Service 타입으로 직접 출력
		schema = {
			"@context": "https://schema.org",
			"@type": "Service",
			name: services[0],
			provider: {
				"@type": "LocalBusiness",
				name: p.businessName,
				url: p.websiteUrl,
				areaServed: p.region,
			},
			areaServed: p.region,
			url: p.websiteUrl,
		};
	} else {
		// 복수 서비스: ItemList
		const itemListElement = services.map((svcName, idx) => ({
			"@type": "ListItem",
			position: idx + 1,
			item: {
				"@type": "Service",
				name: svcName,
				provider: {
					"@type": "LocalBusiness",
					name: p.businessName,
					url: p.websiteUrl,
					areaServed: p.region,
				},
				areaServed: p.region,
				url: p.websiteUrl,
			},
		}));

		schema = {
			"@context": "https://schema.org",
			"@type": "ItemList",
			name: `${p.businessName} 서비스 목록`,
			itemListElement,
		};
	}

	const code = `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;

	return {
		type: "SERVICE",
		format: "json-ld",
		code,
		installGuide:
			"이 코드를 홈페이지 `<head>` 태그 안에 추가합니다. 제공하는 서비스 정보를 검색엔진에 명확히 전달합니다.",
		installLocation: "head",
		vendorInstruction:
			"홈페이지 업체에 다음 코드를 `<head>` 안에 삽입해달라고 요청하세요. 서비스 목록 페이지나 메인 페이지에 적용하세요.",
		verifyMethod:
			"Google Rich Results Test (https://search.google.com/test/rich-results) 또는 Schema.org Validator (https://validator.schema.org) 에서 Service/ItemList 항목이 인식되는지 확인하세요.",
		aiGenerated: false,
	};
}
