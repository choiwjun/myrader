import type { RecommendationInput } from "../types.js";

export const RECOMMENDATION_SYSTEM_PROMPT =
	"You are a Korean SEO/AEO/GEO specialist. Provide concise, practical improvement recommendations in Korean for small business websites.";

export const RECOMMENDATION_JSON_SYSTEM_PROMPT = `${RECOMMENDATION_SYSTEM_PROMPT} Always respond with strict JSON: {"body": string, "examples": string[]}`;

export function buildRecommendationPrompt(input: RecommendationInput): string {
	const { item, context } = input;
	return `업체 정보:
- 업체명: ${context.businessName}
- 업종: ${context.industry}
- 지역: ${context.region}
- 주요 서비스: ${context.mainServices.join(", ")}

진단 항목:
- 코드: ${item.code}
- 제목: ${item.title}
- 설명: ${item.description}
- 예상 효과: ${item.expectedEffect}

이 업체에 맞는 구체적인 개선 방법을 JSON 형식으로 작성하세요.
{
  "body": "개선 설명 (2-3 문장, 업체명과 업종 반영)",
  "examples": ["예시 1", "예시 2"]
}`;
}
