/**
 * X-SAG Core Engine — SEO 규칙 카탈로그
 *
 * PRD § 9 + TRD § 10.3 기반. 규칙 기반 정적 분석만 수행 (POLICY § 7.1).
 * 모든 recommendation 은 비전문가 소상공인이 이해할 수 있는 한국어 문장.
 * ruleWeight: high=10, medium=6, low=3
 *
 * 규칙 수: 48개 (기존 36개 Phase M-A + 신규 12개 Phase O-D)
 */

import type { Rule, RuleResult } from "../types.js";
import { getSchemaNodes } from "../shared/schema-validator.js";

const SITEMAP_LINK_PATTERN = /\/sitemap[\w-]*\.xml(?:$|[?#])/i;

function hasSitemapSignal(ctx: Parameters<Rule>[0]): boolean {
	if (ctx.sitemapUsed === true) return true;
	return ctx.pages.some(
		(p) =>
			p.internalLinks.some((l) => SITEMAP_LINK_PATTERN.test(l)) ||
			p.externalLinks.some((l) => SITEMAP_LINK_PATTERN.test(l)),
	);
}

// ---------------------------------------------------------------------------
// SEO-KEYWORD-001 보조 — word-aware 키워드 매칭 (case/spacing 정규화)
// ---------------------------------------------------------------------------

/**
 * 키워드/위치 텍스트 정규화: 소문자 + 연속 공백류(공백/탭/줄바꿈)를 단일 공백으로 축약,
 * 양끝 trim. 한국어는 어절 사이 띄어쓰기 변형("강남 카페"/"강남  카페")을 흡수한다.
 */
function normalizeForKeyword(s: string): string {
	return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * 키워드가 location 텍스트에 "word-aware" 로 등장하는지 검사한다.
 *
 * 단순 substring(`includes`) 은 incidental 매치(예: 키워드 "카페" 가 "카페트"·"북카페형")
 * 와 띄어쓰기 변형("강남 카페" vs "강남카페")을 모두 잘못 처리한다. 여기서는:
 *  1) 양쪽을 정규화(case/whitespace)한다.
 *  2) 다어절 키워드는 모든 어절이 "전체 단어 경계" 로 location 에 존재하면 매치로 본다
 *     (어절 순서 무관). 이는 띄어쓰기 변형을 흡수하면서 우연한 부분일치를 줄인다.
 *  3) 단일 어절 키워드는 단어 경계 정규식으로 검사한다. 한국어처럼 \b 가 동작하지 않는
 *     스크립트는 "앞뒤가 영숫자가 아님" 으로 경계를 근사한다.
 */
function keywordMatchesLocation(keyword: string, location: string): boolean {
	const kw = normalizeForKeyword(keyword);
	const loc = normalizeForKeyword(location);
	if (kw.length === 0 || loc.length === 0) return false;
	const tokens = kw.split(" ").filter((t) => t.length > 0);
	return tokens.every((tok) => tokenAppearsAsWord(tok, loc));
}

/**
 * 단일 토큰이 normalize 된 location 에 "단어 단위" 로 등장하는지.
 * 영숫자(라틴/숫자) 토큰은 \b 단어 경계를 사용해 substring 오탐(café→cafe…)을 막는다.
 * CJK 등 \b 가 의미 없는 토큰은 경계를 "앞뒤 문자가 라틴 영숫자가 아님" 으로 근사하여
 * 접사 결합("카페트")을 부분적으로 걸러내되, 한국어 조사 결합("카페가")은 허용한다.
 */
function tokenAppearsAsWord(token: string, location: string): boolean {
	if (token.length === 0) return false;
	const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const isLatinNum = /^[a-z0-9]+$/.test(token);
	if (isLatinNum) {
		return new RegExp(`\\b${escaped}\\b`).test(location);
	}
	// CJK/혼합 토큰: 단순 포함으로 근사한다(한국어 단어 경계는 \b 로 표현 불가).
	return location.includes(token);
}

// ---------------------------------------------------------------------------
// SEO-REGION-001 보조 — 지역명 경계-인지 매칭
// ---------------------------------------------------------------------------

/**
 * 한국어 지역명이 "장소 토큰" 으로 합쳐질 때 정당하게 붙는 행정/장소 접미사.
 * (강남 → 강남역/강남구/강남동/강남점 … 은 동일 지역의 정당한 매치로 본다.)
 */
const KOREAN_PLACE_SUFFIX =
	/^(시|도|군|구|읍|면|동|리|로|길|가|역|점|관|센터|지점|지역|일대|인근|근처|부근)/;

/**
 * businessProfile.region 이 텍스트에 "지역 토큰" 으로 등장하는지 경계-인지로 검사한다.
 *
 * 단순 `searchText.includes(region)` 은
 *   - 라틴 region("san") 이 "thousand" 의 부분일치로 통과하는 ASCII FP,
 *   - 한국어 region 이 무관한 더 긴 한글 단어의 파편으로 통과하는 FP
 * 를 일으킨다. 여기서는:
 *   1) 라틴/숫자 region 은 \b 단어경계 정규식으로 검사(부분일치 차단).
 *   2) 한국어 region 은 등장 위치 직후 문자가 "한글이 아니거나"(공백/문장부호/라틴/끝),
 *      또는 "정당한 장소 접미사로 시작" 하면 매치로 본다. 그 외(무관한 한글로 곧장 이어짐)
 *      는 파편 매치로 보고 제외한다.
 */
function regionAppearsInText(region: string, text: string): boolean {
	const r = normalizeForKeyword(region);
	const t = normalizeForKeyword(text);
	if (r.length === 0 || t.length === 0) return false;

	const isLatinNum = /^[a-z0-9 ]+$/.test(r);
	if (isLatinNum) {
		// 다어절 라틴 region 은 모든 토큰이 단어경계로 등장해야 매치(순서 무관).
		return keywordMatchesLocation(r, t);
	}

	// 한국어(또는 CJK 혼합) region: 경계-인지 스캔.
	let from = 0;
	const HANGUL = /[가-힣]/;
	while (true) {
		const idx = t.indexOf(r, from);
		if (idx === -1) return false;
		const after = t.slice(idx + r.length);
		const nextChar = after.charAt(0);
		const boundedAtEnd = nextChar === "" || !HANGUL.test(nextChar);
		if (boundedAtEnd || KOREAN_PLACE_SUFFIX.test(after)) {
			return true;
		}
		from = idx + 1;
	}
}

