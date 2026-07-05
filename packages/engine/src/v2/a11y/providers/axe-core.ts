/**
 * X-SAG Core Engine — axe-core A11Y Provider
 *
 * Phase R-D: axe-core + jsdom 통합 기반 정적 분석.
 *
 * 활성화 조건:
 *  - `axe-core` 와 `jsdom` 패키지가 모두 설치되어 있어야 함 (dynamic import).
 *  - 두 패키지 중 하나라도 없으면 isAvailable() = false 반환 → 체인이 폴백.
 *
 * 환경변수 토글:
 *  - AXE_CORE_DISABLED=true 면 강제로 비활성화 (테스트 격리용).
 *
 * 메모:
 *  - 본 모듈은 ESM 동적 import 로 axe-core 를 로드한다.
 *  - 패키지 누락 시 typecheck 에러를 피하기 위해 모든 axe-core 타입을 `any` 로
 *    캐스팅한다 (axe-core 가 optional peer 이기 때문).
 */

import type {
	A11yInput,
	A11yProvider,
	A11yResult,
	A11yViolation,
} from "../types.js";

// axe-core 가 설치되어 있는지 캐시.
let axeAvailability: boolean | null = null;

async function checkAxeAvailability(): Promise<boolean> {
	if (axeAvailability !== null) return axeAvailability;
	if (process.env.AXE_CORE_DISABLED === "true") {
		axeAvailability = false;
		return false;
	}
	try {
		// 두 모듈 모두 import 시도. 실패하면 false.
		await import("axe-core");
		// @ts-ignore optional peer dependency — no @types/jsdom installed
		await import("jsdom");
		axeAvailability = true;
		return true;
	} catch {
		axeAvailability = false;
		return false;
	}
}

export class AxeCoreA11yProvider implements A11yProvider {
	readonly name = "axe-core" as const;

	/**
	 * 동기 호출이지만 1회 import 결과를 캐시한다.
	 * isAvailable() 이 처음 호출되기 전엔 false 를 반환 (보수적).
	 * 비동기 초기화는 init() 또는 analyze() 호출 시 자동 수행.
	 */
	isAvailable(): boolean {
		if (process.env.AXE_CORE_DISABLED === "true") return false;
		return axeAvailability === true;
	}

	/** 명시적 사전 init — 어댑터 체인 구축 시 호출. */
	async init(): Promise<boolean> {
		return await checkAxeAvailability();
	}

	async analyze(input: A11yInput): Promise<A11yResult> {
		const ok = await checkAxeAvailability();
		if (!ok) {
			throw new Error(
				"axe-core or jsdom is not installed — cannot run AxeCoreA11yProvider",
			);
		}
		// @ts-ignore optional peer dependency — no @types/jsdom installed
		const jsdomMod = (await import("jsdom")) as unknown as {
			JSDOM: new (html: string, opts: unknown) => unknown;
		};
		const axeMod = (await import("axe-core")) as unknown;

		const JSDOMCtor = jsdomMod.JSDOM;
		const dom = new JSDOMCtor(input.html, {
			url: input.url,
			runScripts: "outside-only",
			pretendToBeVisual: true,
		}) as { window: { document: Document } & Record<string, unknown> };

		// axe-core 는 default export 또는 module-style 모두 지원.
		const axe = ((axeMod as { default?: unknown }).default ?? axeMod) as {
			run: (
				ctx: unknown,
				opts: Record<string, unknown>,
			) => Promise<{
				violations: AxeViolation[];
				passes: AxePassEntry[];
				incomplete: AxePassEntry[];
				inapplicable: AxePassEntry[];
			}>;
		};

		const result = await axe.run(dom.window.document, {
			runOnly: {
				type: "tag",
				values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
			},
		});

		const violations: A11yViolation[] = result.violations.map((v) => ({
			ruleId: v.id,
			impact: (v.impact ?? "moderate") as A11yViolation["impact"],
			description: v.description ?? v.help ?? v.id,
			helpUrl:
				v.helpUrl ?? `https://dequeuniversity.com/rules/axe/4.10/${v.id}`,
			affectedNodes: v.nodes?.length ?? 1,
			wcagTags: v.tags ?? [],
		}));

		const passes = result.passes.length;
		const incomplete = result.incomplete.length;
		const inapplicable = result.inapplicable.length;
		const totalRules = passes + violations.length + incomplete + inapplicable;

		const aaViolations = violations.filter((v) =>
			v.wcagTags.some((t) => t === "wcag2aa" || t === "wcag21aa"),
		).length;
		const aaPasses = result.passes.filter((p) =>
			(p.tags ?? []).some((t) => t === "wcag2aa" || t === "wcag21aa"),
		).length;
		const wcag21AaCompliance =
			aaPasses + aaViolations === 0 ? 1 : aaPasses / (aaPasses + aaViolations);

		return {
			violations,
			passes,
			incomplete,
			inapplicable,
			totalRules,
			wcag21AaCompliance,
			source: "axe-core",
			measuredAt: new Date().toISOString(),
		};
	}
}

interface AxeViolation {
	id: string;
	impact?: string;
	description?: string;
	help?: string;
	helpUrl?: string;
	tags?: string[];
	nodes?: { target?: string[] }[];
}

interface AxePassEntry {
	id: string;
	tags?: string[];
}

/** @internal — 테스트 격리용. checkAxeAvailability 의 캐시 리셋. */
export function __resetAxeAvailabilityCache(): void {
	axeAvailability = null;
}
