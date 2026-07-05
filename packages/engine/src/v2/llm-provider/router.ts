/**
 * X-SAG Core Engine v2 — LLM Provider Router
 *
 * Wave 5 prep: `LLM_PROVIDER` 환경 변수 하나로 GEO/AEO/Rule Validator 및
 * Recommendation Engine 의 활성 LLM 제공자를 일관되게 선택한다.
 *
 * 지원 값:
 *   - "chatmock"  : 로컬 ChatGPT Plus 프록시 (OpenAI 호환, $0)
 *   - "openai"    : OpenAI Chat Completions API
 *   - "anthropic" : Anthropic Messages API (OpenAI-compatible transforms enabled)
 *   - "gemini"    : Google Generative Language API (OpenAI-compatible transforms enabled)
 *   - "mock"      : 실제 HTTP 호출 없는 테스트용 (isLlmEnabled=false)
 *
 * 기본 동작:
 *   - LLM_PROVIDER 미설정 (3-state, isChatMockAvailableByEnv 참조):
 *       - CHATMOCK_ENABLED=true                          → "chatmock"
 *       - CHATMOCK_ENABLED=false (명시적 OFF)            → "mock" (BASE_URL 있어도)
 *       - CHATMOCK_ENABLED 미설정 + CHATMOCK_BASE_URL 존재 → "chatmock" (dev 편의)
 *       - 그 외                                          → "mock"
 *   - LLM_PROVIDER 가 알 수 없는 값이면 → "mock" + console.warn (테스트 친화적)
 *
 * 호출 컨벤션:
 *   - 모든 Provider 는 OpenAI 호환 `POST {baseUrl}/chat/completions` 인터페이스로 정규화.
 *   - 형식이 다른 제공자(Anthropic, Gemini) 는 `requestTransform`/`responseTransform`
 *     으로 변환한다. (현재 Phase 에선 미구현 → undefined)
 *
 * 환경 변수 표:
 *   chatmock   : CHATMOCK_BASE_URL, CHATMOCK_API_KEY, CHATMOCK_MODEL, CHATMOCK_ENABLED
 *   openai     : OPENAI_API_KEY,    OPENAI_MODEL (기본 "gpt-4o-mini")
 *   anthropic  : ANTHROPIC_API_KEY, ANTHROPIC_MODEL (기본 "claude-sonnet-4-6")
 *   gemini     : GEMINI_API_KEY or GOOGLE_AI_API_KEY, GEMINI_MODEL (기본 "gemini-2.5-flash")
 */

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

/** 지원되는 LLM 제공자 ID */
export type LlmProviderId =
	| "chatmock"
	| "openai"
	| "anthropic"
	| "gemini"
	| "mock";

/**
 * 라우터가 제공자별 환경 변수를 해석해 만들어주는 호출 설정 객체.
 * 모든 Validator/Provider 는 이 한 가지 형태로만 의존한다.
 */
export interface LlmProviderConfig {
	/** 제공자 ID */
	id: LlmProviderId;
	/** OpenAI 호환 `/chat/completions` 엔드포인트의 base URL (slash 미포함) */
	baseUrl: string;
	/** Authorization 헤더에 실릴 API 키 (mock 의 경우 빈 문자열) */
	apiKey: string;
	/** 호출 모델 ID */
	model: string;
	/** OpenAI 표준 요청 body 를 제공자 고유 포맷으로 변환 (anthropic/gemini 용) */
	requestTransform?: (body: unknown) => unknown;
	/** 제공자 고유 응답 → OpenAI 호환 응답 형태로 변환 */
	responseTransform?: (body: unknown) => unknown;
}

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/** "true" 비교를 대소문자 무관으로 */
function isTrueEnv(v: string | undefined): boolean {
	return typeof v === "string" && v.toLowerCase() === "true";
}

/**
 * ChatMock 이 자동 선택 가능한 상태인지 확인 (3-state, B1 수정).
 *
 * 라우터와 모든 ChatMock 기반 Validator(geo/aeo/nlp/rule-validator) 및
 * recommendation ChatMock provider 의 `isAvailable()` 환경 분기가
 * 이 단일 헬퍼를 공유한다 — 복제 로직으로 인한 분기 불일치(복제 버그) 방지.
 *
 *   - CHATMOCK_ENABLED=true                              → true  (명시적 활성)
 *   - CHATMOCK_ENABLED 가 명시적으로 설정됨(=false, 0 등)  → false (명시적 OFF; BASE_URL 무시)
 *   - CHATMOCK_ENABLED 미설정 + CHATMOCK_BASE_URL 존재     → true  (로컬 dev 편의 유지)
 *   - 그 외                                              → false
 *
 * 즉 `CHATMOCK_ENABLED=false` 는 `CHATMOCK_BASE_URL` 이 있어도 ChatMock 을 자동
 * 선택하지 않는다 — 실 provider 키(OPENAI_API_KEY 등)를 가리는 것을 막기 위함.
 */
