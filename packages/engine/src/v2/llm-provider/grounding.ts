/**
 * X-SAG Core Engine v2 — LLM 웹검색 그라운딩 (WS5c · D8 1순위)
 *
 * 검증기 호출을 "학습 기억(브랜드 친숙도)"에서 "실시간 검색·인용"으로 전환한다.
 * 기존 키로 OpenAI/Gemini/Anthropic 의 웹검색 도구를 켜는 것이라 새 벤더가 0이다.
 * (Perplexity 는 선택적 교차검증일 뿐 Tier 4 필수 아님 — PLAN_ENGINE_VALIDATION D8.)
 *
 * 책임 범위(정직성):
 *   이 모듈은 요청 본문에 provider별 웹검색 옵션을 **주입하는 것까지**만 담당한다.
 *   실제 그라운딩 동작(무명/저최적화 사이트 인용 변별)은 **실 키로의 스모크(D7)** 로
 *   확인해야 하며, 기본값이 OFF 이므로 확인 전엔 측정/제품 동작이 바뀌지 않는다.
 *
 * API 형태 (2026-05-30 실 OpenAI 스모크로 검증 — OpenAI 분기는 실측 확정):
 *   - OpenAI Chat Completions: `web_search_options: {}` + `*-search-preview` 모델 필요.
 *       · 실측: search-preview 모델은 `temperature` 거부(400) → 주입 시 제거한다.
 *       · 실측: `max_tokens` 는 허용. 기본 모델은 search-preview 변형으로 매핑한다.
 *   - Gemini generateContent:  `tools: [{ google_search: {} }]`         (실호출 검증은 D7)
 *   - Anthropic Messages:      `tools: [{ type: "web_search_20250305", name: "web_search" }]` (D7)
 */

import type { LlmProviderId } from "./router.js";

/** 그라운딩 ON 시 OpenAI 기본 모델 → 웹검색 가능(search-preview) 변형 매핑. */
const OPENAI_SEARCH_MODEL: Record<string, string> = {
	"gpt-4o-mini": "gpt-4o-mini-search-preview",
	"gpt-4o": "gpt-4o-search-preview",
};

function isTrueEnv(v: string | undefined): boolean {
	return typeof v === "string" && v.trim().toLowerCase() === "true";
}

/** 환경 변수로 그라운딩 기본값 제어 (XSAG_LLM_GROUNDING). 기본 OFF. */
export function isGroundingEnabledByEnv(): boolean {
	return isTrueEnv(process.env.XSAG_LLM_GROUNDING);
}

/** 그라운딩이 의미 있는 실 검색 provider 인지 (mock/chatmock 로컬 프록시는 제외). */
export function providerSupportsGrounding(id: LlmProviderId): boolean {
	return id === "openai" || id === "gemini" || id === "anthropic";
}

/**
 * 요청 본문에 provider별 웹검색 그라운딩 옵션을 주입한다.
 * - 원본을 변경하지 않고 **새 객체**를 반환한다.
 * - 미지원 provider(mock/chatmock) 또는 객체가 아닌 body 는 그대로 반환.
 * - 이미 설정된 tools/web_search_options 는 보존하고 추가한다.
 */
export function applyGrounding(body: unknown, id: LlmProviderId): unknown {
	if (!providerSupportsGrounding(id)) return body;
	if (body === null || typeof body !== "object") return body;
	const base = body as Record<string, unknown>;

	if (id === "gemini") {
		const existing = Array.isArray(base.tools) ? base.tools : [];
		return { ...base, tools: [...existing, { google_search: {} }] };
	}
	if (id === "anthropic") {
		const existing = Array.isArray(base.tools) ? base.tools : [];
		return {
			...base,
			// max_uses: 호출당 검색 횟수 상한 (비용 가드). 정확한 tool type/필드는 D7 실키 스모크로 확정.
			tools: [
				...existing,
				{ type: "web_search_20250305", name: "web_search", max_uses: 3 },
			],
		};
	}
	// openai (chat/completions 호환):
	//   - search-preview 모델은 temperature 미지원(실측 400) → 제거
	//   - 기본 모델은 -search-preview 변형으로 매핑해 web_search_options 가 실제 동작하게 함
	//   - 원본 불변: base 를 새 객체로 복사한 뒤 수정한다.
	const rest: Record<string, unknown> = { ...base };
	delete rest.temperature;
	if (typeof rest.model === "string") {
		const mapped = OPENAI_SEARCH_MODEL[rest.model];
		if (mapped) rest.model = mapped;
	}
	rest.web_search_options = rest.web_search_options ?? {};
	return rest;
}
