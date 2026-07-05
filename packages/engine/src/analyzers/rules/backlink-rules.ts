/**
 * X-SAG Core Engine — BACKLINK 규칙 카탈로그
 *
 * Phase R-D: 백링크/도메인 권위 룰 8개.
 *
 * 룰들은 RuleContext.backlinkResult 가 있을 때만 실질 평가하고,
 * 없으면 informational(passed=true) 로 처리한다.
 *
 * 카테고리: 모두 "backlink" — 점수 미포함 (informational).
 * ruleWeight: high=10, medium=6, low=3.
 *
 * 룰 목록:
 *  BACKLINK-DA-001                          (high)
 *  BACKLINK-HTTPS-001                       (high)
 *  BACKLINK-CANONICAL-CONSISTENCY-001       (medium)
 *  BACKLINK-STRUCTURED-DATA-DIVERSITY-001   (medium)
 *  BACKLINK-SOCIAL-META-001                 (medium)
 *  BACKLINK-INTERNAL-LINK-DEPTH-001         (medium)
 *  BACKLINK-LINK-EQUITY-001                 (low)
 *  BACKLINK-AGE-SIGNAL-001                  (low, informational)
 */

import type { BacklinkResult } from "../../v2/backlink/types.js";
import type { Rule, RuleResult } from "../types.js";

// ---------------------------------------------------------------------------
// 공통: backlinkResult 없을 때 반환할 informational placeholder
// ---------------------------------------------------------------------------

function backlinkUnavailable(
	ruleId: string,
	title: string,
	severity: "high" | "medium" | "low",
	weight: number,
): RuleResult {
	return {
		ruleId,
		category: "backlink",
		passed: true,
		severity,
		title,
		description: "백링크/도메인 권위 데이터가 없어 평가를 건너뜁니다.",
		evidence: [
			"backlinkResult 미제공 — Ahrefs/Moz API 키 또는 휴리스틱 시그널 필요",
		],
		recommendation:
			"Ahrefs/Moz API 키를 설정하거나 휴리스틱 어댑터를 활성화하면 도메인 권위 진단이 가능합니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: weight,
	};
}

// ---------------------------------------------------------------------------
// BACKLINK-DA-001: 추정 도메인 권위(DA) ≥ 30
// ---------------------------------------------------------------------------

