/**
 * X-SAG Core Engine — GEO 규칙 카탈로그
 *
 * PRD § 11 + TRD § 10.5 기반. 규칙 기반 정적 분석만 수행 (POLICY § 7.1).
 * GEO: Generative Engine Optimization — 생성형 AI 검색 환경 적합도.
 * ruleWeight: high=10, medium=6, low=3
 *
 * 규칙 수: 27개 (기존 19개 Phase M-A + 신규 8개 Phase O-D)
 * GEO-LLMS-TXT-001 ruleWeight: 3→2 (Phase M-A 조정)
 *
 * Phase 1 (시맨틱 마이그레이션): high-weight NAP 룰 5종을 bodyText 정규식 →
 * 다층 시맨틱 검증으로 이관. ruleId/category/severity/weight/RuleResult shape 불변,
 * PASS/FAIL 로직만 교체.
 *   - GEO-TRUST-001 / GEO-CONTACT-001 / GEO-ADDRESS-001 / GEO-PHONE-001 / GEO-NAP-CONSISTENCY-001
 *   검증 순서: (1) schema-validator 구조화 신호 → (2) meta → (3) nap-extractor 본문
 *   (예시 문맥 hasExampleContextAround 로 제외). businessProfile.region 대조 포함.
 */

import type { Rule, RuleResult } from "../types.js";
import {
	areaCodeMatchesRegion,
	extractPhones,
	hasExampleContextAround,
	normalizeBusinessName,
} from "../shared/nap-extractor.js";
import {
	getAggregateRating,
	getName,
	getOpeningHours,
	getPostalAddress,
	getSchemaNodes,
	getTelephone,
	isLocalBusinessNode,
	isOrganizationNode,
	isPresent,
} from "../shared/schema-validator.js";
import { extractSentencesAround } from "../shared/text-utils.js";
import { buildExtractedEntities } from "../types/extracted-entities.js";

// ---------------------------------------------------------------------------
// Phase 1 공통 헬퍼 — NAP 룰의 다층 시맨틱 검증용
// ---------------------------------------------------------------------------

/**
 * ctx.extractedEntities 를 읽되, 누락 시 inline-extractor 로 폴백한다.
 * SEO 등 entities 를 채우지 않는 analyzer 에서도 안전하게 동작한다.
 */
function getEntities(ctx: Parameters<Rule>[0]) {
	return (
		ctx.extractedEntities ??
		buildExtractedEntities(ctx.mainPage, ctx.businessProfile)
	);
}

/**
 * bodyText 에서 예시(example) 문맥이 아닌 "실제" 전화번호만 남긴다.
 * 매치 위치 주변에 example 문맥이 있으면 제외한다.
 */
function realPhones(
	bodyText: string,
	phones: { raw: string; normalized: string; areaCode: string }[],
): { raw: string; normalized: string; areaCode: string }[] {
	return phones.filter((p) => {
		const idx = bodyText.indexOf(p.raw);
		if (idx === -1) return true; // 위치 못 찾으면 보수적으로 유지
		return !hasExampleContextAround(bodyText, idx);
	});
}

/**
 * bodyText 에서 예시(example) 문맥이 아닌 "실제" 주소만 남긴다.
 */
function realAddresses(
	bodyText: string,
	addresses: { raw: string; road: boolean; normalized: string }[],
): { raw: string; road: boolean; normalized: string }[] {
	return addresses.filter((a) => {
		const idx = bodyText.indexOf(a.raw);
		if (idx === -1) return true;
		return !hasExampleContextAround(bodyText, idx);
	});
}

function getBodyParagraphs(page: {
	paragraphs?: string[] | undefined;
	textBlocks?: { tag: string; text: string }[] | undefined;
	bodyText: string;
}): string[] {
	const normalize = (items: string[] | undefined): string[] =>
		(items ?? []).map((p) => p.trim()).filter((p) => p.length > 0);

	const paragraphs = normalize(page.paragraphs);
	if (paragraphs.length > 0) return paragraphs;

	const paragraphBlocks = normalize(
		page.textBlocks
			?.filter((block) => block.tag === "p")
			.map((block) => block.text),
	);
	if (paragraphBlocks.length > 0) return paragraphBlocks;

	return page.bodyText
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
}

/** 예시/문서용 이메일 (example@test.com 등) 여부. */
const DOC_EMAIL_PATTERN =
	/(example|test|sample|dummy|user|name|your|email|id|hong\.?gildong|honggildong)@|@(example|test|sample|domain|yourcompany|email)\./i;

/** 실제로 보이는 이메일만 추출 (예시/문서용 도메인 제외). */
function realEmails(bodyText: string): string[] {
	const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
	const out: string[] = [];
	for (const m of bodyText.matchAll(emailPattern)) {
		const email = m[0];
		const idx = m.index ?? bodyText.indexOf(email);
		if (DOC_EMAIL_PATTERN.test(email)) continue;
		if (hasExampleContextAround(bodyText, idx)) continue;
		out.push(email);
	}
	return out;
}

/**
 * 시간 범위 토큰(예: 09:00-18:00, 9시-18시)을 추출해 실제로 유효한지 검증한다.
 * 유효 기준: hour 0-24, minute 0-59, 그리고 start < end. "09:00-25:00" 같은 불가능한 시간은 거부.
 * GEO-OPENING-HOURS-001 / GEO-BUSINESS-HOURS-DETAIL-001 공용.
 */
const hasValidHoursRange = (text: string): boolean => {
	const rangePattern =
		/(\d{1,2})\s*[:시]?\s*(\d{0,2})\s*[-~]\s*(\d{1,2})\s*[:시]?\s*(\d{0,2})/g;
	for (const m of text.matchAll(rangePattern)) {
		const startH = Number(m[1]);
		const startM = m[2] ? Number(m[2]) : 0;
		const endH = Number(m[3]);
		const endM = m[4] ? Number(m[4]) : 0;
		const valid =
			startH >= 0 &&
			startH <= 24 &&
			endH >= 0 &&
			endH <= 24 &&
			startM >= 0 &&
			startM <= 59 &&
			endM >= 0 &&
			endM <= 59;
		if (!valid) continue;
		const startTotal = startH * 60 + startM;
		const endTotal = endH * 60 + endM;
		if (startTotal < endTotal) return true;
	}
	return false;
};

const KOREAN_TRAILING_PARTICLES = [
	"으로", "에서", "에게", "께서", "부터", "까지", "처럼", "보다", "이라", "라고",
	"이며", "이고", "입니다", "였다", "으로서", "은", "는", "이", "가", "을", "를",
	"에", "의", "도", "만", "과", "와", "로", "랑", "께", "입", "예", "였", "라",
	"고", "며", "지", "서",
];

const KOREAN_PLACE_SUFFIXES = [
	"특별자치시", "특별자치도", "특별시", "광역시", "시", "군", "구", "동", "읍",
	"면", "리", "로", "길", "대로", "역", "점",
];

const isBoundaryChar = (ch: string | undefined): boolean =>
	ch === undefined || !/[가-힣A-Za-z0-9]/.test(ch);

const hasAllowedKoreanTail = (
	tail: string,
	allowPlaceSuffixes: boolean,
): boolean => {
	if (tail.length === 0) return true;
	if (!/^[가-힣]/.test(tail)) return !/^[A-Za-z0-9]/.test(tail);
	const allowed = allowPlaceSuffixes
		? [...KOREAN_PLACE_SUFFIXES, ...KOREAN_TRAILING_PARTICLES]
		: KOREAN_TRAILING_PARTICLES;
	return allowed.some((suffix) => tail.startsWith(suffix));
};

function hasBoundaryAwareMatch(
	text: string,
	rawNeedle: string,
	options: { variants?: string[]; allowPlaceSuffixes?: boolean } = {},
): boolean {
	const variants = (options.variants ?? [rawNeedle])
		.map((v) => v.trim().toLowerCase())
		.filter((v) => v.length > 0)
		.sort((a, b) => b.length - a.length);
	const haystack = text.toLowerCase();

	for (const variant of variants) {
		let pos = haystack.indexOf(variant);
		while (pos !== -1) {
			const before = haystack[pos - 1];
			const tail = haystack.slice(pos + variant.length);
			if (
				isBoundaryChar(before) &&
				hasAllowedKoreanTail(tail, options.allowPlaceSuffixes ?? false)
			) {
				return true;
			}
			pos = haystack.indexOf(variant, pos + 1);
		}
	}

	return false;
}

