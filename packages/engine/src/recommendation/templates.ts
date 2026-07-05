/**
 * X-SAG Core Engine — 동적 추천 템플릿 카탈로그 (Phase P-C)
 *
 * 기존 룰 카탈로그(`analyzers/rules/*`)의 정적 `recommendation` 텍스트를 변경하지 않고,
 * 별도 컨텍스트 치환 가능한 템플릿을 제공한다. RecommendationEngine 이 옵션에 따라
 * 이 템플릿을 보조 입력으로 사용할 수 있다.
 *
 * 정책:
 *  - 기존 룰 텍스트를 절대 수정하지 않는다. 이 파일은 추가 전용.
 *  - 모든 변수는 `{{path}}` 형식. 누락 시 안전한 폴백을 가진다.
 *  - 가장 영향 큰 30~50개 룰 우선 커버 (SEO/GEO/AEO 핵심).
 */

import type { BusinessContext } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecommendationTemplate {
	ruleId: string;
	/** 기존 정적 텍스트 (룰 카탈로그와 동일 의미, 폴백용) */
	baseText: string;
	/** 컨텍스트 치환 가능한 템플릿 — {{businessName}} {{industry}} {{region}} 등 */
	contextualTemplate: string;
	/** LLM 호출 전 후보 표현들 */
	variations: string[];
	/** 톤 */
	tone: "friendly" | "professional" | "urgent";
}

export interface ApplyContextOptions {
	/** 변수 미존재 시 어떻게 처리할지. */
	onMissing?: "keep" | "blank" | "fallback";
	/** fallback 사용 시 대체 문자열. */
	fallbackText?: string;
}

// ---------------------------------------------------------------------------
// applyContext — {{path}} 치환 엔진
// ---------------------------------------------------------------------------

/**
 * 템플릿 문자열의 `{{key.path}}` 토큰을 BusinessContext 기반으로 치환한다.
 *
 * 지원 토큰:
 *  - `{{businessName}}`, `{{industry}}`, `{{region}}`
 *  - `{{mainServices.0}}`, `{{mainServices.1}}`, `{{mainServices.2}}`
 *  - `{{targetKeywords.0}}`, `{{targetKeywords.1}}` (옵션 컨텍스트)
 *
 * 미존재 토큰은 옵션에 따라 keep / blank / fallback 으로 처리된다.
 *
 * @example
 *   applyContext("{{businessName}}는 {{region}}에 있습니다.", ctx)
 *   // → "테스트카페는 서울 강남에 있습니다."
 */
export function applyContext(
	template: string,
	ctx: BusinessContext & { targetKeywords?: string[] },
	opts: ApplyContextOptions = {},
): string {
	const onMissing = opts.onMissing ?? "blank";
	const fallback = opts.fallbackText ?? "";

	return template.replace(/\{\{([^}]+)\}\}/g, (_match, raw: string) => {
		const path = raw.trim();
		const value = resolvePath(ctx, path);
		if (value === undefined || value === null || value === "") {
			if (onMissing === "keep") return `{{${path}}}`;
			if (onMissing === "fallback") return fallback;
			return ""; // blank
		}
		return String(value);
	});
}

function resolvePath(
	ctx: BusinessContext & { targetKeywords?: string[] },
	path: string,
): string | number | undefined {
	// path: businessName | industry | region | mainServices.0 | targetKeywords.1
	const parts = path.split(".");
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let cursor: any = ctx;
	for (const part of parts) {
		if (cursor === undefined || cursor === null) return undefined;
		// 배열 인덱스 접근 처리
		if (/^\d+$/.test(part)) {
			if (!Array.isArray(cursor)) return undefined;
			cursor = cursor[Number(part)];
		} else {
			cursor = cursor[part];
		}
	}
	if (cursor === undefined || cursor === null) return undefined;
	if (typeof cursor === "string" || typeof cursor === "number") return cursor;
	return undefined;
}

// ---------------------------------------------------------------------------
// Template catalog
// ---------------------------------------------------------------------------

/**
 * 가장 영향 큰 룰을 우선 등록. 30개 이상.
 *
 * 정책: 룰 카탈로그(`seo-rules.ts` 등)의 텍스트와 의미가 동일하되,
 *       업종/지역/매장명 맥락이 자연스럽게 녹아 들어간 한국어로 작성.
 */
