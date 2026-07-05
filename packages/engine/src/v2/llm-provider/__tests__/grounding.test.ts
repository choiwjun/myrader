/**
 * WS5c 웹검색 그라운딩 — 단위 테스트
 *
 * applyGrounding 이 provider별 웹검색 옵션을 정확히 주입하는지, 원본 불변·미지원
 * provider no-op·env 토글을 검증한다. (실제 그라운딩 동작은 실 키 스모크 D7 책임.)
 */
import { afterEach, describe, expect, it } from "vitest";
import {
	applyGrounding,
	isGroundingEnabledByEnv,
	providerSupportsGrounding,
} from "../grounding.js";

describe("providerSupportsGrounding", () => {
	it("실 검색 provider(openai/gemini/anthropic)만 지원", () => {
		expect(providerSupportsGrounding("openai")).toBe(true);
		expect(providerSupportsGrounding("gemini")).toBe(true);
		expect(providerSupportsGrounding("anthropic")).toBe(true);
		expect(providerSupportsGrounding("chatmock")).toBe(false);
		expect(providerSupportsGrounding("mock")).toBe(false);
	});
});

describe("applyGrounding", () => {
	const base = { model: "x", messages: [] as unknown[], max_tokens: 800 };

	it("openai → web_search_options 주입 + temperature 제거 + 모델 search 매핑", () => {
		const out = applyGrounding(
			{ model: "gpt-4o-mini", messages: [], max_tokens: 800, temperature: 0.3 },
			"openai",
		) as Record<string, unknown>;
		expect(out.web_search_options).toEqual({});
		expect(out.temperature).toBeUndefined(); // 실측: search-preview 는 temperature 거부
		expect(out.model).toBe("gpt-4o-mini-search-preview"); // 기본모델 → search 변형
		expect(out.max_tokens).toBe(800); // max_tokens 는 유지(실측 허용)
	});

	it("openai → 알 수 없는 모델은 그대로(매핑표에 없으면 유지)", () => {
		const out = applyGrounding({ model: "x", messages: [] }, "openai") as Record<
			string,
			unknown
		>;
		expect(out.model).toBe("x");
		expect(out.web_search_options).toEqual({});
	});

	it("gemini → tools[google_search] 추가 (기존 tools 보존)", () => {
		const out = applyGrounding(
			{ contents: [], tools: [{ x: 1 }] },
			"gemini",
		) as { tools: unknown[] };
		expect(out.tools).toEqual([{ x: 1 }, { google_search: {} }]);
	});

	it("anthropic → web_search tool 추가", () => {
		const out = applyGrounding({ messages: [] }, "anthropic") as {
			tools: Array<{ type: string }>;
		};
		expect(out.tools[0]?.type).toBe("web_search_20250305");
	});

	it("mock/chatmock 은 변경하지 않음 (동일 참조 반환)", () => {
		expect(applyGrounding(base, "mock")).toBe(base);
		expect(applyGrounding(base, "chatmock")).toBe(base);
	});

	it("원본 객체를 변경하지 않는다 (불변)", () => {
		const original = { model: "x" };
		applyGrounding(original, "openai");
		expect(original).toEqual({ model: "x" });
	});

	it("객체가 아니면 그대로 반환", () => {
		expect(applyGrounding("nope", "openai")).toBe("nope");
		expect(applyGrounding(null, "openai")).toBe(null);
	});
});

describe("isGroundingEnabledByEnv", () => {
	const original = process.env.XSAG_LLM_GROUNDING;
	afterEach(() => {
		if (original === undefined) delete process.env.XSAG_LLM_GROUNDING;
		else process.env.XSAG_LLM_GROUNDING = original;
	});

	it("기본 OFF", () => {
		delete process.env.XSAG_LLM_GROUNDING;
		expect(isGroundingEnabledByEnv()).toBe(false);
	});
	it("=true 면 ON (공백/대소문자 무관)", () => {
		process.env.XSAG_LLM_GROUNDING = " TRUE ";
		expect(isGroundingEnabledByEnv()).toBe(true);
	});
	it("=false 면 OFF", () => {
		process.env.XSAG_LLM_GROUNDING = "false";
		expect(isGroundingEnabledByEnv()).toBe(false);
	});
});
