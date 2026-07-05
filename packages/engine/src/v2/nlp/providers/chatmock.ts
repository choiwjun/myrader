/**
 * X-SAG Core Engine — ChatMock NLP Provider
 *
 * ChatMock(또는 OpenAI 호환 로컬 프록시)를 이용한 LLM 기반 NLP 분석.
 *
 * 활성화 조건 (둘 중 하나):
 * - CHATMOCK_ENABLED=true
 * - CHATMOCK_BASE_URL 명시적 설정
 *
 * 환경변수:
 * - CHATMOCK_BASE_URL (기본 http://localhost:8000/v1)
 * - CHATMOCK_API_KEY  (기본 "chatmock-local" — 더미)
 * - CHATMOCK_MODEL    (기본 "gpt-4o")
 *
 * POLICY § 7.1: NLP 결과는 정보 제공 용도 — rule 평가는 결정적.
 */

import { isChatMockAvailableByEnv } from "../../llm-provider/index.js";
import type {
	KeywordDensityItem,
	NlpEeat,
	NlpInput,
	NlpKeywordDensity,
	NlpProvider,
	NlpReadability,
	NlpResult,
	NlpSemanticRelevance,
	NlpTopic,
	TopNoun,
} from "../types.js";

const DEFAULT_BASE_URL = "http://localhost:8000/v1";
const DEFAULT_API_KEY = "chatmock-local";
const DEFAULT_MODEL = "gpt-4o";
const TIMEOUT_MS = 30_000;
const MAX_BODY_CHARS = 3000;

export class ChatMockNlpProvider implements NlpProvider {
	readonly name = "chatmock" as const;

	isAvailable(): boolean {
		// 라우터의 단일 헬퍼를 공유 (복제 버그 방지, B1 3-state)
		return isChatMockAvailableByEnv();
	}

	async analyze(input: NlpInput): Promise<NlpResult> {
		const baseUrl = (process.env.CHATMOCK_BASE_URL ?? DEFAULT_BASE_URL).replace(
			/\/$/,
			"",
		);
		const apiKey = process.env.CHATMOCK_API_KEY ?? DEFAULT_API_KEY;
		const model = process.env.CHATMOCK_MODEL ?? DEFAULT_MODEL;

		const prompt = buildNlpPrompt(input);

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

		let responseText = "";

		try {
			// 1차: JSON mode
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
							content:
								"You are a Korean NLP/SEO content analyst. Analyze Korean webpage content and return strict JSON with keywordDensity, topics, readability, eeat, semanticRelevance fields.",
						},
						{ role: "user", content: prompt },
					],
					max_tokens: 1200,
					temperature: 0.2,
					response_format: { type: "json_object" },
				}),
				signal: controller.signal,
			});

			// JSON mode 미지원 시 폴백
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
								content:
									"You are a Korean NLP/SEO content analyst. Respond with JSON only — no other text.",
							},
							{ role: "user", content: prompt },
						],
						max_tokens: 1200,
						temperature: 0.2,
					}),
					signal: controller.signal,
				});
			}

			if (!res.ok) {
				const err = await res.text().catch(() => res.statusText);
				throw new Error(`ChatMock NLP API error ${res.status}: ${err}`);
			}

			const data = (await res.json()) as ChatMockResponse;
			responseText = data.choices?.[0]?.message?.content ?? "";
		} finally {
			clearTimeout(timer);
		}

		const parsed = parseNlpResponse(responseText, input);
		return {
			...parsed,
			source: "chatmock",
			analyzedAt: new Date().toISOString(),
		};
	}
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildNlpPrompt(input: NlpInput): string {
	const body = input.bodyText.slice(0, MAX_BODY_CHARS);
	return `다음 한국어 웹페이지 콘텐츠를 분석하라.

URL: ${input.url}
업종: ${input.industry}
지역: ${input.region}
목표 키워드: ${input.targetKeywords.join(", ") || "(없음)"}

제목: ${input.title ?? "(없음)"}
설명: ${input.description ?? "(없음)"}
H1: ${input.h1 ?? "(없음)"}
H2: ${input.h2.slice(0, 5).join(" | ") || "(없음)"}

본문 (앞 ${MAX_BODY_CHARS}자):
${body}

JSON으로 응답하라:
{
  "keywordDensity": {
    "targetKeywords": [{ "keyword": "...", "count": N, "density": 0.0~1.0 }],
    "topNouns": [{ "word": "...", "count": N }]
  },
  "topics": [{ "topic": "...", "relevance": 0.0~1.0 }],
  "readability": {
    "avgSentenceLength": N,
    "avgParagraphLength": N,
    "score": 0~100
  },
  "eeat": {
    "hasAuthor": true|false,
    "hasExpertiseSignals": N,
    "hasTrustSignals": N,
    "hasFreshness": true|false,
    "score": 0~100
  },
  "semanticRelevance": {
    "titleBodyAlignment": 0.0~1.0,
    "keywordIntegration": 0.0~1.0
  }
}

응답은 JSON만, 다른 텍스트 없음.`;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

interface ParsedNlp {
	keywordDensity: NlpKeywordDensity;
	topics: NlpTopic[];
	readability: NlpReadability;
	eeat: NlpEeat;
	semanticRelevance: NlpSemanticRelevance;
}

export function parseNlpResponse(text: string, input: NlpInput): ParsedNlp {
	const json = tryParseJson(text);
	if (!json) {
		return emptyResult(input);
	}
	return {
		keywordDensity: parseKeywordDensity(json.keywordDensity, input),
		topics: parseTopics(json.topics),
		readability: parseReadability(json.readability),
		eeat: parseEeat(json.eeat),
		semanticRelevance: parseSemanticRelevance(json.semanticRelevance),
	};
}

function tryParseJson(text: string): Record<string, unknown> | null {
	if (!text || text.trim().length === 0) return null;

	// 1차: 순수 JSON
	try {
		const obj = JSON.parse(text);
		if (obj && typeof obj === "object") return obj as Record<string, unknown>;
	} catch {
		// fallback
	}

	// 2차: 코드 블록 또는 첫 {} 추출
	const fence = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/u);
	if (fence?.[1]) {
		try {
			return JSON.parse(fence[1]) as Record<string, unknown>;
		} catch {
			// continue
		}
	}
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start >= 0 && end > start) {
		try {
			return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
		} catch {
			return null;
		}
	}
	return null;
}

