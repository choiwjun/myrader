import { isChatMockAvailableByEnv } from "../../v2/llm-provider/index.js";
import type {
	RecommendationInput,
	RecommendationOutput,
	RecommendationProvider,
} from "../types.js";
import {
	RECOMMENDATION_JSON_SYSTEM_PROMPT,
	RECOMMENDATION_SYSTEM_PROMPT,
	buildRecommendationPrompt,
} from "./prompt.js";
import { parseRecommendationResponse } from "./response-parser.js";

const DEFAULT_BASE_URL = "http://localhost:8000/v1";
const DEFAULT_API_KEY = "chatmock-local";
const DEFAULT_MODEL = "gpt-4o";
const TIMEOUT_MS = 30_000;

export class ChatMockProvider implements RecommendationProvider {
	readonly name = "chatmock" as const;

	isAvailable(): boolean {
		// 라우터의 단일 헬퍼를 공유 (복제 버그 방지, B1 3-state)
		return isChatMockAvailableByEnv();
	}

	async generate(input: RecommendationInput): Promise<RecommendationOutput> {
		const baseUrl = (process.env.CHATMOCK_BASE_URL ?? DEFAULT_BASE_URL).replace(
			/\/$/,
			"",
		);
		const apiKey = process.env.CHATMOCK_API_KEY ?? DEFAULT_API_KEY;
		const model = process.env.CHATMOCK_MODEL ?? DEFAULT_MODEL;
		const prompt = buildRecommendationPrompt(input);

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		let responseText = "";

		try {
			let res = await fetch(`${baseUrl}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model,
					messages: [
						{
							role: "system",
							content: RECOMMENDATION_JSON_SYSTEM_PROMPT,
						},
						{ role: "user", content: prompt },
					],
					max_tokens: 500,
					temperature: 0.3,
					response_format: { type: "json_object" },
				}),
				signal: controller.signal,
			});

			if (!res.ok && (res.status === 400 || res.status === 422)) {
				res = await fetch(`${baseUrl}/chat/completions`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`,
					},
					body: JSON.stringify({
						model,
						messages: [
							{
								role: "system",
								content: `${RECOMMENDATION_SYSTEM_PROMPT} Respond with JSON only.`,
							},
							{ role: "user", content: prompt },
						],
						max_tokens: 500,
						temperature: 0.3,
					}),
					signal: controller.signal,
				});
			}

			if (!res.ok) {
				const err = await res.text().catch(() => res.statusText);
				throw new Error(`ChatMock API error ${res.status}: ${err}`);
			}

			const data = (await res.json()) as ChatMockResponse;
			responseText = data.choices?.[0]?.message?.content ?? "";
		} finally {
			clearTimeout(timer);
		}

		const parsed = parseRecommendationResponse(responseText, input, {
			allowPlainTextFallback: true,
		});

		return {
			body: parsed.body,
			examples: parsed.examples,
			aiGenerated: true,
			provider: "chatmock",
			model,
			costUsd: 0,
		};
	}
}

interface ChatMockResponse {
	choices?: Array<{
		message?: { content?: string };
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
	};
}
