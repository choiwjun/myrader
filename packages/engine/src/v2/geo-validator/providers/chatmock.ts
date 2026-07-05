/**
 * X-SAG Core Engine v2 — ChatMock GEO Validator Provider
 *
 * ChatMock(OpenAI 호환 로컬 프록시)에 GEO 질의를 전송하고 응답을 분석한다.
 *
 * 활성화 조건 (둘 중 하나):
 *   1. CHATMOCK_ENABLED=true
 *   2. CHATMOCK_BASE_URL 명시적 설정
 *
 * 환경변수:
 *   - CHATMOCK_BASE_URL (기본 http://localhost:8000/v1)
 *   - CHATMOCK_API_KEY  (기본 "chatmock-local" — 더미)
 *   - CHATMOCK_MODEL    (기본 "gpt-4o")
 *   - CHATMOCK_ENABLED  ("true" 이면 명시적 활성화)
 *
 * 호출 패턴 (recommendation/providers/chatmock.ts 재사용):
 *   - POST /v1/chat/completions
 *   - max_tokens: 800 (GEO 응답은 좀 더 길게)
 *   - temperature: 0.3
 *   - timeout: 30s
 *   - rate limit: 질의 간 500ms
 *
 * Wave 5 라우팅:
 *   - 옵션으로 `providerConfig` 를 받으면 base URL/API key/model 을 override 한다.
 *   - `getActiveLlmProvider()` 와 결합해 `LLM_PROVIDER` 환경 변수로 OpenAI/Anthropic/Gemini
 *     로 스위칭 가능. providerConfig 미지정 시엔 기존 ChatMock 환경 변수를 그대로 사용한다.
 */

import {
	applyGrounding,
	callLlmWithReliability,
	CircuitBreaker,
	isChatMockAvailableByEnv,
	isGroundingEnabledByEnv,
	isSystemicLlmStatus,
	LlmHttpError,
} from "../../llm-provider/index.js";
import type { LlmProviderConfig } from "../../llm-provider/index.js";
import {
	generateDefaultQueries,
	withStructuredExtraction,
} from "../prompt-templates.js";
import type {
	GeoCitation,
	GeoQuery,
	GeoValidationInput,
	GeoValidationResult,
	GeoValidator,
} from "../types.js";
import { analyzeCitation, computeMetrics } from "../validator.js";

const DEFAULT_BASE_URL = "http://localhost:8000/v1";
const DEFAULT_API_KEY = "chatmock-local";
const DEFAULT_MODEL = "gpt-4o";
const TIMEOUT_MS = 30_000;
const RATE_LIMIT_MS = 500;
const MAX_TOKENS = 800;

// GAP 3 신뢰성 기본값 (보수적 — 정당한 커버리지를 줄이지 않도록).
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 2_000;
// breaker: systemic(429/401/403) 연속 3회면 cooldown 동안 fail-fast.
// threshold>=3 + 짧은 cooldown → 일시적 잡음으로 잘못 차단하지 않음.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 10_000;

interface ChatMockApiResponse {
	choices?: Array<{
		message?: { content?: string };
	}>;
}

interface ProviderHttpRequest {
	url: string;
	headers: Record<string, string>;
	body: unknown;
}

export interface ChatMockGeoValidatorOptions {
	/** 질의 간 대기 시간 (ms). 기본 500. */
	rateLimitMs?: number;
	/** 단일 호출 타임아웃 (ms). 기본 30000. */
	timeoutMs?: number;
	/**
	 * Wave 5: 라우터에서 받은 호출 설정.
	 * 지정되면 CHATMOCK_* 환경 변수 대신 이 값을 사용한다.
	 * `getActiveLlmProvider()` 와 함께 쓰면 LLM_PROVIDER 로 단일 스위칭.
	 */
	providerConfig?: LlmProviderConfig;
	/**
	 * WS5c: 웹검색 그라운딩 강제. 미지정 시 `XSAG_LLM_GROUNDING` env 를 따른다(기본 OFF).
	 * 실 provider(openai/gemini/anthropic)에서만 효과 — mock/chatmock 은 무시.
	 */
	grounding?: boolean;
}

