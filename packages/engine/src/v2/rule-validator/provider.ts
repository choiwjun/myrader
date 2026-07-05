/**
 * X-SAG Core Engine v2 — ChatMock Rule Semantic Validator Provider
 *
 * 진단 룰의 의미적 정합성을 ChatMock(OpenAI 호환 로컬 프록시) 으로 검토한다.
 *
 * 활성화 조건 (둘 중 하나, geo-validator 와 동일):
 *   1. CHATMOCK_ENABLED=true
 *   2. CHATMOCK_BASE_URL 명시적 설정
 *
 * 환경변수 (geo-validator/providers/chatmock.ts 와 동일):
 *   - CHATMOCK_BASE_URL (기본 http://localhost:8000/v1)
 *   - CHATMOCK_API_KEY  (기본 "chatmock-local" — 더미)
 *   - CHATMOCK_MODEL    (기본 "gpt-4o")
 *   - CHATMOCK_ENABLED  ("true" 이면 명시적 활성화)
 *
 * 호출 패턴:
 *   - POST /v1/chat/completions
 *   - batchSize=5 (한 번에 룰 5개를 묶어 보내 roundtrip 감소)
 *   - max_tokens: 1500 (배치 응답이라 좀 더 크게)
 *   - temperature: 0.2 (리뷰는 일관성이 더 중요)
 *   - timeout: 60s (배치 응답 시간 여유)
 *   - rate limit: 배치 간 500ms
 *
 * Wave 5 라우팅:
 *   - 옵션으로 `providerConfig` 를 받으면 base URL/API key/model 을 override 한다.
 *   - `getActiveLlmProvider()` 와 결합해 `LLM_PROVIDER` 환경 변수로 스위칭 가능.
 */

import {
	callLlmWithReliability,
	CircuitBreaker,
	isChatMockAvailableByEnv,
	isSystemicLlmStatus,
	LlmHttpError,
} from "../llm-provider/index.js";
import type { LlmProviderConfig } from "../llm-provider/index.js";
import type {
	RuleDescriptor,
	RuleSemanticIssue,
	RuleSemanticReport,
	RuleSemanticSeverity,
	RuleSemanticValidator,
} from "./types.js";

const DEFAULT_BASE_URL = "http://localhost:8000/v1";
const DEFAULT_API_KEY = "chatmock-local";
const DEFAULT_MODEL = "gpt-4o";
const TIMEOUT_MS = 60_000;
const RATE_LIMIT_MS = 500;
const MAX_TOKENS = 1500;
const DEFAULT_BATCH_SIZE = 5;

// GAP 3 신뢰성 기본값 (보수적 — 정당한 커버리지를 줄이지 않도록).
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 2_000;
// breaker: systemic(429/401/403) 연속 3회면 cooldown 동안 fail-fast.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 10_000;

const SYSTEM_PROMPT = `당신은 SEO/AEO/GEO 진단 규칙을 검토하는 시니어 컨설턴트입니다.
각 규칙의 [의도]와 [구현]이 일치하는지, 의도가 명확한지, 사용자에게 가치를 주는지를 평가하세요.

각 규칙에 대해 다음 JSON 형식으로 응답하세요:
{
  "ruleId": "...",
  "severity": "info|warn|critical",
  "issue": "발견된 의미적 불일치 또는 모호함",
  "suggestion": "개선 방향"
}

여러 규칙을 검토할 때는 JSON array 로 응답하세요.
문제가 없으면 응답에서 해당 ruleId 를 생략하세요.
JSON 외 다른 설명은 출력하지 마세요.`;

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

interface RawIssueShape {
	ruleId?: unknown;
	severity?: unknown;
	issue?: unknown;
	suggestion?: unknown;
}

export interface ChatMockRuleSemanticValidatorOptions {
	/** 배치 간 대기 시간 (ms). 기본 500. */
	rateLimitMs?: number;
	/** 단일 호출 타임아웃 (ms). 기본 60000. */
	timeoutMs?: number;
	/** 한 번에 검토할 룰 수 (기본 5) */
	batchSize?: number;
	/**
	 * Wave 5: 라우터에서 받은 호출 설정.
	 * 지정되면 CHATMOCK_* 환경 변수 대신 이 값을 사용한다.
	 */
	providerConfig?: LlmProviderConfig;
}

export class RuleSemanticChatMockValidator implements RuleSemanticValidator {
	readonly name = "chatmock" as const;

	private readonly rateLimitMs: number;
	private readonly timeoutMs: number;
	private readonly batchSize: number;
	private readonly providerConfig: LlmProviderConfig | undefined;
	/** GAP 3: provider 별 in-process 회로 차단기 (인스턴스 수명 동안 공유). */
	private readonly breaker: CircuitBreaker;

