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

const MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 15_000;
// 토큰 단가는 cost-table.ts(COST_PER_1K_TOKENS_USD)를 단일 진실 소스로 사용한다(GAP4-①).

export class OpenAIProvider implements RecommendationProvider {
	readonly name = "openai" as const;

	isAvailable(): boolean {
		return Boolean(process.env.OPENAI_API_KEY);
	}

	async generate(input: RecommendationInput): Promise<RecommendationOutput> {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			throw new Error("OPENAI_API_KEY not set");
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		let responseText = "";
		let inputTokens = 0;
		let outputTokens = 0;

		try {
			const res = await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: MODEL,
					messages: [
						{
							role: "system",
							content: RECOMMENDATION_SYSTEM_PROMPT,
						},
						{ role: "user", content: buildRecommendationPrompt(input) },
					],
					max_tokens: 500,
					temperature: 0.3,
					response_format: { type: "json_object" },
				}),
				signal: controller.signal,
			});

			if (!res.ok) {
				const err = await res.text().catch(() => res.statusText);
				throw new Error(`OpenAI API error ${res.status}: ${err}`);
			}

			const data = (await res.json()) as OpenAIChatResponse;
			responseText = data.choices[0]?.message?.content ?? "";
			inputTokens = data.usage?.prompt_tokens ?? 0;
			outputTokens = data.usage?.completion_tokens ?? 0;
		} finally {
			clearTimeout(timer);
		}

		const parsed = parseRecommendationResponse(responseText, input);
		const costUsd = estimateCostUsd(MODEL, inputTokens, outputTokens);

		return {
			body: parsed.body,
			examples: parsed.examples,
			aiGenerated: true,
			provider: "openai",
			model: MODEL,
			costUsd,
		};
	}
}

interface OpenAIChatResponse {
	choices: Array<{
		message: { content: string };
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
	};
}