export class ChatMockGeoValidator implements GeoValidator {
	readonly name = "chatmock" as const;

	private readonly rateLimitMs: number;
	private readonly timeoutMs: number;
	private readonly providerConfig: LlmProviderConfig | undefined;
	private readonly grounding: boolean;
	/** GAP 3: provider 별 in-process 회로 차단기 (인스턴스 수명 동안 공유). */
	private readonly breaker: CircuitBreaker;

	constructor(options: ChatMockGeoValidatorOptions = {}) {
		this.rateLimitMs = options.rateLimitMs ?? RATE_LIMIT_MS;
		this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
		this.providerConfig = options.providerConfig;
		this.grounding = options.grounding ?? isGroundingEnabledByEnv();
		this.breaker = new CircuitBreaker({
			threshold: BREAKER_THRESHOLD,
			cooldownMs: BREAKER_COOLDOWN_MS,
		});
	}

	isAvailable(): boolean {
		// providerConfig 가 명시적으로 주입되면 mock 이외에는 모두 가용으로 판단
		if (this.providerConfig) {
			return (
				this.providerConfig.id !== "mock" &&
				this.providerConfig.baseUrl.length > 0 &&
				this.providerConfig.apiKey.length > 0
			);
		}
		// 환경 기반 분기는 라우터의 단일 헬퍼를 공유 (복제 버그 방지, B1 3-state)
		return isChatMockAvailableByEnv();
	}

	async validate(
		input: GeoValidationInput,
		queries?: GeoQuery[],
	): Promise<GeoValidationResult> {
		const qs = queries ?? generateDefaultQueries(input);
		const citations: GeoCitation[] = [];

		for (let i = 0; i < qs.length; i++) {
			const q = qs[i];
			if (!q) continue;
			// 정직성: grounded 일 때만 구조화 출력(번호목록) 지시를 덧붙여, 결정적으로
			// 추천 업체명을 파싱할 수 있게 한다. grounding OFF 면 원문 질의 그대로.
			const promptQuery = withStructuredExtraction(q.query, this.grounding);
			const llmResponse = await this.askChatMock(promptQuery);
			// grounded 신호를 전달 — analyzeCitation 은 grounded 일 때만 응답에서
			// recommendedBusinesses 를 결정적 추출한다(아니면 빈 배열).
			const citation = analyzeCitation(
				q,
				llmResponse,
				input,
				new Date(),
				this.grounding,
			);
			citations.push(citation);
			// 마지막 질의 이후엔 sleep 생략
			if (i < qs.length - 1 && this.rateLimitMs > 0) {
				await this.delay(this.rateLimitMs);
			}
		}

		const metrics = computeMetrics(citations);

		return {
			url: input.url,
			businessName: input.businessName,
			citations,
			metrics,
			source: "chatmock",
			validatedAt: new Date().toISOString(),
		};
	}

