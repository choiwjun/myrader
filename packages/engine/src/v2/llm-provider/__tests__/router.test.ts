/**
 * v2/llm-provider — Router 단위 테스트
 *
 * 검증 시나리오:
 * 1. LLM_PROVIDER 미설정 + CHATMOCK 환경 없음   → mock
 * 2. CHATMOCK_ENABLED=true                       → chatmock (자동 감지)
 * 3. LLM_PROVIDER=openai + OPENAI_API_KEY        → openai 설정 + isLlmEnabled()=true
 * 4. LLM_PROVIDER=openai (키 없음)               → openai 설정 + isLlmEnabled()=false
 * 5. LLM_PROVIDER=invalid                        → mock 폴백 + warn
 * 6. LLM_PROVIDER=anthropic / gemini             → 기본 모델/URL 셋업 + transforms
 * 7. CHATMOCK_BASE_URL 끝 슬래시 정규화
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getActiveLlmProvider,
	isChatMockAvailableByEnv,
	isLlmEnabled,
} from "../router.js";

// ---------------------------------------------------------------------------
// env helpers
// ---------------------------------------------------------------------------

const ENV_KEYS = [
	"LLM_PROVIDER",
	"CHATMOCK_ENABLED",
	"CHATMOCK_BASE_URL",
	"CHATMOCK_API_KEY",
	"CHATMOCK_MODEL",
	"OPENAI_API_KEY",
	"OPENAI_MODEL",
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_MODEL",
	"GEMINI_API_KEY",
	"GOOGLE_AI_API_KEY",
	"GEMINI_MODEL",
] as const;

const originalEnv: Partial<
	Record<(typeof ENV_KEYS)[number], string | undefined>
> = {};

function snapshotEnv(): void {
	for (const k of ENV_KEYS) {
		originalEnv[k] = process.env[k];
	}
}

function restoreEnv(): void {
	for (const k of ENV_KEYS) {
		const v = originalEnv[k];
		if (v === undefined) {
			delete process.env[k];
		} else {
			process.env[k] = v;
		}
	}
}

function clearEnv(): void {
	for (const k of ENV_KEYS) {
		delete process.env[k];
	}
}

beforeEach(() => {
	snapshotEnv();
	clearEnv();
});

afterEach(() => {
	vi.restoreAllMocks();
	restoreEnv();
});

// ---------------------------------------------------------------------------
// Scenario 1: 기본값 (모든 환경 변수 미설정)
// ---------------------------------------------------------------------------

describe("getActiveLlmProvider() — 기본 동작", () => {
	it("환경 변수 미설정이면 mock 으로 폴백한다", () => {
		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("mock");
		expect(cfg.baseUrl).toBe("");
		expect(cfg.apiKey).toBe("");
	});

	it("기본값에선 isLlmEnabled()=false", () => {
		expect(isLlmEnabled()).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: ChatMock 자동 감지
// ---------------------------------------------------------------------------

describe("getActiveLlmProvider() — ChatMock 라우팅", () => {
	it("CHATMOCK_ENABLED=true 면 자동으로 chatmock 을 선택한다", () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("chatmock");
		expect(cfg.baseUrl).toBe("http://localhost:8000/v1");
		expect(cfg.apiKey).toBe("chatmock-local");
		expect(cfg.model).toBe("gpt-4o");
		expect(isLlmEnabled()).toBe(true);
	});

	it("CHATMOCK_BASE_URL 만 설정해도 chatmock 자동 선택 + 끝 슬래시 정규화", () => {
		process.env["CHATMOCK_BASE_URL"] = "http://custom:9000/v1/";
		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("chatmock");
		expect(cfg.baseUrl).toBe("http://custom:9000/v1");
	});

	it("LLM_PROVIDER=chatmock 명시 + 모델/키 환경 변수 반영", () => {
		process.env["LLM_PROVIDER"] = "chatmock";
		process.env["CHATMOCK_API_KEY"] = "secret";
		process.env["CHATMOCK_MODEL"] = "gpt-4o-mini";
		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("chatmock");
		expect(cfg.apiKey).toBe("secret");
		expect(cfg.model).toBe("gpt-4o-mini");
	});
});

// ---------------------------------------------------------------------------
// Scenario 3 / 4: OpenAI
// ---------------------------------------------------------------------------

describe("getActiveLlmProvider() — OpenAI 라우팅", () => {
	it("LLM_PROVIDER=openai + OPENAI_API_KEY → 정상 설정 + isLlmEnabled=true", () => {
		process.env["LLM_PROVIDER"] = "openai";
		process.env["OPENAI_API_KEY"] = "sk-test-key";

		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("openai");
		expect(cfg.baseUrl).toBe("https://api.openai.com/v1");
		expect(cfg.apiKey).toBe("sk-test-key");
		expect(cfg.model).toBe("gpt-4o-mini");
		expect(isLlmEnabled()).toBe(true);
	});

	it("OPENAI_MODEL 환경 변수가 우선한다", () => {
		process.env["LLM_PROVIDER"] = "openai";
		process.env["OPENAI_API_KEY"] = "sk-test-key";
		process.env["OPENAI_MODEL"] = "gpt-4o-mini";

		const cfg = getActiveLlmProvider();
		expect(cfg.model).toBe("gpt-4o-mini");
	});

	it("OPENAI_API_KEY 가 없으면 isLlmEnabled()=false (config 는 그대로 반환)", () => {
		process.env["LLM_PROVIDER"] = "openai";
		// 키 없음
		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("openai");
		expect(cfg.apiKey).toBe("");
		expect(isLlmEnabled()).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Scenario 5: 알 수 없는 LLM_PROVIDER
// ---------------------------------------------------------------------------

describe("getActiveLlmProvider() — 잘못된 값 처리", () => {
	it("LLM_PROVIDER=invalid → mock 폴백 + console.warn", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {
			// no-op
		});
		process.env["LLM_PROVIDER"] = "completely-unknown-provider";

		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("mock");
		// 경고 메시지에 입력한 raw 값이 포함되어야 한다
		expect(warn).toHaveBeenCalled();
		const firstCallArg = String(warn.mock.calls[0]?.[0] ?? "");
		expect(firstCallArg).toContain("completely-unknown-provider");
		expect(firstCallArg).toContain("mock");
	});

	it("isLlmEnabled() 도 invalid 값엔 false 를 반환한다", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {
			// no-op
		});
		process.env["LLM_PROVIDER"] = "completely-unknown-provider";
		expect(isLlmEnabled()).toBe(false);
	});

	it("LLM_PROVIDER=mock 은 명시적으로 mock 을 선택한다 (CHATMOCK 켜져 있어도)", () => {
		process.env["LLM_PROVIDER"] = "mock";
		process.env["CHATMOCK_ENABLED"] = "true";

		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("mock");
		expect(isLlmEnabled()).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Scenario 6: Anthropic / Gemini
// ---------------------------------------------------------------------------

describe("getActiveLlmProvider() — anthropic/gemini transforms", () => {
	it("LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY → 기본 모델/URL 셋업", () => {
		process.env["LLM_PROVIDER"] = "anthropic";
		process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";

		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("anthropic");
		expect(cfg.baseUrl).toBe("https://api.anthropic.com/v1");
		expect(cfg.model).toBe("claude-sonnet-4-6");
		expect(cfg.apiKey).toBe("sk-ant-test");
		// Wave 5: transform 구현됨 (OpenAI ↔ Anthropic)
		expect(cfg.requestTransform).toBeTypeOf("function");
		expect(cfg.responseTransform).toBeTypeOf("function");
		expect(isLlmEnabled()).toBe(true);
	});

	it("LLM_PROVIDER=gemini + GEMINI_API_KEY → 기본 모델/URL 셋업", () => {
		process.env["LLM_PROVIDER"] = "gemini";
		process.env["GEMINI_API_KEY"] = "gm-test";
		process.env["GEMINI_MODEL"] = "gemini-2.0-flash";

		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("gemini");
		expect(cfg.baseUrl).toBe(
			"https://generativelanguage.googleapis.com/v1beta",
		);
		expect(cfg.model).toBe("gemini-2.0-flash");
		expect(cfg.apiKey).toBe("gm-test");
		expect(cfg.requestTransform).toBeTypeOf("function");
		expect(cfg.responseTransform).toBeTypeOf("function");
		expect(isLlmEnabled()).toBe(true);
	});

	it("LLM_PROVIDER=gemini + GOOGLE_AI_API_KEY legacy alias enables Gemini", () => {
		process.env["LLM_PROVIDER"] = "gemini";
		process.env["GOOGLE_AI_API_KEY"] = "google-ai-test";

		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("gemini");
		expect(cfg.apiKey).toBe("google-ai-test");
		expect(cfg.model).toBe("gemini-2.5-flash");
		expect(isLlmEnabled()).toBe(true);
	});

	// -------------------------------------------------------------------------
	// Wave 5 transform 동작 — anthropic
	// -------------------------------------------------------------------------

	describe("anthropic transform", () => {
		beforeEach(() => {
			process.env["LLM_PROVIDER"] = "anthropic";
			process.env["ANTHROPIC_API_KEY"] = "sk-ant-x";
		});

		it("system role 메시지를 top-level system 필드로 분리", () => {
			const cfg = getActiveLlmProvider();
			const out = cfg.requestTransform?.({
				model: "claude-sonnet-4-6",
				messages: [
					{ role: "system", content: "당신은 한국어 비서입니다." },
					{ role: "user", content: "안녕" },
				],
				max_tokens: 256,
			}) as {
				system: string;
				messages: Array<{ role: string }>;
				max_tokens: number;
			};
			expect(out.system).toBe("당신은 한국어 비서입니다.");
			expect(out.messages).toHaveLength(1);
			expect(out.messages[0]?.role).toBe("user");
			expect(out.max_tokens).toBe(256);
		});

		it("max_tokens 미지정 → 1024 default", () => {
			const cfg = getActiveLlmProvider();
			const out = cfg.requestTransform?.({
				messages: [{ role: "user", content: "hi" }],
			}) as { max_tokens: number };
			expect(out.max_tokens).toBe(1024);
		});

		it("Anthropic response → OpenAI choices 형태로 변환", () => {
			const cfg = getActiveLlmProvider();
			const out = cfg.responseTransform?.({
				content: [{ type: "text", text: "응답입니다." }],
				stop_reason: "end_turn",
			}) as {
				choices: Array<{
					message: { role: string; content: string };
					finish_reason: string;
				}>;
			};
			expect(out.choices[0]?.message.content).toBe("응답입니다.");
			expect(out.choices[0]?.finish_reason).toBe("end_turn");
		});
	});

	// -------------------------------------------------------------------------
	// Wave 5 transform 동작 — gemini
	// -------------------------------------------------------------------------

	describe("gemini transform", () => {
		beforeEach(() => {
			process.env["LLM_PROVIDER"] = "gemini";
			process.env["GEMINI_API_KEY"] = "gm-x";
		});

		it("messages → contents (assistant → model 매핑) + systemInstruction 분리", () => {
			const cfg = getActiveLlmProvider();
			const out = cfg.requestTransform?.({
				messages: [
					{ role: "system", content: "한국어 응답." },
					{ role: "user", content: "Q1" },
					{ role: "assistant", content: "A1" },
					{ role: "user", content: "Q2" },
				],
				max_tokens: 100,
				temperature: 0.7,
			}) as {
				contents: Array<{ role: string; parts: Array<{ text: string }> }>;
				systemInstruction: { parts: Array<{ text: string }> };
				generationConfig: { maxOutputTokens: number; temperature: number };
			};
			expect(out.systemInstruction.parts[0]?.text).toBe("한국어 응답.");
			expect(out.contents).toHaveLength(3);
			expect(out.contents[1]?.role).toBe("model"); // assistant → model
			expect(out.generationConfig.maxOutputTokens).toBe(100);
			expect(out.generationConfig.temperature).toBe(0.7);
		});

		it("Gemini response → OpenAI choices 형태로 변환", () => {
			const cfg = getActiveLlmProvider();
			const out = cfg.responseTransform?.({
				candidates: [
					{
						content: { parts: [{ text: "응답" }] },
						finishReason: "STOP",
					},
				],
			}) as {
				choices: Array<{ message: { content: string }; finish_reason: string }>;
			};
			expect(out.choices[0]?.message.content).toBe("응답");
			expect(out.choices[0]?.finish_reason).toBe("STOP");
		});
	});
});

// ---------------------------------------------------------------------------
// Scenario 7: CHATMOCK_ENABLED 3-state (B1 수정)
// ---------------------------------------------------------------------------

describe("isChatMockAvailableByEnv() — 3-state (B1)", () => {
	it("CHATMOCK_ENABLED=false 면 BASE_URL 이 있어도 false (명시적 OFF)", () => {
		process.env["CHATMOCK_ENABLED"] = "false";
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:8000/v1";
		expect(isChatMockAvailableByEnv()).toBe(false);
	});

	it("CHATMOCK_ENABLED=false + BASE_URL + LLM_PROVIDER 미설정 → mock (chatmock 자동선택 안 함)", () => {
		process.env["CHATMOCK_ENABLED"] = "false";
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:8000/v1";
		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("mock");
		expect(isLlmEnabled()).toBe(false);
	});

	it("CHATMOCK_ENABLED=false 라도 LLM_PROVIDER=openai 면 openai (명시 우선)", () => {
		process.env["CHATMOCK_ENABLED"] = "false";
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:8000/v1";
		process.env["LLM_PROVIDER"] = "openai";
		process.env["OPENAI_API_KEY"] = "sk-real";
		const cfg = getActiveLlmProvider();
		expect(cfg.id).toBe("openai");
		expect(isLlmEnabled()).toBe(true);
	});

	it("CHATMOCK_ENABLED=true → true", () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		expect(isChatMockAvailableByEnv()).toBe(true);
	});

	it("CHATMOCK_ENABLED 미설정 + BASE_URL 존재 → true (dev 편의 유지)", () => {
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:8000/v1";
		expect(isChatMockAvailableByEnv()).toBe(true);
	});

	it("CHATMOCK_ENABLED 미설정 + BASE_URL 없음 → false", () => {
		expect(isChatMockAvailableByEnv()).toBe(false);
	});

	it("CHATMOCK_ENABLED=0 (비-true 명시값)면 BASE_URL 있어도 false", () => {
		process.env["CHATMOCK_ENABLED"] = "0";
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:8000/v1";
		expect(isChatMockAvailableByEnv()).toBe(false);
	});

	it("CHATMOCK_ENABLED 가 공백문자열이면 명시적 OFF (BASE_URL 무시)", () => {
		process.env["CHATMOCK_ENABLED"] = "   ";
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:8000/v1";
		expect(isChatMockAvailableByEnv()).toBe(false);
	});

	it("CHATMOCK_ENABLED 가 빈 문자열이면 미설정처럼 BASE_URL 폴백", () => {
		process.env["CHATMOCK_ENABLED"] = "";
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:8000/v1";
		expect(isChatMockAvailableByEnv()).toBe(true);
	});
});