function escapeRegExpLiteral(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasFlexibleSpacingKoreanMatch(text: string, variant: string): boolean {
	const compact = variant.replace(/\s+/g, "").toLowerCase();
	if (compact.length < 2 || !/[가-힣]/.test(compact)) return false;

	const pattern = [...compact].map(escapeRegExpLiteral).join("\\s*");
	const regex = new RegExp(pattern, "gi");
	const haystack = text.toLowerCase();
	for (const match of haystack.matchAll(regex)) {
		const idx = match.index ?? 0;
		const before = haystack[idx - 1];
		const tail = haystack.slice(idx + match[0].length);
		if (isBoundaryChar(before) && hasAllowedKoreanTail(tail, false)) {
			return true;
		}
	}
	return false;
}

function hasBusinessNameMatch(text: string, name: string): boolean {
	const variants = normalizeBusinessName(name).variants;
	if (hasBoundaryAwareMatch(text, name, { variants })) return true;
	return variants.some((variant) => hasFlexibleSpacingKoreanMatch(text, variant));
}

function getIndustryVariants(industry: string): string[] {
	const normalized = industry.trim().toLowerCase();
	const compact = normalized.replace(/[\s_-]+/g, "");
	const synonyms: Record<string, string[]> = {
		cafe: ["카페", "커피", "커피숍", "coffee shop"],
		coffeeshop: ["카페", "커피", "커피숍", "coffee shop"],
		restaurant: ["식당", "음식점", "레스토랑"],
		clinic: ["병원", "의원", "클리닉"],
		medicalclinic: ["병원", "의원", "클리닉"],
		dentist: ["치과", "치과의원"],
		academy: ["학원", "아카데미"],
		salon: ["미용실", "헤어샵", "살롱"],
		hotel: ["호텔", "숙박", "숙소"],
		lodgingbusiness: ["호텔", "숙박", "숙소", "펜션"],
		bakery: ["베이커리", "빵집"],
		healthclub: ["헬스장", "피트니스", "짐"],
		gym: ["헬스장", "피트니스", "짐"],
		autorepair: ["자동차정비", "정비소", "카센터"],
	};
	return Array.from(
		new Set([industry, normalized, compact, ...(synonyms[compact] ?? [])]),
	).filter((v) => v.trim().length > 0);
}

function hasContactLink(
	page: { contactLinks?: { kind: "tel" | "mailto" }[] },
	kind: "tel" | "mailto",
): boolean {
	return (page.contactLinks ?? []).some((link) => link.kind === kind);
}

// ---------------------------------------------------------------------------
// GEO-BUSINESS-NAME-001: 업체명 명확 (businessName 이 title/H1/footer 에 등장)
// ---------------------------------------------------------------------------
export const geoBusinessName001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const name = ctx.businessProfile.businessName;
	if (!name) {
		return {
			ruleId: "GEO-BUSINESS-NAME-001",
			category: "geo",
			passed: false,
			severity: "high",
			title: "업체명 명확성",
			description:
				"businessName field is empty. Add the exact store, clinic, or business name users search for.",
			evidence: ["businessProfile.businessName 없음"],
			recommendation:
				"진단 요청 시 businessName 필드에 고객이 실제로 검색할 업체명을 정확히 입력하세요. 예: '강남 브런치카페 르시그널'처럼 브랜드명과 지점을 함께 넣으면 AI 검색 식별률이 올라갑니다.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "high",
			ruleWeight: 10,
		};
	}
	const searchText = [
		page.title ?? "",
		page.h1 ?? "",
		page.bodyText.slice(0, 3000),
	].join(" ");
	const passed = hasBusinessNameMatch(searchText, name);
	return {
		ruleId: "GEO-BUSINESS-NAME-001",
		category: "geo",
		passed,
		severity: "high",
		title: "업체명 명확성 (title/H1/본문 포함 여부)",
		description: passed
			? `businessName="${name}" appears in a prominent page area.`
			: `businessName="${name}" is missing from title, H1, and the first 3000 body characters, so AI answers may not identify the business correctly.`,
		evidence: [
			`업체명: ${name}`,
			`title: ${page.title ?? "없음"}`,
			`H1: ${page.h1 ?? "없음"}`,
		],
		recommendation: `Put the exact businessName "${name}" in the page title and H1, then repeat it naturally near the top of the body. Example: "${name} - ${ctx.businessProfile.region} ${ctx.businessProfile.industry}".`,
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// GEO-INDUSTRY-001: 업종 명확
// ---------------------------------------------------------------------------
export const geoIndustry001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const industry = ctx.businessProfile.industry;
	if (!industry) {
		return {
			ruleId: "GEO-INDUSTRY-001",
			category: "geo",
			passed: false,
			severity: "high",
			title: "업종 명확성",
			description:
				"industry field is empty. Add the customer-facing industry keyword such as cafe, clinic, academy, or salon.",
			evidence: ["businessProfile.industry 없음"],
			recommendation:
				"진단 요청 시 industry 필드에 대표 업종을 입력하세요. 예: cafe, clinic, academy처럼 고객이 비교 검색할 업종 단어를 사용해야 AI 검색이 업체 유형을 분류할 수 있습니다.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "high",
			ruleWeight: 10,
		};
	}
	const searchText = [
		page.title ?? "",
		page.description ?? "",
		page.h1 ?? "",
		...page.h2,
		page.bodyText.slice(0, 3000),
	].join(" ");
	const passed = hasBoundaryAwareMatch(searchText, industry, {
		variants: getIndustryVariants(industry),
	});
	return {
		ruleId: "GEO-INDUSTRY-001",
		category: "geo",
		passed,
		severity: "high",
		title: "업종 정보 명확성",
		description: passed
			? `industry="${industry}" appears on the page.`
			: `industry="${industry}" is missing from title, meta description, H1/H2, and the first 3000 body characters, so AI answers may not classify the business category.`,
		evidence: [
			`업종: ${industry}`,
			`title: ${page.title ?? "없음"}`,
			`description: ${page.description ?? "없음"}`,
		],
		recommendation: `Add the exact industry keyword "${industry}" to the title, meta description, H1, and intro copy. Example: "${ctx.businessProfile.region} ${industry} ${ctx.businessProfile.businessName}".`,
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// GEO-REGION-001: 지역 정보 명확
// ---------------------------------------------------------------------------
export const geoRegion001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const region = ctx.businessProfile.region;
	if (!region) {
		return {
			ruleId: "GEO-REGION-001",
			category: "geo",
			passed: false,
			severity: "high",
			title: "지역 정보 명확성",
			description:
				"region field is empty. Add a searchable service-area value such as city, district, or neighborhood.",
			evidence: ["businessProfile.region 없음"],
			recommendation:
				"진단 요청 시 region 필드에 시/구/동 단위 지역명을 입력하세요. 예: '서울 강남구', '경기 성남 분당'처럼 지역 검색 조합에 쓸 수 있는 값을 넣어야 합니다.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "high",
			ruleWeight: 10,
		};
	}
	const searchText = [
		page.title ?? "",
		page.description ?? "",
		page.h1 ?? "",
		page.bodyText.slice(0, 3000),
	].join(" ");
	const passed = hasBoundaryAwareMatch(searchText, region, {
		allowPlaceSuffixes: true,
	});
	return {
		ruleId: "GEO-REGION-001",
		category: "geo",
		passed,
		severity: "high",
		title: "지역 정보 명확성",
		description: passed
			? `region="${region}" appears on the page.`
			: `region="${region}" is missing from title, meta description, H1, and the first 3000 body characters, so local-intent AI answers may not match the business to nearby searches.`,
		evidence: [`지역: ${region}`, `title: ${page.title ?? "없음"}`],
		recommendation: `Add the exact region "${region}" to the title, meta description, H1, address block, and intro copy. Example: "${region} ${ctx.businessProfile.industry} ${ctx.businessProfile.businessName}".`,
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// GEO-SERVICE-001: 주요 서비스 페이지 분리 여부
// ---------------------------------------------------------------------------
export const geoService001: Rule = (ctx): RuleResult => {
	const services = ctx.businessProfile.mainServices;
	const pages = ctx.pages;
	// 서비스 수 이상의 페이지(메인 포함)가 있으면 서비스 페이지 분리로 추정
	const passed = pages.length >= services.length + 1;
	return {
		ruleId: "GEO-SERVICE-001",
		category: "geo",
		passed,
		severity: "medium",
		title: "주요 서비스별 페이지 분리 여부",
		description: passed
			? `전체 ${pages.length}개 페이지가 분석되어 서비스별 페이지가 분리된 것으로 보입니다.`
			: `전체 ${pages.length}개 페이지로 주요 서비스 ${services.length}개를 모두 다루기 어렵습니다. 서비스별 전용 페이지가 없으면 각 서비스의 검색 노출이 약합니다.`,
		evidence: [
			`분석된 페이지: ${pages.length}개`,
			`주요 서비스: ${services.length}개 (${services.join(", ")})`,
		],
		recommendation:
			"각 주요 서비스마다 별도 페이지를 만들어 구체적인 설명, 가격, 사진을 담으세요. 서비스 페이지는 AI 검색에서 해당 서비스 질문의 답변 소스가 됩니다.",
		actionType: "si_action",
		difficulty: "hard",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// GEO-TRUST-001: 신뢰 정보 (대표자/사업자번호/연락처/주소)
// ---------------------------------------------------------------------------
export const geoTrust001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const region = ctx.businessProfile.region ?? "";
	const ent = getEntities(ctx);
	const nodes = getSchemaNodes(page.schemaJsonLd);

	// (1) 구조화 신호: 어떤 노드든 telephone/address 가 있으면 trust 신호로 인정.
	// (getTelephone 은 contactPoint.telephone, getPostalAddress 는 string|PostalAddress 처리)
	const schemaTel = nodes
		.map((n) => getTelephone(n))
		.find((t): t is string => Boolean(t));
	const schemaAddr = nodes
		.map((n) => getPostalAddress(n))
		.find((a) => a !== null);

	// (3) 본문 신호: 예시(example) 문맥 전화/주소는 제외.
	const phones = realPhones(page.bodyText, ent.phones);
	// 지역번호가 region 과 부합하는 전화만 "신뢰 전화"로 인정.
	const trustedPhones = phones.filter((p) =>
		areaCodeMatchesRegion(p.areaCode, region),
	);
	const addresses = realAddresses(page.bodyText, ent.addresses);

	// 사업자등록번호는 NAP 가 아니지만 trust 신호 — 예시 문맥 제외 후 인정.
	const bizRegPattern = /\d{3}-\d{2}-\d{5}/g;
	let hasBizReg = false;
	for (const m of page.bodyText.matchAll(bizRegPattern)) {
		if (!hasExampleContextAround(page.bodyText, m.index ?? 0)) {
			hasBizReg = true;
			break;
		}
	}

	const hasPhone = Boolean(schemaTel) || trustedPhones.length > 0;
	const hasAddress = schemaAddr !== null || addresses.length > 0;

	const trustCount = [hasBizReg, hasPhone, hasAddress].filter(Boolean).length;
	const passed = trustCount >= 2;

	return {
		ruleId: "GEO-TRUST-001",
		category: "geo",
		passed,
		severity: "high",
		title: "신뢰 정보 포함 여부 (사업자번호/전화/주소)",
		description: passed
			? `신뢰 정보 ${trustCount}개(사업자번호: ${hasBizReg ? "✓" : "✗"}, 전화: ${hasPhone ? "✓" : "✗"}, 주소: ${hasAddress ? "✓" : "✗"})가 확인되었습니다.`
			: `신뢰 정보가 부족합니다(사업자번호: ${hasBizReg ? "✓" : "✗"}, 전화: ${hasPhone ? "✓" : "✗"}, 주소: ${hasAddress ? "✓" : "✗"}). AI 검색 엔진은 신뢰 정보가 충분한 업체를 더 신뢰합니다.`,
		evidence: [
			`사업자번호: ${hasBizReg ? "있음" : "없음"}`,
			`전화번호: ${hasPhone ? "있음" : "없음"}`,
			`주소 정보: ${hasAddress ? "있음" : "없음"}`,
		],
		recommendation:
			"하단(footer)에 업체명, 대표자명, 사업자등록번호, 주소, 전화번호를 명시하세요. 이 정보는 AI 검색에서 업체 신뢰도를 높입니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// GEO-LOCAL-BUSINESS-SCHEMA-001: LocalBusiness JSON-LD 적용
// ---------------------------------------------------------------------------
export const geoLocalBusinessSchema001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasLocalBusiness = nodes.some((node) => {
		if (!isLocalBusinessNode(node)) return false;
		const hasName = isPresent(getName(node));
		const hasContact =
			isPresent(getPostalAddress(node)) || isPresent(getTelephone(node));
		return hasName && hasContact;
	});
	return {
		ruleId: "GEO-LOCAL-BUSINESS-SCHEMA-001",
		category: "geo",
		passed: hasLocalBusiness,
		severity: "high",
		title: "LocalBusiness 구조화 데이터(JSON-LD) 적용 여부",
		description: hasLocalBusiness
			? "LocalBusiness JSON-LD 구조화 데이터가 핵심 정보(업체명 + 주소/전화)와 함께 적용되어 있습니다. AI 검색에서 업체 정보를 구조적으로 전달합니다."
			: "유효한 LocalBusiness JSON-LD 구조화 데이터가 없습니다. (@type만 있고 업체명·주소·전화 같은 핵심 속성이 비어 있으면 인정되지 않습니다.) AI 검색 엔진이 업체 정보를 파악하기 어렵습니다.",
		evidence: [
			`URL: ${page.url}`,
			`JSON-LD 수: ${page.schemaJsonLd.length}개`,
			`유효 LocalBusiness Schema(명칭+주소/전화): ${hasLocalBusiness ? "있음" : "없음"}`,
		],
		recommendation:
			"X-SAG '스니펫 생성' 기능으로 LocalBusiness JSON-LD 코드를 생성 후 홈페이지 <head>에 삽입하도록 업체에 요청하세요.",
		actionType: "snippet_action",
		difficulty: "medium",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// GEO-ORGANIZATION-SCHEMA-001: Organization JSON-LD 적용
// ---------------------------------------------------------------------------
export const geoOrganizationSchema001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const hasOrg = getSchemaNodes(page.schemaJsonLd).some(isOrganizationNode);
	return {
		ruleId: "GEO-ORGANIZATION-SCHEMA-001",
		category: "geo",
		passed: hasOrg,
		severity: "medium",
		title: "Organization 구조화 데이터(JSON-LD) 적용 여부",
		description: hasOrg
			? "Organization JSON-LD 구조화 데이터가 적용되어 있습니다."
			: "Organization JSON-LD 구조화 데이터가 없습니다. 브랜드 정보를 AI 검색에 명확히 전달하지 못합니다.",
		evidence: [
			`URL: ${page.url}`,
			`Organization Schema: ${hasOrg ? "있음" : "없음"}`,
		],
		recommendation:
			"Organization JSON-LD를 추가하면 업체명, 로고, SNS 링크, 연락처 등을 구조적으로 제공할 수 있습니다. X-SAG 스니펫 생성 기능을 활용하세요.",
		actionType: "snippet_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// GEO-LLMS-TXT-001: llms.txt 적용 가능 여부 (본문에서 힌트 감지)
// ruleWeight: 2 (Phase M-A 조정, 기존 3→2)
// ---------------------------------------------------------------------------
export const geoLlmsTxt001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	let origin = "";
	try {
		origin = new URL(page.url).origin;
	} catch {
		origin = page.url;
	}
	const llmsUrl = `${origin}/llms.txt`;
	// ---------------------------------------------------------------------
	// Phase 2 시맨틱 검증:
	// 예전 룰은 bodyText 의 'llms.txt' 단순 언급(블로그/설명 글)만으로 통과시켰다.
	// 실제 파일 존재 여부는 HTTP fetch 없이 단정 불가하나(POLICY §7.1),
	// internal/external 링크에 /llms.txt 경로가 있으면 실제 파일 신호로 인정한다.
	// 본문 언급만으로는 통과시키지 않는다(FP 제거).
	// ---------------------------------------------------------------------
	const llmsPathRe = /\/llms\.txt(?:[?#].*)?$/i;
	const hasLlmsLink = [...page.internalLinks, ...page.externalLinks].some((l) =>
		llmsPathRe.test(l.trim()),
	);
	const passed = hasLlmsLink;
	return {
		ruleId: "GEO-LLMS-TXT-001",
		category: "geo",
		passed,
		severity: "low",
		title: "llms.txt 적용 여부",
		description: passed
			? "사이트 링크에서 /llms.txt 파일 경로가 확인되었습니다. AI 검색 엔진에 업체 정보를 안내하는 파일이 적용된 것으로 보입니다."
			: `${llmsUrl} 경로의 llms.txt 파일 링크가 확인되지 않습니다(본문 언급만으로는 인정하지 않으며, 실제 존재 여부는 HTTP 확인이 필요합니다). llms.txt는 AI 검색 엔진에 업체 정보를 명확히 안내하는 파일입니다.`,
		evidence: [
			`확인 URL: ${llmsUrl}`,
			`/llms.txt 링크: ${hasLlmsLink ? "있음" : "없음"}`,
		],
		recommendation:
			"X-SAG '스니펫 생성' 기능으로 /llms.txt 파일 내용을 생성한 후 홈페이지 루트 디렉토리에 업로드하세요. AI 검색 엔진이 업체를 더 잘 이해할 수 있습니다.",
		actionType: "snippet_action",
		difficulty: "medium",
		expectedImpact: "low",
		ruleWeight: 2,
	};
};

// ---------------------------------------------------------------------------
// GEO-AI-SUMMARY-001: AI가 요약하기 쉬운 문장 구조 (단락 길이 평균 50~300자)
// ---------------------------------------------------------------------------
export const geoAiSummary001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const paragraphs = getBodyParagraphs(page).filter((p) => p.length >= 20);

	if (paragraphs.length === 0) {
		return {
			ruleId: "GEO-AI-SUMMARY-001",
			category: "geo",
			passed: false,
			severity: "medium",
			title: "AI 요약 친화적 문장 구조",
			description: "분석 가능한 본문 단락이 없습니다.",
			evidence: [`URL: ${page.url}`],
			recommendation: "명확한 단락 구조로 본문을 작성하세요.",
			actionType: "self_fix",
			difficulty: "medium",
			expectedImpact: "medium",
			ruleWeight: 6,
		};
	}

	const avgLen =
		paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length;
	const passed = avgLen >= 50 && avgLen <= 300;
	return {
		ruleId: "GEO-AI-SUMMARY-001",
		category: "geo",
		passed,
		severity: "medium",
		title: "AI 요약 친화적 문장 구조 (단락 평균 50~300자)",
		description: passed
			? `단락 평균 길이가 ${Math.round(avgLen)}자로 AI 요약에 적합한 구조입니다.`
			: avgLen < 50
				? `avgParagraphChars=${Math.round(avgLen)}입니다. 권장 범위 50-300자보다 짧아 정보가 부족하고, AI 검색이 업체를 설명하기 어렵습니다.`
				: `avgParagraphChars=${Math.round(avgLen)}입니다. 권장 범위 50-300자를 초과해 단락이 너무 길고, AI 검색에서 인용되기 어렵습니다.`,
		evidence: [
			`분석 단락 수: ${paragraphs.length}개`,
			`단락 평균 길이: ${Math.round(avgLen)}자`,
		],
		recommendation:
			"각 단락을 50-300자로 구성하세요. 한 단락에 하나의 핵심 정보만 담고, 300자를 넘는 단락은 서비스/가격/위치/신뢰 정보 단위로 나누세요.",
		actionType: "self_fix",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// GEO-SOCIAL-PROOF-001: 리뷰/평점/수상 흔적
// ---------------------------------------------------------------------------
export const geoSocialProof001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;

	// ---------------------------------------------------------------------
	// Phase 1 시맨틱 검증:
	// (1) schema AggregateRating / Review (review 속성 포함) → 즉시 통과.
	// (2) 본문: "실제" 사회적 증거 마커만 인정.
	//     - 평점 수치(별점 4.8, ★★★★, 평점 X/5)
	//     - 리뷰/후기 "건수"(리뷰 120개, 후기 35건)
    //     - 수상/인증/자격(N년 수상, ~인증, 자격증 보유)
	//   기존 룰처럼 '고객'/'감사'/'추천'/'만족' 단독 단어는 거의 모든 페이지에 있어 FP 였다.
	//   또한 "리뷰를 남겨주세요"/"후기 작성 이벤트" 같이 리뷰에 "관한" 안내문은 증거로 치지 않는다.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasSchemaProof = nodes.some((n) => {
		if (getAggregateRating(n) !== null) return true;
		if (isPresent(n.review)) return true;
		if (isPresent(n.aggregateRating)) return true;
		return false;
	});

	// 실제 증거 마커.
	// 평점 수치: '별점 4.8' / '평점 4.8' / '4.8/5' / '4.8점'(1~5 범위) / 별 이모지.
	const ratingValue =
		/별점\s*[1-5](?:\.\d)?|평점\s*[1-5](?:\.\d)?|[1-5]\.\d\s*\/\s*5|[1-5](?:\.\d)?\s*점(?!심|포|검|원|장|주|차)|★{2,5}|⭐{2,5}/;
	const reviewCount =
		/(?:리뷰|후기|평가|구매평)\s*\d+\s*(?:건|개|명|회)|\d+\s*(?:건|개|명)\s*(?:의\s*)?(?:리뷰|후기|평가)/;
	const awardCert =
		/수상|대상\s*수상|우수업체|인증\s*(?:업체|기관|마크)|공식\s*인증|자격증\s*(?:보유|취득)|\d+\s*년\s*연속|미슐랭|블루리본|맛집\s*선정|TV\s*출연|방송\s*출연/;

	// 리뷰에 "관한" 안내문(메타 텍스트) — 증거가 아님.
	const META_REVIEW_PATTERN =
		/리뷰를?\s*(?:남겨|작성|등록|써)|후기를?\s*(?:남겨|작성|등록|올려)|리뷰\s*이벤트|후기\s*이벤트|리뷰\s*작성\s*시|첫\s*리뷰/;

	const realMarkerRe = new RegExp(
		`${ratingValue.source}|${reviewCount.source}|${awardCert.source}`,
		"g",
	);
	let bodyMarker: string | null = null;
	for (const m of body.matchAll(realMarkerRe)) {
		const idx = m.index ?? 0;
		const start = Math.max(0, idx - 20);
		const end = Math.min(body.length, idx + m[0].length + 20);
		// 주변이 "리뷰 작성 안내" 맥락이면 건너뛴다.
		if (META_REVIEW_PATTERN.test(body.slice(start, end))) continue;
		if (hasExampleContextAround(body, idx)) continue;
		bodyMarker = m[0].trim();
		break;
	}

	const passed = hasSchemaProof || bodyMarker !== null;
	const found = hasSchemaProof ? "schema AggregateRating/Review" : bodyMarker;
	return {
		ruleId: "GEO-SOCIAL-PROOF-001",
		category: "geo",
		passed,
		severity: "low",
		title: "리뷰/평점/수상 정보 존재 여부",
		description: passed
			? `신뢰 증거("${found}")가 홈페이지에 있습니다.`
			: "구체적 신뢰 증거(평점 수치, 리뷰 건수, 수상·인증)가 없습니다. '고객 만족' 같은 일반 문구만으로는 AI 검색이 신뢰 증거로 인정하지 않습니다.",
		evidence: [
			`URL: ${page.url}`,
			`schema 평점/리뷰: ${hasSchemaProof ? "있음" : "없음"}`,
			`본문 증거 마커: ${bodyMarker ?? "없음"}`,
		],
		recommendation:
			"'네이버 평점 4.8 (리뷰 120개)', '2024 우수업체 수상'처럼 수치가 있는 신뢰 증거를 추가하세요. 진짜 고객 후기 2~3개와 평점만 있어도 신뢰도가 크게 올라갑니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// GEO-CONTACT-001: 명확한 연락 수단 (전화/이메일/주소)
// ---------------------------------------------------------------------------
export const geoContact001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const region = ctx.businessProfile.region ?? "";
	const ent = getEntities(ctx);
	const nodes = getSchemaNodes(page.schemaJsonLd);

	// (1) 구조화 신호: schema telephone (contactPoint.telephone 포함).
	const schemaTel = nodes
		.map((n) => getTelephone(n))
		.find((t): t is string => Boolean(t));

	// (3) 본문 신호: 예시 문맥 제외 + 지역코드 부합 전화만 인정.
	const realPhone =
		realPhones(page.bodyText, ent.phones).filter((p) =>
			areaCodeMatchesRegion(p.areaCode, region),
		).length > 0;
	const hasTelLink = hasContactLink(page, "tel");
	const hasMailtoLink = hasContactLink(page, "mailto");
	const hasPhone = Boolean(schemaTel) || realPhone || hasTelLink;

	// 이메일: 예시/문서용(example@test.com 등) 은 제외. mailto: 는 parser contactLinks 에서만 인정한다.
	const hasEmail = realEmails(page.bodyText).length > 0 || hasMailtoLink;

	// "문의 채널" 은 실제로 연락 가능한 수단일 때만 인정한다.
	// 단순 '문의'/'상담' 단어(특히 예시·안내문)는 신호로 치지 않고,
	// 카카오/메신저 외부 링크 또는 명시적 채널 키워드가 있어야 한다.
	const channelLinkPattern =
		/(pf\.kakao\.com|open\.kakao\.com|kakao\.com\/(?:ch|talk)|talk\.naver|line\.me|instagram\.com|facebook\.com|t\.me|wa\.me)/i;
	const hasChannelLink = page.externalLinks.some((l) =>
		channelLinkPattern.test(l),
	);
	// 실제 메신저/채널 수단을 가리키는 키워드. 단순 '문의'/'상담' 은 제외해
	// 예시·안내문만 있는 페이지가 통과하지 않도록 한다.
	const channelKeyword =
		/카카오\s*채널|카카오톡|카톡|채널 추가|플러스친구|네이버\s*톡톡|라인\s*추가|인스타\s*DM|텔레그램/;
	const hasContactKeyword = hasChannelLink || channelKeyword.test(page.bodyText);

	const contactCount = [hasPhone, hasEmail, hasContactKeyword].filter(
		Boolean,
	).length;
	const passed = contactCount >= 1;

	return {
		ruleId: "GEO-CONTACT-001",
		category: "geo",
		passed,
		severity: "high",
		title: "명확한 연락 수단 존재 여부",
		description: passed
			? `연락 수단 ${contactCount}개(전화: ${hasPhone ? "✓" : "✗"}, 이메일: ${hasEmail ? "✓" : "✗"}, 문의 안내: ${hasContactKeyword ? "✓" : "✗"})가 확인되었습니다.`
			: "전화번호, 이메일, 문의 링크 등 연락 수단이 없습니다. 방문자가 연락할 방법을 찾지 못해 이탈합니다.",
		evidence: [
			`전화번호: ${hasPhone ? "있음" : "없음"}`,
			`이메일: ${hasEmail ? "있음" : "없음"}`,
			`문의 키워드: ${hasContactKeyword ? "있음" : "없음"}`,
		],
		recommendation:
			"전화번호, 이메일, 또는 카카오채널 링크 중 최소 1개를 메인 페이지에 명확히 표시하세요. 헤더나 푸터에 항상 보이도록 배치하면 좋습니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// GEO-OPENING-HOURS-001: 영업 시간 정보 존재 (Phase M-A 신규)
// ---------------------------------------------------------------------------
export const geoOpeningHours001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;

	// ---------------------------------------------------------------------
	// Phase 1 시맨틱 검증:
	// (1) schema OpeningHoursSpecification / openingHours → 즉시 통과.
	// (2) 본문: 유효한 시간 범위(hasValidHoursRange) 또는 요일/휴무 명시.
	//     단, 예시(example) 맥락의 시간 표기는 제외한다.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const schemaHours = nodes.flatMap((n) => getOpeningHours(n));
	// getOpeningHours 는 string/string[] 형태만 추출한다. 객체형
	// openingHoursSpecification({dayOfWeek,opens,closes}) 도 구조화 신호로 인정한다.
	const hasSpecObject = nodes.some(
		(n) => isPresent(n.openingHoursSpecification) || isPresent(n.openingHours),
	);
	const hasSchemaHours = schemaHours.length > 0 || hasSpecObject;

	// 본문 시간 범위: 09:00-18:00 / 9시~21시 형태 (유효성 + start<end).
	const hasBodyRange = hasValidHoursRange(body);
	// 요일/휴무/영업·운영 키워드. 예시 맥락은 아래에서 제외.
	const dayPattern =
		/영업\s*시간|운영\s*시간|오픈\s*시간|월요일|화요일|수요일|목요일|금요일|토요일|일요일|평일|주말|연중무휴|휴무일?|매주\s*[월화수목금토일]|월\s*~\s*금/g;

	// 시간/요일 신호가 "예시" 맥락이 아닌 실제 표기인지 검사.
	let realHoursLabel: string | null = null;
	if (hasBodyRange || dayPattern.test(body)) {
		// 매치 위치 중 example 맥락이 아닌 것이 하나라도 있으면 실제 신호.
		dayPattern.lastIndex = 0;
		const candidates: { label: string; idx: number }[] = [];
		const rangeRe =
			/(\d{1,2})\s*[:시]\s*(\d{0,2})\s*[-~]\s*(\d{1,2})\s*[:시]\s*(\d{0,2})/g;
		for (const m of body.matchAll(rangeRe))
			candidates.push({ label: m[0].trim(), idx: m.index ?? 0 });
		for (const m of body.matchAll(dayPattern))
			candidates.push({ label: m[0].trim(), idx: m.index ?? 0 });
		for (const c of candidates) {
			if (!hasExampleContextAround(body, c.idx)) {
				realHoursLabel = c.label;
				break;
			}
		}
	}

	const passed = hasSchemaHours || realHoursLabel !== null;
	const found =
		schemaHours[0] ??
		(hasSpecObject ? "schema openingHoursSpecification" : realHoursLabel);
	return {
		ruleId: "GEO-OPENING-HOURS-001",
		category: "geo",
		passed,
		severity: "medium",
		title: "영업 시간 정보 존재 여부",
		description: passed
			? `영업 시간 정보("${found}")가 홈페이지에 있습니다. AI 검색에서 '몇 시까지 운영하나요?'에 답변할 수 있습니다.`
			: "영업 시간 정보가 없습니다(예시 표기 제외). 고객이 방문 전 영업 시간을 확인할 수 없어 헛걸음할 수 있습니다.",
		evidence: [
			`schema 영업시간: ${hasSchemaHours ? "있음" : "없음"}`,
			`본문 영업시간 표기: ${realHoursLabel ?? "없음"}`,
		],
		recommendation:
			"'영업시간: 오전 10시~오후 9시 (월~토), 일요일 휴무' 형태로 영업 시간을 명확히 안내하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// GEO-PHONE-001: 전화번호 본문 명시 (Phase M-A 신규)
// ---------------------------------------------------------------------------
export const geoPhone001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const region = ctx.businessProfile.region ?? "";
	const ent = getEntities(ctx);
	const nodes = getSchemaNodes(page.schemaJsonLd);

	// (1) 구조화 신호: schema telephone (contactPoint.telephone 포함).
	const schemaTel = nodes
		.map((n) => getTelephone(n))
		.find((t): t is string => Boolean(t));

	// (3) 본문 신호: 예시('(예시)'/'(example)') 문맥 제외 + 지역코드 부합.
	const phones = realPhones(page.bodyText, ent.phones);
	const trustedPhones = phones.filter((p) =>
		areaCodeMatchesRegion(p.areaCode, region),
	);

	const telLink = (page.contactLinks ?? []).find((link) => link.kind === "tel");
	const passed = Boolean(schemaTel) || trustedPhones.length > 0 || Boolean(telLink);
	const found =
		schemaTel ?? trustedPhones[0]?.raw ?? telLink?.value ?? phones[0]?.raw ?? null;
	return {
		ruleId: "GEO-PHONE-001",
		category: "geo",
		passed,
		severity: "high",
		title: "전화번호 본문 명시 여부",
		description: passed
			? `전화번호("${found}")가 홈페이지에 있습니다.`
			: "홈페이지에 (예시가 아닌) 전화번호가 없습니다. AI 검색에서 '전화번호 알려줘'라고 물었을 때 답할 수 없습니다.",
		evidence: [`전화번호 발견: ${found ?? "없음"}`],
		recommendation:
			"전화번호를 홈페이지 상단(헤더) 또는 하단(푸터)에 텍스트로 명시하세요. 이미지로만 표기하면 AI가 인식하지 못합니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// GEO-ADDRESS-001: 도로명 주소 본문 명시 (Phase M-A 신규)
// ---------------------------------------------------------------------------
export const geoAddress001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const region = ctx.businessProfile.region ?? "";
	const ent = getEntities(ctx);
	const nodes = getSchemaNodes(page.schemaJsonLd);

	// (1) 구조화 신호: schema PostalAddress (문자열 또는 PostalAddress 객체).
	const schemaAddr = nodes
		.map((n) => getPostalAddress(n))
		.find((a) => a !== null);
	const schemaAddrText =
		typeof schemaAddr === "string"
			? schemaAddr
			: schemaAddr
				? [
						schemaAddr.addressRegion,
						schemaAddr.addressLocality,
						schemaAddr.streetAddress,
					]
						.filter(Boolean)
						.join(" ")
				: "";

	// (3) 본문 신호: 예시('형식입니다'/example) 문맥 제외한 실제 주소.
	const addresses = realAddresses(page.bodyText, ent.addresses);
	// region 부합 우선: region 이 normalized/raw 에 경계 있는 지역 토큰으로 등장한 주소가 있으면 그것을 우선 채택.
	const regionMatched =
		region.length > 0
			? addresses.find(
					(a) =>
						hasBoundaryAwareMatch(a.normalized, region, {
							allowPlaceSuffixes: true,
						}) ||
						hasBoundaryAwareMatch(a.raw, region, { allowPlaceSuffixes: true }),
				)
			: undefined;
	const bestAddress = regionMatched ?? addresses[0];

	const passed = Boolean(schemaAddr) || addresses.length > 0;
	const found = schemaAddr ? schemaAddrText : (bestAddress?.raw ?? null);
	return {
		ruleId: "GEO-ADDRESS-001",
		category: "geo",
		passed,
		severity: "high",
		title: "도로명 주소 본문 명시 여부",
		description: passed
			? `주소("${found}")가 홈페이지에 있습니다. AI 검색에서 위치 질문에 답변할 수 있습니다.`
			: "도로명 주소가 홈페이지에 없습니다('형식입니다' 등 예시 표기는 제외). '어디에 있어요?'라는 질문에 AI 검색이 답변하지 못합니다.",
		evidence: [`주소 발견: ${found ?? "없음"}`],
		recommendation:
			"도로명 주소(예: 서울시 강남구 테헤란로 123)를 홈페이지 텍스트로 명시하세요. 지도 임베드만으로는 AI가 주소를 인식하지 못합니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// GEO-BRAND-MENTION-001: 업체명 본문 반복 등장 (3회 이상)
// ---------------------------------------------------------------------------
export const geoBrandMention001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const name = ctx.businessProfile.businessName;
	if (!name) {
		return {
			ruleId: "GEO-BRAND-MENTION-001",
			category: "geo",
			passed: false,
			severity: "low",
			title: "업체명 반복 등장 여부",
			description: "업체명이 입력되지 않아 분석할 수 없습니다.",
			evidence: ["businessProfile.businessName 없음"],
			recommendation: "진단 요청 시 업체명을 입력하세요.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "low",
			ruleWeight: 3,
		};
	}
	// ---------------------------------------------------------------------
	// Phase 1 시맨틱 검증: 단순 substring 카운트는 '떡' 이 '떡집'/'떡카페'/'떡볶이'
	// 안에서도 매치돼 과대 집계되는 FP 가 있었다. normalizeBusinessName 변형 +
	// "구분된 토큰(distinct token)" 경계 가드로 다른 합성어에 묻힌 매치를 제외한다.
	// ---------------------------------------------------------------------
	const bodyLower = page.bodyText.toLowerCase();
	const variants = normalizeBusinessName(name)
		.variants.map((v) => v.toLowerCase())
		.filter((v) => v.length > 0);

	const isWordChar = (ch: string | undefined): boolean =>
		ch !== undefined && /[가-힣A-Za-z0-9]/.test(ch);

	// 한국어 조사(은/는/이/가/을/를/에/의/도/만…)는 명사에 바로 붙는다.
	// 브랜드 뒤가 조사로 시작하는 한글이면 "브랜드+조사"로 보고 정상 등장으로 인정한다.
	// 반면 떡'집'/떡'카'페/떡'볶'이 처럼 명사를 만드는 음절이 뒤따르면 합성어로 보고 제외한다.
	// (조사 시작 음절의 닫힌 집합 — 합성어 오탐을 줄이면서 한국어 굴절을 허용)
	const JOSA_INITIALS = new Set([
		"은", "는", "이", "가", "을", "를", "에", "의", "도", "만", "과", "와",
		"로", "으", "랑", "께", "한", "부", "까", "보", "처", "마", "조", "밖",
		"입", "예", "였", "라", "고", "며", "지", "서",
	]);

	// 뒤따르는 char 가 브랜드를 "다른 단어로" 확장하면 true (= 같은 브랜드 등장 아님).
	const extendsToCompound = (after: string | undefined): boolean => {
		if (after === undefined) return false;
		// 영숫자가 바로 붙으면 합성/연속 토큰.
		if (/[A-Za-z0-9]/.test(after)) return true;
		// 한글이면: 조사 시작 음절은 허용(굴절), 그 외 한글은 합성 명사로 보고 제외.
		if (/[가-힣]/.test(after)) return !JOSA_INITIALS.has(after);
		return false;
	};

	const matchedPositions = new Set<number>();
	for (const variant of variants) {
		if (variant.length === 0) continue;
		let pos = bodyLower.indexOf(variant);
		while (pos !== -1) {
			const before = bodyLower[pos - 1];
			const after = bodyLower[pos + variant.length];
			// 앞은 단어문자가 아니어야(토큰 시작) 하고, 뒤는 합성어로 확장되지 않아야 한다.
			if (!isWordChar(before) && !extendsToCompound(after)) {
				matchedPositions.add(pos);
			}
			pos = bodyLower.indexOf(variant, pos + 1);
		}
	}
	const count = matchedPositions.size;
	const passed = count >= 3;
	return {
		ruleId: "GEO-BRAND-MENTION-001",
		category: "geo",
		passed,
		severity: "low",
		title: "업체명 반복 등장 여부 (3회 이상)",
		description: passed
			? `업체명 "${name}"이 본문에 ${count}회(구분된 등장) 나타나 브랜드 인지도가 강화됩니다.`
			: `업체명 "${name}"이 본문에 구분된 형태로 ${count}회밖에 등장하지 않습니다(합성어 내 매치 제외). AI 검색 엔진은 반복 등장하는 업체명을 더 잘 인식합니다.`,
		evidence: [`구분된 업체명 등장 횟수: ${count}회`],
		recommendation: `홈페이지 본문에서 "${name}"을 자연스럽게 3회 이상 언급하세요. 인사말, 서비스 설명, 마무리 문장 등에 포함하면 됩니다.`,
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// GEO-OG-IMAGE-001: OG 이미지 설정 여부 (Phase M-A 신규)
// ---------------------------------------------------------------------------
export const geoOgImage001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// Phase 4 시맨틱 마이그레이션:
	// 예전 로직은 bodyText.includes("og:image") 를 OR 신호로 써서, "og:image 태그를
	// 추가하세요" 같은 안내문/SEO 가이드 본문이 og:image 가 "설정된" 것으로 오탐했다.
	// 파서는 모든 <meta property> 를 키 소문자화하여 meta 맵에 수집하므로
	// meta["og:image"] 가 실제 설정 신호다. bodyText 분기를 제거하고 meta 만 신뢰한다.
	const ogImageValue = page.meta?.["og:image"];
	const hasOgImage = isPresent(ogImageValue);
	return {
		ruleId: "GEO-OG-IMAGE-001",
		category: "geo",
		passed: hasOgImage,
		severity: "medium",
		title: "OG 이미지(og:image) 설정 여부",
		description: hasOgImage
			? "OG 이미지가 설정되어 있습니다. SNS 공유 시 업체 이미지가 표시됩니다."
			: "OG 이미지(og:image)가 없습니다. SNS나 메신저로 공유할 때 이미지가 표시되지 않아 클릭률이 낮아집니다.",
		evidence: [`og:image 감지: ${hasOgImage ? "있음" : "없음"}`],
		recommendation:
			"홈페이지 <head>에 og:image 태그를 추가하고 업체를 잘 나타내는 대표 이미지(1200×630px 권장)를 설정하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// GEO-NAP-CONSISTENCY-001: NAP(이름/주소/전화) 일관성 (Phase M-A 신규)
// ---------------------------------------------------------------------------
export const geoNapConsistency001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const region = ctx.businessProfile.region ?? "";
	const ent = getEntities(ctx);
	const nodes = getSchemaNodes(page.schemaJsonLd);

	// --- Name: 프로필 업체명이 본문/스키마에 등장하는가 ---
	const nameVariants = ent.businessNameVariants;
	const schemaNames = nodes
		.map((n) => getName(n))
		.filter((n): n is string => Boolean(n));
	const schemaNameMatchesProfile = (schemaName: string): boolean =>
		nameVariants.some((variant) => hasBoundaryAwareMatch(schemaName, variant));
	const nameInBody =
		ctx.businessProfile.businessName.length > 0 &&
		hasBusinessNameMatch(page.bodyText, ctx.businessProfile.businessName);
	const nameInSchema =
		nameVariants.length > 0 && schemaNames.some(schemaNameMatchesProfile);
	const hasName = nameInBody || nameInSchema;

	// --- Phone: 예시 제외 실제 전화 + 지역코드 부합 ---
	const realPhoneList = realPhones(page.bodyText, ent.phones);
	const schemaTel = nodes
		.map((n) => getTelephone(n))
		.find((t): t is string => Boolean(t));
	const trustedPhones = realPhoneList.filter((p) =>
		areaCodeMatchesRegion(p.areaCode, region),
	);
	const hasPhone =
		Boolean(schemaTel) || trustedPhones.length > 0 || hasContactLink(page, "tel");
	// 지역코드가 region 과 어긋나는 전화만 있으면 일관성 위반.
	const phoneRegionConflict =
		!schemaTel &&
		realPhoneList.length > 0 &&
		trustedPhones.length === 0 &&
		region.length > 0;

	// --- Address: 예시 제외 실제 주소 (+ schema PostalAddress) ---
	const realAddrList = realAddresses(page.bodyText, ent.addresses);
	const schemaAddr = nodes
		.map((n) => getPostalAddress(n))
		.find((a) => a !== null);
	const hasAddress = Boolean(schemaAddr) || realAddrList.length > 0;

	// --- Mutual consistency: 스키마 업체명 vs 프로필 업체명 충돌 ---
	// 스키마에 name 이 있는데 프로필 업체명과 전혀 겹치지 않으면 footer-vs-body 회사명 충돌로 간주.
	const schemaNameConflict =
		nameVariants.length > 0 &&
		schemaNames.length > 0 &&
		!schemaNames.some(schemaNameMatchesProfile);

	const allPresent = hasName && hasPhone && hasAddress;
	const consistent = !phoneRegionConflict && !schemaNameConflict;
	const passed = allPresent && consistent;

	const conflictNote = !consistent
		? phoneRegionConflict && schemaNameConflict
			? " (지역번호·업체명 불일치 감지)"
			: phoneRegionConflict
				? ` (전화 지역번호가 '${region}' 지역과 불일치)`
				: ` (스키마 업체명 "${schemaNames[0]}"이 프로필 업체명과 불일치)`
		: "";

	return {
		ruleId: "GEO-NAP-CONSISTENCY-001",
		category: "geo",
		passed,
		severity: "medium",
		title: "NAP 정보 완전성 (업체명/주소/전화번호)",
		description: passed
			? `NAP(업체명: ${hasName ? "✓" : "✗"}, 주소: ${hasAddress ? "✓" : "✗"}, 전화: ${hasPhone ? "✓" : "✗"}) 3가지가 모두 일관되게 확인됩니다.`
			: `NAP 정보가 불완전하거나 불일치합니다(업체명: ${hasName ? "✓" : "✗"}, 주소: ${hasAddress ? "✓" : "✗"}, 전화: ${hasPhone ? "✓" : "✗"})${conflictNote}. AI 검색과 지도 서비스는 NAP 일관성으로 업체를 식별합니다.`,
		evidence: [
			`업체명: ${hasName ? "있음" : "없음"}`,
			`주소: ${hasAddress ? "있음" : "없음"}`,
			`전화번호: ${hasPhone ? "있음" : "없음"}`,
			`상호 일관성: ${consistent ? "일치" : "불일치"}`,
		],
		recommendation:
			"홈페이지 푸터에 업체명, 도로명 주소, 전화번호를 항상 동일한 형식으로 표시하세요. 네이버 플레이스, 구글 마이비즈니스와도 동일해야 합니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// GEO-LOCATION-SCHEMA-001: 위치 정보 구조화 데이터 (geo/address 속성)
// ---------------------------------------------------------------------------
export const geoLocationSchema001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const hasGeoAddress = getSchemaNodes(page.schemaJsonLd).some(
		(node) =>
			isPresent(getPostalAddress(node)) ||
			isPresent(node.geo) ||
			isPresent(node.hasMap),
	);
	return {
		ruleId: "GEO-LOCATION-SCHEMA-001",
		category: "geo",
		passed: hasGeoAddress,
		severity: "medium",
		title: "위치 정보 구조화 데이터(address/geo) 적용 여부",
		description: hasGeoAddress
			? "위치 정보(address 또는 geo)가 포함된 구조화 데이터가 있습니다. AI 검색과 지도 서비스에서 위치를 정확히 파악합니다."
			: "구조화 데이터에 주소(address) 또는 좌표(geo) 정보가 없습니다. AI 검색에서 '어디에 있어요?'라는 질문에 답변하기 어렵습니다.",
		evidence: [
			`address/geo Schema: ${hasGeoAddress ? "있음" : "없음"}`,
			`JSON-LD 수: ${page.schemaJsonLd.length}개`,
		],
		recommendation:
			"LocalBusiness JSON-LD에 address(PostalAddress 타입)와 geo(GeoCoordinates) 속성을 추가하세요. X-SAG 스니펫 생성 기능으로 자동 생성할 수 있습니다.",
		actionType: "snippet_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// GEO-MULTIPLE-LANG-001: 다국어 지원 여부 (외국어 콘텐츠)
// ---------------------------------------------------------------------------
export const geoMultipleLang001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 4 시맨틱 마이그레이션:
	// 예전 로직은 [a-zA-Z]{4,} 영단어를 5개 이상 세면 "영어 콘텐츠 있음" 으로 봤다.
	// 차용어(menu/premium/signature)·브랜드명·URL 조각이 섞인 한국어 본문이
	// 다국어로 오탐됐다. 이제 파서가 노출하는 구조화 신호(linkTags 의 rel=alternate
	// hreflang + html lang)를 1차 신호로 쓴다. 우연한 외국어 몇 단어로는 통과시키지 않는다.
	//
	// 다국어 판정:
	//   (1) rel 에 "alternate" 가 포함되고 hreflang 이 있는 <link> 의 distinct hreflang 값
	//       (x-default 제외) 가 2개 이상 → 명백한 다국어 버전 선언.
	//   (2) distinct hreflang 1개라도, 그것이 html lang 과 다른 언어를 가리키면 → 다국어
	//       (현재 페이지 언어 + 별도 언어 버전 = 최소 2개 언어 운영).
	// ---------------------------------------------------------------------
	const linkTags = page.linkTags ?? [];
	const htmlLang = (page.htmlLang ?? "").trim().toLowerCase();
	const htmlLangPrimary = htmlLang.split("-")[0] ?? "";

	const hreflangValues = new Set<string>();
	for (const lt of linkTags) {
		if (!lt.rel || !lt.rel.includes("alternate")) continue;
		const hl = (lt.hreflang ?? "").trim().toLowerCase();
		if (hl.length === 0) continue;
		if (hl === "x-default") continue; // 라우팅용 표식 — 언어 카운트에서 제외
		hreflangValues.add(hl.split("-")[0] ?? hl);
	}

	const distinctHreflang = hreflangValues.size;
	// 현재 페이지 언어와 다른 언어를 가리키는 alternate 가 하나라도 있으면 다국어.
	const declaresOtherLang =
		distinctHreflang >= 2 ||
		(distinctHreflang >= 1 &&
			(htmlLangPrimary.length === 0 ||
				!hreflangValues.has(htmlLangPrimary)));
	const isMultilingual = declaresOtherLang;

	// 다국어가 전혀 없어도 한국어 단일 서비스면 passed (외국인 대상 아닌 경우)
	// 단, 관광지/호텔/레스토랑 업종에서 다국어 없으면 개선 권고
	const touristIndustry =
		/호텔|펜션|게스트하우스|민박|레스토랑|관광|여행|숙박/.test(
			ctx.businessProfile.industry ?? "",
		);
	const passed = !touristIndustry || isMultilingual;

	return {
		ruleId: "GEO-MULTIPLE-LANG-001",
		category: "geo",
		passed,
		severity: "low",
		title: "다국어 콘텐츠 지원 여부",
		description: passed
			? isMultilingual
				? `다국어 버전이 hreflang 으로 선언되어 있습니다(언어 ${distinctHreflang + (htmlLangPrimary.length > 0 ? 1 : 0)}종 추정). AI 검색이 외국어 사용자에게도 노출합니다.`
				: "단일 언어(한국어) 서비스로 다국어 지원이 필요하지 않습니다."
			: "관광/숙박 업종이지만 다국어 버전(hreflang)이 선언돼 있지 않습니다. 외국인 고객을 위한 영문 페이지와 rel=\"alternate\" hreflang 링크를 추가하면 AI 검색 노출이 넓어집니다.",
		evidence: [
			`업종: ${ctx.businessProfile.industry ?? "미입력"}`,
			`html lang: ${htmlLang.length > 0 ? htmlLang : "미설정"}`,
			`alternate hreflang 언어 수(x-default 제외): ${distinctHreflang}개`,
		],
		recommendation:
			'외국인 고객을 대상으로 한다면 언어별 페이지를 만들고 <head> 에 <link rel="alternate" hreflang="en" href="..."> 처럼 다국어 버전을 선언하세요. 영문 페이지 하나만 추가해도 글로벌 검색 노출이 늘어납니다.',
		actionType: "self_fix",
		difficulty: "medium",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ===========================================================================
// Phase O-D 신규 GEO 룰 (+8개) — 룰 깊이 보강
// ===========================================================================

// ---------------------------------------------------------------------------
// GEO-BRAND-IN-TITLE-001: title에 brand name 포함
// ---------------------------------------------------------------------------
export const geoBrandInTitle001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const name = ctx.businessProfile.businessName;
	if (!name) {
		return {
			ruleId: "GEO-BRAND-IN-TITLE-001",
			category: "geo",
			passed: false,
			severity: "high",
			title: "Title 태그 내 브랜드명 포함 여부",
			description: "업체명이 입력되지 않아 분석할 수 없습니다.",
			evidence: ["businessProfile.businessName 없음"],
			recommendation: "진단 요청 시 업체명을 입력하세요.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "high",
			ruleWeight: 10,
		};
	}
	const passed = hasBusinessNameMatch(page.title ?? "", name);
	return {
		ruleId: "GEO-BRAND-IN-TITLE-001",
		category: "geo",
		passed,
		severity: "high",
		title: "Title 태그 내 브랜드명 포함 여부",
		description: passed
			? `브랜드명 "${name}"이 title에 포함되어 있습니다.`
			: `브랜드명 "${name}"이 title("${page.title ?? "없음"}")에 없습니다. AI 검색에서 브랜드 인식이 약해집니다.`,
		evidence: [`브랜드명: ${name}`, `현재 title: ${page.title ?? "없음"}`],
		recommendation: `title에 "${name}"을 반드시 포함시키세요. 예: '${name} | ${ctx.businessProfile.industry || "서비스"}' 또는 '${ctx.businessProfile.region || "지역"} ${ctx.businessProfile.industry || "업종"} - ${name}'.`,
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// GEO-BRAND-IN-H1-001: H1에 brand name 포함
// ---------------------------------------------------------------------------
export const geoBrandInH1001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const name = ctx.businessProfile.businessName;
	if (!name) {
		return {
			ruleId: "GEO-BRAND-IN-H1-001",
			category: "geo",
			passed: false,
			severity: "high",
			title: "H1 태그 내 브랜드명 포함 여부",
			description: "업체명이 입력되지 않아 분석할 수 없습니다.",
			evidence: ["businessProfile.businessName 없음"],
			recommendation: "진단 요청 시 업체명을 입력하세요.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "high",
			ruleWeight: 10,
		};
	}
	const passed = hasBusinessNameMatch(page.h1 ?? "", name);
	return {
		ruleId: "GEO-BRAND-IN-H1-001",
		category: "geo",
		passed,
		severity: "high",
		title: "H1 태그 내 브랜드명 포함 여부",
		description: passed
			? `브랜드명 "${name}"이 H1 제목에 포함되어 있습니다.`
			: `브랜드명 "${name}"이 H1("${page.h1 ?? "없음"}")에 없습니다. 검색 엔진의 브랜드 인식이 약해집니다.`,
		evidence: [`브랜드명: ${name}`, `현재 H1: ${page.h1 ?? "없음"}`],
		recommendation: `H1에 "${name}"을 자연스럽게 포함시키세요. 예: '${name} - ${ctx.businessProfile.region || "지역"} ${ctx.businessProfile.industry || "서비스"}'.`,
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// GEO-BRAND-CONSISTENCY-001: 메타·H1·본문에서 brand 표기 일관성
// ---------------------------------------------------------------------------
export const geoBrandConsistency001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const name = ctx.businessProfile.businessName;
	if (!name) {
		return {
			ruleId: "GEO-BRAND-CONSISTENCY-001",
			category: "geo",
			passed: false,
			severity: "medium",
			title: "브랜드명 표기 일관성 (title/H1/본문)",
			description: "업체명이 입력되지 않아 분석할 수 없습니다.",
			evidence: ["businessProfile.businessName 없음"],
			recommendation: "진단 요청 시 업체명을 입력하세요.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "medium",
			ruleWeight: 6,
		};
	}
	const inTitle = hasBusinessNameMatch(page.title ?? "", name);
	const inH1 = hasBusinessNameMatch(page.h1 ?? "", name);
	const inDesc = hasBusinessNameMatch(page.description ?? "", name);
	const inBody = hasBusinessNameMatch(page.bodyText, name);
	// 3개 이상에 일관되게 등장해야 통과
	const count = [inTitle, inH1, inDesc, inBody].filter(Boolean).length;
	const passed = count >= 3;
	return {
		ruleId: "GEO-BRAND-CONSISTENCY-001",
		category: "geo",
		passed,
		severity: "medium",
		title: "브랜드명 표기 일관성 (title/H1/description/본문)",
		description: passed
			? `브랜드명 "${name}"이 ${count}/4개 위치(title/H1/description/body)에 일관되게 등장합니다.`
			: `브랜드명 "${name}"이 ${count}/4개 위치에만 등장합니다(title: ${inTitle ? "✓" : "✗"}, H1: ${inH1 ? "✓" : "✗"}, description: ${inDesc ? "✓" : "✗"}, body: ${inBody ? "✓" : "✗"}). AI 검색이 브랜드 식별을 혼동할 수 있습니다.`,
		evidence: [
			`title: ${inTitle ? "있음" : "없음"}`,
			`H1: ${inH1 ? "있음" : "없음"}`,
			`description: ${inDesc ? "있음" : "없음"}`,
			`body: ${inBody ? "있음" : "없음"}`,
		],
		recommendation: `브랜드명 "${name}"의 표기를 title, H1, meta description, 본문에 모두 동일한 형식으로 사용하세요. 줄임말이나 영문/한글 혼용을 피합니다.`,
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// GEO-MAP-EMBED-001: 네이버맵/구글맵 iframe 또는 링크 존재
// ---------------------------------------------------------------------------
export const geoMapEmbed001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 2 시맨틱 검증:
	// 예전 룰은 bodyText 의 '네이버 지도'/'구글 지도' 단순 언급만으로 통과시켜,
	// 가이드/FAQ 에서 지도 사용법을 "설명"하는 페이지가 실제 임베드 없이 FP 였다.
	// 실제 신호 = (1) internal/external 링크의 지도 URL(iframe src 포함)
	//            (2) schema hasMap. bodyText 키워드는 더 이상 통과 근거가 아니다.
	// ---------------------------------------------------------------------
	const mapPatterns = [
		"map.naver.com",
		"naver.me",
		"google.com/maps",
		"maps.google",
		"maps.app.goo.gl",
		"kakao.com/map",
		"kakaomap",
		"map.kakao.com",
	];
	const allLinks = [...page.internalLinks, ...page.externalLinks].map((l) =>
		l.toLowerCase(),
	);
	const hasMapLink = allLinks.some((l) =>
		mapPatterns.some((p) => l.includes(p)),
	);

	// schema hasMap (string URL 또는 Map 객체 url) → 실제 지도 신호.
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasSchemaMap = nodes.some((n) => {
		const hm = n.hasMap;
		if (typeof hm === "string") return hm.trim().length > 0;
		if (isPresent(hm)) return true;
		return false;
	});

	const passed = hasMapLink || hasSchemaMap;
	return {
		ruleId: "GEO-MAP-EMBED-001",
		category: "geo",
		passed,
		severity: "low",
		title: "지도 임베드/링크 존재 여부",
		description: passed
			? "네이버맵/구글맵 등 실제 지도 링크/임베드 또는 schema hasMap 이 확인됩니다."
			: "실제 지도 임베드(iframe)·링크나 schema hasMap 이 없습니다(본문 '지도' 언급만으로는 인정하지 않습니다). 방문자가 위치를 직관적으로 파악하기 어렵습니다.",
		evidence: [
			`지도 링크(내부/외부): ${hasMapLink ? "있음" : "없음"}`,
			`schema hasMap: ${hasSchemaMap ? "있음" : "없음"}`,
		],
		recommendation:
			"네이버 지도 또는 카카오맵 임베드(iframe)를 '오시는 길' 섹션에 추가하거나, 지도 페이지 링크를 제공하세요.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// GEO-DIRECTIONS-INFO-001: "찾아오시는 길" 또는 교통 안내
// ---------------------------------------------------------------------------
export const geoDirectionsInfo001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;
	// ---------------------------------------------------------------------
	// Phase 2 시맨틱 검증:
	// 예전 룰은 '주차'/'교통' substring 만으로 통과시켜 '주차 걱정 없습니다'(부정),
	// '교통 불편'(불만) 같은 맥락을 길찾기 안내로 오인하는 FP 가 있었다.
	// extractSentencesAround 로 키워드 주변 문장을 보고 부정/불만 문맥이면 제외한다.
	// ---------------------------------------------------------------------
	// 명확한 길찾기 신호(부정 맥락이 거의 없음) — 등장만으로 인정.
	const strongPattern =
		/찾아오시는 길|오시는 길|교통편|교통 안내|지하철|버스|역에서|출구|도보\s*\d+분|차로\s*\d+분/;
	// 약한/모호 신호 — 부정·불만 맥락이면 제외해야 하는 키워드.
	const weakPattern = /주차|교통|오시는길/g;
	// 부정/없음/불만/비교 문맥 (주변 문장에 있으면 안내가 아님).
	const NEGATION_PATTERN =
		/없(?:다|습니다|어요|음|는|이|을)|불편|어렵|힘들|문제|불만|혼잡|복잡|부족|곤란|아쉽/;

	const hasStrong = strongPattern.test(body);
	const strongFound = body.match(strongPattern)?.[0] ?? null;

	// 약한 키워드: 주변 문장(±40자) 중 부정 문맥이 아닌 등장이 하나라도 있으면 인정.
	let weakLabel: string | null = null;
	if (weakPattern.test(body)) {
		weakPattern.lastIndex = 0;
		for (const m of body.matchAll(weakPattern)) {
			const around = extractSentencesAround(body, m[0], 40).join(" ");
			if (!NEGATION_PATTERN.test(around)) {
				weakLabel = m[0];
				break;
			}
		}
	}

	const passed = hasStrong || weakLabel !== null;
	const found = strongFound ?? weakLabel;
	return {
		ruleId: "GEO-DIRECTIONS-INFO-001",
		category: "geo",
		passed,
		severity: "low",
		title: "교통/길찾기 안내 정보 여부",
		description: passed
			? `교통/길찾기 정보("${found}")가 확인됩니다.`
			: "'찾아오시는 길' 또는 지하철·버스 등 교통 안내가 없습니다(부정·불만 문맥의 '주차'/'교통' 언급은 제외). 위치 기반 검색에 불리합니다.",
		evidence: [`교통/길찾기 표현: ${found ?? "없음"}`],
		recommendation:
			"'찾아오시는 길' 섹션에 지하철역 출구 번호, 도보 거리, 주차 가능 여부를 추가하세요. 예: '강남역 3번 출구 도보 5분, 주차 가능'.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// GEO-BUSINESS-HOURS-DETAIL-001: 요일별 운영시간 (단순 "09-18"만 아닌)
// ---------------------------------------------------------------------------
// hasValidHoursRange 는 파일 상단(Phase 1 헬퍼)에 정의되어 있다.
export const geoBusinessHoursDetail001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// 요일별 표기: 월~금, 평일/주말 구분, 토/일 표기
	const detailPattern =
		/월요일|화요일|수요일|목요일|금요일|토요일|일요일|월\s*~|평일|주말|토.?일|월화수|매주\s*[월화수목금토일]/;
	const hasDetail = detailPattern.test(page.bodyText);
	// 단순 시간 표기는 "유효한" 시간 범위만 인정한다 (09:00-25:00 같은 불가능한 시간은 hours 로 치지 않음).
	const hasAnyHours = hasValidHoursRange(page.bodyText) || hasDetail;
	// 시간 정보가 전혀 없으면 GEO-OPENING-HOURS-001의 책임이므로 점수 중립(unavailable).
	// 시간 정보는 있는데 detail 없으면 fail.
	const passed = hasAnyHours && hasDetail;
	const scoreImpact: RuleResult["scoreImpact"] = hasAnyHours
		? "scored"
		: "unavailable";
	return {
		ruleId: "GEO-BUSINESS-HOURS-DETAIL-001",
		category: "geo",
		passed,
		severity: "medium",
		title: "요일별 운영시간 상세 표기 여부",
		description: passed
			? "요일별 또는 평일/주말 구분이 포함된 영업시간 표기가 있습니다."
			: hasAnyHours
				? "단순 '시간 범위' 표기만 있고 요일별 구분이 없습니다. 평일/주말 영업시간이 다를 수 있어 고객이 혼동합니다."
				: "영업시간 정보가 없습니다(GEO-OPENING-HOURS-001 참조).",
		evidence: [
			`시간 표기: ${hasAnyHours ? "있음" : "없음"}`,
			`요일별 구분: ${hasDetail ? "있음" : "없음"}`,
		],
		scoreImpact,
		recommendation:
			"'평일 10:00~21:00, 토요일 10:00~18:00, 일요일 휴무' 같이 요일별로 영업시간을 명시하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// GEO-PHONE-FORMAT-001: 전화번호 클릭 가능 (tel: 링크)
// ---------------------------------------------------------------------------
export const geoPhoneFormat001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 4 시맨틱 강화:
	// 예전 로직은 /\d{2,4}-\d{3,4}-\d{4}/.test(bodyText) 로 전화번호 존재를 판정해,
	// "예시) 010-0000-0000" 같은 placeholder 번호도 "전화번호 있음" 으로 보고 tel 단서가
	// 없으면 실패시켰다(안내문 오탐). 이제 nap-extractor 의 extractPhones 로 후보를
	// 추출하고 realPhones 로 예시(example) 문맥 번호를 제외한 "실측" 번호만 평가한다.
	// tel: 링크는 parser contactLinks 에서만 인정한다.
	// ---------------------------------------------------------------------
	const realPhoneList = realPhones(page.bodyText, extractPhones(page.bodyText));
	const hasTelLink = hasContactLink(page, "tel");
	const hasPhone = realPhoneList.length > 0 || hasTelLink;
	const passed = !hasPhone || hasTelLink;
	const scoreImpact: RuleResult["scoreImpact"] = hasPhone
		? "scored"
		: "unavailable";
	return {
		ruleId: "GEO-PHONE-FORMAT-001",
		category: "geo",
		passed,
		severity: "low",
		title: "전화번호 클릭 가능 링크(tel:) 여부",
		description: passed
			? hasPhone
				? "전화번호와 함께 tel: 링크가 확인됩니다."
				: "전화번호 정보가 없습니다(GEO-PHONE-001 참조)."
			: "전화번호는 있지만 tel: 링크가 없습니다. 모바일에서 한 번에 전화하기 어렵습니다.",
		evidence: [
			`전화번호: ${hasPhone ? "있음" : "없음"}`,
			`tel 링크: ${hasTelLink ? "있음" : "없음"}`,
		],
		scoreImpact,
		recommendation:
			"전화번호 텍스트를 a href=tel:01012345678 링크로 감싸세요. 스마트폰 사용자가 번호를 탭만 해도 바로 전화가 걸립니다.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// GEO-REVIEW-AGGREGATE-001: AggregateRating schema 또는 평점 본문 표시
// ---------------------------------------------------------------------------
export const geoReviewAggregate001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;
	// ---------------------------------------------------------------------
	// Phase 2 시맨틱 검증:
	// (1) schema AggregateRating / Review → 즉시 통과 (getAggregateRating + review 속성).
	// (2) 본문 평점/리뷰 마커는 부정/비교/척도(범위) 문맥이면 제외한다.
	//     예전 정규식은 '후기 2개입니다'(결손 안내), '별점 1~5 범위'(척도 설명) 같은
	//     평점이 "아닌" 텍스트를 평점 표기로 카운트하는 FP 가 있었다.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasAggregateRating = nodes.some((n) => {
		if (getAggregateRating(n) !== null) return true;
		if (isPresent(n.aggregateRating)) return true;
		if (isPresent(n.review)) return true;
		return false;
	});

	// 본문 평점 표기: "별점 4.8", "★★★★★", "4.5/5점", "평점 4.8", "리뷰 100건"
	const ratingPattern =
		/별점\s*[1-5](?:\.\d)?|★{1,5}|⭐{1,5}|[1-5]\.\d\s*\/\s*5|평점\s*[1-5](?:\.\d)?|리뷰\s*\d+\s*(?:건|개|명)|후기\s*\d+\s*(?:건|개|명)/g;
	// 부정/비교/척도(범위) 문맥 — 실제 평점 증거가 아님.
	const NEGATIVE_CONTEXT =
		/없(?:다|습니다|어요|음|는|이)|낮(?:다|습니다|아|은)|부족|비교|다른|범위|아직|척도|기준으로|매겨|부탁/;

	let hasBodyRating = false;
	if (ratingPattern.test(body)) {
		ratingPattern.lastIndex = 0;
		for (const m of body.matchAll(ratingPattern)) {
			const idx = m.index ?? 0;
			const start = Math.max(0, idx - 30);
			const end = Math.min(body.length, idx + m[0].length + 30);
			const around = body.slice(start, end);
			if (NEGATIVE_CONTEXT.test(around)) continue;
			if (hasExampleContextAround(body, idx)) continue;
			hasBodyRating = true;
			break;
		}
	}

	const passed = hasAggregateRating || hasBodyRating;
	return {
		ruleId: "GEO-REVIEW-AGGREGATE-001",
		category: "geo",
		passed,
		severity: "medium",
		title: "리뷰 평점/AggregateRating 표시 여부",
		description: passed
			? "리뷰 평점(schema 또는 본문 표기)이 확인됩니다. AI 검색 결과에 신뢰도 정보로 활용됩니다."
			: "리뷰 평점이나 AggregateRating schema가 없습니다(결손·비교·척도 안내 문맥은 평점 증거로 인정하지 않습니다). AI 검색은 평점 데이터를 신뢰도 판단에 활용합니다.",
		evidence: [
			`AggregateRating schema: ${hasAggregateRating ? "있음" : "없음"}`,
			`본문 평점 표기: ${hasBodyRating ? "있음" : "없음"}`,
		],
		recommendation:
			"네이버 플레이스/구글 리뷰 평점을 본문에 텍스트로 표시하거나, AggregateRating JSON-LD를 추가하세요. 예: '네이버 평점 4.8점 (리뷰 120개)'.",
		actionType: "snippet_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};
