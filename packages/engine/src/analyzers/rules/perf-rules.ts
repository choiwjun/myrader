/**
 * X-SAG Core Engine — PERF 규칙 카탈로그
 *
 * TRD § 19.2 + POLICY § 24.4 (가중치 15%) 기반.
 * Lighthouse / PageSpeed Insights Core Web Vitals 기준 적용.
 * ruleWeight: high=10, medium=6, low=3
 *
 * 규칙 수: 10개
 * ctx.lighthouseResult 가 없으면 데이터 부족 상태로 passed=true 반환.
 */

import type { Rule, RuleResult } from "../types.js";

// ---------------------------------------------------------------------------
// 헬퍼: lighthouseResult 없을 때 반환할 기본 결과 빌더
// ---------------------------------------------------------------------------

function noData(
	ruleId: string,
	title: string,
	severity: RuleResult["severity"],
	expectedImpact: RuleResult["expectedImpact"],
	ruleWeight: number,
): RuleResult {
	return {
		ruleId,
		category: "perf",
		passed: true,
		severity,
		title,
		description: "Lighthouse 측정 데이터가 없어 분석을 건너뜁니다.",
		evidence: ["lighthouseResult 미제공 — PSI API 호출 필요"],
		recommendation:
			"PageSpeed Insights(https://pagespeed.web.dev/)에서 사이트를 직접 측정해 보세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact,
		ruleWeight,
	};
}