export function isChatMockAvailableByEnv(): boolean {
	const flag = process.env.CHATMOCK_ENABLED;
	// 비어있지 않게(공백만 있어도) 설정됐으면 "명시적 설정"으로 보고 그 값을 존중한다.
	// 빈 문자열/미설정만 BASE_URL 폴백으로 흘려보낸다 — 공백·"0"·"false" 등은 비-true → OFF.
	if (typeof flag === "string" && flag.length > 0) {
		return isTrueEnv(flag.trim());
	}
	// 미설정 → BASE_URL 존재만으로 로컬 dev 활성화
	const baseUrl = process.env.CHATMOCK_BASE_URL;
	return Boolean(baseUrl && baseUrl.length > 0);
}

/** LLM_PROVIDER 환경 변수를 정규화. 미지정 시 자동 추론. */
function resolveProviderId(): LlmProviderId {
	const raw = process.env.LLM_PROVIDER;
	if (typeof raw === "string" && raw.length > 0) {
		const v = raw.toLowerCase().trim();
		if (
			v === "chatmock" ||
			v === "openai" ||
			v === "anthropic" ||
			v === "gemini" ||
			v === "mock"
		) {
			return v;
		}
		// 알 수 없는 값 — 폴백 + 경고
		// eslint-disable-next-line no-console
		console.warn(
			`[llm-provider] 알 수 없는 LLM_PROVIDER="${raw}" — "mock" 으로 폴백합니다.`,
		);
		return "mock";
	}

	// 명시 미지정 시: ChatMock 환경이면 chatmock, 아니면 mock (3-state)
	return isChatMockAvailableByEnv() ? "chatmock" : "mock";
}

// ---------------------------------------------------------------------------
// 제공자별 설정 빌더
// ---------------------------------------------------------------------------

function buildChatMockConfig(): LlmProviderConfig {
	const baseUrl = (
		process.env.CHATMOCK_BASE_URL ?? "http://localhost:8000/v1"
	).replace(/\/$/, "");
	return {
		id: "chatmock",
		baseUrl,
		apiKey: process.env.CHATMOCK_API_KEY ?? "chatmock-local",
		model: process.env.CHATMOCK_MODEL ?? "gpt-4o",
	};
}

function buildOpenAIConfig(): LlmProviderConfig {
	const apiKey = process.env.OPENAI_API_KEY ?? "";
	return {
		id: "openai",
		baseUrl: "https://api.openai.com/v1",
		apiKey,
		model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
	};
}

// ---------------------------------------------------------------------------
// OpenAI ↔ Anthropic transforms
// ---------------------------------------------------------------------------

interface OpenAIMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

interface OpenAIRequest {
	model?: string;
	messages?: OpenAIMessage[];
	max_tokens?: number;
	temperature?: number;
	response_format?: { type?: string };
}

/**
 * OpenAI request → Anthropic Messages API request
 * - system role 메시지를 top-level `system` 필드로 분리
 * - messages 배열에는 user/assistant 만 유지
 * - max_tokens 필수 (없으면 1024 default)
 */
function transformOpenAIToAnthropic(body: unknown): unknown {
	const req = (body ?? {}) as OpenAIRequest;
	const messages = req.messages ?? [];
	const system = messages
		.filter((m) => m.role === "system")
		.map((m) => m.content)
		.join("\n\n");
	const userAssistant = messages.filter((m) => m.role !== "system");
	return {
		model: req.model,
		messages: userAssistant,
		...(system && { system }),
		max_tokens: req.max_tokens ?? 1024,
		...(req.temperature !== undefined && { temperature: req.temperature }),
	};
}

