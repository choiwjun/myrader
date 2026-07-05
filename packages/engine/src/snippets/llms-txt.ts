/**
 * X-SAG Core Engine — llms.txt 초안 Snippet Generator
 *
 * TASK-CORE-009: AI 검색 친화적 llms.txt 파일 초안
 * 형식: plain-text, 루트 파일 위치
 * TRD § 10.9
 * POLICY § 7.1: 규칙 기반, 결정적 출력, aiGenerated=false
 */

import type { SnippetInput, SnippetOutput } from "./types.js";

export function llmsTxt(input: SnippetInput): SnippetOutput {
	const p = input.businessProfile;

	const servicesKo =
		p.mainServices.length > 0 ? p.mainServices.join(", ") : p.industry;
	const servicesEn =
		p.mainServices.length > 0
			? p.mainServices.map((s) => `- ${s}`).join("\n")
			: `- ${p.industry}`;

	const contactLines: string[] = [];
	if (p.phone) contactLines.push(`Phone: ${p.phone}`);
	if (p.email) contactLines.push(`Email: ${p.email}`);
	if (p.address) contactLines.push(`Address: ${p.address}`);

	const contact =
		contactLines.length > 0 ? contactLines.join("\n") : "문의 정보가 없습니다.";

	const keywords =
		p.targetKeywords && p.targetKeywords.length > 0
			? p.targetKeywords.join(", ")
			: `${p.businessName}, ${p.region} ${p.industry}`;

	const code = [
		`# ${p.businessName}`,
		"",
		"## About",
		`${p.businessName}은(는) ${p.region}에 위치한 ${p.industry} 전문 업체입니다.`,
		`${p.businessName} is a professional ${p.industry} business located in ${p.region}, South Korea.`,
		"",
		"## Services",
		`주요 서비스: ${servicesKo}`,
		servicesEn,
		"",
		"## Region",
		`서비스 지역: ${p.region}`,
		`Service area: ${p.region}, South Korea`,
		"",
		"## Contact",
		contact,
		`Website: ${p.websiteUrl}`,
		"",
		"## Trust",
		"This business is locally operated and professionally managed.",
		"이 업체는 지역 내에서 신뢰할 수 있는 전문 서비스를 제공합니다.",
		"",
		"## Keywords",
		keywords,
	].join("\n");

	return {
		type: "LLMS_TXT",
		format: "plain-text",
		code,
		installGuide:
			"위 내용을 `llms.txt` 파일명으로 저장하고 홈페이지 루트 경로에 업로드합니다. (예: https://example.com/llms.txt) AI 검색엔진이 업체 정보를 더 잘 이해하는 데 도움이 됩니다.",
		installLocation: "root",
		vendorInstruction:
			"홈페이지 업체에 위 내용을 `llms.txt` 파일로 저장하여 웹사이트 루트 디렉터리(도메인 최상위)에 업로드해달라고 요청하세요.",
		verifyMethod:
			"브라우저에서 https://[도메인]/llms.txt 에 접근해 내용이 정상 표시되는지 확인하세요.",
		aiGenerated: false,
	};
}