// ---------------------------------------------------------------------------
// SEO-TITLE-001: title 태그 존재
// ---------------------------------------------------------------------------
export const seoTitle001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const passed = page.title !== null && page.title.trim().length > 0;
	return {
		ruleId: "SEO-TITLE-001",
		category: "seo",
		passed,
		severity: "high",
		title: "페이지 제목(title 태그) 존재 여부",
		description: passed
			? "페이지 제목이 설정되어 있습니다."
			: "홈페이지에 제목(title 태그)이 없습니다. 검색 결과에서 사이트 이름이 표시되지 않아 클릭률이 낮아질 수 있습니다.",
		evidence: passed
			? [`현재 title: "${page.title}"`]
			: [`URL: ${page.url} — title 태그 없음`],
		recommendation:
			"홈페이지 제작 업체에 '<title>업체명 | 핵심 서비스</title>' 형식으로 title 태그를 추가해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// SEO-TITLE-002: title 길이 10~60자
// ---------------------------------------------------------------------------
export const seoTitle002: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const len = page.title?.trim().length ?? 0;
	const passed = len >= 10 && len <= 60;
	const tooShort = len > 0 && len < 10;
	const tooLong = len > 60;
	return {
		ruleId: "SEO-TITLE-002",
		category: "seo",
		passed,
		severity: "medium",
		title: "페이지 제목 길이 적절성 (10~60자)",
		description: passed
			? `제목 길이(${len}자)가 권장 범위(10~60자) 안에 있습니다.`
			: tooShort
				? `제목이 너무 짧습니다(${len}자). 검색 결과에서 정보가 부족하게 표시됩니다.`
				: tooLong
					? `제목이 너무 깁니다(${len}자). 검색 결과에서 잘려서 표시될 수 있습니다.`
					: "제목이 없어 길이를 확인할 수 없습니다.",
		evidence: page.title
			? [`현재 title(${len}자): "${page.title.trim()}"`]
			: [`URL: ${page.url} — title 없음`],
		recommendation:
			"제목은 10~60자가 적당합니다. 예: '강남 가죽공방 클래스 | 르쿠르'처럼 업체명과 핵심 서비스를 포함하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-META-001: meta description 존재
// ---------------------------------------------------------------------------
export const seoMeta001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const passed =
		page.description !== null && page.description.trim().length > 0;
	return {
		ruleId: "SEO-META-001",
		category: "seo",
		passed,
		severity: "high",
		title: "메타 설명(meta description) 존재 여부",
		description: passed
			? "메타 설명이 설정되어 있습니다."
			: "메타 설명이 없습니다. 검색 결과에서 페이지 내용 미리보기가 자동 생성되어 클릭률에 영향을 줄 수 있습니다.",
		evidence: passed
			? [`현재 description: "${page.description}"`]
			: [`URL: ${page.url} — meta description 없음`],
		recommendation:
			"홈페이지 제작 업체에 meta name description 태그를 추가해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// SEO-META-002: meta description 길이 50~160자
// ---------------------------------------------------------------------------
export const seoMeta002: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const len = page.description?.trim().length ?? 0;
	const passed = len >= 50 && len <= 160;
	return {
		ruleId: "SEO-META-002",
		category: "seo",
		passed,
		severity: "medium",
		title: "메타 설명 길이 적절성 (50~160자)",
		description: passed
			? `메타 설명 길이(${len}자)가 권장 범위(50~160자) 안에 있습니다.`
			: len > 0 && len < 50
				? `메타 설명이 너무 짧습니다(${len}자). 서비스와 지역 정보를 더 추가하세요.`
				: len > 160
					? `메타 설명이 너무 깁니다(${len}자). 검색 결과에서 잘려 보입니다.`
					: "메타 설명이 없어 길이를 확인할 수 없습니다.",
		evidence: page.description
			? [`현재 description(${len}자): "${page.description.trim()}"`]
			: [`URL: ${page.url} — description 없음`],
		recommendation:
			"메타 설명은 50~160자로 작성하세요. 예: '[업체명]은 [지역]에 위치한 [업종]입니다. [핵심 서비스]를 제공합니다.'",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-H1-001: H1 존재
// ---------------------------------------------------------------------------
export const seoH1001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const passed = page.h1 !== null && page.h1.trim().length > 0;
	return {
		ruleId: "SEO-H1-001",
		category: "seo",
		passed,
		severity: "high",
		title: "H1 제목 존재 여부",
		description: passed
			? `H1 제목이 있습니다: "${page.h1}"`
			: "페이지에 H1 제목이 없습니다. 검색 엔진이 페이지 주제를 파악하기 어렵습니다.",
		evidence: passed ? [`H1: "${page.h1}"`] : [`URL: ${page.url} — H1 없음`],
		recommendation:
			"홈페이지 제작 업체에 페이지 상단에 h1 태그로 업체명 또는 핵심 서비스를 추가해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// SEO-H1-002: H1 1개만 (복수 H1 검출)
// ---------------------------------------------------------------------------
export const seoH1002: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// headingStructure (Phase O-D optional) contains all heading elements in
	// document order. Use it to count actual H1 elements when available.
	// If headingStructure is absent (older crawl), fall back to the honest
	// skip pattern: h1 is a single string|null so we cannot confirm ≤1 H1.
	const h1Count = page.headingStructure !== undefined
		? page.headingStructure.filter((h) => h.level === 1).length
		: null;

	if (h1Count === null) {
		// No heading structure data — cannot determine count. Return
		// a skip-style informational result rather than a false passed=true.
		return {
			ruleId: "SEO-H1-002",
			category: "seo",
			passed: true,
			severity: "medium",
			title: "H1 제목 중복 사용 여부",
			description:
				"H1 수량 확인에 필요한 heading 구조 데이터가 없습니다(크롤러 미수집). 확인 불가로 처리합니다.",
			evidence: [`URL: ${page.url}`, "headingStructure: 미수집"],
			recommendation:
				"페이지당 H1은 1개만 사용해야 합니다. 하위 제목은 H2, H3를 사용하도록 업체에 수정 요청하세요.",
			actionType: "vendor_action",
			difficulty: "easy",
			expectedImpact: "medium",
			scoreImpact: "unavailable",
			ruleWeight: 6,
		};
	}

	const passed = h1Count <= 1;
	return {
		ruleId: "SEO-H1-002",
		category: "seo",
		passed,
		severity: "medium",
		title: "H1 제목 중복 사용 여부",
		description: passed
			? h1Count === 0
				? "H1 제목이 없습니다 (SEO-H1-001 참조)."
				: "H1 제목이 1개로 올바르게 사용되고 있습니다."
			: `H1 제목이 ${h1Count}개 감지되었습니다. 페이지당 H1은 1개만 사용해야 합니다.`,
		evidence: [`URL: ${page.url}`, `H1 수: ${h1Count}개`],
		recommendation:
			"페이지당 H1은 1개만 사용해야 합니다. 하위 제목은 H2, H3를 사용하도록 업체에 수정 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-H2-001: H2 사용 여부
// ---------------------------------------------------------------------------
export const seoH2001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const passed = page.h2.length > 0;
	return {
		ruleId: "SEO-H2-001",
		category: "seo",
		passed,
		severity: "low",
		title: "H2 소제목 사용 여부",
		description: passed
			? `H2 소제목이 ${page.h2.length}개 사용되고 있습니다.`
			: "페이지에 H2 소제목이 없습니다. 콘텐츠 구조가 없으면 검색 엔진이 내용을 이해하기 어렵습니다.",
		evidence: passed
			? page.h2.slice(0, 3).map((h) => `H2: "${h}"`)
			: [`URL: ${page.url} — H2 없음`],
		recommendation:
			"주요 섹션마다 H2 소제목을 추가해 페이지 구조를 만들어 주세요. 예: '제공 서비스', '이용 방법', '오시는 길' 등.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-IMG-ALT-001: 이미지 alt 부재 비율 < 30%
// ---------------------------------------------------------------------------
export const seoImgAlt001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const images = page.images;
	if (images.length === 0) {
		return {
			ruleId: "SEO-IMG-ALT-001",
			category: "seo",
			passed: true,
			severity: "medium",
			title: "이미지 대체 텍스트(alt) 작성 비율",
			description: "이미지가 없어 해당 항목을 확인할 수 없습니다.",
			evidence: [`URL: ${page.url} — 이미지 없음`],
			recommendation:
				"이미지 추가 시 alt 속성을 반드시 포함하세요. 예: alt='강남 카페 인테리어'",
			actionType: "vendor_action",
			difficulty: "easy",
			expectedImpact: "medium",
			scoreImpact: "not_applicable",
			ruleWeight: 6,
		};
	}
	const withAlt = images.filter(
		(img) => img.alt !== null && img.alt.trim().length > 0,
	).length;
	const altRatio = withAlt / images.length;
	const passed = altRatio >= 0.7;
	return {
		ruleId: "SEO-IMG-ALT-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "이미지 대체 텍스트(alt) 작성 비율",
		description: passed
			? `이미지 ${images.length}개 중 ${withAlt}개(${Math.round(altRatio * 100)}%)에 대체 텍스트가 있습니다.`
			: `이미지 ${images.length}개 중 ${images.length - withAlt}개에 대체 텍스트(alt)가 없습니다. 시각 장애인 접근성과 이미지 검색 노출에 불리합니다.`,
		evidence: [
			`전체 이미지: ${images.length}개`,
			`alt 있음: ${withAlt}개 (${Math.round(altRatio * 100)}%)`,
			`alt 없음: ${images.length - withAlt}개`,
		],
		recommendation:
			"홈페이지 업체에 모든 이미지에 alt 속성을 추가해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-CANONICAL-001: canonical link 존재
// ---------------------------------------------------------------------------
export const seoCanonical001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const passed =
		page.canonicalUrl !== null && page.canonicalUrl.trim().length > 0;
	return {
		ruleId: "SEO-CANONICAL-001",
		category: "seo",
		passed,
		severity: "low",
		title: "정규 URL(canonical) 태그 존재 여부",
		description: passed
			? `canonical URL이 설정되어 있습니다: ${page.canonicalUrl}`
			: "canonical 태그가 없습니다. URL 중복 문제가 생기면 검색 점수가 분산될 수 있습니다.",
		evidence: passed
			? [`canonical: ${page.canonicalUrl}`]
			: [`URL: ${page.url} — canonical 없음`],
		recommendation:
			"홈페이지 업체에 link rel=canonical 태그를 head에 추가해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-ROBOTS-001: 메인이 noindex 아님
// ---------------------------------------------------------------------------
export const seoRobots001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const robotsMeta = page.robotsMeta?.toLowerCase() ?? "";
	const isNoindex = robotsMeta.includes("noindex");
	const passed = !isNoindex;
	return {
		ruleId: "SEO-ROBOTS-001",
		category: "seo",
		passed,
		severity: "high",
		title: "검색 수집 허용 여부 (noindex 검사)",
		description: passed
			? "메인 페이지가 검색 엔진 수집을 허용하고 있습니다."
			: "메인 페이지에 noindex 설정이 있습니다. 검색 결과에 전혀 노출되지 않습니다.",
		evidence: [`URL: ${page.url}`, `robots meta: ${page.robotsMeta ?? "없음"}`],
		recommendation: isNoindex
			? "홈페이지 업체에 메인 페이지의 noindex 설정을 제거해달라고 요청하세요."
			: "robots.txt와 noindex 설정을 주기적으로 점검하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// SEO-SITEMAP-001: sitemap.xml 가능성
// ---------------------------------------------------------------------------
export const seoSitemap001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	let origin = "";
	try {
		origin = new URL(page.url).origin;
	} catch {
		origin = page.url;
	}
	const sitemapUrl = `${origin}/sitemap.xml`;
	// Phase 4 계약 수정: crawler 가 sitemap.xml 을 실제 URL 선정에 사용한 경우
	// ctx.sitemapUsed 로 전달된다. 페이지 본문/푸터 링크는 보조 신호로만 유지한다.
	const hasSitemap = hasSitemapSignal(ctx);
	const passed = hasSitemap;
	return {
		ruleId: "SEO-SITEMAP-001",
		category: "seo",
		passed,
		severity: "low",
		title: "sitemap.xml 존재 가능성",
		description: passed
			? "사이트 내에서 sitemap 관련 정보가 확인되었습니다."
			: `${sitemapUrl} 경로에 sitemap.xml 이 없거나 확인되지 않습니다.`,
		evidence: [
			`확인 URL: ${sitemapUrl}`,
			`crawler sitemap 사용 여부: ${ctx.sitemapUsed === true ? "있음" : "없음"}`,
			`sitemap 링크 발견 여부: ${hasSitemap ? "있음" : "없음"}`,
		],
		recommendation:
			"홈페이지 업체에 /sitemap.xml 파일 생성을 요청하고, Google Search Console에 등록하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-MOBILE-001: meta viewport 존재
// ---------------------------------------------------------------------------
export const seoMobile001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const hasViewport =
		page.meta.viewport !== undefined ||
		page.meta.Viewport !== undefined ||
		Object.keys(page.meta).some((k) => k.toLowerCase() === "viewport");
	return {
		ruleId: "SEO-MOBILE-001",
		category: "seo",
		passed: hasViewport,
		severity: "high",
		title: "모바일 대응 (viewport 메타 태그)",
		description: hasViewport
			? "모바일 viewport 설정이 있습니다."
			: "viewport 메타 태그가 없습니다. 스마트폰에서 홈페이지가 작게 보여 사용자가 이탈할 수 있습니다.",
		evidence: [`viewport 태그: ${page.meta.viewport ?? "없음"}`],
		recommendation:
			"홈페이지 업체에 head에 meta name=viewport content=width=device-width,initial-scale=1 태그를 추가해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// SEO-URL-001: URL 구조
// ---------------------------------------------------------------------------
export const seoUrl001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	let pathname = "/";
	try {
		pathname = new URL(page.url).pathname;
	} catch {
		pathname = page.url;
	}
	const depth = pathname.split("/").filter(Boolean).length;
	const hasQueryId = /[?&]id=\d+/i.test(page.url);
	const passed = depth <= 3 && !hasQueryId;
	return {
		ruleId: "SEO-URL-001",
		category: "seo",
		passed,
		severity: "low",
		title: "URL 구조 적절성",
		description: passed
			? "URL 구조가 간결하고 이해하기 쉽습니다."
			: depth > 3
				? `URL 깊이가 ${depth}단계로 너무 깊습니다.`
				: "URL에 ?id=숫자 형식이 포함되어 있습니다.",
		evidence: [`URL: ${page.url}`, `경로 깊이: ${depth}단계`],
		recommendation:
			"URL은 /services/leather-class 처럼 의미 있는 단어로 구성하도록 업체에 요청하세요.",
		actionType: "si_action",
		difficulty: "hard",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-KEYWORD-001: targetKeywords 가 title/H1/meta description 에 포함
// ---------------------------------------------------------------------------
export const seoKeyword001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const keywords = ctx.businessProfile.targetKeywords;
	if (keywords.length === 0) {
		return {
			ruleId: "SEO-KEYWORD-001",
			category: "seo",
			passed: true,
			severity: "high",
			title: "목표 키워드 핵심 영역 포함 여부",
			description: "목표 키워드가 입력되지 않았습니다.",
			evidence: ["targetKeywords 없음"],
			recommendation:
				"진단 요청 시 목표 키워드를 입력하면 더 정확한 분석이 가능합니다.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "high",
			scoreImpact: "not_applicable",
			ruleWeight: 10,
		};
	}
	// ---------------------------------------------------------------------
	// Phase 2.5 — word-aware 매칭으로 개선:
	// 과거: [title, h1, description].join(" ") 한 덩어리에 substring(includes) 검사.
	//   - 띄어쓰기 변형("강남 카페" vs "강남카페")을 놓치고,
	//   - 우연한 부분일치("카페" ⊂ "카페트")를 키워드 포함으로 오판하며,
	//   - 어느 핵심 영역(title/H1/desc)에 들어갔는지 구분하지 못해 incidental 매치를 과대평가.
	// 개선: title / H1 / meta description / headingStructure 를 "구분된 가중 위치" 로 보고,
	//   각 위치마다 word-aware(case/spacing 정규화 + 단어 경계) 매칭을 수행한다.
	//   핵심 위치(title/H1/description) 중 한 곳 이상에 매치된 키워드만 "포함" 으로 인정한다.
	//   (headingStructure 매치는 보조 신호로 evidence 에만 기록 — 통과 판정에는 핵심 위치 사용.)
	// ---------------------------------------------------------------------
	const coreLocations: { label: string; text: string }[] = [
		{ label: "title", text: page.title ?? "" },
		{ label: "H1", text: page.h1 ?? "" },
		{ label: "description", text: page.description ?? "" },
	];
	const headings = page.headingStructure;

	const found: { kw: string; locations: string[] }[] = [];
	for (const kw of keywords) {
		const hitLocations: string[] = [];
		for (const loc of coreLocations) {
			if (keywordMatchesLocation(kw, loc.text)) hitLocations.push(loc.label);
		}
		// 보조: headingStructure(H2~H6 등) 매치는 evidence 보강용으로만 기록.
		if (headings && headings.some((h) => keywordMatchesLocation(kw, h.text))) {
			hitLocations.push("heading");
		}
		// 통과 판정은 핵심 위치(title/H1/description) 매치가 1개 이상일 때만.
		const inCore = hitLocations.some((l) => l !== "heading");
		if (inCore) found.push({ kw, locations: hitLocations });
	}

	const passed = found.length > 0;
	const foundLabel =
		found.map((f) => `${f.kw}(${f.locations.join("/")})`).join(", ") || "없음";
	return {
		ruleId: "SEO-KEYWORD-001",
		category: "seo",
		passed,
		severity: "high",
		title: "목표 키워드 핵심 영역(title/H1/description) 포함 여부",
		description: passed
			? `목표 키워드 중 "${found.map((f) => f.kw).join(", ")}"가 제목/H1/설명에 포함되어 있습니다.`
			: `목표 키워드 (${keywords.join(", ")})가 제목, H1, 설명 어디에도 (단어 단위로) 없습니다.`,
		evidence: [
			`목표 키워드: ${keywords.join(", ")}`,
			`포함된 키워드(위치): ${foundLabel}`,
		],
		recommendation:
			"홈페이지 제목, H1, 메타 설명에 목표 키워드를 자연스럽게 포함시키세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// SEO-INTERNAL-LINK-001: 내부 링크 ≥ 3개
// ---------------------------------------------------------------------------
export const seoInternalLink001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const count = page.internalLinks.length;
	const passed = count >= 3;
	return {
		ruleId: "SEO-INTERNAL-LINK-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "내부 링크 충분성 (3개 이상)",
		description: passed
			? `내부 링크가 ${count}개 있습니다.`
			: `내부 링크가 ${count}개뿐입니다.`,
		evidence: [
			`내부 링크 수: ${count}개`,
			...page.internalLinks.slice(0, 3).map((l) => `링크: ${l}`),
		],
		recommendation:
			"메인 페이지에서 서비스 소개, 위치 안내, 문의 페이지 등 3개 이상의 내부 링크를 추가하도록 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-CTA-001: CTA 텍스트가 메인 페이지에 존재
// ---------------------------------------------------------------------------
export const seoCta001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;

	// ---------------------------------------------------------------------
	// Phase 1 시맨틱 검증: "실행 가능한(actionable)" CTA 만 인정.
	// 기존 룰은 '문의'/'예약'/'시작' 단어가 본문 어디든 있으면 통과 →
	// "예약은 취소할 수 없습니다"(정책문)·"시작 시간" 같은 비-CTA 문장도 통과하는 FP.
	// (1) 명령형/버튼 문구: '문의하기'·'예약하세요'·'상담 신청'·'지금 전화' 등.
	// (2) 연락/예약 채널 외부 링크(tel/booking/kakao/naver booking).
	// 정책/부정 맥락(취소·환불 불가, ~할 수 없습니다)에만 등장하면 제외.
	// ---------------------------------------------------------------------
	const ctaNoun =
		"(?:문의|상담|예약|구매|주문|신청|등록|가입|결제|방문|구독|다운로드)";
	const imperativeCta = new RegExp(
		`${ctaNoun}\\s*(?:하기|하세요|해\\s*보세요|받기|받으세요|주세요|하러|바로가기|신청|접수)` +
			`|(?:지금|바로|무료로?|간편)\\s*${ctaNoun}` +
			`|(?:전화|카톡|카카오|채팅)\\s*(?:문의|상담|예약|주세요|하기|걸기)` +
			`|예약하기|상담신청|무료\\s*체험|체험\\s*신청|장바구니\\s*담기|지금\\s*시작`,
		"g",
	);

	const POLICY_PATTERN =
		/할\s*수\s*없습니다|불가능|불가합니다|취소\s*(?:불가|환불|규정|수수료)|환불\s*(?:불가|규정)|변경\s*불가|주의\s*사항|약관|정책상/;

	let ctaLabel: string | null = null;
	for (const m of body.matchAll(imperativeCta)) {
		const idx = m.index ?? 0;
		const start = Math.max(0, idx - 18);
		const end = Math.min(body.length, idx + m[0].length + 18);
		if (POLICY_PATTERN.test(body.slice(start, end))) continue;
		ctaLabel = m[0].trim();
		break;
	}

	// 연락/예약 채널 외부 링크도 actionable CTA 로 인정. tel:/mailto: 는
	// parser contactLinks 에서만 온다(HTTP link arrays 는 HTTP(S)-only).
	const ctaLinkPattern =
		/(pf\.kakao\.com|open\.kakao\.com|kakao\.com\/(?:ch|talk)|booking\.naver|talk\.naver|smartstore\.naver|\/order|\/reservation|\/booking)/i;
	const hasContactCta = (page.contactLinks ?? []).some(
		(link) => link.kind === "tel" || link.kind === "mailto",
	);
	const hasCtaLink =
		hasContactCta || page.externalLinks.some((l) => ctaLinkPattern.test(l));

	const passed = ctaLabel !== null || hasCtaLink;
	return {
		ruleId: "SEO-CTA-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "행동 유도 문구(CTA) 존재 여부",
		description: passed
			? `실행 가능한 행동 유도 문구("${ctaLabel ?? "연락/예약 링크"}")가 메인 페이지에 있습니다.`
			: "메인 페이지에 '예약하기', '지금 상담받기' 같은 실행 가능한 행동 유도(CTA)가 없습니다. ('취소할 수 없습니다' 같은 정책 문구는 CTA 로 인정하지 않습니다.)",
		evidence: [
			`URL: ${page.url}`,
			`명령형 CTA: ${ctaLabel ?? "없음"}`,
			`연락/예약 링크: ${hasCtaLink ? "있음" : "없음"}`,
		],
		recommendation:
			"메인 페이지에 '지금 무료 상담받기', '예약하기', '전화 문의' 같은 명확한 행동 유도 버튼을 추가하도록 요청하세요. 버튼은 전화/카카오/예약 링크로 연결되어야 합니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-REGION-001: 지역 키워드가 메인 페이지에 포함
// ---------------------------------------------------------------------------
export const seoRegion001: Rule = (ctx): RuleResult => {
	const region = ctx.businessProfile.region;
	const page = ctx.mainPage;
	// Phase 3 시맨틱 검증: 기존 로직은 합쳐진 텍스트에 region 을 단순 substring 으로
	// 찾아, 라틴 region("san"⊂"thousand") 의 부분일치 FP 와 한국어 region 이 무관한 더
	// 긴 한글 단어의 파편으로 매치되는 FP 를 모두 통과시켰다.
	// → regionAppearsInText() 로 라틴은 \b 단어경계, 한국어는 경계/place-suffix 인지로 검사.
	const searchText = [
		page.title ?? "",
		page.description ?? "",
		page.h1 ?? "",
		...page.h2,
		page.bodyText.slice(0, 2000),
	].join(" ");
	const passed = region.trim().length > 0 && regionAppearsInText(region, searchText);
	return {
		ruleId: "SEO-REGION-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "지역 키워드 본문 포함 여부",
		description: passed
			? `지역 정보 "${region}"이 홈페이지에 포함되어 있습니다.`
			: `지역 정보 "${region}"이 제목, 설명, 본문 어디에도 없습니다. 지역 검색에서 노출이 어렵습니다.`,
		evidence: [
			`업체 지역: ${region}`,
			`title: ${page.title ?? "없음"}`,
			`description: ${page.description ?? "없음"}`,
		],
		recommendation: `제목이나 소개 문구에 "${region}"를 포함시키세요.`,
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ===========================================================================
// Phase M-A 신규 SEO 룰 (+19개) — TRD § 19.5
// ===========================================================================

// ---------------------------------------------------------------------------
// SEO-HTTPS-001: HTTPS 사용 여부
// ---------------------------------------------------------------------------
export const seoHttps001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const passed = page.url.startsWith("https://");
	return {
		ruleId: "SEO-HTTPS-001",
		category: "seo",
		passed,
		severity: "high",
		title: "HTTPS 보안 연결 사용 여부",
		description: passed
			? "홈페이지가 HTTPS(보안 연결)로 서비스되고 있습니다."
			: "홈페이지가 HTTP로 서비스되고 있습니다. 보안이 취약한 사이트는 검색 순위에서 불이익을 받습니다.",
		evidence: [`URL: ${page.url}`, `프로토콜: ${page.url.split("://")[0]}`],
		recommendation:
			"홈페이지 제작 업체에 SSL 인증서를 적용하고 모든 http 주소를 https로 전환해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// SEO-LANG-001: html lang 속성 존재
// ---------------------------------------------------------------------------
export const seoLang001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const htmlLang = page.htmlLang?.trim() ?? "";
	const metaLang =
		Object.entries(page.meta).find(([k]) => k.toLowerCase() === "lang")?.[1] ?? "";
	const hasLang = htmlLang.length > 0 || metaLang.trim().length > 0;
	return {
		ruleId: "SEO-LANG-001",
		category: "seo",
		passed: hasLang,
		severity: "medium",
		title: "HTML lang 속성 설정 여부",
		description: hasLang
			? "HTML lang 속성이 설정되어 있습니다."
			: "HTML lang 속성이 감지되지 않습니다. 언어 설정이 없으면 검색 엔진이 타깃 언어를 혼동할 수 있습니다.",
		evidence: [`URL: ${page.url}`, `html lang: ${htmlLang || "없음"}`],
		recommendation:
			"홈페이지 업체에 HTML 태그의 lang 속성을 실제 페이지 언어(예: ko, en)에 맞게 설정해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-OG-001: OpenGraph 기본 메타태그 (og:title, og:description, og:image, og:url)
// ---------------------------------------------------------------------------
// placeholder/기본값 텍스트는 실제 값으로 카운트하지 않는다 (대소문자 무시).
const OG_PLACEHOLDER_VALUES = [
	"untitled",
	"page title",
	"new page",
	"default",
	"unnamed",
	"document",
	"제목없음",
	"페이지 제목",
	"제목 없음",
	"없음",
	"미설정",
];
const isPlaceholder = (v: string): boolean => {
	const normalized = v.trim().toLowerCase();
	return OG_PLACEHOLDER_VALUES.includes(normalized);
};
// 채워진 텍스트 값인지 + placeholder 가 아닌지 판정 (og:title/description 용)
const hasRealOgText = (meta: Record<string, string>, key: string): boolean => {
	const value = meta[key];
	return (
		typeof value === "string" &&
		value.trim().length > 0 &&
		!isPlaceholder(value)
	);
};

export const seoOg001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// parser collects all <meta property="og:*"> tags into page.meta (lowercase keys).
	// bodyText is visible text with <script>/<style>/meta stripped, so OG tags are
	// NOT in bodyText — reading page.meta is the correct approach.
	// og:title/description 은 placeholder("Untitled"/"제목없음" 등) 를 실제 값으로 치지 않는다.
	// og:image/url 은 URL 이므로 placeholder 필터링 대상이 아니다.
	const hasOgTitle = hasRealOgText(page.meta, "og:title");
	const hasOgDesc = hasRealOgText(page.meta, "og:description");
	const hasOgImage = "og:image" in page.meta && page.meta["og:image"].trim().length > 0;
	const hasOgUrl = "og:url" in page.meta && page.meta["og:url"].trim().length > 0;
	const count = [hasOgTitle, hasOgDesc, hasOgImage, hasOgUrl].filter(
		Boolean,
	).length;
	const passed = count >= 3;
	return {
		ruleId: "SEO-OG-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "OpenGraph 기본 메타태그 설정 여부",
		description: passed
			? `OpenGraph 메타태그 ${count}개가 설정되어 있습니다.`
			: `OpenGraph 메타태그가 ${count}개뿐입니다(권장: 4개). SNS 공유 시 제목·설명·이미지가 제대로 표시되지 않습니다.`,
		evidence: [
			`og:title: ${hasOgTitle ? "있음" : "없음"}`,
			`og:description: ${hasOgDesc ? "있음" : "없음"}`,
			`og:image: ${hasOgImage ? "있음" : "없음"}`,
			`og:url: ${hasOgUrl ? "있음" : "없음"}`,
		],
		recommendation:
			"홈페이지 업체에 head에 og:title, og:description, og:image, og:url 4개의 OpenGraph 태그를 추가해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-OG-002: og:locale 설정 여부
// ---------------------------------------------------------------------------
export const seoOg002: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// Phase 1: <meta property="og:locale"> 는 visible bodyText 에 없다.
	// 파서가 모든 <meta> 를 page.meta(소문자 키)에 모으므로 meta 맵을 읽는다.
	const localeValue =
		page.meta["og:locale"] ??
		Object.entries(page.meta).find(
			([k]) => k.toLowerCase() === "og:locale",
		)?.[1];
	const hasOgLocale =
		typeof localeValue === "string" && localeValue.trim().length > 0;
	return {
		ruleId: "SEO-OG-002",
		category: "seo",
		passed: hasOgLocale,
		severity: "low",
		title: "OpenGraph 언어(og:locale) 설정 여부",
		description: hasOgLocale
			? `og:locale이 설정되어 있습니다(${localeValue}).`
			: "og:locale 태그가 없습니다. SNS 공유 시 언어 최적화가 되지 않습니다.",
		evidence: [`og:locale: ${hasOgLocale ? (localeValue ?? "있음") : "없음"}`],
		recommendation:
			"홈페이지 업체에 meta property=og:locale content=ko_KR 태그를 head에 추가해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-TWITTER-001: Twitter Card 메타태그 존재
// ---------------------------------------------------------------------------
export const seoTwitter001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// Phase 1: <meta name="twitter:card"> 는 visible bodyText 에 없다 → meta 맵을 읽는다.
	const cardValue =
		page.meta["twitter:card"] ??
		Object.entries(page.meta).find(
			([k]) => k.toLowerCase() === "twitter:card",
		)?.[1];
	const hasTwitterCard =
		typeof cardValue === "string" && cardValue.trim().length > 0;
	return {
		ruleId: "SEO-TWITTER-001",
		category: "seo",
		passed: hasTwitterCard,
		severity: "low",
		title: "Twitter Card 메타태그 설정 여부",
		description: hasTwitterCard
			? `Twitter Card 메타태그가 설정되어 있습니다(${cardValue}).`
			: "Twitter Card 메타태그가 없습니다. 트위터/X에 링크 공유 시 미리보기가 최적화되지 않습니다.",
		evidence: [`twitter:card: ${hasTwitterCard ? (cardValue ?? "있음") : "없음"}`],
		recommendation:
			"홈페이지 업체에 meta name=twitter:card content=summary_large_image 태그를 추가해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-FAVICON-001: favicon 존재 여부
// ---------------------------------------------------------------------------
export const seoFavicon001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 1 — HONEST SKIP:
	// 파비콘은 <link rel="icon"> 으로 선언되는데, 파서는 (a) <meta> 만 page.meta 에
	// 모으고 (b) bodyText 는 "보이는 본문"이라 <link> 가 들어있지 않다. 즉 파비콘을
	// 확정할 파서 신호가 없다. 기존 룰은 bodyText 에서 'favicon'/'rel="icon"' 문자열을
	// 찾았는데, 이는 본문에 우연히 노출된 문서/코드 텍스트에만 매치되는 FP 였다.
	// 따라서 파서가 신호를 노출하기 전까지는 패널티를 주지 않고(=passed:true) informational 처리한다.
	// 단, 파서가 어떤 favicon 관련 값을 meta 로 노출하면 그 신호는 존중한다.
	// (HANDOFF: ParsedPage 에 link rel=icon 노출 필드 추가 시 본 룰을 실측 검증으로 승격할 것.)
	// ---------------------------------------------------------------------
	const FAVICON_META_KEYS = [
		"msapplication-tileimage",
		"msapplication-config",
		"apple-touch-icon",
		"icon",
		"shortcut icon",
	];
	const metaSignal = Object.entries(page.meta).find(
		([k, v]) =>
			FAVICON_META_KEYS.includes(k.toLowerCase()) &&
			typeof v === "string" &&
			v.trim().length > 0,
	);
	const hasMetaFavicon = metaSignal !== undefined;

	return {
		ruleId: "SEO-FAVICON-001",
		category: "seo",
		// 신호 없음 → 패널티 미부과(informational pass). meta 신호가 있으면 그대로 pass.
		passed: true,
		severity: "low",
		title: "파비콘(favicon) 설정 여부",
		description: hasMetaFavicon
			? "파비콘 관련 메타 신호가 확인됩니다."
			: "파비콘은 <link rel=icon>으로 선언되며 현재 파서가 이를 별도로 노출하지 않습니다. 확인 불가로 처리합니다(패널티 없음).",
		evidence: [
			`URL: ${page.url}`,
			`파비콘 메타 신호: ${hasMetaFavicon ? (metaSignal?.[0] ?? "있음") : "미수집(파서 미노출)"}`,
		],
		recommendation:
			"홈페이지 업체에 favicon.ico 또는 PNG 아이콘 파일을 추가하고 link rel=icon 태그를 설정해달라고 요청하세요. 브라우저 탭/북마크에서 브랜드 인식이 강화됩니다.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "low",
		scoreImpact: hasMetaFavicon ? "scored" : "unavailable",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-IMG-LAZY-001: 이미지 loading=lazy 사용 여부
// ---------------------------------------------------------------------------
export const seoImgLazy001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const images = page.images;
	if (images.length === 0) {
		return {
			ruleId: "SEO-IMG-LAZY-001",
			category: "seo",
			passed: true,
			severity: "low",
			title: "이미지 지연 로딩(lazy loading) 적용 여부",
			description: "이미지가 없어 해당 항목을 확인할 수 없습니다.",
			evidence: [`URL: ${page.url} — 이미지 없음`],
			recommendation: "이미지 추가 시 loading=lazy 속성을 함께 적용하세요.",
			actionType: "vendor_action",
			difficulty: "easy",
			expectedImpact: "low",
			scoreImpact: "not_applicable",
			ruleWeight: 3,
		};
	}
	// ---------------------------------------------------------------------
	// Phase 2.5 — PROMOTED to real measurement (commit 512973d):
	// 파서가 이제 <img loading="..."> 속성을 images[].loading 으로 노출한다.
	// 지연 로딩의 목표는 "스크롤 아래(below-the-fold) 이미지"를 미리 받지 않는 것.
	// - 이미지가 적으면(≤ FEW_IMAGES_THRESHOLD) below-the-fold 가 거의 없어 lazy 가
	//   필수적이지 않으므로 패널티를 주지 않는다(passed=true).
	// - 이미지가 많으면 lazy 비율이 임계치(LAZY_RATIO_THRESHOLD) 이상일 때 통과시킨다.
	//   (첫 1~2장은 above-the-fold 라 eager 가 정상이므로 100% 를 요구하지 않는다.)
	// ---------------------------------------------------------------------
	const FEW_IMAGES_THRESHOLD = 2;
	const LAZY_RATIO_THRESHOLD = 0.5;
	const lazyCount = images.filter((img) => img.loading === "lazy").length;
	const ratio = lazyCount / images.length;
	const fewImages = images.length <= FEW_IMAGES_THRESHOLD;
	const passed = fewImages || ratio >= LAZY_RATIO_THRESHOLD;
	const ratioPct = Math.round(ratio * 100);
	return {
		ruleId: "SEO-IMG-LAZY-001",
		category: "seo",
		passed,
		severity: "low",
		title: "이미지 지연 로딩(lazy loading) 적용 여부",
		description: passed
			? fewImages
				? `이미지가 ${images.length}개로 적어 지연 로딩이 필수적이지 않습니다(패널티 없음).`
				: `이미지 ${images.length}개 중 ${lazyCount}개(${ratioPct}%)가 loading="lazy"로 지연 로딩됩니다.`
			: `이미지 ${images.length}개 중 ${lazyCount}개(${ratioPct}%)만 loading="lazy"입니다. 스크롤 아래 이미지가 초기 로딩을 느리게 합니다.`,
		evidence: [
			`전체 이미지 수: ${images.length}개`,
			`loading="lazy" 이미지: ${lazyCount}개 (${ratioPct}%)`,
		],
		recommendation:
			"홈페이지 업체에 스크롤 아래(첫 화면 밖) 이미지 태그에 loading=lazy 속성을 추가해달라고 요청하세요. 페이지 초기 로딩 속도가 빨라집니다.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-IMG-DIMENSIONS-001: img width/height 속성 존재 여부
// ---------------------------------------------------------------------------
export const seoImgDimensions001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const images = page.images;
	if (images.length === 0) {
		return {
			ruleId: "SEO-IMG-DIMENSIONS-001",
			category: "seo",
			passed: true,
			severity: "low",
			title: "이미지 width/height 속성 설정 여부",
			description: "이미지가 없어 확인할 수 없습니다.",
			evidence: [`URL: ${page.url} — 이미지 없음`],
			recommendation: "이미지 추가 시 width, height 속성을 명시하세요.",
			actionType: "vendor_action",
			difficulty: "easy",
			expectedImpact: "low",
			scoreImpact: "not_applicable",
			ruleWeight: 3,
		};
	}
	// ---------------------------------------------------------------------
	// Phase 2.5 — PROMOTED to real measurement (commit 512973d):
	// 파서가 이제 <img width height> 속성을 images[].width/height 로 노출한다.
	// width/height 를 둘 다 선언하면 브라우저가 이미지 로드 전에 공간을 예약해
	// 레이아웃 흔들림(CLS)을 방지한다. 한쪽만 선언하면 종횡비를 계산할 수 없어 효과가 없다.
	// → 둘 다 선언한 이미지 비율이 임계치(BOTH_DIM_RATIO_THRESHOLD) 이상이면 통과.
	// ---------------------------------------------------------------------
	const BOTH_DIM_RATIO_THRESHOLD = 0.5;
	const bothDimCount = images.filter(
		(img) => Boolean(img.width) && Boolean(img.height),
	).length;
	const ratio = bothDimCount / images.length;
	const ratioPct = Math.round(ratio * 100);
	const passed = ratio >= BOTH_DIM_RATIO_THRESHOLD;
	return {
		ruleId: "SEO-IMG-DIMENSIONS-001",
		category: "seo",
		passed,
		severity: "low",
		title: "이미지 width/height 속성 설정 여부",
		description: passed
			? `이미지 ${images.length}개 중 ${bothDimCount}개(${ratioPct}%)가 width·height를 모두 선언해 레이아웃 흔들림(CLS)을 방지합니다.`
			: `이미지 ${images.length}개 중 ${bothDimCount}개(${ratioPct}%)만 width·height를 둘 다 선언했습니다. 로딩 중 레이아웃이 흔들릴 수 있습니다(CLS).`,
		evidence: [
			`전체 이미지 수: ${images.length}개`,
			`width·height 모두 선언한 이미지: ${bothDimCount}개 (${ratioPct}%)`,
		],
		recommendation:
			"홈페이지 업체에 이미지 태그에 width, height 속성을 함께 추가해달라고 요청하세요. 페이지 로드 중 레이아웃 흔들림(CLS)이 줄어듭니다.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-IMG-FORMAT-001: WebP/AVIF 이미지 포맷 사용 여부
// ---------------------------------------------------------------------------
export const seoImgFormat001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const images = page.images;
	if (images.length === 0) {
		return {
			ruleId: "SEO-IMG-FORMAT-001",
			category: "seo",
			passed: true,
			severity: "low",
			title: "최신 이미지 포맷(WebP/AVIF) 사용 여부",
			description: "이미지가 없어 확인할 수 없습니다.",
			evidence: [`URL: ${page.url} — 이미지 없음`],
			recommendation: "이미지 추가 시 WebP 또는 AVIF 포맷을 사용하세요.",
			actionType: "vendor_action",
			difficulty: "medium",
			expectedImpact: "low",
			scoreImpact: "not_applicable",
			ruleWeight: 3,
		};
	}
	const modernImages = images.filter(
		(img) =>
			img.src.toLowerCase().endsWith(".webp") ||
			img.src.toLowerCase().endsWith(".avif"),
	);
	const passed = modernImages.length > 0;
	return {
		ruleId: "SEO-IMG-FORMAT-001",
		category: "seo",
		passed,
		severity: "low",
		title: "최신 이미지 포맷(WebP/AVIF) 사용 여부",
		description: passed
			? `WebP/AVIF 이미지가 ${modernImages.length}개 사용되고 있습니다.`
			: "WebP 또는 AVIF 형식의 이미지가 없습니다. JPEG/PNG 대비 30~50% 용량이 절약됩니다.",
		evidence: [
			`전체 이미지: ${images.length}개`,
			`WebP/AVIF: ${modernImages.length}개`,
		],
		recommendation:
			"홈페이지 업체에 이미지를 WebP 또는 AVIF 형식으로 변환해달라고 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-LINK-NEWTAB-001: target=_blank + rel=noopener 보안 설정
// ---------------------------------------------------------------------------
export const seoLinkNewtab001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 2.5 — HONEST DOWNGRADE (informational):
	// 이 룰은 <a target="_blank"> 링크에 rel="noopener" 가 있는지를 봐야 한다.
	// 그러나 파서는 링크를 internalLinks/externalLinks 의 "URL 문자열" 로만 노출하고,
	// 각 <a> 의 target/rel 속성을 보존하지 않는다. bodyText 는 "보이는 본문" 이라 HTML
	// 속성이 제거돼 있어, 기존의 bodyText.includes("_blank")/("noopener") 검사는 실제
	// 링크 속성이 아니라 본문에 우연히 인용된 코드/문서 텍스트(예: "target=_blank 를
	// 쓰세요" 같은 안내문)에만 매치되는 false positive 였다.
	// → 파서가 링크별 target/rel 신호를 노출하기 전까지는 패널티를 주지 않고
	//   informational(passed=true) 로 처리한다.
	// (HANDOFF: ParsedPage 에 링크별 { href, target, rel } 구조를 추가하면 실측 승격 가능.)
	// ---------------------------------------------------------------------
	return {
		ruleId: "SEO-LINK-NEWTAB-001",
		category: "seo",
		passed: true,
		severity: "medium",
		title: "새 탭 링크(target=_blank) 보안 설정 여부",
		description:
			"새 탭 링크 보안 설정(target=_blank + rel=noopener)은 <a> 태그의 target/rel 속성으로 판단해야 하는데, 현재 파서가 링크별 target/rel 속성을 노출하지 않습니다. 확인 불가로 처리합니다(패널티 없음).",
		evidence: [
			`외부 링크 수: ${page.externalLinks.length}개`,
			"target/rel 속성: 미수집(파서가 링크별 target/rel 필드를 노출하지 않음)",
		],
		recommendation:
			"홈페이지 업체에 새 탭으로 열리는 외부 링크(target=_blank)에 rel=noopener noreferrer를 추가해달라고 요청하세요. 탭내빙(tabnabbing) 보안 취약점을 막습니다.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		scoreImpact: "unavailable",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-STRUCTURED-DATA-001: JSON-LD 구조화 데이터 최소 1개 존재
// ---------------------------------------------------------------------------
export const seoStructuredData001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const count = getSchemaNodes(page.schemaJsonLd).length;
	const passed = count >= 1;
	return {
		ruleId: "SEO-STRUCTURED-DATA-001",
		category: "seo",
		passed,
		severity: "high",
		title: "JSON-LD 구조화 데이터 존재 여부",
		description: passed
			? `JSON-LD 구조화 데이터가 ${count}개 적용되어 있습니다.`
			: "JSON-LD 구조화 데이터가 없습니다. 검색 결과에서 별점, 가격, FAQ 등 풍부한 정보가 표시되지 않습니다.",
		evidence: [`URL: ${page.url}`, `JSON-LD 수: ${count}개`],
		recommendation:
			"X-SAG 스니펫 생성 기능으로 업종에 맞는 JSON-LD 코드를 생성한 후 홈페이지 head에 추가해달라고 요청하세요.",
		actionType: "snippet_action",
		difficulty: "medium",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// SEO-BREADCRUMB-001: Breadcrumb 구조화 데이터 존재
// ---------------------------------------------------------------------------
export const seoBreadcrumb001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const hasBreadcrumb = getSchemaNodes(page.schemaJsonLd).some((schema) => {
		const type = schema["@type"];
		return (
			type === "BreadcrumbList" ||
			(Array.isArray(type) && type.includes("BreadcrumbList"))
		);
	});
	return {
		ruleId: "SEO-BREADCRUMB-001",
		category: "seo",
		passed: hasBreadcrumb,
		severity: "low",
		title: "빵 부스러기 탐색(Breadcrumb) 구조화 데이터 여부",
		description: hasBreadcrumb
			? "Breadcrumb 구조화 데이터가 적용되어 있습니다."
			: "Breadcrumb 구조화 데이터가 없습니다. 검색 결과에서 사이트 내 위치 경로가 표시되지 않습니다.",
		evidence: [`BreadcrumbList Schema: ${hasBreadcrumb ? "있음" : "없음"}`],
		recommendation:
			"여러 페이지로 구성된 사이트라면 각 페이지에 BreadcrumbList JSON-LD를 추가하도록 업체에 요청하세요.",
		actionType: "snippet_action",
		difficulty: "medium",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-WORD-COUNT-001: 본문 콘텐츠 분량
// ---------------------------------------------------------------------------
export const seoWordCount001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const charCount = page.bodyText.replace(/\s/g, "").length;
	const wordCount = page.wordCount ?? Math.round(charCount / 2);
	const passed = charCount >= 300 || wordCount >= 200;
	return {
		ruleId: "SEO-WORD-COUNT-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "본문 콘텐츠 분량 적절성",
		description: passed
			? `본문 콘텐츠가 충분합니다(${charCount}자).`
			: `본문 콘텐츠가 너무 적습니다(${charCount}자). 내용이 부족한 페이지는 검색 순위에서 불리합니다.`,
		evidence: [
			`본문 글자 수(공백 제외): ${charCount}자`,
			`단어 수: ${wordCount}개`,
		],
		recommendation:
			"서비스 설명, 이용 방법, 자주 묻는 질문 등을 추가하여 본문 내용을 300자 이상으로 늘리세요.",
		actionType: "self_fix",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-KOREAN-URL-001: 한글 URL 인코딩 처리 여부
// ---------------------------------------------------------------------------
export const seoKoreanUrl001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	let pathname = "/";
	try {
		pathname = new URL(page.url).pathname;
	} catch {
		pathname = page.url;
	}
	const hasRawKorean = /[가-힣]/.test(pathname);
	const passed = !hasRawKorean;
	return {
		ruleId: "SEO-KOREAN-URL-001",
		category: "seo",
		passed,
		severity: "low",
		title: "한글 URL 인코딩 처리 여부",
		description: passed
			? "URL에 인코딩되지 않은 한글이 없습니다."
			: "URL에 인코딩되지 않은 한글이 포함되어 있습니다. 일부 환경에서 링크가 깨질 수 있습니다.",
		evidence: [`URL: ${page.url}`, `경로: ${pathname}`],
		recommendation:
			"URL은 영문 슬러그(예: /leather-class) 또는 퍼센트 인코딩된 한글을 사용하세요.",
		actionType: "si_action",
		difficulty: "hard",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-HREFLANG-001: 다국어 사이트 hreflang 메타태그
// ---------------------------------------------------------------------------
export const seoHreflang001: Rule = (ctx): RuleResult => {
	// Phase 4 실측 승격 (commit bbd2d96 가 page.linkTags 추가 — <link> 의 rel/href/hreflang):
	// hreflang 신호는 <head> 의 <link rel="alternate" hreflang="…"> 에만 존재한다. 파서가
	// 이제 모든 <link> 의 rel(소문자)/href/hreflang 를 linkTags 로 수집하므로, 본문 언급이
	// 아닌 진짜 구조화 신호를 직접 읽는다. 기존 bodyText.includes("hreflang"/"en_us"…) 는
	// 그 단어를 인용한 안내 본문에만 반응하는 FP/죽은 코드였으므로 더 이상 사용하지 않는다.
	//
	// 판정 기준 (rule intent = "hreflang 을 제대로 선언했는가"):
	//  - alternate-hreflang <link> 가 하나도 없음 → 단일 언어 사이트. 다국어 의도가 감지되지
	//    않으므로 정보성 통과(passed=true). 단일 언어 SMB 를 hreflang 없다고 감점하지 않는다.
	//  - alternate-hreflang <link> 가 1개 이상이고 모두 hreflang 값이 유효 → 다국어 신호 통과.
	//  - rel="alternate" 인데 hreflang 누락, 또는 hreflang 인데 href 누락 → 부분/깨진 선언만
	//    실패(passed=false). "있는데 잘못 단" 경우만 부드럽게(weight 3) 감점한다.
	const page = ctx.mainPage;
	const linkTags = page.linkTags ?? [];

	// rel 토큰에 "alternate" 가 포함된 <link> (rel 은 파서가 소문자 정규화).
	const alternateLinks = linkTags.filter((l) =>
		(l.rel ?? "").split(/\s+/).includes("alternate"),
	);
	// alternate 이면서 hreflang 속성을 가진 정상 신호.
	const hreflangLinks = alternateLinks.filter(
		(l) => l.hreflang !== null && l.hreflang.trim() !== "",
	);
	// 깨진 선언: hreflang 은 있는데 href 가 비었거나, alternate+hreflang 인데 href 누락.
	const brokenHreflangLinks = hreflangLinks.filter(
		(l) => l.href === null || l.href.trim() === "",
	);

	const hasHreflang = hreflangLinks.length > 0;
	const hasBroken = brokenHreflangLinks.length > 0;
	// 다국어 의도가 전혀 없으면(단일 언어) 정보성 통과. hreflang 이 있으면 깨진 것만 실패.
	const passed = !hasHreflang ? true : !hasBroken;

	const langList = hreflangLinks
		.map((l) => l.hreflang)
		.filter((v): v is string => !!v)
		.join(", ");

	return {
		ruleId: "SEO-HREFLANG-001",
		category: "seo",
		passed,
		severity: "low",
		title: "다국어 hreflang 태그 설정 여부",
		description: !hasHreflang
			? "<link rel=\"alternate\" hreflang> 태그가 없습니다. 단일 언어 사이트로 보이며, 다국어 버전이 없다면 hreflang 은 불필요합니다(정보성)."
			: passed
				? `다국어 hreflang 신호가 정상적으로 선언되어 있습니다(${langList}).`
				: "rel=\"alternate\" hreflang <link> 가 있으나 일부에 href 가 없어 다국어 신호가 깨져 있습니다.",
		evidence: [
			`<link rel="alternate" hreflang> 수: ${hreflangLinks.length}개`,
			hasHreflang
				? `선언된 hreflang: ${langList || "(값 없음)"}`
				: "다국어 alternate-hreflang <link> 미발견 (단일 언어 사이트로 판단)",
			hasBroken
				? `href 누락된 hreflang <link>: ${brokenHreflangLinks.length}개`
				: "href 누락된 hreflang <link> 없음",
		],
		recommendation: !hasHreflang
			? "영어, 중국어 등 다국어 버전이 있다면 각 페이지 <head> 에 <link rel=\"alternate\" hreflang> 태그를 추가하도록 업체에 요청하세요. 다국어 버전이 없으면 이 항목은 N/A 입니다."
			: "각 hreflang <link> 에 유효한 href(절대 URL)를 지정하고, 모든 언어 버전이 서로를 상호 참조(자기 자신 포함)하도록 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "hard",
		expectedImpact: "low",
		scoreImpact: !hasHreflang ? "not_applicable" : "scored",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-PAGE-DEPTH-001: 사이트 계층 구조 깊이
// ---------------------------------------------------------------------------
export const seoPageDepth001: Rule = (ctx): RuleResult => {
	const pages = ctx.pages;
	let maxDepth = 0;
	for (const p of pages) {
		try {
			const pn = new URL(p.url).pathname;
			const depth = pn.split("/").filter(Boolean).length;
			if (depth > maxDepth) maxDepth = depth;
		} catch {
			// ignore
		}
	}
	const passed = maxDepth <= 3;
	return {
		ruleId: "SEO-PAGE-DEPTH-001",
		category: "seo",
		passed,
		severity: "low",
		title: "사이트 계층 구조 깊이 (3단계 이하 권장)",
		description: passed
			? `사이트 최대 깊이가 ${maxDepth}단계로 적절합니다.`
			: `사이트 최대 깊이가 ${maxDepth}단계입니다. 3단계를 초과하면 검색 엔진이 하위 페이지를 잘 발견하지 못합니다.`,
		evidence: [
			`분석된 페이지 수: ${pages.length}개`,
			`최대 URL 깊이: ${maxDepth}단계`,
		],
		recommendation:
			"홈페이지 구조를 홈 > 서비스 > 상세 3단계 이하로 단순하게 유지하세요.",
		actionType: "si_action",
		difficulty: "hard",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-NAVER-META-001: 네이버 웹마스터 도구 인증 설정
// ---------------------------------------------------------------------------
export const seoNaverMeta001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// Phase 3 시맨틱 검증: 기존 로직은 bodyText 에서 'naver-site-verification' 문자열을
	// 찾아, 그 단어를 인용한 안내/블로그 본문에도 인증된 것으로 오탐했다.
	// 파서가 모든 <meta name/property> 를 meta 맵(소문자 키)으로 수집하므로,
	// 실제 <meta name="naver-site-verification" content="…"> 값을 직접 읽는다.
	const naverVerifyContent = page.meta["naver-site-verification"];
	const hasNaverVerify =
		typeof naverVerifyContent === "string" &&
		naverVerifyContent.trim().length > 0;
	return {
		ruleId: "SEO-NAVER-META-001",
		category: "seo",
		passed: hasNaverVerify,
		severity: "medium",
		title: "네이버 웹마스터 도구 인증 설정 여부",
		description: hasNaverVerify
			? "네이버 웹마스터 도구 인증 메타태그가 설정되어 있습니다."
			: "네이버 웹마스터 도구 인증 태그가 없습니다. 네이버 검색에서의 최적화가 제한될 수 있습니다.",
		evidence: [
			`meta[name="naver-site-verification"]: ${hasNaverVerify ? naverVerifyContent : "없음"}`,
		],
		recommendation:
			"네이버 서치어드바이저에서 사이트를 등록하고 인증 메타태그를 홈페이지에 추가하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-DUPLICATE-CONTENT-001: 중복 URL 여부
// ---------------------------------------------------------------------------
export const seoDuplicateContent001: Rule = (ctx): RuleResult => {
	const pages = ctx.pages;
	const uniqueUrls = new Set(pages.map((p) => p.url));
	const passed = uniqueUrls.size === pages.length;
	return {
		ruleId: "SEO-DUPLICATE-CONTENT-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "중복 페이지 URL 여부",
		description: passed
			? `분석된 ${pages.length}개 페이지가 모두 고유한 URL을 가지고 있습니다.`
			: "중복 URL이 감지되었습니다. 같은 내용이 여러 URL에서 서비스되면 검색 순위가 분산됩니다.",
		evidence: [
			`전체 페이지: ${pages.length}개`,
			`고유 URL: ${uniqueUrls.size}개`,
		],
		recommendation:
			"동일한 내용이 여러 URL에 있다면 canonical 태그로 대표 URL을 지정하도록 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-EXTERNAL-LINK-COUNT-001: 외부 링크 수 합리적인 범위
// ---------------------------------------------------------------------------
export const seoExternalLinkCount001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const count = page.externalLinks.length;
	const passed = count <= 20;
	return {
		ruleId: "SEO-EXTERNAL-LINK-COUNT-001",
		category: "seo",
		passed,
		severity: "low",
		title: "외부 링크 수 합리적 범위 여부",
		description: passed
			? `외부 링크가 ${count}개로 합리적인 범위입니다.`
			: `외부 링크가 ${count}개로 너무 많습니다. 과도한 외부 링크는 페이지 신뢰도를 낮출 수 있습니다.`,
		evidence: [`외부 링크 수: ${count}개`],
		recommendation:
			"외부 링크는 신뢰할 수 있는 사이트로만 연결하고, 20개 이하로 유지하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ===========================================================================
// Phase O-D 신규 SEO 룰 (+12개) — 룰 깊이 보강
// ===========================================================================

// ---------------------------------------------------------------------------
// SEO-HTTP2-001: HTTP/2 또는 HTTP/3 사용 여부
// ---------------------------------------------------------------------------
export const seoHttp2001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const protocol = page.httpProtocol ?? null;
	// protocol 정보가 없으면 informational (passed=true) — 크롤러가 채워주지 않은 경우
	if (protocol === null || protocol === undefined) {
		return {
			ruleId: "SEO-HTTP2-001",
			category: "seo",
			passed: true,
			severity: "low",
			title: "HTTP/2 또는 HTTP/3 사용 여부",
			description:
				"HTTP 프로토콜 버전 정보를 확인할 수 없습니다(크롤러 메타 미수집).",
			evidence: [`URL: ${page.url}`, "프로토콜 버전: 미수집"],
			recommendation:
				"호스팅 업체에 HTTP/2 또는 HTTP/3 활성화를 요청하세요. 페이지 로딩 속도가 빨라집니다.",
			actionType: "vendor_action",
			difficulty: "medium",
			expectedImpact: "low",
			scoreImpact: "unavailable",
			ruleWeight: 3,
		};
	}
	const passed = protocol === "2" || protocol === "3";
	return {
		ruleId: "SEO-HTTP2-001",
		category: "seo",
		passed,
		severity: "low",
		title: "HTTP/2 또는 HTTP/3 사용 여부",
		description: passed
			? `HTTP/${protocol} 프로토콜을 사용 중입니다. 최신 프로토콜로 페이지 로딩이 빠릅니다.`
			: `HTTP/${protocol} 프로토콜을 사용 중입니다. HTTP/2 또는 HTTP/3로 업그레이드하면 페이지 로딩이 빨라집니다.`,
		evidence: [`URL: ${page.url}`, `프로토콜: HTTP/${protocol}`],
		recommendation:
			"호스팅/CDN 업체에 HTTP/2 또는 HTTP/3 활성화를 요청하세요. CloudFlare, AWS CloudFront 같은 CDN을 사용하면 쉽게 적용됩니다.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-PAGE-LANG-CONSISTENCY-001: html lang + Content-Language 헤더 일치
// ---------------------------------------------------------------------------
export const seoPageLangConsistency001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const langInHtml = page.htmlLang?.toLowerCase() ?? null;
	const contentLang = page.contentLanguageHeader?.toLowerCase() ?? null;

	// 둘 다 없으면 informational 통과 (단일 신호로 판단 불가)
	if (!langInHtml && !contentLang) {
		return {
			ruleId: "SEO-PAGE-LANG-CONSISTENCY-001",
			category: "seo",
			passed: true,
			severity: "medium",
			title: "HTML lang과 Content-Language 헤더 일치 여부",
			description:
				"HTML lang 속성과 Content-Language 헤더 모두 확인할 수 없습니다.",
			evidence: [`URL: ${page.url}`],
			recommendation:
				"html lang=ko 속성을 추가하고, 서버에서 Content-Language: ko 헤더를 설정하세요.",
			actionType: "vendor_action",
			difficulty: "medium",
			expectedImpact: "medium",
			scoreImpact: "unavailable",
			ruleWeight: 6,
		};
	}
	// 한쪽만 있으면 informational 통과
	if (!langInHtml || !contentLang) {
		const effectiveBase = (langInHtml ?? contentLang)?.split("-")[0] ?? null;
		const isNonKorean = effectiveBase !== null && effectiveBase !== "ko";
		return {
			ruleId: "SEO-PAGE-LANG-CONSISTENCY-001",
			category: "seo",
			passed: !isNonKorean,
			severity: isNonKorean ? "low" : "medium",
			title: "HTML lang과 Content-Language 헤더 일치 여부",
			description: isNonKorean
				? `한국어 외 언어(${effectiveBase})로 감지되었습니다. 진단은 계속 진행되지만, 한국어 타깃 사이트가 맞는지 확인이 필요합니다.`
				: `HTML lang(${langInHtml ?? "없음"})과 Content-Language(${contentLang ?? "없음"}) 중 한쪽만 설정되어 있습니다.`,
			evidence: [
				`HTML lang: ${langInHtml ?? "없음"}`,
				`Content-Language 헤더: ${contentLang ?? "없음"}`,
			],
			recommendation:
				"한국어 사이트라면 HTML lang과 Content-Language 헤더를 모두 'ko' 또는 'ko-KR'로 맞추세요.",
			actionType: "vendor_action",
			difficulty: "medium",
			expectedImpact: "medium",
			scoreImpact: isNonKorean ? "scored" : "unavailable",
			ruleWeight: 6,
		};
	}
	// 두 값의 기본 언어 코드 비교 (ko-KR vs ko 처럼 prefix 만 비교)
	const htmlBase = langInHtml.split("-")[0];
	const headerBase = contentLang.split("-")[0];
	const passed = htmlBase === headerBase;
	const isNonKorean = passed && htmlBase !== "ko";
	return {
		ruleId: "SEO-PAGE-LANG-CONSISTENCY-001",
		category: "seo",
		passed: passed && !isNonKorean,
		severity: isNonKorean ? "low" : "medium",
		title: "HTML lang과 Content-Language 헤더 일치 여부",
		description: !passed
			? `HTML lang(${langInHtml})과 Content-Language(${contentLang})가 다릅니다. 검색 엔진이 페이지 언어를 혼동할 수 있습니다.`
			: isNonKorean
				? `한국어 외 언어(${htmlBase})로 감지되었습니다. 진단은 계속 진행되지만, 한국어 타깃 사이트가 맞는지 확인이 필요합니다.`
				: `HTML lang(${langInHtml})과 Content-Language(${contentLang})가 일치합니다.`,
		evidence: [
			`HTML lang: ${langInHtml}`,
			`Content-Language 헤더: ${contentLang}`,
		],
		recommendation:
			"HTML lang과 Content-Language 헤더의 언어 코드를 동일하게 맞추세요. 한국어 사이트면 둘 다 'ko' 또는 'ko-KR'로 설정합니다.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "medium",
		scoreImpact: "scored",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-AMP-VALID-001: AMP 사용 시 <link rel="amphtml"> 유효성
// ---------------------------------------------------------------------------
export const seoAmpValid001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 2 — HONEST DOWNGRADE (informational):
	// AMP 여부와 amphtml 연결은 <link rel="amphtml">·<html ⚡>·<html amp> 같은
	// 마크업으로 선언되는데, 파서는 (a) <meta> 만 page.meta 에 모으고 (b) bodyText 는
	// "보이는 본문"이라 <link>/<html> 속성과 ⚡ 마크업이 제거되어 있다. 즉 AMP 를
	// 확정할 파서 신호가 없다. 기존 룰은 bodyText 에서 'amphtml'/'⚡'/'<html amp'
	// 문자열을 찾았는데, 이는 본문에 우연히 노출된 문서/코드 텍스트(예: AMP 를 설명하는
	// 블로그 글)에만 매치되어 멀쩡한 비-AMP 페이지를 AMP 로 오판하는 FP 였다.
	// 따라서 파서가 amphtml 링크 신호를 노출하기 전까지는 패널티를 주지 않고
	// (passed=true) informational 처리한다.
	// (HANDOFF: ParsedPage 에 amphtml link 노출 필드 추가 시 실측 검증으로 승격할 것.)
	// ---------------------------------------------------------------------
	return {
		ruleId: "SEO-AMP-VALID-001",
		category: "seo",
		passed: true,
		severity: "low",
		title: "AMP 페이지 amphtml 링크 유효성",
		description:
			"AMP 여부는 <link rel=amphtml> 등 마크업으로 선언되며, 현재 파서가 이 신호를 별도로 노출하지 않습니다. AMP link detection needs parser field, deferred. 확인 불가로 처리합니다(패널티 없음).",
		evidence: [
			`URL: ${page.url}`,
			"amphtml 링크: 미수집(파서가 AMP link 필드를 노출하지 않음)",
		],
		recommendation:
			"AMP 페이지를 별도로 운영한다면 원본 페이지 head 에 link rel=amphtml href=AMP_URL 태그를 추가하세요. 대부분의 소상공인 사이트는 AMP 가 필요하지 않습니다.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "low",
		scoreImpact: "unavailable",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-XML-SITEMAP-VALID-001: sitemap.xml URL이 robots.txt에 명시되어 있는가
// ---------------------------------------------------------------------------
export const seoXmlSitemapValid001: Rule = (ctx): RuleResult => {
	// Phase 4 계약 수정: crawler 가 sitemap.xml 을 실제 fetch/URL 선정에 사용한
	// 실측 신호(ctx.sitemapUsed)를 우선한다. 사이트 내 sitemap 링크는 보조 신호다.
	const hasSitemap = hasSitemapSignal(ctx);
	const passed = hasSitemap;
	return {
		ruleId: "SEO-XML-SITEMAP-VALID-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "sitemap.xml의 robots.txt 등록 여부",
		description: passed
			? "크롤러가 sitemap.xml 사용 또는 sitemap 링크를 확인했습니다. robots.txt에도 Sitemap: 라인을 추가하세요."
			: "sitemap.xml 사용 신호가 확인되지 않습니다. 검색 엔진이 모든 페이지를 발견하기 어렵습니다.",
		evidence: [
			`crawler sitemap 사용 여부: ${ctx.sitemapUsed === true ? "있음" : "없음"}`,
			`sitemap 신호: ${hasSitemap ? "있음" : "없음"}`,
		],
		recommendation:
			"/sitemap.xml 파일을 생성하고 robots.txt 파일에 'Sitemap: https://도메인/sitemap.xml' 라인을 추가하도록 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-PAGINATION-001: rel="prev"/"next" 존재 (페이지네이션 사이트)
// ---------------------------------------------------------------------------
export const seoPagination001: Rule = (ctx): RuleResult => {
	// Phase 4 실측 승격 (commit bbd2d96 가 page.linkTags 추가 — <link> 의 rel/href/hreflang):
	// rel=prev/next 신호는 <head> 의 <link rel="prev"|"next"> 에만 존재한다. 속성값
	// 'rel="prev"' 는 가시 bodyText 에 절대 나타나지 않으므로 기존 bodyText 매칭은 TP 가
	// 구조적으로 불가능한 죽은 코드였다. 파서가 이제 linkTags 로 모든 <link> rel/href 를
	// 수집하므로 진짜 rel=prev/next 신호를 직접 읽는다.
	//
	// 판정 기준 (rule intent = "페이지네이션이 있다면 rel=prev/next 를 제대로 달았는가"):
	//  - rel=prev/next <link> 가 하나라도 있음(=페이지네이션 사이트) → href 가 모두 유효하면
	//    통과, href 누락 등 깨진 선언이 있으면 실패(passed=false).
	//  - rel=prev/next <link> 가 전혀 없음 → 대다수 SMB 페이지는 페이지네이션이 없으므로
	//    정보성 통과(passed=true). URL ?page= / 본문 '다음 페이지' 는 참고용 evidence 로만.
	const page = ctx.mainPage;
	const linkTags = page.linkTags ?? [];

	// rel 토큰에 prev/next 가 포함된 <link> (rel 은 파서가 소문자 정규화).
	const relPagination = linkTags.filter((l) => {
		const tokens = (l.rel ?? "").split(/\s+/);
		return tokens.includes("prev") || tokens.includes("next");
	});
	const relNext = relPagination.filter((l) =>
		(l.rel ?? "").split(/\s+/).includes("next"),
	);
	const relPrev = relPagination.filter((l) =>
		(l.rel ?? "").split(/\s+/).includes("prev"),
	);
	// 깨진 선언: rel=prev/next 인데 href 가 비어 검색 엔진이 따라갈 수 없음.
	const brokenPagination = relPagination.filter(
		(l) => l.href === null || l.href.trim() === "",
	);

	const hasRelPagination = relPagination.length > 0;
	const hasBroken = brokenPagination.length > 0;
	// 페이지네이션 신호가 없으면 정보성 통과. 있으면 href 누락(깨짐)만 실패.
	const passed = !hasRelPagination ? true : !hasBroken;

	// 참고용: URL/본문 기반 페이지네이션 가능성 (판정에는 사용하지 않음).
	const bodyLower = page.bodyText.toLowerCase();
	const looksPaginated =
		ctx.pages.some((p) => /[?&]page=\d+|\/page\/\d+/i.test(p.url)) ||
		/다음 페이지|이전 페이지|page \d+|페이지 \d+/.test(bodyLower);

	return {
		ruleId: "SEO-PAGINATION-001",
		category: "seo",
		passed,
		severity: "low",
		title: "페이지네이션 rel=prev/next 설정 여부",
		description: !hasRelPagination
			? "<link rel=\"prev\"|\"next\"> 페이지네이션 태그가 없습니다. 페이지가 나뉘지 않은 사이트라면 불필요합니다(정보성)."
			: passed
				? `페이지네이션 rel=prev/next <link> 가 정상적으로 선언되어 있습니다(next ${relNext.length} / prev ${relPrev.length}).`
				: "rel=\"prev\"/\"next\" <link> 가 있으나 일부에 href 가 없어 페이지네이션 신호가 깨져 있습니다.",
		evidence: [
			`<link rel="next"> 수: ${relNext.length}개, <link rel="prev"> 수: ${relPrev.length}개`,
			hasBroken
				? `href 누락된 rel=prev/next <link>: ${brokenPagination.length}개`
				: "href 누락된 rel=prev/next <link> 없음",
			`페이지네이션 가능성(참고용, 판정 제외): ${looksPaginated ? "있음" : "없음"}`,
		],
		recommendation: !hasRelPagination
			? "페이지네이션이 없으면 이 항목은 N/A입니다. 여러 페이지로 나뉜 목록(블로그, 상품 목록 등)이 있다면 각 페이지 <head> 에 <link rel=\"prev\"|\"next\"> 태그를 추가하도록 업체에 요청하세요."
			: "각 rel=prev/next <link> 에 유효한 href(다음/이전 페이지의 절대 URL)를 지정하도록 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "low",
		scoreImpact: !hasRelPagination ? "not_applicable" : "scored",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-CONTENT-FRESHNESS-001: article:published_time 또는 last-modified 메타 존재
// ---------------------------------------------------------------------------
export const seoContentFreshness001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const hasPublishedTime =
		page.meta["article:published_time"] !== undefined ||
		page.meta["article:modified_time"] !== undefined ||
		page.meta["og:updated_time"] !== undefined ||
		page.meta["last-modified"] !== undefined;
	const hasLastModifiedField =
		page.lastModified !== null &&
		page.lastModified !== undefined &&
		page.lastModified !== "";
	const passed = hasPublishedTime || hasLastModifiedField;
	return {
		ruleId: "SEO-CONTENT-FRESHNESS-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "콘텐츠 최신성 메타데이터 존재 여부",
		description: passed
			? `콘텐츠 최신성 정보(${page.lastModified ?? "메타태그"})가 설정되어 있습니다.`
			: "article:published_time, og:updated_time 등 콘텐츠 최신성 메타데이터가 없습니다. 검색 엔진이 콘텐츠 신선도를 파악하기 어렵습니다.",
		evidence: [
			`article:published_time: ${page.meta["article:published_time"] ?? "없음"}`,
			`article:modified_time: ${page.meta["article:modified_time"] ?? "없음"}`,
			`og:updated_time: ${page.meta["og:updated_time"] ?? "없음"}`,
		],
		recommendation:
			"블로그/뉴스성 페이지에는 meta property=article:published_time 과 article:modified_time 태그를 추가하도록 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-DUPLICATE-META-DESC-001: 동일 사이트 내 중복 meta description 감지
// ---------------------------------------------------------------------------
export const seoDuplicateMetaDesc001: Rule = (ctx): RuleResult => {
	const pages = ctx.pages;
	// 빈 description 제외하고 카운트
	const descriptions = pages
		.map((p) => (p.description ?? "").trim())
		.filter((d) => d.length > 0);
	if (descriptions.length < 2) {
		return {
			ruleId: "SEO-DUPLICATE-META-DESC-001",
			category: "seo",
			passed: true,
			severity: "medium",
			title: "중복 메타 설명(meta description) 감지",
			description:
				"비교 가능한 페이지 수가 부족하여 중복 검사를 수행할 수 없습니다.",
			evidence: [
				`분석 페이지 수: ${pages.length}개`,
				`description 있음: ${descriptions.length}개`,
			],
			recommendation:
				"각 페이지마다 페이지 내용에 맞는 고유한 meta description을 작성하세요.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "medium",
			scoreImpact: "not_applicable",
			ruleWeight: 6,
		};
	}
	const uniqueDescs = new Set(descriptions);
	const duplicateCount = descriptions.length - uniqueDescs.size;
	const passed = duplicateCount === 0;
	return {
		ruleId: "SEO-DUPLICATE-META-DESC-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "중복 메타 설명(meta description) 감지",
		description: passed
			? `${descriptions.length}개 페이지 모두 고유한 meta description을 가지고 있습니다.`
			: `${duplicateCount}개의 페이지가 동일한 meta description을 사용합니다. 검색 결과에서 페이지 구분이 어려워집니다.`,
		evidence: [
			`전체 페이지: ${pages.length}개`,
			`description 있는 페이지: ${descriptions.length}개`,
			`고유 description: ${uniqueDescs.size}개`,
			`중복 페이지: ${duplicateCount}개`,
		],
		recommendation:
			"각 페이지의 meta description을 페이지 내용에 맞게 고유하게 작성하세요. 같은 설명을 여러 페이지에 사용하면 검색 노출에 불리합니다.",
		actionType: "self_fix",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-HEADING-HIERARCHY-001: H1 → H2 → H3 위계 (H2 건너뛰고 H3 등 위반 감지)
// ---------------------------------------------------------------------------
export const seoHeadingHierarchy001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const headings = page.headingStructure ?? [];
	if (headings.length === 0) {
		// headingStructure 미수집 → fallback: h1/h2 만으로 간단 검사
		const hasH1 = page.h1 !== null;
		const hasH2 = page.h2.length > 0;
		// H1 없이 H2 사용은 위반
		const passed = !hasH2 || hasH1;
		return {
			ruleId: "SEO-HEADING-HIERARCHY-001",
			category: "seo",
			passed,
			severity: "medium",
			title: "제목 태그 위계 구조 (H1→H2→H3) 적절성",
			description: passed
				? "제목 위계 구조가 적절합니다."
				: "H1 없이 H2가 사용되고 있습니다. 제목 위계가 어긋나면 검색 엔진이 콘텐츠 구조를 이해하기 어렵습니다.",
			evidence: [`H1: ${page.h1 ?? "없음"}`, `H2 수: ${page.h2.length}개`],
			recommendation:
				"페이지 시작은 H1, 주요 섹션은 H2, 하위 섹션은 H3 순서로 작성하도록 업체에 요청하세요.",
			actionType: "vendor_action",
			difficulty: "medium",
			expectedImpact: "medium",
			scoreImpact: "unavailable",
			ruleWeight: 6,
		};
	}
	// 위계 위반: 이전 레벨 + 1 보다 큰 점프 (예: H1 → H3, H2 → H4)
	let violationCount = 0;
	let lastLevel = 0;
	let firstViolation = "";
	for (const h of headings) {
		if (lastLevel > 0 && h.level > lastLevel + 1) {
			violationCount++;
			if (firstViolation === "") {
				firstViolation = `H${lastLevel} → H${h.level} ("${h.text.slice(0, 30)}")`;
			}
		}
		lastLevel = h.level;
	}
	const passed = violationCount === 0;
	return {
		ruleId: "SEO-HEADING-HIERARCHY-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "제목 태그 위계 구조 (H1→H2→H3) 적절성",
		description: passed
			? `제목 태그 ${headings.length}개의 위계 구조가 모두 적절합니다.`
			: `제목 위계 위반이 ${violationCount}건 감지되었습니다(예: ${firstViolation}). 위계가 어긋나면 검색 엔진과 스크린리더가 콘텐츠를 이해하기 어렵습니다.`,
		evidence: [
			`전체 제목 태그 수: ${headings.length}개`,
			`위계 위반: ${violationCount}건`,
			...(firstViolation ? [`첫 위반: ${firstViolation}`] : []),
		],
		recommendation:
			"H1 → H2 → H3 순서로 위계를 지키세요. H2를 건너뛰고 H3로 가지 않도록 콘텐츠 구조를 정비하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-TRAILING-SLASH-001: URL trailing slash 일관성
// ---------------------------------------------------------------------------
export const seoTrailingSlash001: Rule = (ctx): RuleResult => {
	const pages = ctx.pages;
	// 루트(/)는 제외하고 비교
	const nonRootPaths = pages
		.map((p) => {
			try {
				return new URL(p.url).pathname;
			} catch {
				return null;
			}
		})
		.filter((p): p is string => p !== null && p !== "/");
	if (nonRootPaths.length < 2) {
		return {
			ruleId: "SEO-TRAILING-SLASH-001",
			category: "seo",
			passed: true,
			severity: "low",
			title: "URL trailing slash 일관성",
			description:
				"비교 가능한 페이지가 부족해 일관성 검사를 수행할 수 없습니다.",
			evidence: [`분석된 비루트 페이지 수: ${nonRootPaths.length}개`],
			recommendation:
				"URL 끝에 슬래시(/)를 붙일지 말지를 사이트 전체에 일관되게 적용하세요.",
			actionType: "vendor_action",
			difficulty: "medium",
			expectedImpact: "low",
			scoreImpact: "not_applicable",
			ruleWeight: 3,
		};
	}
	const withSlash = nonRootPaths.filter((p) => p.endsWith("/")).length;
	const withoutSlash = nonRootPaths.length - withSlash;
	// 모두 같은 방식이면 통과
	const passed = withSlash === 0 || withoutSlash === 0;
	return {
		ruleId: "SEO-TRAILING-SLASH-001",
		category: "seo",
		passed,
		severity: "low",
		title: "URL trailing slash 일관성",
		description: passed
			? `URL trailing slash가 ${withSlash > 0 ? "있음" : "없음"}으로 일관되게 적용되어 있습니다.`
			: `URL trailing slash가 일관되지 않습니다(있음: ${withSlash}개, 없음: ${withoutSlash}개). 같은 페이지가 두 URL로 인식될 수 있습니다.`,
		evidence: [
			`trailing slash 있음: ${withSlash}개`,
			`trailing slash 없음: ${withoutSlash}개`,
		],
		recommendation:
			"URL 끝에 슬래시(/)를 붙일지 말지 한 가지 규칙으로 통일하고, 다른 규칙은 301 리다이렉트로 보내도록 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// SEO-CANONICAL-SELF-001: canonical이 현재 페이지 자신을 가리키는가
// ---------------------------------------------------------------------------
export const seoCanonicalSelf001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	if (page.canonicalUrl === null || page.canonicalUrl.trim() === "") {
		return {
			ruleId: "SEO-CANONICAL-SELF-001",
			category: "seo",
			passed: false,
			severity: "medium",
			title: "Canonical URL의 자기 참조 여부",
			description:
				"canonical URL이 설정되어 있지 않아 자기 참조 여부를 확인할 수 없습니다.",
			evidence: [`URL: ${page.url}`, "canonical: 없음"],
			recommendation:
				"메인 페이지에는 link rel=canonical 태그를 자기 자신의 URL로 설정하도록 업체에 요청하세요.",
			actionType: "vendor_action",
			difficulty: "easy",
			expectedImpact: "medium",
			ruleWeight: 6,
		};
	}
	// URL 정규화 후 비교
	const normalize = (u: string): string => {
		try {
			const parsed = new URL(u);
			return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
		} catch {
			return u.replace(/\/$/, "");
		}
	};
	const pageNormalized = normalize(page.url);
	const canonicalNormalized = normalize(page.canonicalUrl);
	const passed = pageNormalized === canonicalNormalized;
	return {
		ruleId: "SEO-CANONICAL-SELF-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "Canonical URL의 자기 참조 여부",
		description: passed
			? "canonical URL이 현재 페이지 자신을 정확히 가리키고 있습니다."
			: `canonical URL(${page.canonicalUrl})이 현재 페이지(${page.url})와 다릅니다. 검색 노출이 의도와 다르게 분산될 수 있습니다.`,
		evidence: [
			`현재 페이지 URL: ${page.url}`,
			`canonical: ${page.canonicalUrl}`,
		],
		recommendation:
			"메인 페이지의 canonical은 페이지 자신의 URL과 정확히 일치해야 합니다. 의도적으로 다른 페이지로 보내는 경우가 아니라면 자기 참조로 수정하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// SEO-BROKEN-LINK-001: 본문 internal 링크 중 404/410 비율
// ---------------------------------------------------------------------------
export const seoBrokenLink001: Rule = (ctx): RuleResult => {
	const pages = ctx.pages;
	// crawl된 페이지 중 4xx/410 상태가 있는지 검사
	const brokenPages = pages.filter(
		(p) =>
			p.statusCode === 404 ||
			p.statusCode === 410 ||
			(p.statusCode >= 400 && p.statusCode < 500),
	);
	// 전체 분석된 페이지 대비 broken 비율
	const passed = brokenPages.length === 0;
	return {
		ruleId: "SEO-BROKEN-LINK-001",
		category: "seo",
		passed,
		severity: "high",
		title: "내부 링크 깨짐(broken link) 여부",
		description: passed
			? `분석된 ${pages.length}개 페이지 모두 정상 응답(2xx/3xx)입니다.`
			: `분석된 페이지 중 ${brokenPages.length}개가 404/410 등 깨진 상태입니다. 방문자와 검색 엔진 모두에 부정적입니다.`,
		evidence: [
			`전체 분석 페이지: ${pages.length}개`,
			`깨진 페이지: ${brokenPages.length}개`,
			...brokenPages.slice(0, 3).map((p) => `${p.statusCode}: ${p.url}`),
		],
		recommendation:
			"깨진 내부 링크를 모두 수정하거나 301 리다이렉트로 정상 페이지로 연결하세요. Google Search Console로 정기 점검을 권합니다.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// SEO-REDIRECT-CHAIN-001: 리다이렉트 체인 ≤ 2
// ---------------------------------------------------------------------------
export const seoRedirectChain001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const chainLen = page.redirectChainLength;
	if (chainLen === null || chainLen === undefined) {
		return {
			ruleId: "SEO-REDIRECT-CHAIN-001",
			category: "seo",
			passed: true,
			severity: "medium",
			title: "리다이렉트 체인 길이 (2회 이하 권장)",
			description:
				"리다이렉트 체인 정보를 확인할 수 없습니다(크롤러 메타 미수집).",
			evidence: [`URL: ${page.url}`, "리다이렉트 정보: 미수집"],
			recommendation:
				"리다이렉트는 한 번만 거치도록 설정하세요. 여러 단계 리다이렉트는 페이지 로딩을 느리게 합니다.",
			actionType: "vendor_action",
			difficulty: "medium",
			expectedImpact: "medium",
			scoreImpact: "unavailable",
			ruleWeight: 6,
		};
	}
	const passed = chainLen <= 2;
	return {
		ruleId: "SEO-REDIRECT-CHAIN-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "리다이렉트 체인 길이 (2회 이하 권장)",
		description: passed
			? `리다이렉트가 ${chainLen}회로 적절한 수준입니다.`
			: `리다이렉트가 ${chainLen}회로 너무 많이 거칩니다. 페이지 로딩 속도와 SEO 점수에 부정적입니다.`,
		evidence: [`URL: ${page.url}`, `리다이렉트 횟수: ${chainLen}회`],
		recommendation:
			"리다이렉트는 1회로 끝내도록 설정하세요. http → https → www → 최종 URL 같은 다단계 리다이렉트는 한 번으로 합치도록 업체에 요청하세요.",
		actionType: "vendor_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};
