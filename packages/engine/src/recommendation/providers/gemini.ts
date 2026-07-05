import type {
	RecommendationInput,
	RecommendationOutput,
	RecommendationProvider,
} from "../types.js";
import { estimateCostUsd } from "../cost-table.js";
import {
	RECOMMENDATION_SYSTEM_PROMPT,
	buildRecommendationPrompt,
} from "./prompt.js";
import { parseRecommendationResponse } from "./response-parser.js";

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 15_000;
// 토큰 단가는 cost-table.ts(COST_PER_1K_TOKENS_USD)를 단일 진실 소스로 사용한다.
// 이전에 이 파일에 하드코딩된 값(0.00007/0.00021)은 cost-table(0.000075/0.0003)과
// 드리프트되어 있었다(GAP4-① 수정).

export class GeminiProvider implements RecommendationProvider {
	readonly name = "gemini" as const;

	isAvailable(): boolean {
		return Boolean(getGeminiApiKey());
	}

	async generate(input: RecommendationInput): Promise<RecommendationOutput> {
		const apiKey = getGeminiApiKey();
		if (!apiKey) {
			throw new Error("GEMINI_API_KEY not set");
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		let responseText = "";
		let inputTokens = 0;
		let outputTokens = 0;

		try {
			const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contents: [{ parts: [{ text: buildRecommendationPrompt(input) }] }],
					generationConfig: {
						maxOutputTokens: 500,
						temperature: 0.3,
						responseMimeType: "application/json",
					},
					systemInstruction: {
						parts: [{ text: RECOMMENDATION_SYSTEM_PROMPT }],
					},
				}),
				signal: controller.signal,
			});

			if (!res.ok) {
				const err = await res.text().catch(() => res.statusText);
				throw new Error(`Gemini API error ${res.status}: ${err}`);
			}

			const data = (await res.json()) as GeminiResponse;
			responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
			inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
			outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
		} finally {
			clearTimeout(timer);
		}

		const parsed = parseRecommendationResponse(responseText, input);
		const costUsd = estimateCostUsd(MODEL, inputTokens, outputTokens);

		return {
			body: parsed.body,
			examples: parsed.examples,
			aiGenerated: true,
			provider: "gemini",
			model: MODEL,
			costUsd,
		};
	}
}

function getGeminiApiKey(): string | undefined {
	return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
}

interface GeminiResponse {
	candidates?: Array<{
		content?: {
			parts?: Array<{ text?: string }>;
		};
	}>;
	usageMetadata?: {
		promptTokenCount?: number;
		candidatesTokenCount?: number;
	};
}