interface AnthropicResponse {
	content?: Array<{ type?: string; text?: string }>;
	stop_reason?: string;
	usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Anthropic response → OpenAI Chat Completions response shape
 * - content[0].text → choices[0].message.content
 */
function transformAnthropicToOpenAI(body: unknown): unknown {
	const res = (body ?? {}) as AnthropicResponse;
	const text = res.content?.[0]?.text ?? "";
	return {
		choices: [
			{
				message: { role: "assistant", content: text },
				finish_reason: res.stop_reason ?? "stop",
			},
		],
		usage: res.usage,
	};
}

function buildAnthropicConfig(): LlmProviderConfig {
	const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
	return {
		id: "anthropic",
		// Anthropic Messages API: POST {baseUrl}/messages (chat/completions 호환 아님)
		// 호출자는 cfg.id === "anthropic" 분기로 path 를 "/messages" 로 변경하고
		// requestTransform/responseTransform 을 적용해야 한다.
		baseUrl: "https://api.anthropic.com/v1",
		apiKey,
		model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
		requestTransform: transformOpenAIToAnthropic,
		responseTransform: transformAnthropicToOpenAI,
	};
}

// ---------------------------------------------------------------------------
// OpenAI ↔ Gemini transforms
// ---------------------------------------------------------------------------

interface GeminiResponse {
	candidates?: Array<{
		content?: { parts?: Array<{ text?: string }> };
		finishReason?: string;
	}>;
}

/**
 * OpenAI request → Gemini generateContent request
 * - messages → contents[{role, parts:[{text}]}]
 * - system 은 systemInstruction.parts[0].text 로 분리
 * - role: "assistant" → "model" 매핑
 */
function transformOpenAIToGemini(body: unknown): unknown {
	const req = (body ?? {}) as OpenAIRequest;
	const messages = req.messages ?? [];
	const system = messages
		.filter((m) => m.role === "system")
		.map((m) => m.content)
		.join("\n\n");
	const contents = messages
		.filter((m) => m.role !== "system")
		.map((m) => ({
			role: m.role === "assistant" ? "model" : "user",
			parts: [{ text: m.content }],
		}));
	return {
		contents,
		...(system && {
			systemInstruction: { parts: [{ text: system }] },
		}),
		generationConfig: {
			...(req.max_tokens !== undefined && {
				maxOutputTokens: req.max_tokens,
			}),
			...(req.temperature !== undefined && { temperature: req.temperature }),
			...(req.response_format?.type === "json_object" && {
				responseMimeType: "application/json",
			}),
		},
	};
}

/**
 * Gemini response → OpenAI Chat Completions response shape
 * - candidates[0].content.parts[0].text → choices[0].message.content
 */
function transformGeminiToOpenAI(body: unknown): unknown {
	const res = (body ?? {}) as GeminiResponse;
	const text = res.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
	return {
		choices: [
			{
				message: { role: "assistant", content: text },
				finish_reason: res.candidates?.[0]?.finishReason ?? "stop",
			},
		],
	};
}

function getGeminiApiKey(): string {
	return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? "";
}

function buildGeminiConfig(): LlmProviderConfig {
	const apiKey = getGeminiApiKey();
	return {
		id: "gemini",
		// Gemini URL 패턴: {baseUrl}/models/{model}:generateContent?key={apiKey}
		// 호출자는 cfg.id === "gemini" 분기로 URL path 를 별도 빌드해야 한다.
		baseUrl: "https://generativelanguage.googleapis.com/v1beta",
		apiKey,
		model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
		requestTransform: transformOpenAIToGemini,
		responseTransform: transformGeminiToOpenAI,
	};
}

/** Mock — 실제 HTTP 호출이 일어나지 않는 자리 표시자 */
function buildMockConfig(): LlmProviderConfig {
	return {
		id: "mock",
		baseUrl: "",
		apiKey: "",
		model: "mock",
	};
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * 현재 환경 변수 기준 활성 LLM Provider 설정을 계산해 반환한다.
 *
 * 호출 시점마다 환경 변수를 다시 읽으므로, 테스트에서 process.env 를 조작한
 * 직후에도 결과가 즉시 반영된다.
 *
 * 클라우드 제공자(openai/anthropic/gemini)인데 API 키가 비어 있으면
 * isLlmEnabled() 는 false 를 반환한다 (config 자체는 그대로 반환).
 */
export function getActiveLlmProvider(): LlmProviderConfig {
	const id = resolveProviderId();
	switch (id) {
		case "chatmock":
			return buildChatMockConfig();
		case "openai":
			return buildOpenAIConfig();
		case "anthropic":
			return buildAnthropicConfig();
		case "gemini":
			return buildGeminiConfig();
		default:
			return buildMockConfig();
	}
}

/**
 * 현재 환경에서 실제 LLM 호출이 가능한지 여부.
 *
 * - mock         : 항상 false
 * - chatmock     : baseUrl 이 비어있지 않으면 true (CHATMOCK_ENABLED 또는 BASE_URL)
 * - openai       : OPENAI_API_KEY 가 있으면 true
 * - anthropic    : ANTHROPIC_API_KEY 가 있으면 true
 * - gemini       : GEMINI_API_KEY 또는 GOOGLE_AI_API_KEY 가 있으면 true
 */
export function isLlmEnabled(): boolean {
	const cfg = getActiveLlmProvider();
	if (cfg.id === "mock") return false;
	return cfg.apiKey.length > 0 && cfg.baseUrl.length > 0;
}

/**
 * 그라운딩 가능한 provider 폴백 체인 (안정성 — 1순위가 쿼터/인증 실패면 다음으로).
 * 기본 순서 openai → gemini → anthropic, 각 API 키가 설정된 것만 포함한다.
 * `LLM_PROVIDER` 가 grounding provider 로 명시되면 그것을 1순위로 끌어올린다.
 * 키가 하나도 없으면 빈 배열(호출자는 기존 단일 provider 로 폴백).
 */
export function getGroundingProviderChain(): LlmProviderConfig[] {
	const chain: LlmProviderConfig[] = [];
	if ((process.env.OPENAI_API_KEY ?? "").length > 0) {
		chain.push(buildOpenAIConfig());
	}
	if ((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? "").length > 0) {
		chain.push(buildGeminiConfig());
	}
	if ((process.env.ANTHROPIC_API_KEY ?? "").length > 0) {
		chain.push(buildAnthropicConfig());
	}
	const raw = (process.env.LLM_PROVIDER ?? "").toLowerCase().trim();
	if (raw === "openai" || raw === "gemini" || raw === "anthropic") {
		chain.sort((a, b) => (a.id === raw ? -1 : b.id === raw ? 1 : 0));
	}
	return chain;
}