export const backlinkDa001: Rule = (ctx): RuleResult => {
	const ruleId = "BACKLINK-DA-001";
	const title = "추정 도메인 권위(DA) 30 이상";
	const bl: BacklinkResult | undefined = ctx.backlinkResult;
	if (!bl) return backlinkUnavailable(ruleId, title, "high", 10);

	const da = bl.domainAuthority;
	const passed = da >= 30;
	return {
		ruleId,
		category: "backlink",
		passed,
		severity: "high",
		title,
		description: passed
			? `추정 도메인 권위가 ${da}으로 양호합니다 (출처: ${bl.source}).`
			: `추정 도메인 권위가 ${da}으로 낮습니다. 외부 사이트의 신뢰 신호 확보가 필요합니다 (출처: ${bl.source}).`,
		evidence: [
			`domainAuthority: ${da}`,
			`source: ${bl.source}`,
			`confidence: ${bl.confidence.toFixed(2)}`,
		],
		recommendation:
			"관련 업계 디렉토리(네이버 플레이스, 카카오맵, 업종 협회 등)에 사이트를 등록하고, 블로그/SNS에서 정확한 URL로 사이트가 인용되도록 콘텐츠 마케팅을 늘리세요.",
		actionType: "self_fix",
		difficulty: "medium",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// BACKLINK-HTTPS-001: HTTPS 적용 + HSTS (백링크 권위 누수 방지)
// ---------------------------------------------------------------------------

export const backlinkHttps001: Rule = (ctx): RuleResult => {
	const ruleId = "BACKLINK-HTTPS-001";
	const title = "HTTPS + HSTS 적용 (백링크 권위 보호)";
	const bl: BacklinkResult | undefined = ctx.backlinkResult;
	if (!bl) return backlinkUnavailable(ruleId, title, "high", 10);

	const httpsOk = bl.signals.httpsEnforced;
	const hstsOk = bl.signals.hsts;
	const passed = httpsOk && hstsOk;
	return {
		ruleId,
		category: "backlink",
		passed,
		severity: "high",
		title,
		description: passed
			? "HTTPS 와 HSTS 가 모두 적용되어 백링크가 안전하게 전달됩니다."
			: httpsOk
				? "HTTPS 는 적용됐지만 HSTS 가 없어 일부 사용자가 HTTP 로 접근할 수 있습니다."
				: "HTTPS 가 적용되지 않아 외부 사이트에서 사이트를 인용할 때 보안 경고를 받습니다.",
		evidence: [`httpsEnforced: ${httpsOk}`, `hsts: ${hstsOk}`],
		recommendation:
			"홈페이지 제작 업체에 SSL 인증서를 설치하고 응답 헤더에 'Strict-Transport-Security: max-age=31536000' 을 추가해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// BACKLINK-CANONICAL-CONSISTENCY-001: canonical 일관성 (권위 누수 방지)
// ---------------------------------------------------------------------------

export const backlinkCanonicalConsistency001: Rule = (ctx): RuleResult => {
	const ruleId = "BACKLINK-CANONICAL-CONSISTENCY-001";
	const title = "canonical URL 일관성 (백링크 권위 통합)";
	const bl: BacklinkResult | undefined = ctx.backlinkResult;
	if (!bl) return backlinkUnavailable(ruleId, title, "medium", 6);

	const passed = bl.signals.canonicalConsistency;
	return {
		ruleId,
		category: "backlink",
		passed,
		severity: "medium",
		title,
		description: passed
			? "모든 페이지의 canonical 이 동일 도메인을 가리켜 백링크 권위가 한 곳으로 모입니다."
			: "canonical 이 일관되지 않아 외부 백링크의 권위가 여러 URL 로 분산될 수 있습니다.",
		evidence: [`canonicalConsistency: ${bl.signals.canonicalConsistency}`],
		recommendation:
			"각 페이지의 <link rel='canonical' href='https://본도메인/페이지경로'> 가 같은 도메인·동일 형식(www 포함 여부, trailing slash) 으로 통일되도록 제작 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// BACKLINK-STRUCTURED-DATA-DIVERSITY-001: JSON-LD 3종 이상
// ---------------------------------------------------------------------------

export const backlinkStructuredDataDiversity001: Rule = (ctx): RuleResult => {
	const ruleId = "BACKLINK-STRUCTURED-DATA-DIVERSITY-001";
	const title = "구조화 데이터(JSON-LD) 3종 이상";
	const bl: BacklinkResult | undefined = ctx.backlinkResult;
	if (!bl) return backlinkUnavailable(ruleId, title, "medium", 6);

	const count = bl.signals.structuredDataCount;
	const passed = count >= 3;
	return {
		ruleId,
		category: "backlink",
		passed,
		severity: "medium",
		title,
		description: passed
			? `JSON-LD 구조화 데이터가 ${count}종 등록되어 검색엔진/AI 가 사이트를 신뢰합니다.`
			: `JSON-LD 가 ${count}종으로 부족합니다. Organization, LocalBusiness, WebSite 등 3종 이상 권장.`,
		evidence: [`structuredDataCount: ${count}`, "기준: ≥ 3"],
		recommendation:
			"Organization, LocalBusiness, WebSite, BreadcrumbList 등 다양한 JSON-LD 를 페이지에 삽입해달라고 제작 업체에 요청하세요.",
		actionType: "snippet_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// BACKLINK-SOCIAL-META-001: 소셜 메타 (og:*, twitter:*) 충분
// ---------------------------------------------------------------------------

export const backlinkSocialMeta001: Rule = (ctx): RuleResult => {
	const ruleId = "BACKLINK-SOCIAL-META-001";
	const title = "소셜 미디어 메타태그 완성도 (백링크 유도)";
	const bl: BacklinkResult | undefined = ctx.backlinkResult;
	if (!bl) return backlinkUnavailable(ruleId, title, "medium", 6);

	const count = bl.signals.socialMetaCount;
	const passed = count >= 5;
	return {
		ruleId,
		category: "backlink",
		passed,
		severity: "medium",
		title,
		description: passed
			? `소셜 메타태그가 ${count}개 설정되어 SNS 공유 시 미리보기가 풍부하게 노출됩니다.`
			: `소셜 메타태그가 ${count}개로 부족합니다. og:title/description/image/url 과 twitter:card/title/description 까지 권장.`,
		evidence: [`socialMetaCount: ${count}`, "기준: ≥ 5"],
		recommendation:
			"<meta property='og:title|og:description|og:image|og:url'> 과 <meta name='twitter:card|twitter:title|twitter:description'> 을 모두 추가해 SNS 공유 시 클릭률을 올리세요.",
		actionType: "snippet_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// BACKLINK-INTERNAL-LINK-DEPTH-001: 메인 → 모든 페이지 클릭 깊이 ≤ 3
// ---------------------------------------------------------------------------

export const backlinkInternalLinkDepth001: Rule = (ctx): RuleResult => {
	const ruleId = "BACKLINK-INTERNAL-LINK-DEPTH-001";
	const title = "내부 링크 클릭 깊이 3단계 이내";
	const bl: BacklinkResult | undefined = ctx.backlinkResult;
	if (!bl) return backlinkUnavailable(ruleId, title, "medium", 6);

	// BFS: 메인 페이지에서 internalLinks 를 따라가며 모든 페이지 도달 가능 한지.
	const mainUrl = ctx.mainPage.url;
	const urlSet = new Set(ctx.pages.map((p) => p.url));
	const depths = new Map<string, number>();
	depths.set(mainUrl, 0);
	const queue: string[] = [mainUrl];
	while (queue.length > 0) {
		const cur = queue.shift();
		if (!cur) continue;
		const page = ctx.pages.find((p) => p.url === cur);
		if (!page) continue;
		const d = depths.get(cur) ?? 0;
		for (const link of page.internalLinks) {
			if (!urlSet.has(link)) continue;
			if (depths.has(link)) continue;
			depths.set(link, d + 1);
			queue.push(link);
		}
	}
	let maxDepth = 0;
	for (const d of depths.values()) {
		if (d > maxDepth) maxDepth = d;
	}
	const unreachable = ctx.pages.filter((p) => !depths.has(p.url)).length;
	const passed = maxDepth <= 3 && unreachable === 0;

	return {
		ruleId,
		category: "backlink",
		passed,
		severity: "medium",
		title,
		description: passed
			? `내부 링크가 잘 연결되어 메인에서 모든 페이지를 최대 ${maxDepth}단계 안에 도달할 수 있습니다.`
			: `메인에서 일부 페이지까지의 클릭 깊이가 ${maxDepth}단계이고 도달 불가 페이지가 ${unreachable}개 있어 백링크 권위가 잘 분산되지 않습니다.`,
		evidence: [
			`maxDepth: ${maxDepth}`,
			`unreachablePages: ${unreachable}`,
			`totalPages: ${ctx.pages.length}`,
		],
		recommendation:
			"메인 페이지의 메뉴/푸터에 주요 페이지(서비스·가격·문의 등) 링크를 직접 노출하고, 각 페이지 하단에 관련 페이지 링크를 추가해 클릭 깊이를 3단계 이내로 줄이세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// BACKLINK-LINK-EQUITY-001: 외부 outbound link 적절 (페이지당 ≤ 50)
// ---------------------------------------------------------------------------

export const backlinkLinkEquity001: Rule = (ctx): RuleResult => {
	const ruleId = "BACKLINK-LINK-EQUITY-001";
	const title = "외부 링크 수 적정 (권위 누수 방지)";
	const bl: BacklinkResult | undefined = ctx.backlinkResult;
	if (!bl) return backlinkUnavailable(ruleId, title, "low", 3);

	const main = ctx.mainPage;
	const externalCount = main.externalLinks.length;
	const passed = externalCount <= 50;
	return {
		ruleId,
		category: "backlink",
		passed,
		severity: "low",
		title,
		description: passed
			? `메인 페이지의 외부 링크가 ${externalCount}개로 적정 수준입니다.`
			: `메인 페이지에 외부 링크가 ${externalCount}개로 너무 많아 사이트 권위가 외부로 빠져나갑니다.`,
		evidence: [`메인 외부 링크 수: ${externalCount}`, "기준: ≤ 50"],
		recommendation:
			"메인 페이지에 외부 사이트로 나가는 링크를 줄이고, 꼭 필요한 외부 링크에는 rel='nofollow' 또는 rel='ugc' 를 추가해 권위 누수를 막으세요.",
		actionType: "snippet_action",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// BACKLINK-AGE-SIGNAL-001: 도메인 age 신호 (informational)
// ---------------------------------------------------------------------------

export const backlinkAgeSignal001: Rule = (ctx): RuleResult => {
	const ruleId = "BACKLINK-AGE-SIGNAL-001";
	const title = "도메인 age 신호 (Last-Modified / 카피라이트 연도)";
	const bl: BacklinkResult | undefined = ctx.backlinkResult;
	if (!bl) return backlinkUnavailable(ruleId, title, "low", 3);

	const main = ctx.mainPage;
	const lastMod = main.lastModified ?? null;
	// bodyText 에서 © YYYY 패턴 매칭
	const yearMatch = main.bodyText.match(/©\s*(\d{4})/);
	const copyrightYear = yearMatch?.[1] ?? null;
	// 현재 연도 대비 최신성
	const currentYear = new Date().getFullYear();
	const cyNum = copyrightYear ? Number.parseInt(copyrightYear, 10) : null;
	const recentCopyright = cyNum !== null && cyNum >= currentYear - 1;
	const passed = Boolean(lastMod) || recentCopyright;

	return {
		ruleId,
		category: "backlink",
		passed,
		severity: "low",
		title,
		description: passed
			? "Last-Modified 또는 최근 카피라이트 연도가 발견되어 사이트가 최신 상태로 보입니다."
			: "Last-Modified 또는 최근 카피라이트 연도가 없어 사이트가 오래돼 보일 수 있습니다.",
		evidence: [
			`lastModified: ${lastMod ?? "없음"}`,
			`copyrightYear: ${copyrightYear ?? "없음"}`,
		],
		recommendation:
			"푸터의 카피라이트 연도를 매년 업데이트하고, 서버 응답에 Last-Modified 헤더를 포함하도록 제작 업체에 요청하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};