function parseKeywordDensity(raw: unknown, input: NlpInput): NlpKeywordDensity {
	const obj = (raw ?? {}) as Record<string, unknown>;
	const rawTarget = Array.isArray(obj.targetKeywords)
		? (obj.targetKeywords as unknown[])
		: [];
	const targetKeywords: KeywordDensityItem[] = rawTarget
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const i = item as Record<string, unknown>;
			const keyword = typeof i.keyword === "string" ? i.keyword : "";
			const count = numberOrZero(i.count);
			const density = clamp01(numberOrZero(i.density));
			if (!keyword) return null;
			return { keyword, count, density };
		})
		.filter((x): x is KeywordDensityItem => x !== null);

	// LLM 응답에 누락된 입력 키워드가 있으면 0으로 채움
	for (const kw of input.targetKeywords) {
		if (!targetKeywords.some((t) => t.keyword === kw)) {
			targetKeywords.push({ keyword: kw, count: 0, density: 0 });
		}
	}

	const rawNouns = Array.isArray(obj.topNouns)
		? (obj.topNouns as unknown[])
		: [];
	const topNouns: TopNoun[] = rawNouns
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const i = item as Record<string, unknown>;
			const word = typeof i.word === "string" ? i.word : "";
			const count = numberOrZero(i.count);
			if (!word) return null;
			return { word, count };
		})
		.filter((x): x is TopNoun => x !== null)
		.slice(0, 10);

	return { targetKeywords, topNouns };
}

function parseTopics(raw: unknown): NlpTopic[] {
	if (!Array.isArray(raw)) return [];
	return (raw as unknown[])
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const i = item as Record<string, unknown>;
			const topic = typeof i.topic === "string" ? i.topic : "";
			const relevance = clamp01(numberOrZero(i.relevance));
			if (!topic) return null;
			return { topic, relevance };
		})
		.filter((x): x is NlpTopic => x !== null)
		.slice(0, 5);
}

function parseReadability(raw: unknown): NlpReadability {
	const obj = (raw ?? {}) as Record<string, unknown>;
	return {
		avgSentenceLength: numberOrZero(obj.avgSentenceLength),
		avgParagraphLength: numberOrZero(obj.avgParagraphLength),
		score: clampScore(numberOrZero(obj.score)),
	};
}

function parseEeat(raw: unknown): NlpEeat {
	const obj = (raw ?? {}) as Record<string, unknown>;
	return {
		hasAuthor: Boolean(obj.hasAuthor),
		hasExpertiseSignals: Math.max(
			0,
			Math.floor(numberOrZero(obj.hasExpertiseSignals)),
		),
		hasTrustSignals: Math.max(0, Math.floor(numberOrZero(obj.hasTrustSignals))),
		hasFreshness: Boolean(obj.hasFreshness),
		score: clampScore(numberOrZero(obj.score)),
	};
}

function parseSemanticRelevance(raw: unknown): NlpSemanticRelevance {
	const obj = (raw ?? {}) as Record<string, unknown>;
	return {
		titleBodyAlignment: clamp01(numberOrZero(obj.titleBodyAlignment)),
		keywordIntegration: clamp01(numberOrZero(obj.keywordIntegration)),
	};
}

function emptyResult(input: NlpInput): ParsedNlp {
	return {
		keywordDensity: {
			targetKeywords: input.targetKeywords.map((kw) => ({
				keyword: kw,
				count: 0,
				density: 0,
			})),
			topNouns: [],
		},
		topics: [],
		readability: { avgSentenceLength: 0, avgParagraphLength: 0, score: 0 },
		eeat: {
			hasAuthor: false,
			hasExpertiseSignals: 0,
			hasTrustSignals: 0,
			hasFreshness: false,
			score: 0,
		},
		semanticRelevance: { titleBodyAlignment: 0, keywordIntegration: 0 },
	};
}

function numberOrZero(v: unknown): number {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string") {
		const n = Number(v);
		if (Number.isFinite(n)) return n;
	}
	return 0;
}

function clamp01(v: number): number {
	return Math.max(0, Math.min(1, v));
}

function clampScore(v: number): number {
	return Math.max(0, Math.min(100, Math.round(v)));
}

// ---------------------------------------------------------------------------
// API response type
// ---------------------------------------------------------------------------

interface ChatMockResponse {
	choices?: Array<{
		message?: { content?: string };
	}>;
}