const TEMPLATES: RecommendationTemplate[] = [
	// -------------------------------------------------------------------------
	// SEO — TITLE / META
	// -------------------------------------------------------------------------
	{
		ruleId: "SEO-TITLE-001",
		baseText:
			"홈페이지 제작 업체에 '<title>업체명 | 핵심 서비스</title>' 형식으로 title 태그를 추가해달라고 요청하세요.",
		contextualTemplate:
			"{{businessName}}처럼 업체명이 검색 결과 첫 줄에 보이도록, 홈페이지 담당자에게 '<title>{{businessName}} | {{mainServices.0}}</title>' 형식으로 제목 태그를 추가해 달라고 요청해 보세요. {{region}} 지역에서 검색 노출이 좋아집니다.",
		variations: [
			"{{businessName}}의 홈페이지 제목(title) 태그를 '{{businessName}} | {{mainServices.0}}' 형식으로 설정하세요.",
			"검색 결과에 {{businessName}} 이름이 정확히 보이도록 title 태그를 보완해 주세요.",
		],
		tone: "friendly",
	},
	{
		ruleId: "SEO-TITLE-002",
		baseText:
			"제목은 10~60자가 적당합니다. 예: '강남 가죽공방 클래스 | 르쿠르'처럼 업체명과 핵심 서비스를 포함하세요.",
		contextualTemplate:
			"제목은 10~60자가 가장 적당합니다. 예를 들어 '{{region}} {{industry}} | {{businessName}}'처럼 지역, 업종, 매장명을 함께 담아 보세요.",
		variations: [
			"'{{businessName}} {{mainServices.0}} | {{region}}' 처럼 30~50자 사이로 제목을 다듬어 보세요.",
		],
		tone: "friendly",
	},
	{
		ruleId: "SEO-META-001",
		baseText:
			"홈페이지 제작 업체에 meta name description 태그를 추가해달라고 요청하세요.",
		contextualTemplate:
			"검색 결과 미리보기를 직접 정해 두려면, {{businessName}}의 핵심 소개를 80~150자로 작성해 meta description 태그에 넣어 달라고 요청하세요. 예: '{{region}}에서 {{mainServices.0}}을(를) 제공하는 {{businessName}}입니다.'",
		variations: [
			"{{businessName}} 소개 한 단락(약 100자)을 meta description으로 추가해 보세요.",
		],
		tone: "friendly",
	},
	{
		ruleId: "SEO-META-002",
		baseText:
			"메타 설명은 50~160자가 적당합니다. 업체 위치와 핵심 서비스를 포함하세요.",
		contextualTemplate:
			"메타 설명은 50~160자가 적당합니다. '{{region}} {{businessName}}, {{mainServices.0}} 전문' 처럼 위치와 대표 서비스를 함께 적어 주세요.",
		variations: [
			"{{businessName}}의 위치와 주요 서비스가 한눈에 들어오도록 100자 내외로 정리해 보세요.",
		],
		tone: "friendly",
	},

	// -------------------------------------------------------------------------
	// SEO — HEADING / STRUCTURE
	// -------------------------------------------------------------------------
	{
		ruleId: "SEO-H1-001",
		baseText: "페이지 상단에 H1 제목 태그를 1개 추가하세요.",
		contextualTemplate:
			"페이지 상단에 '{{businessName}}'을(를) 포함한 H1 제목 태그를 한 개만 두세요. 예: '<h1>{{region}} {{industry}} {{businessName}}</h1>'.",
		variations: [
			"{{businessName}}이(가) 가장 큰 제목(H1)으로 보이도록 정리해 주세요.",
		],
		tone: "friendly",
	},
	{
		ruleId: "SEO-OG-001",
		baseText:
			"Open Graph 메타 태그(og:title, og:description, og:image)를 추가하세요.",
		contextualTemplate:
			"{{businessName}}이(가) SNS에서 공유될 때 멋지게 보이도록 og:title, og:description, og:image 메타 태그를 추가해 주세요. og:image는 매장 대표 사진 1장이 적당합니다.",
		variations: [
			"카카오톡/페이스북 공유 시 {{businessName}} 정보가 깔끔히 보이도록 OG 태그를 보강하세요.",
		],
		tone: "friendly",
	},
	{
		ruleId: "SEO-IMG-ALT-001",
		baseText:
			"이미지에 alt 속성을 추가해 시각장애인과 검색엔진이 이해하도록 하세요.",
		contextualTemplate:
			"{{businessName}} 홈페이지의 이미지에 alt 속성을 채워 주세요. 예: alt='{{region}} {{businessName}} {{mainServices.0}} 사진'. 검색엔진과 스크린리더가 이미지 내용을 이해할 수 있습니다.",
		variations: [
			"대표 이미지의 alt 텍스트에 {{businessName}}, {{region}}, {{mainServices.0}}을(를) 자연스럽게 넣어 보세요.",
		],
		tone: "friendly",
	},
	{
		ruleId: "SEO-CANONICAL-001",
		baseText: "rel='canonical' 링크 태그로 정식 URL을 알려 주세요.",
		contextualTemplate:
			"{{businessName}} 홈페이지의 정식 주소를 검색엔진에 알리려면 <link rel='canonical' href='...'> 태그를 추가하세요. 중복 페이지 문제를 예방할 수 있습니다.",
		variations: ["대표 페이지에 canonical 링크 태그를 한 줄 추가해 주세요."],
		tone: "professional",
	},
	{
		ruleId: "SEO-ROBOTS-001",
		baseText: "robots.txt 파일을 도메인 루트에 추가하세요.",
		contextualTemplate:
			"{{businessName}} 도메인 루트(`/robots.txt`)에 robots.txt 파일을 두어 검색엔진이 어느 페이지를 읽어도 되는지 안내하세요.",
		variations: ["robots.txt 한 줄짜리 기본 파일이라도 우선 올려 두세요."],
		tone: "professional",
	},
	{
		ruleId: "SEO-SITEMAP-001",
		baseText: "sitemap.xml 을 생성해 검색엔진에 페이지 목록을 알리세요.",
		contextualTemplate:
			"{{businessName}} 홈페이지의 모든 페이지를 정리한 sitemap.xml 을 만들어 도메인 루트에 올리세요. 네이버/구글 서치콘솔에 등록하면 색인 속도가 빨라집니다.",
		variations: ["sitemap.xml 을 만들고 서치콘솔에 등록해 주세요."],
		tone: "professional",
	},

	// -------------------------------------------------------------------------
	// GEO — BUSINESS / LOCATION / SCHEMA
	// -------------------------------------------------------------------------
	{
		ruleId: "GEO-BUSINESS-NAME-001",
		baseText: "홈페이지 메인에 정확한 업체명을 표기하세요.",
		contextualTemplate:
			"홈페이지 메인 페이지 상단에 '{{businessName}}' 이름이 명확히 보이게 표기하세요. 검색엔진과 AI가 매장을 정확히 인식합니다.",
		variations: [
			"{{businessName}} 매장명을 헤더와 푸터에 일관되게 노출해 주세요.",
		],
		tone: "friendly",
	},
	{
		ruleId: "GEO-INDUSTRY-001",
		baseText:
			"홈페이지에 업종 키워드(예: '카페', '미용실')를 명확히 노출하세요.",
		contextualTemplate:
			"검색엔진이 {{businessName}}을(를) {{industry}}로 인식하도록, 본문에 '{{industry}}' 키워드를 자연스럽게 2~3회 노출해 보세요.",
		variations: ["{{industry}} 키워드를 헤딩과 본문에 골고루 배치해 주세요."],
		tone: "friendly",
	},
	{
		ruleId: "GEO-REGION-001",
		baseText: "지역명을 본문과 헤더에 자연스럽게 포함하세요.",
		contextualTemplate:
			"'{{region}}' 지역명을 {{businessName}} 홈페이지 본문과 푸터에 포함해 주세요. '{{region}} {{industry}}' 같은 키워드 검색에서 노출 가능성이 높아집니다.",
		variations: [
			"'{{region}} {{businessName}}' 조합을 헤더/푸터에 노출해 보세요.",
		],
		tone: "friendly",
	},
	{
		ruleId: "GEO-SERVICE-001",
		baseText: "주요 서비스 목록을 명확히 적어 두세요.",
		contextualTemplate:
			"{{businessName}}이(가) 제공하는 주요 서비스({{mainServices.0}}, {{mainServices.1}})를 메인 페이지에 목록 형태로 정리해 주세요.",
		variations: [
			"{{mainServices.0}}, {{mainServices.1}}, {{mainServices.2}} 같은 핵심 서비스를 불릿 리스트로 보여 주세요.",
		],
		tone: "friendly",
	},
	{
		ruleId: "GEO-CONTACT-001",
		baseText: "전화번호, 주소, 영업시간을 한 곳에 모아 표기하세요.",
		contextualTemplate:
			"{{businessName}}의 전화번호·주소·영업시간을 한 섹션에 모아 두면 고객이 빠르게 연락할 수 있습니다. {{region}} 지역 검색에서도 도움이 됩니다.",
		variations: ["연락처 블록(NAP)을 푸터에 고정 노출해 주세요."],
		tone: "friendly",
	},
	{
		ruleId: "GEO-PHONE-001",
		baseText: "전화번호를 명확히 표기하세요.",
		contextualTemplate:
			"{{businessName}} 대표 전화번호를 헤더와 푸터에 표기하세요. 모바일에서는 tel: 링크로 바로 전화 걸 수 있게 해 주세요.",
		variations: [
			"전화번호를 클릭하면 바로 전화 걸리도록 tel: 링크로 처리해 주세요.",
		],
		tone: "friendly",
	},
	{
		ruleId: "GEO-ADDRESS-001",
		baseText: "주소를 명확히 표기하세요.",
		contextualTemplate:
			"{{businessName}}의 주소를 도로명까지 정확히 표기하세요. {{region}}에서 검색하는 고객이 위치를 바로 확인할 수 있습니다.",
		variations: ["주소 옆에 지도 보기 링크를 함께 두세요."],
		tone: "friendly",
	},
	{
		ruleId: "GEO-OPENING-HOURS-001",
		baseText: "영업시간을 명확히 표기하세요.",
		contextualTemplate:
			"{{businessName}}의 영업시간을 요일별로 정리해 주세요. 휴무일도 함께 명시하면 고객 불만이 줄어듭니다.",
		variations: ["요일별 영업시간 표를 만들어 주세요."],
		tone: "friendly",
	},
	{
		ruleId: "GEO-LOCAL-BUSINESS-SCHEMA-001",
		baseText: "LocalBusiness 구조화 데이터(Schema.org)를 추가하세요.",
		contextualTemplate:
			"검색엔진이 {{businessName}}을(를) 지역 업체로 인식하도록 LocalBusiness 구조화 데이터(JSON-LD)를 추가하세요. 이름, 주소, 전화번호, 영업시간을 포함해야 합니다.",
		variations: [
			"LocalBusiness JSON-LD 스니펫을 <head> 안에 한 블록 추가하세요.",
		],
		tone: "professional",
	},
	{
		ruleId: "GEO-ORGANIZATION-SCHEMA-001",
		baseText: "Organization 구조화 데이터를 추가하세요.",
		contextualTemplate:
			"{{businessName}} 브랜드 정보를 Organization 스키마(JSON-LD)로 추가해 검색엔진/AI가 더 정확히 이해하도록 도와주세요.",
		variations: [
			"Organization JSON-LD에 logo, sameAs(SNS 링크)를 함께 넣어 주세요.",
		],
		tone: "professional",
	},
	{
		ruleId: "GEO-MAP-EMBED-001",
		baseText: "지도 임베드(네이버/구글)로 위치를 시각적으로 보여 주세요.",
		contextualTemplate:
			"{{businessName}} '오시는 길' 섹션에 네이버 지도 또는 구글 지도를 임베드해 주세요. {{region}} 지역 고객의 방문 결정에 도움이 됩니다.",
		variations: ["오시는 길 페이지에 지도 임베드를 넣어 주세요."],
		tone: "friendly",
	},

	// -------------------------------------------------------------------------
	// AEO — ANSWER ENGINE OPTIMIZATION
	// -------------------------------------------------------------------------
	{
		ruleId: "AEO-FAQ-001",
		baseText: "자주 묻는 질문(FAQ) 섹션을 추가하세요.",
		contextualTemplate:
			"{{businessName}} 홈페이지에 '{{industry}}을(를) 이용할 때 자주 묻는 질문' 5~10개를 정리한 FAQ 섹션을 만드세요. AI 검색에서 답변으로 자주 인용됩니다.",
		variations: ["{{mainServices.0}} 관련 FAQ를 우선 5개 정도 작성해 보세요."],
		tone: "friendly",
	},
	{
		ruleId: "AEO-FAQ-SCHEMA-001",
		baseText: "FAQ 페이지에 FAQPage 구조화 데이터를 추가하세요.",
		contextualTemplate:
			"{{businessName}}의 FAQ 섹션에 FAQPage JSON-LD 구조화 데이터를 추가하면, 구글이 검색 결과에 질문/답변을 풍성하게 보여 줄 수 있습니다.",
		variations: ["기존 FAQ에 FAQPage 스키마를 추가하세요."],
		tone: "professional",
	},
	{
		ruleId: "AEO-SERVICE-DESC-001",
		baseText: "서비스에 대한 상세 설명을 본문에 추가하세요.",
		contextualTemplate:
			"{{businessName}}의 주요 서비스 '{{mainServices.0}}'에 대한 설명을 100~200자로 풀어서 작성해 주세요. AI 답변에 인용되기 좋은 형태입니다.",
		variations: [
			"{{mainServices.0}}의 특징과 차별점을 2~3문장으로 정리해 주세요.",
		],
		tone: "friendly",
	},
	{
		ruleId: "AEO-PRICE-INFO-001",
		baseText: "가격(또는 가격 범위) 정보를 명확히 표기하세요.",
		contextualTemplate:
			"{{businessName}}의 {{mainServices.0}} 가격 정보를 명확히 적어 두세요. '가격 문의' 대신 '5만 원부터' 같은 범위라도 안내하면 전환율이 올라갑니다.",
		variations: ["주요 서비스의 시작 가격대를 표기해 주세요."],
		tone: "friendly",
	},
	{
		ruleId: "AEO-DIRECT-ANSWER-001",
		baseText: "핵심 질문에 대한 직접 답변을 본문 상단에 두세요.",
		contextualTemplate:
			"'{{businessName}}은(는) {{industry}} 업체이며 {{region}}에 위치합니다' 같은 직접 답변을 본문 첫 문단에 두면, AI가 답변 후보로 인용할 가능성이 높아집니다.",
		variations: ["첫 문단에 5W1H가 담긴 한 문장을 추가하세요."],
		tone: "professional",
	},
	{
		ruleId: "AEO-LOCAL-SERVICE-001",
		baseText: "지역+서비스 조합 키워드로 본문을 강화하세요.",
		contextualTemplate:
			"'{{region}} {{mainServices.0}}' 같은 지역+서비스 키워드를 본문에 자연스럽게 2~3회 노출해 주세요. {{region}}에서 검색하는 고객이 찾기 쉬워집니다.",
		variations: [
			"'{{region}} {{industry}}' 검색 시 노출되도록 키워드 조합을 본문에 녹여 주세요.",
		],
		tone: "friendly",
	},
	{
		ruleId: "AEO-DEFINITION-001",
		baseText: "핵심 용어/서비스의 정의를 한 문장으로 정리해 두세요.",
		contextualTemplate:
			"'{{mainServices.0}}'에 대한 정의를 한 문장으로 정리해 두세요. 예: '{{mainServices.0}}란(은) ...입니다.' AI가 답변에 그대로 인용할 수 있습니다.",
		variations: ["주요 용어를 사전식 한 문장 정의로 정리해 주세요."],
		tone: "professional",
	},
	{
		ruleId: "AEO-LAST-UPDATED-001",
		baseText: "콘텐츠 마지막 업데이트 일자를 표시하세요.",
		contextualTemplate:
			"{{businessName}} 페이지 하단에 '최종 수정일'을 표시하세요. 최신성을 보여 주면 AI 답변에 채택될 확률이 높아집니다.",
		variations: ["콘텐츠 끝부분에 업데이트 날짜를 적어 주세요."],
		tone: "professional",
	},
	{
		ruleId: "AEO-LIST-FORMAT-001",
		baseText: "핵심 정보를 리스트 형식으로 정리하세요.",
		contextualTemplate:
			"{{businessName}}의 서비스 목록·특징·이용 절차 등을 불릿 리스트로 정리하세요. AI가 인용하기 쉬운 구조입니다.",
		variations: ["서비스 특징 3~5가지를 불릿 리스트로 보여 주세요."],
		tone: "friendly",
	},

	// -------------------------------------------------------------------------
	// MOBILE
	// -------------------------------------------------------------------------
	{
		ruleId: "MOBILE-VIEWPORT-OK-001",
		baseText: "viewport 메타 태그를 추가해 모바일 화면에 맞게 표시하세요.",
		contextualTemplate:
			"<head> 안에 <meta name='viewport' content='width=device-width, initial-scale=1'> 태그를 추가해 주세요. {{businessName}} 홈페이지가 모바일에서 자연스럽게 표시됩니다.",
		variations: ["viewport 메타 태그 한 줄을 head에 추가하세요."],
		tone: "professional",
	},
	{
		ruleId: "MOBILE-TAP-TARGET-001",
		baseText: "버튼/링크 크기를 최소 44x44px 이상으로 만들어 주세요.",
		contextualTemplate:
			"{{businessName}} 모바일 페이지의 버튼과 링크는 최소 44x44px 이상이 좋습니다. 손가락으로 정확히 누를 수 있어 이탈률이 줄어듭니다.",
		variations: ["주요 버튼(예약/연락하기)을 더 크게 만들어 주세요."],
		tone: "friendly",
	},
	{
		ruleId: "MOBILE-FONT-SIZE-001",
		baseText: "본문 글자 크기를 16px 이상으로 설정하세요.",
		contextualTemplate:
			"{{businessName}} 모바일 본문 글자 크기를 16px 이상으로 키워 주세요. 작은 글씨는 읽기 어려워 고객이 빠르게 이탈합니다.",
		variations: ["본문 기본 글꼴 크기를 16px로 올려 보세요."],
		tone: "friendly",
	},

	// -------------------------------------------------------------------------
	// PERF
	// -------------------------------------------------------------------------
	{
		ruleId: "PERF-LCP-001",
		baseText: "메인 이미지 LCP 시간을 2.5초 이내로 줄이세요.",
		contextualTemplate:
			"{{businessName}} 메인 페이지의 가장 큰 이미지(LCP)가 2.5초 안에 떠야 합니다. 이미지 용량을 줄이거나 WebP 포맷으로 바꿔 보세요.",
		variations: ["대표 이미지의 용량을 200KB 이하로 압축해 보세요."],
		tone: "urgent",
	},
	{
		ruleId: "PERF-CLS-001",
		baseText: "레이아웃 변동(CLS)을 0.1 이하로 유지하세요.",
		contextualTemplate:
			"{{businessName}} 페이지가 로드되는 동안 콘텐츠가 갑자기 움직이지 않도록, 이미지/배너에 width·height를 미리 지정해 주세요.",
		variations: ["이미지·iframe·광고 영역에 크기를 미리 지정해 주세요."],
		tone: "professional",
	},
];

const TEMPLATE_INDEX = new Map<string, RecommendationTemplate>(
	TEMPLATES.map((t) => [t.ruleId, t]),
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** 룰 ID 로 템플릿을 조회. 없으면 null. */
export function getTemplate(ruleId: string): RecommendationTemplate | null {
	return TEMPLATE_INDEX.get(ruleId) ?? null;
}

/** 등록된 룰 ID 목록 (디버그/테스트용). */
export function listTemplateRuleIds(): string[] {
	return TEMPLATES.map((t) => t.ruleId);
}

/**
 * 컨텍스트에 맞춰 추천 문구를 즉시 렌더링한다.
 * 템플릿이 없으면 fallbackText 를 그대로 반환한다.
 */
export function renderTemplate(
	ruleId: string,
	ctx: BusinessContext & { targetKeywords?: string[] },
	fallbackText: string,
	opts: ApplyContextOptions = {},
): string {
	const tpl = getTemplate(ruleId);
	if (!tpl) return fallbackText;
	return applyContext(tpl.contextualTemplate, ctx, opts);
}