	constructor(options: ChatMockRuleSemanticValidatorOptions = {}) {
		this.rateLimitMs = options.rateLimitMs ?? RATE_LIMIT_MS;
		this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
		this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
		this.providerConfig = options.providerConfig;
		if (this.batchSize < 1) {
			throw new Error("batchSize must be >= 1");
		}
		this.breaker = new CircuitBreaker({
			threshold: BREAKER_THRESHOLD,
			cooldownMs: BREAKER_COOLDOWN_MS,
		});
	}

	isAvailable(): boolean {
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

	async validate(rules: RuleDescriptor[]): Promise<RuleSemanticReport> {
		const issues: RuleSemanticIssue[] = [];
		let reviewedCount = 0;

		const batches = chunk(rules, this.batchSize);

		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i];
			if (!batch || batch.length === 0) continue;

			const raw = await this.askChatMock(batch);
			const parsed = tryParseIssues(raw, batch);

			if (parsed === null) {
				// JSON parse 실패 — 해당 배치는 skip 하고 warn 출력, 전체는 계속.
				// 사용자에게 진단 신호는 주되 다른 배치 결과는 보존한다.
				// eslint-disable-next-line no-console
				console.warn(
					`[rule-validator] batch ${i + 1}/${batches.length} JSON parse 실패 — 해당 배치 ${batch.length}개 룰은 검토 미완료로 처리.`,
				);
			} else {
				issues.push(...parsed);
				reviewedCount += batch.length;
			}

			// 마지막 배치 이후엔 sleep 생략
			if (i < batches.length - 1 && this.rateLimitMs > 0) {
				await this.delay(this.rateLimitMs);
			}
		}

		return {
			totalRules: rules.length,
			reviewed: reviewedCount,
			issues,
			summary: buildSummary(rules.length, reviewedCount, issues),
			validatedAt: new Date().toISOString(),
			source: this.name,
		};
	}

	/**
	 * 룰 배치 1개를 ChatMock 에 보내고 응답 텍스트(JSON 으로 추정) 를 반환한다.
	 * 네트워크/타임아웃 실패는 빈 문자열로 처리 (호출자가 parse 실패로 인식).
	 */
	private async askChatMock(batch: RuleDescriptor[]): Promise<string> {
		// providerConfig 우선, 미지정 시 CHATMOCK_* 환경 변수 폴백
		const baseUrl = this.providerConfig
			? this.providerConfig.baseUrl
			: (process.env.CHATMOCK_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
		const apiKey = this.providerConfig
			? this.providerConfig.apiKey
			: (process.env.CHATMOCK_API_KEY ?? DEFAULT_API_KEY);
		const model = this.providerConfig
			? this.providerConfig.model
			: (process.env.CHATMOCK_MODEL ?? DEFAULT_MODEL);

		const userPrompt = formatBatchPrompt(batch);
		const standardBody = {
			model,
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: userPrompt },
			],
			max_tokens: MAX_TOKENS,
			temperature: 0.2,
			response_format: { type: "json_object" },
		};
		const request = this.buildProviderRequest(
			baseUrl,
			apiKey,
			model,
			standardBody,
		);
		const providerId = this.providerConfig?.id ?? "chatmock";

		// GAP 3: 단일 HTTP 시도. non-ok 는 systemic/transient 모두 LlmHttpError 로 throw 하여
		// withRetry(systemic 미재시도) + breaker(systemic 집계) 가 동작하게 한다.
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
					let detail = "";
					try {
						detail = (await res.text())
							.replace(/\s+/g, " ")
							.trim()
							.slice(0, 500);
					} catch {
						detail = "";
					}
					// eslint-disable-next-line no-console
					console.warn(
						`[rule-validator] provider HTTP ${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`,
					);
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
		} catch (error) {
			// rule-validator 계약: 모든 실패(systemic/transient/회로 open/네트워크)는 빈 문자열로
			// 흘려 caller 가 parse 실패(배치 skip)로 처리한다 — 다른 배치 결과는 보존한다.
			const message =
				error instanceof LlmHttpError
					? error.message
					: error instanceof Error
						? error.message
						: "unknown provider request error";
			// systemic 은 위 HTTP 로그로 이미 보고됨 — 일시적/네트워크만 추가 로그.
			if (!(error instanceof LlmHttpError && isSystemicLlmStatus(error.status))) {
				// eslint-disable-next-line no-console
				console.warn(`[rule-validator] provider request failed: ${message}`);
			}
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
		const body = cfg?.requestTransform
			? cfg.requestTransform(standardBody)
			: standardBody;

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

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/** 입력 배열을 size 크기로 분할 */
function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		out.push(arr.slice(i, i + size));
	}
	return out;
}