	/**
	 * 단일 질의를 ChatMock 에 보내고 응답 텍스트를 반환한다.
	 * 실패 시 빈 문자열을 반환 (전체 배치는 계속 진행).
	 */
	private async askChatMock(query: string): Promise<string> {
		// providerConfig 가 주입되어 있으면 우선 사용, 아니면 CHATMOCK_* 환경 변수 폴백
		const baseUrl = this.providerConfig
			? this.providerConfig.baseUrl
			: (process.env.CHATMOCK_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
		const apiKey = this.providerConfig
			? this.providerConfig.apiKey
			: (process.env.CHATMOCK_API_KEY ?? DEFAULT_API_KEY);
		const model = this.providerConfig
			? this.providerConfig.model
			: (process.env.CHATMOCK_MODEL ?? DEFAULT_MODEL);
		const standardBody = {
			model,
			messages: [
				{
					role: "system",
					content:
						"You are a helpful Korean local information assistant. Answer the user's question naturally in Korean. Mention specific business names, locations, and URLs when relevant. Be concise but informative.",
				},
				{ role: "user", content: query },
			],
			max_tokens: MAX_TOKENS,
			temperature: 0.3,
		};
		const request = this.buildProviderRequest(
			baseUrl,
			apiKey,
			model,
			standardBody,
		);
		const providerId = this.providerConfig?.id ?? "chatmock";

		// GAP 3: 단일 HTTP 시도. systemic(429/401/403) 와 일시적(네트워크/5xx) 모두 throw 하여
		// withRetry 가 정책에 따라 재시도하게 한다 (systemic 은 재시도 안 함).
		const attempt = async (): Promise<string> => {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), this.timeoutMs);
			try {
				const res = await fetch(request.url, {
					method: "POST",
					headers: request.headers,
					body: JSON.stringify(request.body),
					signal: controller.signal,
				});

				if (!res.ok) {
					// quota(429)/auth(401·403) 시스템 에러는 전파 — 빈 응답으로 삼키면
					// mentionRate=0 으로 오염되어 "AI 가시성 0" 으로 오인된다(데이터 정직성).
					if (isSystemicLlmStatus(res.status)) {
						throw new LlmHttpError(res.status, res.statusText);
					}
					// 일시적 HTTP 에러 → throw 하여 재시도 유도 (소진되면 외부에서 "" 처리).
					throw new LlmHttpError(res.status, res.statusText);
				}

				const rawData: unknown = await res.json();
				const data = (
					this.providerConfig?.responseTransform
						? this.providerConfig.responseTransform(rawData)
						: rawData
				) as ChatMockApiResponse;
				return data.choices?.[0]?.message?.content ?? "";
			} finally {
				clearTimeout(timer);
			}
		};

		try {
			return await callLlmWithReliability(attempt, {
				providerId,
				breaker: this.breaker,
				retry: {
					maxAttempts: RETRY_MAX_ATTEMPTS,
					baseDelayMs: RETRY_BASE_DELAY_MS,
					maxDelayMs: RETRY_MAX_DELAY_MS,
				},
			});
		} catch (err) {
			// systemic 에러는 전파(배치 실패 기록 — 데이터 정직성).
			if (err instanceof LlmHttpError && isSystemicLlmStatus(err.status)) {
				throw err;
			}
			// 회로 open(CircuitOpenError) 또는 재시도 소진된 일시적 에러/네트워크/타임아웃 —
			// 빈 응답으로 처리하고 배치 계속(기존 caller 계약 보존).
			return "";
		}
	}

	private buildProviderRequest(
		baseUrl: string,
		apiKey: string,
		model: string,
		standardBody: Record<string, unknown>,
	): ProviderHttpRequest {
		const cfg = this.providerConfig;
		const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
		const transformed = cfg?.requestTransform
			? cfg.requestTransform(standardBody)
			: standardBody;
		// WS5c: 그라운딩 ON 이면 provider별 웹검색 옵션 주입 (mock/chatmock 은 no-op).
		const body = this.grounding
			? applyGrounding(transformed, cfg?.id ?? "chatmock")
			: transformed;

		if (cfg?.id === "anthropic") {
			return {
				url: `${normalizedBaseUrl}/messages`,
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				body,
			};
		}

		if (cfg?.id === "gemini") {
			const url = new URL(
				`${normalizedBaseUrl}/models/${encodeURIComponent(model)}:generateContent`,
			);
			url.searchParams.set("key", apiKey);
			return {
				url: url.toString(),
				headers: {
					"Content-Type": "application/json",
				},
				body,
			};
		}

		return {
			url: `${normalizedBaseUrl}/chat/completions`,
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body,
		};
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