// ---------------------------------------------------------------------------
// PERF-LCP-001: LCP < 2.5s (Good 기준)
// ---------------------------------------------------------------------------
export const perfLcp001: Rule = (ctx): RuleResult => {
	const ruleId = "PERF-LCP-001";
	const title = "LCP(최대 콘텐츠 페인트) 2.5초 이내";
	if (!ctx.lighthouseResult) return noData(ruleId, title, "high", "high", 10);

	const lcp = ctx.lighthouseResult.lcp;
	const passed = lcp <= 2500;
	const lcpSec = (lcp / 1000).toFixed(2);

	return {
		ruleId,
		category: "perf",
		passed,
		severity: "high",
		title,
		description: passed
			? `LCP가 ${lcpSec}초로 권장 기준(2.5초 이내)을 충족합니다.`
			: `LCP가 ${lcpSec}초로 너무 느립니다. 방문자가 첫 화면 로딩을 기다리다 이탈할 수 있습니다.`,
		evidence: [
			`LCP: ${lcpSec}s (기준: ≤ 2.5s)`,
			`측정 전략: ${ctx.lighthouseResult.strategy}`,
		],
		recommendation:
			"대표 이미지나 배너 이미지를 WebP 형식으로 변환하고, 중요한 이미지에 loading='eager'와 fetchpriority='high' 속성을 추가해 달라고 제작 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// PERF-LCP-002: LCP < 4.0s (Needs Improvement 기준)
// ---------------------------------------------------------------------------
export const perfLcp002: Rule = (ctx): RuleResult => {
	const ruleId = "PERF-LCP-002";
	const title = "LCP(최대 콘텐츠 페인트) 4초 이내";
	if (!ctx.lighthouseResult)
		return noData(ruleId, title, "medium", "medium", 6);

	const lcp = ctx.lighthouseResult.lcp;
	const passed = lcp <= 4000;
	const lcpSec = (lcp / 1000).toFixed(2);

	return {
		ruleId,
		category: "perf",
		passed,
		severity: "medium",
		title,
		description: passed
			? `LCP가 ${lcpSec}초로 최소 허용 기준(4초 이내)을 충족합니다.`
			: `LCP가 ${lcpSec}초로 매우 느립니다. 즉각적인 개선이 필요합니다.`,
		evidence: [
			`LCP: ${lcpSec}s (기준: ≤ 4.0s)`,
			`측정 전략: ${ctx.lighthouseResult.strategy}`,
		],
		recommendation:
			"서버 응답 속도를 개선하고 불필요한 자바스크립트 로딩을 줄여달라고 제작 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "hard",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// PERF-FID-001: FID(max-potential-fid) < 100ms
// ---------------------------------------------------------------------------
export const perfFid001: Rule = (ctx): RuleResult => {
	const ruleId = "PERF-FID-001";
	const title = "FID(첫 번째 입력 지연) 100ms 이내";
	if (!ctx.lighthouseResult)
		return noData(ruleId, title, "medium", "medium", 6);

	const fid = ctx.lighthouseResult.fid;
	const passed = fid < 100;

	return {
		ruleId,
		category: "perf",
		passed,
		severity: "medium",
		title,
		description: passed
			? `FID가 ${fid}ms로 권장 기준(100ms 미만)을 충족합니다.`
			: `FID가 ${fid}ms로 버튼 클릭 등의 반응이 느립니다. 방문자가 사이트가 느리다고 느낄 수 있습니다.`,
		evidence: [`FID(max-potential-fid): ${fid}ms (기준: < 100ms)`],
		recommendation:
			"불필요한 자바스크립트 플러그인이나 채팅 위젯을 줄이고, 메인 스레드 작업을 최적화해 달라고 제작 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "hard",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// PERF-CLS-001: CLS < 0.1 (Good 기준)
// ---------------------------------------------------------------------------
export const perfCls001: Rule = (ctx): RuleResult => {
	const ruleId = "PERF-CLS-001";
	const title = "CLS(누적 레이아웃 이동) 0.1 이하";
	if (!ctx.lighthouseResult) return noData(ruleId, title, "high", "high", 10);

	const cls = ctx.lighthouseResult.cls;
	const passed = cls <= 0.1;

	return {
		ruleId,
		category: "perf",
		passed,
		severity: "high",
		title,
		description: passed
			? `CLS가 ${cls.toFixed(3)}으로 권장 기준(0.1 이하)을 충족합니다.`
			: `CLS가 ${cls.toFixed(3)}으로 페이지 로딩 중 요소가 갑자기 이동합니다. 방문자가 버튼을 잘못 클릭할 수 있습니다.`,
		evidence: [`CLS: ${cls.toFixed(3)} (기준: ≤ 0.1)`],
		recommendation:
			"이미지와 배너에 너비/높이 속성(width, height)을 명시하고, 광고나 팝업이 페이지 로딩 후 삽입되지 않도록 해달라고 제작 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// PERF-CLS-002: CLS < 0.25 (Needs Improvement 기준)
// ---------------------------------------------------------------------------
export const perfCls002: Rule = (ctx): RuleResult => {
	const ruleId = "PERF-CLS-002";
	const title = "CLS(누적 레이아웃 이동) 0.25 이하";
	if (!ctx.lighthouseResult)
		return noData(ruleId, title, "medium", "medium", 6);

	const cls = ctx.lighthouseResult.cls;
	const passed = cls <= 0.25;

	return {
		ruleId,
		category: "perf",
		passed,
		severity: "medium",
		title,
		description: passed
			? `CLS가 ${cls.toFixed(3)}으로 최소 허용 기준(0.25 이하)을 충족합니다.`
			: `CLS가 ${cls.toFixed(3)}으로 레이아웃 이동이 심합니다. 즉각적인 개선이 필요합니다.`,
		evidence: [`CLS: ${cls.toFixed(3)} (기준: ≤ 0.25)`],
		recommendation:
			"동적으로 삽입되는 콘텐츠(배너, 팝업, 폰트)에 공간을 미리 확보해 달라고 제작 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "hard",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// PERF-INP-001: INP < 200ms
// ---------------------------------------------------------------------------
export const perfInp001: Rule = (ctx): RuleResult => {
	const ruleId = "PERF-INP-001";
	const title = "INP(다음 페인트까지의 상호작용) 200ms 이내";
	if (!ctx.lighthouseResult)
		return noData(ruleId, title, "medium", "medium", 6);

	const inp = ctx.lighthouseResult.inp;
	if (inp === undefined) {
		return {
			ruleId,
			category: "perf",
			passed: true,
			severity: "medium",
			title,
			description: "INP 데이터를 측정할 수 없습니다.",
			evidence: ["INP 값 없음 — Lighthouse 버전 확인 필요"],
			recommendation:
				"Chrome 사용자 경험 보고서(CrUX) 데이터로 INP를 별도 확인해 보세요.",
			actionType: "vendor_action",
			difficulty: "medium",
			expectedImpact: "medium",
			ruleWeight: 6,
		};
	}

	const passed = inp < 200;

	return {
		ruleId,
		category: "perf",
		passed,
		severity: "medium",
		title,
		description: passed
			? `INP가 ${inp}ms로 권장 기준(200ms 미만)을 충족합니다.`
			: `INP가 ${inp}ms로 사용자 상호작용 후 화면 반응이 느립니다.`,
		evidence: [`INP: ${inp}ms (기준: < 200ms)`],
		recommendation:
			"긴 자바스크립트 작업을 분할하고 이벤트 핸들러를 최적화해 달라고 제작 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "hard",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// PERF-TTFB-001: TTFB < 800ms
// ---------------------------------------------------------------------------
export const perfTtfb001: Rule = (ctx): RuleResult => {
	const ruleId = "PERF-TTFB-001";
	const title = "TTFB(첫 번째 바이트까지의 시간) 800ms 이내";
	if (!ctx.lighthouseResult)
		return noData(ruleId, title, "medium", "medium", 6);

	const ttfb = ctx.lighthouseResult.ttfb;
	const passed = ttfb < 800;

	return {
		ruleId,
		category: "perf",
		passed,
		severity: "medium",
		title,
		description: passed
			? `TTFB가 ${ttfb}ms로 권장 기준(800ms 미만)을 충족합니다.`
			: `TTFB가 ${ttfb}ms로 서버 응답이 느립니다. 모든 성능 지표에 영향을 줍니다.`,
		evidence: [`TTFB: ${ttfb}ms (기준: < 800ms)`],
		recommendation:
			"웹호스팅 서버를 국내 CDN이 지원되는 서비스로 변경하거나 서버 캐시를 설정해 달라고 제작 업체에 요청하세요.",
		actionType: "si_action",
		difficulty: "hard",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// PERF-FCP-001: FCP < 1.8s
// ---------------------------------------------------------------------------
export const perfFcp001: Rule = (ctx): RuleResult => {
	const ruleId = "PERF-FCP-001";
	const title = "FCP(첫 번째 콘텐츠 페인트) 1.8초 이내";
	if (!ctx.lighthouseResult)
		return noData(ruleId, title, "medium", "medium", 6);

	const fcp = ctx.lighthouseResult.fcp;
	const passed = fcp <= 1800;
	const fcpSec = (fcp / 1000).toFixed(2);

	return {
		ruleId,
		category: "perf",
		passed,
		severity: "medium",
		title,
		description: passed
			? `FCP가 ${fcpSec}초로 권장 기준(1.8초 이내)을 충족합니다.`
			: `FCP가 ${fcpSec}초로 첫 화면 표시가 느립니다. 방문자가 빈 화면을 보는 시간이 길어집니다.`,
		evidence: [`FCP: ${fcpSec}s (기준: ≤ 1.8s)`],
		recommendation:
			"중요 CSS를 인라인으로 처리하고 렌더링을 방해하는 스크립트를 제거해 달라고 제작 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// PERF-PERF-SCORE-001: Lighthouse Performance 점수 >= 70
// ---------------------------------------------------------------------------
export const perfPerfScore001: Rule = (ctx): RuleResult => {
	const ruleId = "PERF-PERF-SCORE-001";
	const title = "Lighthouse 성능 점수 70점 이상";
	if (!ctx.lighthouseResult) return noData(ruleId, title, "high", "high", 10);

	const score = ctx.lighthouseResult.performance;
	const passed = score >= 70;

	return {
		ruleId,
		category: "perf",
		passed,
		severity: "high",
		title,
		description: passed
			? `Lighthouse 성능 점수가 ${score}점으로 권장 기준(70점 이상)을 충족합니다.`
			: `Lighthouse 성능 점수가 ${score}점으로 낮습니다. 사이트 속도가 전반적으로 개선이 필요합니다.`,
		evidence: [
			`성능 점수: ${score}/100 (기준: ≥ 70)`,
			`측정 전략: ${ctx.lighthouseResult.strategy}`,
		],
		recommendation:
			"PageSpeed Insights 보고서의 '개선 기회' 항목을 확인하여 제작 업체에 개선을 요청하세요. 이미지 최적화, 미사용 JavaScript 제거가 가장 효과적입니다.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// PERF-MOBILE-001: 모바일 Lighthouse 점수 >= 50
// ---------------------------------------------------------------------------
export const perfMobile001: Rule = (ctx): RuleResult => {
	const ruleId = "PERF-MOBILE-001";
	const title = "모바일 Lighthouse 성능 점수 50점 이상";
	if (!ctx.lighthouseResult)
		return noData(ruleId, title, "medium", "medium", 6);

	const isMobile = ctx.lighthouseResult.strategy === "mobile";
	const score = ctx.lighthouseResult.performance;
	const passed = !isMobile || score >= 50;

	return {
		ruleId,
		category: "perf",
		passed,
		severity: "medium",
		title,
		description: !isMobile
			? "모바일 측정이 아니므로 검사를 건너뜁니다."
			: passed
				? `모바일 성능 점수가 ${score}점으로 최소 기준(50점 이상)을 충족합니다.`
				: `모바일 성능 점수가 ${score}점으로 매우 낮습니다. 모바일 사용자(전체 방문의 70~80%) 경험이 나쁩니다.`,
		evidence: [
			`성능 점수(모바일): ${score}/100 (기준: ≥ 50)`,
			`측정 전략: ${ctx.lighthouseResult.strategy}`,
		],
		recommendation:
			"모바일 환경에서 이미지 용량을 줄이고(모바일용 리사이즈), 폰트 로딩을 최적화해 달라고 제작 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};