/** 한 배치를 사용자 프롬프트로 직렬화 */
function formatBatchPrompt(batch: RuleDescriptor[]): string {
	const lines: string[] = [
		"아래 진단 규칙들을 검토하고 의미적 이슈를 JSON array 로 응답하세요.",
		"",
	];
	for (let i = 0; i < batch.length; i++) {
		const r = batch[i];
		if (!r) continue;
		lines.push(`### 규칙 ${i + 1}: ${r.ruleId}`);
		lines.push(`- 카테고리: ${r.category}`);
		lines.push(`- 제목: ${r.title}`);
		lines.push(`- 설명: ${r.description}`);
		lines.push(`- [의도]: ${r.intent}`);
		lines.push(`- [구현]: ${r.implementationHint}`);
		lines.push("");
	}
	lines.push(
		'JSON array 형식: [{"ruleId":"...","severity":"info|warn|critical","issue":"...","suggestion":"..."}]',
	);
	lines.push("문제가 없는 규칙은 array 에서 제외하세요.");
	return lines.join("\n");
}

/**
 * LLM 응답 텍스트에서 JSON array 를 안전하게 파싱한다.
 *
 * 반환:
 *   - 성공: RuleSemanticIssue[] (빈 배열은 "이슈 없음" 을 의미)
 *   - 실패: null (호출자가 batch skip 로 처리)
 *
 * 동작:
 *   1. 응답이 빈 문자열이면 fail
 *   2. ```json ... ``` 코드펜스가 있으면 안쪽 내용만 추출
 *   3. 첫 '[' 와 마지막 ']' 사이를 시도 → fallback 으로 첫 '{' 와 마지막 '}' 시도
 *   4. parse 실패 시 null
 *   5. parse 성공해도 항목이 RuleSemanticIssue shape 가 아니면 무시(필터)
 *   6. batch 에 없는 ruleId 는 무시
 */
function tryParseIssues(
	raw: string,
	batch: RuleDescriptor[],
): RuleSemanticIssue[] | null {
	if (!raw || raw.trim().length === 0) {
		return null;
	}

	let text = raw.trim();

	// 코드펜스 제거
	const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fenceMatch?.[1]) {
		text = fenceMatch[1].trim();
	}

	// 1차: array 추출
	const firstBracket = text.indexOf("[");
	const lastBracket = text.lastIndexOf("]");
	let arrayLike: unknown = undefined;

	if (firstBracket !== -1 && lastBracket > firstBracket) {
		const slice = text.slice(firstBracket, lastBracket + 1);
		try {
			arrayLike = JSON.parse(slice);
		} catch {
			arrayLike = undefined;
		}
	}

	// 2차: 단일 object → array 로 승격
	if (arrayLike === undefined) {
		const firstBrace = text.indexOf("{");
		const lastBrace = text.lastIndexOf("}");
		if (firstBrace !== -1 && lastBrace > firstBrace) {
			const slice = text.slice(firstBrace, lastBrace + 1);
			try {
				const obj = JSON.parse(slice) as unknown;
				arrayLike = [obj];
			} catch {
				arrayLike = undefined;
			}
		}
	}

	if (!Array.isArray(arrayLike)) {
		return null;
	}

	const batchIds = new Set(batch.map((r) => r.ruleId));
	const issues: RuleSemanticIssue[] = [];

	for (const item of arrayLike) {
		const issue = normalizeIssue(item, batchIds);
		if (issue) {
			issues.push(issue);
		}
	}

	return issues;
}

function normalizeIssue(
	raw: unknown,
	allowedIds: Set<string>,
): RuleSemanticIssue | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as RawIssueShape;
	const ruleId = typeof r.ruleId === "string" ? r.ruleId : null;
	const severity =
		typeof r.severity === "string" ? normalizeSeverity(r.severity) : null;
	const issue = typeof r.issue === "string" ? r.issue : null;
	const suggestion = typeof r.suggestion === "string" ? r.suggestion : "";

	if (!ruleId || !severity || !issue) return null;
	if (!allowedIds.has(ruleId)) return null;

	return { ruleId, severity, issue, suggestion };
}

function normalizeSeverity(s: string): RuleSemanticSeverity | null {
	const v = s.toLowerCase().trim();
	if (v === "info" || v === "warn" || v === "critical") return v;
	return null;
}

function buildSummary(
	total: number,
	reviewed: number,
	issues: RuleSemanticIssue[],
): string {
	const counts = { info: 0, warn: 0, critical: 0 };
	for (const i of issues) counts[i.severity] += 1;
	const skipped = total - reviewed;
	const skippedNote =
		skipped > 0 ? `, ${skipped}개 미검토(LLM 응답 파싱 실패)` : "";
	return `${total}개 룰 중 ${reviewed}개 검토 완료${skippedNote} — 이슈 ${issues.length}건 (critical ${counts.critical} / warn ${counts.warn} / info ${counts.info}).`;
}
