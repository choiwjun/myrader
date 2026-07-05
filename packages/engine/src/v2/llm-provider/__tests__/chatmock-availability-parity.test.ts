/**
 * ChatMock isAvailable() 6-way 동형성(parity) 테스트 — WS1.2 (복제 버그 방지)
 *
 * geo / aeo / nlp / rule-validator 검증기와 recommendation ChatMock provider,
 * 그리고 라우터 `isChatMockAvailableByEnv()` 가 환경 기반 분기에서 **동일하게**
 * 동작하는지 검증한다. 특히 `CHATMOCK_ENABLED=false` 명시적 OFF(B1)를 6곳 모두
 * 존중해야 한다 — 과거엔 각자 복제된 2-state 로직이라 분기가 어긋날 위험이 있었다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatMockProvider } from "../../../recommendation/providers/chatmock.js";
import { ChatMockAeoValidator } from "../../aeo-validator/providers/chatmock.js";
import { ChatMockGeoValidator } from "../../geo-validator/providers/chatmock.js";
import { ChatMockNlpProvider } from "../../nlp/providers/chatmock.js";
import { RuleSemanticChatMockValidator } from "../../rule-validator/provider.js";
import { isChatMockAvailableByEnv } from "../router.js";

const ENV_KEYS = ["CHATMOCK_ENABLED", "CHATMOCK_BASE_URL", "LLM_PROVIDER"] as const;
const original: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
	for (const k of ENV_KEYS) {
		original[k] = process.env[k];
		delete process.env[k];
	}
});

afterEach(() => {
	for (const k of ENV_KEYS) {
		const v = original[k];
		if (v === undefined) delete process.env[k];
		else process.env[k] = v;
	}
});

/**
 * 6곳의 환경 기반 isAvailable() 결과 (providerConfig 미주입 = 환경 분기 경로).
 * 라우터 헬퍼를 마지막에 둔다.
 */
function envBranchAvailability(): boolean[] {
	return [
		new ChatMockGeoValidator().isAvailable(),
		new ChatMockAeoValidator().isAvailable(),
		new ChatMockNlpProvider().isAvailable(),
		new RuleSemanticChatMockValidator().isAvailable(),
		new ChatMockProvider().isAvailable(),
		isChatMockAvailableByEnv(),
	];
}

describe("ChatMock isAvailable() 6-way parity (환경 분기)", () => {
	it("CHATMOCK_ENABLED=false + BASE_URL → 6곳 전부 false (B1 명시적 OFF)", () => {
		process.env["CHATMOCK_ENABLED"] = "false";
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:8000/v1";
		const all = envBranchAvailability();
		expect(all).toEqual([false, false, false, false, false, false]);
	});

	it("CHATMOCK_ENABLED=true → 6곳 전부 true", () => {
		process.env["CHATMOCK_ENABLED"] = "true";
		expect(envBranchAvailability()).toEqual([true, true, true, true, true, true]);
	});

	it("BASE_URL 만 설정 → 6곳 전부 true (dev 편의)", () => {
		process.env["CHATMOCK_BASE_URL"] = "http://localhost:8000/v1";
		expect(envBranchAvailability()).toEqual([true, true, true, true, true, true]);
	});

	it("환경 미설정 → 6곳 전부 false", () => {
		expect(envBranchAvailability()).toEqual([
			false,
			false,
			false,
			false,
			false,
			false,
		]);
	});
});
