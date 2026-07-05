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

const MODEL = "claude-sonnet-4-6";
const TIMEOUT_MS = 15_000;
// 토큰 단가는 cost-table.ts(COST_PER_1K_TOKENS_USD)를 단일 진실 소스로 사용한다(GAP4-①).

export class AnthropicProvider implements RecommendationProvider {
	readonly name = "anthropic" as const;

	isAvailable(): boolean {
		return Boolean(process.env.ANTHROPIC_API_KEY);
	}

	async generate(input: RecommendationInput): Promise<RecommendationOutput> {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			throw new Error("ANTHROPIC_API_KEY not set");
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		let responseText = "";
		let inputTokens = 0;
		let outputTokens = 0;

		try {
			const res = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: MODEL,
					max_tokens: 500,
					system: `${RECOMMENDATION_SYSTEM_PROMPT} Always respond in valid JSON.`,
					messages: [
						{ role: "user", content: buildRecommendationPrompt(input) },
					],
				}),
				signal: controller.signal,
			});

			if (!res.ok) {
				const err = await res.text().catch(() => res.statusText);
				throw new Error(`Anthropic API error ${res.status}: ${err}`);
			}

			const data = (await res.json()) as AnthropicResponse;
			responseText = data.content?.[0]?.text ?? "";
			inputTokens = data.usage?.input_tokens ?? 0;
			outputTokens = data.usage?.output_tokens ?? 0;
		} finally {
			clearTimeout(timer);
		}

		const parsed = parseRecommendationResponse(responseText, input);
		const costUsd = estimateCostUsd(MODEL, inputTokens, outputTokens);

		return {
			body: parsed.body,
			examples: parsed.examples,
			aiGenerated: true,
			provider: "anthropic",
			model: MODEL,
			costUsd,
		};
	}
}

interface AnthropicResponse {
	content?: Array<{ type?: string; text?: string }>;
	usage?: {
		input_tokens: number;
		output_tokens: number;
	};
}
