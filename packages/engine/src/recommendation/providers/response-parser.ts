import type { RecommendationInput } from "../types.js";

export interface ParsedRecommendationResponse {
	body: string;
	examples: string[];
}

interface ParseOptions {
	allowPlainTextFallback?: boolean;
}

export function parseRecommendationResponse(
	text: string,
	input: RecommendationInput,
	options: ParseOptions = {},
): ParsedRecommendationResponse {
	const parsed = parseJsonPayload(text);
	if (parsed) {
		return toRecommendation(parsed, input);
	}

	if (options.allowPlainTextFallback) {
		const trimmed = text.trim();
		if (trimmed.length > 0) {
			return { body: trimmed.slice(0, 500), examples: [] };
		}
	}

	return fallbackRecommendation(input);
}

function parseJsonPayload(text: string): unknown | null {
	for (const candidate of jsonCandidates(text)) {
		try {
			return JSON.parse(candidate);
		} catch {
			// Try the next candidate.
		}
	}
	return null;
}

function jsonCandidates(text: string): string[] {
	const trimmed = text.trim();
	const candidates: string[] = [];
	if (trimmed.length > 0) {
		candidates.push(trimmed);
	}

	const fence = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
	if (fence?.[1]) {
		candidates.push(fence[1]);
	}

	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start >= 0 && end > start) {
		candidates.push(trimmed.slice(start, end + 1));
	}

	return [...new Set(candidates)];
}

function toRecommendation(
	value: unknown,
	input: RecommendationInput,
): ParsedRecommendationResponse {
	if (typeof value !== "object" || value === null) {
		return fallbackRecommendation(input);
	}

	const payload = value as { body?: unknown; examples?: unknown };
	const body =
		typeof payload.body === "string" && payload.body.trim().length > 0
			? payload.body
			: fallbackBody(input);
	const examples = Array.isArray(payload.examples)
		? payload.examples
				.filter((example): example is string => typeof example === "string")
				.slice(0, 3)
		: [];
	return { body, examples };
}

function fallbackRecommendation(
	input: RecommendationInput,
): ParsedRecommendationResponse {
	return { body: fallbackBody(input), examples: [] };
}

function fallbackBody(input: RecommendationInput): string {
	return input.item.recommendationText ?? input.item.description;
}
