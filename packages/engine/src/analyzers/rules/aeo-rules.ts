/**
 * X-SAG Core Engine — AEO 규칙 카탈로그
 *
 * PRD § 10 + TRD § 10.4 기반. 규칙 기반 정적 분석만 수행 (POLICY § 7.1).
 * AEO: Answer Engine Optimization — 질문/답변형 검색 환경 적합도.
 * ruleWeight: high=10, medium=6, low=3
 *
 * 규칙 수: 30개 (기존 20개 Phase M-A + 신규 10개 Phase O-D)
 */

import type { Rule, RuleResult } from "../types.js";
// ---------------------------------------------------------------------------
// 공통 헬퍼: 문장 분할 (splitSentences)
// ---------------------------------------------------------------------------
// Phase 0: splitSentences / DOT_PLACEHOLDER 구현은 shared/text-utils.js 로 이관됨.
// 기존 import 경로(rules/aeo-rules.js) 호환을 위해 여기서 re-export 한다.
// 신규 룰은 shared/text-utils.js 에서 직접 import 할 것.
import {
	DOT_PLACEHOLDER,
	extractSentencesAround,
	headingHasKeyword,
	splitSentences,
} from "../shared/text-utils.js";
import {
	getAggregateRating,
	getName,
	getSchemaNodes,
	getTelephone,
	isFaqPageNode,
	isOrganizationNode,
	isPresent,
} from "../shared/schema-validator.js";
import {
	areaCodeMatchesRegion,
	EXAMPLE_CONTEXT_PATTERN,
	extractPhones,
	hasExampleContextAround,
	normalizeBusinessName,
} from "../shared/nap-extractor.js";

export { DOT_PLACEHOLDER, splitSentences };

// ---------------------------------------------------------------------------
// Phase 1 (시맨틱 마이그레이션) 공통 헬퍼
// ---------------------------------------------------------------------------

/**
 * 매치 위치(±radius) 주변에 부정/예시 맥락이 있으면 true.
 * "무료가 아닙니다", "가격 예시", "별도 문의" 처럼 실제 신호가 아닌 설명문을 거른다.
 */
const AEO_NEGATION_PATTERN =
	/아닙니다|아니에요|아니라|없습니다|없어요|불가|제외|예시|예제|샘플|placeholder|example/i;

function hasNegationAround(text: string, idx: number, radius = 25): boolean {
	const start = Math.max(0, idx - radius);
	const end = Math.min(text.length, idx + radius);
	return AEO_NEGATION_PATTERN.test(text.slice(start, end));
}

/** @type 이 주어진 타입 문자열(들) 중 하나와 매칭되는지. (string | string[] 모두 처리) */
function nodeTypeIncludes(node: Record<string, unknown>, ...types: string[]): boolean {
	const t = node["@type"];
	if (typeof t === "string") return types.includes(t);
	if (Array.isArray(t)) return t.some((x) => typeof x === "string" && types.includes(x));
	return false;
}

function getBodyParagraphs(
	page: {
		paragraphs?: string[] | undefined;
		textBlocks?: { tag: string; text: string }[] | undefined;
		bodyText: string;
	},
	fallbackSplitPattern: RegExp,
): string[] {
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

	const textBlocks = normalize(page.textBlocks?.map((block) => block.text));
	if (textBlocks.length > 0) return textBlocks;

	return page.bodyText
		.split(fallbackSplitPattern)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
}

// ---------------------------------------------------------------------------
// Phase 2 (AEO 시맨틱 마이그레이션) 공통 헬퍼
// ---------------------------------------------------------------------------

/**
 * 입력 폼 레이블 맥락. "작성자 이름을 입력", "수정일 입력", "사업자등록번호 입력란"
 * 처럼 실제 콘텐츠가 아니라 입력 폼/플레이스홀더인 경우를 거른다.
 */
const FORM_LABEL_PATTERN =
	/입력(?:해|하|란|칸|값|please)?|을 입력|를 입력|기입|작성\s*예|작성하세요|작성해|채워|선택하세요|업로드|첨부|로그인|회원가입|아이디|비밀번호|검색어|placeholder/i;

/**
 * AI/도구 크레딧 맥락. "by GPT", "by ChatGPT", "AI로 자동 생성" 처럼 사람 작성자가
 * 아닌 도구 표기를 작성자(E-E-A-T) 신호로 인정하지 않는다.
 */
const TOOL_CREDIT_PATTERN =
	/by\s*(?:gpt|chatgpt|claude|gemini|ai|bot|봇)|ai\s*(?:로|가|를|으로)?\s*(?:자동\s*)?생성|자동\s*생성|chatgpt|chat\s*gpt/i;

/** 저작권 표기 맥락. "© 2025", "Copyright 2024", "All rights reserved" — 업데이트 날짜가 아님. */
const COPYRIGHT_PATTERN = /©|copyright|all\s*rights?\s*reserved/i;

/**
 * 매치 위치(±radius) 주변에 form-label 맥락이 있으면 true.
 */
function hasFormLabelAround(text: string, idx: number, radius = 30): boolean {
	if (idx < 0) return false;
	const from = Math.max(0, idx - radius);
	const to = Math.min(text.length, idx + radius);
	return FORM_LABEL_PATTERN.test(text.slice(from, to));
}

/**
 * 어떤 (중첩 포함) 스키마 노드든 주어진 키 중 하나라도 present 값을 가지면 true.
 * dateModified / author / publisher 등 "키 존재 + 비어있지 않음" 판정용.
 */
function anyNodeHasPresentKey(
	nodes: Record<string, unknown>[],
	...keys: string[]
): boolean {
	return nodes.some((n) => keys.some((k) => isPresent(n[k])));
}

// ---------------------------------------------------------------------------
// Phase 2.5 (AEO 얕은-정규식 마이그레이션) 공통 헬퍼
// ---------------------------------------------------------------------------

/**
 * 후기/리뷰 안내·정책·이벤트 맥락. "리뷰 작성 안내", "리뷰 정책", "후기 이벤트",
 * "리뷰를 남겨주세요" 처럼 실제 고객 증언이 아니라 작성 안내/정책/모집 문구를 거른다.
 */
const TESTIMONIAL_INSTRUCTION_PATTERN =
	/작성\s*안내|작성\s*방법|남기는\s*방법|남겨\s*주세요|남겨주세요|작성\s*해\s*주세요|작성해\s*주세요|정책|규정|이벤트|약관|유의\s*사항|주의\s*사항|삭제될|모집|부탁드립니다/;

/**
 * 후기 긍정 평가 술어. 실제 증언 문장에 등장하는 만족/추천 표현.
 */
const TESTIMONIAL_PRAISE_PATTERN =
	/만족|좋았|괜찮았|훌륭|최고|강추|추천합니다|친절|덕분에|감사합니다|또\s*방문|재방문|대만족/;

/**
 * 신선도(최신성) 라벨. 최신 날짜에 인접해야 "업데이트 신호"로 인정.
 */
const FRESHNESS_LABEL_PATTERN =
	/최종\s*(?:수정|업데이트|갱신)|업데이트(?:일|\s*[:：])?|갱신|수정일|기준|최신|updated/i;

/**
 * 과거-게시/창업 등 "최신성"이 아닌 날짜 맥락. 이 맥락의 연도는 freshness 로 인정하지 않는다.
 */
const PAST_PUBLISH_PATTERN =
	/창업|설립|개업|개원|오픈\s*(?:했|한|일)|since|게시(?:일|됨|했)|등록(?:일|됨)|발행(?:일|됨)/i;

/**
 * 질문형 종결 신호. 단어(왜/무엇)만이 아니라 실제 질문 형태(물음표 또는 질문 종결어미)여야 한다.
 */
const QUESTION_ENDING_PATTERN =
	/\?|까요\s*[?.]?$|나요\s*[?.]?$|인가요\s*[?.]?$|됩니까\s*[?.]?$|할까요\s*[?.]?$|는가요\s*[?.]?$|을까요\s*[?.]?$|ㄴ가요\s*[?.]?$/;

/** 질문형 키워드 (의문사). QUESTION_ENDING_PATTERN 과 함께 쓰일 때만 질문으로 인정. */
const QUESTION_KEYWORD_PATTERN =
	/어떻게|왜|무엇|무슨|얼마나|얼마인|언제|어디서|어디에|누가|몇|어떤|할\s*수\s*있/;

/** heading 텍스트가 실제 질문형인지: 물음표/질문 종결어미로 끝나거나, 의문사+의문 종결을 가진다. */
function isQuestionHeading(text: string): boolean {
	const t = text.trim();
	if (t.length === 0) return false;
	if (QUESTION_ENDING_PATTERN.test(t)) return true;
	// 물음표는 없지만 의문사 + 의문 종결어미가 함께 있으면 질문형으로 인정.
	return QUESTION_KEYWORD_PATTERN.test(t) && /나요|까요|인가요|됩니까|할까요|가요/.test(t);
}

/**
 * 수사형 CTA(행동 유도) 슬로건. '준비되셨나요?', '함께하실래요?', '지금 시작할까요?',
 * '왜 망설이세요?' 처럼 물음표는 있으나 답을 제공하는 정보형 질문이 아닌 마케팅 문구.
 * AI 검색이 직접 답변으로 인용하지 않으므로 질문형 비율의 분자에서 제외한다.
 * 토큰은 CTA-앵커형으로 좁혀, 합법 정보형 질문('환불을 망설이게 되는 이유는?',
 * '운동은 언제 시작할까요?', '지금 신청하면 할인되나요?')을 깎지 않도록 한다.
 */
const RHETORICAL_CTA_HEADING_PATTERN =
	/준비\s*되?셨나요|아직도\s*망설이|망설이지\s*마|망설이세요|망설이시나요|망설이고\s*계신가요|함께\s*하실래요|함께\s*하실까요|함께\s*시작할까요|지금\s*시작할까요|바로\s*시작할까요|시작하실래요|도전\s*해\s*보|지금\s*바로\s*신청|지금\s*신청하세요|지금\s*예약하시겠|동참하실래요/;

/**
 * aeoHeadingQuestionRatio001 전용: 공용 isQuestionHeading 으로 질문형이면서
 * 수사형 CTA 슬로건이 아닌, 답변 가능한 정보형 질문 heading 인지.
 * isQuestionHeading 을 통과한 것에서 CTA 만 빼므로 false-negative 를 새로 만들지 않는다.
 */
function isInformationalQuestionHeading(text: string): boolean {
	const t = text.trim();
	if (!isQuestionHeading(t)) return false;
	return !RHETORICAL_CTA_HEADING_PATTERN.test(t);
}

/**
 * 매치 위치(±radius) 주변에 주어진 패턴이 있으면 true. (제외 맥락 판정 공용)
 */
function hasPatternAround(
	text: string,
	idx: number,
	pattern: RegExp,
	radius = 30,
): boolean {
	if (idx < 0) return false;
	const from = Math.max(0, idx - radius);
	const to = Math.min(text.length, idx + radius);
	return pattern.test(text.slice(from, to));
}

// ---------------------------------------------------------------------------
// Phase 3.5 (AEO 수치-사실 per-instance 문맥 헬퍼) — AEO-NUMERIC-FACTS-001 정밀화
// ---------------------------------------------------------------------------

/**
 * 비-사실(non-fact) 맥락. 게시글 번호·조회수·댓글 수·페이지네이션·메뉴 가짓수
 * 나열·푸터 잡다 숫자처럼, 숫자가 있어도 "실적/통계/가격"이 아닌 운영성 표기.
 * 이 맥락 인접 숫자는 의미 있는 수치로 인정하지 않는다.
 */
const NON_FACT_CONTEXT_PATTERN =
	/조회수?|조회\s*[:：]|view(?:s|ed)?|게시(?:글|물)?\s*번호|글\s*번호|번호\s*[:：]|댓글|덧글|답글|추천\s*수|좋아요|페이지\s*\d|다음\s*페이지|이전\s*페이지|page\s*\d|목록|navigation|메뉴\s*[:：]|copyright|all\s*rights/i;

/**
 * 사실(fact) 앵커. 실제 서비스/가격/통계/실적/이용 맥락 어휘. 모호한 수량 단위
 * (명/개/가지/곳/회/건/점)는 이 앵커가 인접할 때만 의미 있는 수치로 인정한다.
 */
const FACT_ANCHOR_PATTERN =
	/고객|이용|방문|예약|회원|가입자|만족(?:도)?|재방문|시술|진료|치료|수술|상담|판매|주문|배송|메뉴|시공|작업|완료|달성|기록|돌파|누적|경력|운영|보유|제공|서비스|가격|요금|비용|원|할인/;

/**
 * 매치 위치(±radius) 주변에 비-사실(운영성) 맥락이 있으면 true.
 */
function hasNonFactContextAround(text: string, idx: number, radius = 18): boolean {
	return hasPatternAround(text, idx, NON_FACT_CONTEXT_PATTERN, radius);
}

/**
 * 매치 위치(±radius) 주변에 실제 서비스/실적/이용 등 사실 앵커가 있으면 true.
 */
function hasFactAnchorAround(text: string, idx: number, radius = 16): boolean {
	return hasPatternAround(text, idx, FACT_ANCHOR_PATTERN, radius);
}

// ---------------------------------------------------------------------------
// AEO-CITATION-001 전용: "출처성 외부 링크" 판별 헬퍼
// ---------------------------------------------------------------------------

/**
 * 출처성(공신력) 도메인 allowlist 토큰. 공공(.go.kr/.gov)·공익(.or.kr)·학술
 * (.ac.kr/.re.kr/.edu) 및 통계/연구/뉴스 성격의 호스트는 본문 인용 표지가 없어도
 * "출처"로 승격한다. 호스트를 URL 파싱해 suffix 매칭하므로 베어 호스트도 인정된다.
 */
const CITATION_ALLOWLIST_HOST_TOKENS = [
	"go.kr",
	"or.kr",
	"re.kr",
	"ac.kr",
	"gov",
	"edu",
	"kostat.go.kr",
	"kosis.kr",
	"data.go.kr",
	"nso.go.kr",
	"kati.net",
	"doi.org",
	"jstor.org",
	"wikipedia.org",
	"namu.wiki",
	"yna.co.kr",
	"hankyung.com",
	"mk.co.kr",
	"chosun.com",
	"donga.com",
	"hani.co.kr",
	"joongang.co.kr",
];

/**
 * 출처성 호스트 부분문자열(서브도메인 포함) 토큰. suffix 가 아닌 contains 로 본다.
 * scholar.google / news\d / ncbi.nlm 처럼 도메인 일부에 출처 신호가 박힌 경우.
 */
const CITATION_ALLOWLIST_HOST_CONTAINS =
	/scholar\.google|ncbi\.nlm|pubmed|sciencedirect|yonhapnews|(?:^|\.)news\d?\b|(?:^|\.)press\b/i;

/**
 * URL 경로(pathname)에 등장하는 출처 신호 토큰. allowlist 가 아니어도 경로 세그먼트가
 * report/research/통계/뉴스 등 출처 신호면 "출처성 링크"로 인정한다.
 * pathname 전용이라 scheme 의 '//' 를 경로로 오인하지 않는다. 세그먼트 단위로 매칭해
 * '/data-policy'·'/article-list' 같은 합성어 오탐을 피한다.
 */
const CITATION_PATH_SEGMENT_SIGNAL =
	/(?:^|\/)(?:report|reports|research|study|studies|stat|stats|statistics|whitepaper|dataset|survey|journal|paper|papers|publication|publications|press|insight|insights|reference|references)(?:\/|$)/i;

/**
 * 호스트(hostname)에 박힌 출처 신호 토큰. 'reference.com'·'research.io' 처럼
 * 호스트 자체가 출처성 어휘인 경우. 베어 호스트 출처 링크의 false-negative 방지.
 */
const CITATION_HOST_SIGNAL =
	/\b(?:report|reports|research|statistics|whitepaper|journal|reference|references|press|insight|insights)\b/i;

/**
 * 외부 링크가 "출처성"으로 인정될 만한지 판별한다.
 * NON_CITATION_HOST(SNS/지도/공유) 제외는 호출부에서 선행한다.
 * URL 을 파싱해 host/pathname 을 분리 검사하므로 scheme 의 '//' 를 경로로 오인하지 않는다.
 * (1) 출처성 allowlist 호스트(suffix/contains), (2) 호스트에 출처 신호 어휘,
 * (3) 경로 세그먼트에 출처 신호 토큰이 있으면 true. 셋 다 아니면 false.
 */
function isCitationWorthyLink(url: string): boolean {
	if (!url) return false;
	let host = "";
	let pathname = "";
	try {
		const parsed = new URL(url);
		host = parsed.hostname.toLowerCase();
		pathname = parsed.pathname;
	} catch {
		// URL 파싱 불가(상대경로 등): 보수적으로 출처성 아님 처리.
		return false;
	}
	const allowHost = CITATION_ALLOWLIST_HOST_TOKENS.some(
		(t) => host === t || host.endsWith(`.${t}`),
	);
	if (allowHost) return true;
	if (CITATION_ALLOWLIST_HOST_CONTAINS.test(host)) return true;
	if (CITATION_HOST_SIGNAL.test(host)) return true;
	return CITATION_PATH_SEGMENT_SIGNAL.test(pathname);
}

// ---------------------------------------------------------------------------
// AEO-FAQ-001: FAQ 섹션 존재 (parsedPage.hasFAQ)
// ---------------------------------------------------------------------------
export const aeoFaq001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const passed = page.hasFAQ;
	return {
		ruleId: "AEO-FAQ-001",
		category: "aeo",
		passed,
		severity: "high",
		title: "FAQ 섹션 존재 여부",
		description: passed
			? "홈페이지에 FAQ 섹션이 있습니다. 사용자 질문에 답변하기 좋은 구조입니다."
			: "홈페이지에 FAQ(자주 묻는 질문) 섹션이 없습니다. 방문자의 궁금증을 해결하지 못해 문의가 줄어들 수 있습니다.",
		evidence: [
			`URL: ${page.url}`,
			`FAQ 발견: ${page.hasFAQ ? "있음" : "없음"}`,
		],
		recommendation:
			"홈페이지에 '자주 묻는 질문' 섹션을 추가하세요. 가격, 이용 방법, 소요 시간 등 고객이 자주 묻는 5~10개 질문을 작성하면 됩니다.",
		actionType: "snippet_action",
		difficulty: "medium",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// AEO-FAQ-SCHEMA-001: FAQ Schema (JSON-LD) 존재
// ---------------------------------------------------------------------------
export const aeoFaqSchema001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const hasFaqSchema = getSchemaNodes(page.schemaJsonLd).some(isFaqPageNode);
	return {
		ruleId: "AEO-FAQ-SCHEMA-001",
		category: "aeo",
		passed: hasFaqSchema,
		severity: "medium",
		title: "FAQ 구조화 데이터(Schema) 적용 여부",
		description: hasFaqSchema
			? "FAQ Schema(JSON-LD)가 적용되어 있습니다. 검색 결과에서 FAQ가 직접 표시될 수 있습니다."
			: "FAQ Schema(JSON-LD)가 없습니다. 구조화 데이터를 추가하면 검색 결과에서 질문과 답변이 바로 보일 수 있습니다.",
		evidence: [
			`URL: ${page.url}`,
			`JSON-LD 수: ${page.schemaJsonLd.length}개`,
			`FAQPage Schema: ${hasFaqSchema ? "있음" : "없음"}`,
		],
		recommendation:
			"FAQ HTML 섹션에 FAQPage JSON-LD 스키마를 추가하세요. X-SAG의 '스니펫 생성' 기능으로 코드를 자동으로 만들 수 있습니다.",
		actionType: "snippet_action",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-QUESTION-FORMAT-001: 질문형 제목 H2/H3에 ≥ 1개
// ---------------------------------------------------------------------------
export const aeoQuestionFormat001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 2.5 시맨틱 검증: 실제 "질문형 제목" 이어야 통과.
	// 기존 룰은 H2 에 '왜'/'무엇' substring 만 있어도 통과 → '왜 우리인가'(평서 슬로건),
	// '무엇이든 가능'(평서) 같은 비-질문 제목도 통과시켰다.
	// (1) H2 또는 headingStructure(H2/H3) 텍스트가 물음표/질문 종결어미로 끝나거나
	//     의문사+의문 종결을 가진 "실제 질문 제목" 이어야 한다.
	// (2) 본문에만 의문사가 있는 경우는 제목 신호가 아니므로 제외(heading 만 본다).
	// ---------------------------------------------------------------------
	const headingTexts = [
		...page.h2,
		...(page.headingStructure ?? [])
			.filter((h) => h.level === 2 || h.level === 3)
			.map((h) => h.text),
		...(page.h3 ?? []),
	];
	const questionH2 = Array.from(
		new Set(headingTexts.map((h) => h.trim())),
	).filter((h) => isQuestionHeading(h));
	const passed = questionH2.length >= 1;
	return {
		ruleId: "AEO-QUESTION-FORMAT-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "질문형 소제목(H2/H3) 사용 여부",
		description: passed
			? `질문형 소제목이 ${questionH2.length}개 있습니다: "${questionH2[0]}"`
			: "H2 소제목 중에 질문형 문장이 없습니다. '어떻게...', '왜...' 같은 질문형 제목은 AI 검색에서 직접 답변으로 선택될 가능성을 높입니다.",
		evidence: [
			`전체 H2: ${page.h2.length}개`,
			`질문형 H2: ${questionH2.length}개`,
			...questionH2.slice(0, 2).map((h) => `질문형 H2: "${h}"`),
		],
		recommendation:
			"'이용 방법은 어떻게 되나요?', '가격이 얼마인가요?' 같은 질문형 소제목을 1개 이상 추가하세요. 고객이 검색할 법한 질문을 제목으로 만들면 됩니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-SERVICE-DESC-001: 서비스 설명 명확성 (mainServices 본문 등장)
// ---------------------------------------------------------------------------
export const aeoServiceDesc001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const services = ctx.businessProfile.mainServices;
	if (services.length === 0) {
		return {
			ruleId: "AEO-SERVICE-DESC-001",
			category: "aeo",
			passed: true,
			severity: "high",
			title: "주요 서비스 설명 명확성",
			description:
				"mainServices field is empty. Add the actual service names customers search for.",
			evidence: ["mainServices 없음"],
			recommendation:
				"진단 요청의 mainServices 필드에 실제 제공 서비스명을 입력하세요. 예: 커트, 염색, 상담처럼 고객이 검색할 서비스 단위로 넣어야 AI 응답 최적화 분석이 가능합니다.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "high",
			ruleWeight: 10,
		};
	}
	// ---------------------------------------------------------------------
	// Phase 1 시맨틱 검증: (1) schema Service/Offer.name → (2) heading →
	// (3) 본문 (단, form-label/블로그 제목 전용 등장은 서비스 설명으로 인정하지 않음).
	// ---------------------------------------------------------------------
	const bodyLower = page.bodyText.toLowerCase();
	const nodes = getSchemaNodes(page.schemaJsonLd);

	// schema 에 노출된 서비스명 모음: Service/Offer/Product 노드의 name + itemOffered.name + makesOffer.
	const schemaServiceNames: string[] = [];
	for (const n of nodes) {
		if (nodeTypeIncludes(n, "Service", "Offer", "Product")) {
			const nm = getName(n);
			if (nm) schemaServiceNames.push(nm.toLowerCase());
		}
		// Offer.itemOffered.name / makesOffer[].itemOffered.name
		const itemOffered = n.itemOffered;
		if (itemOffered && typeof itemOffered === "object") {
			const nm = getName(itemOffered);
			if (nm) schemaServiceNames.push(nm.toLowerCase());
		}
		const makesOffer = n.makesOffer;
		if (Array.isArray(makesOffer)) {
			for (const offer of makesOffer) {
				if (offer && typeof offer === "object") {
					const off = offer as Record<string, unknown>;
					const nm = getName(off) ?? getName(off.itemOffered);
					if (nm) schemaServiceNames.push(nm.toLowerCase());
				}
			}
		}
		// hasOfferCatalog.itemListElement[].itemOffered.name
		const catalog = n.hasOfferCatalog;
		if (catalog && typeof catalog === "object") {
			const list = (catalog as Record<string, unknown>).itemListElement;
			if (Array.isArray(list)) {
				for (const el of list) {
					if (el && typeof el === "object") {
						const e = el as Record<string, unknown>;
						const nm = getName(e) ?? getName(e.itemOffered);
						if (nm) schemaServiceNames.push(nm.toLowerCase());
					}
				}
			}
		}
	}

	// form-label / 블로그·게시판 제목 전용 맥락: 이 키워드 주변에서만 서비스명이 등장하면
	// "실제 서비스 설명"이 아니라 입력 폼 레이블 또는 글 제목일 가능성이 높다.
	const FORM_LABEL_PATTERN =
		/입력(?:해|하|란|칸|please)?|검색어?|을 입력|를 입력|제목|작성자|글쓰기|게시판|댓글|답변하기|로그인|회원가입|아이디|비밀번호|이름\s*[:：]|문의\s*제목/;

	const isRealService = (service: string): boolean => {
		const sLower = service.toLowerCase();
		// (1) 구조화 신호: schema Service/Offer name 에 서비스명이 포함되면 즉시 인정.
		if (schemaServiceNames.some((n) => n.includes(sLower) || sLower.includes(n)))
			return true;
		// (2) heading 신호: H2/H3 등 heading 텍스트에 등장하면 인정 (제목은 서비스 섹션 신호).
		if (headingHasKeyword(page.headingStructure, service)) return true;
		if (page.h2.some((h) => h.toLowerCase().includes(sLower))) return true;
		// (3) 본문 신호: 등장하되, 모든 등장 위치가 form-label/제목 맥락이면 제외.
		if (!bodyLower.includes(sLower)) return false;
		const windows = extractSentencesAround(page.bodyText, service, 30);
		if (windows.length === 0) return true; // 위치를 못 잡으면 보수적으로 인정.
		// 한 군데라도 form-label 맥락이 아닌 일반 본문 등장이 있으면 실제 서비스로 인정.
		return windows.some((w) => !FORM_LABEL_PATTERN.test(w));
	};

	const foundServices = services.filter((s) => isRealService(s));
	const missingServices = services.filter((s) => !foundServices.includes(s));
	const missingServiceExamples = missingServices
		.map(
			(service) =>
				`${service}: 서비스 정의, 적합한 고객, 소요 시간/가격/예약 방법을 2-3문장으로 설명`,
		)
		.join(" / ");
	const passed = foundServices.length >= Math.ceil(services.length * 0.5);
	return {
		ruleId: "AEO-SERVICE-DESC-001",
		category: "aeo",
		passed,
		severity: "high",
		title: "주요 서비스 설명 명확성",
		description: passed
			? `mainServices coverage is sufficient: ${foundServices.length} found (${foundServices.join(", ")}).`
			: `mainServices missing coverage: required services (${services.join(", ")}) are not sufficiently present in body text; missingServices=(${missingServices.join(", ") || "none"}). AI answers may omit the business services.`,
		evidence: [
			`주요 서비스: ${services.join(", ")}`,
			`본문에서 발견: ${foundServices.join(", ") || "없음"}`,
		],
		recommendation: passed
			? "mainServices items are sufficiently reflected in body text. Keep each core service explanation at 2-3 sentences."
			: `Add each missing mainServices item to body text: ${missingServices.join(", ") || "none"}. For every service, write a visible heading or sentence using the exact service name plus a short 2-3 sentence explanation. Example service section: ${missingServiceExamples || "none"}.`,
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "high",
		ruleWeight: 10,
	};
};

// ---------------------------------------------------------------------------
// AEO-PRICE-INFO-001: 가격/요금 정보 본문 등장
// ---------------------------------------------------------------------------
export const aeoPriceInfo001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;

	// ---------------------------------------------------------------------
	// Phase 1 시맨틱 검증: 실제 "가격 신호"가 있어야 통과.
	// 기존 룰은 '가격'/'요금'/'무료' 단어만 있어도 통과 → ~80% FP.
	// (1) schema Offer.price/priceSpecification/lowPrice → 즉시 통과.
	// (2) 본문: 숫자 + 통화(원/₩/만원) 인접, 또는 '무료/유료' 명시.
	//     단, 부정/예시 맥락("무료가 아닙니다", "가격 예시") 은 제외.
	//     '가격은 상담 후 결정' 같이 숫자 없는 설명문은 가격 정보로 인정하지 않는다.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasSchemaPrice = nodes.some((n) => {
		if (nodeTypeIncludes(n, "Offer", "AggregateOffer")) {
			if (isPresent(n.price) || isPresent(n.lowPrice) || isPresent(n.highPrice))
				return true;
		}
		// 어떤 노드든 price / priceSpecification.price 보유 시 인정.
		if (isPresent(n.price)) return true;
		const spec = n.priceSpecification;
		if (spec && typeof spec === "object") {
			const sp = spec as Record<string, unknown>;
			if (isPresent(sp.price) || isPresent(sp.minPrice) || isPresent(sp.maxPrice))
				return true;
		}
		// Offer 가 offers 배열 안에 중첩된 경우.
		const offers = n.offers;
		if (Array.isArray(offers)) {
			return offers.some(
				(o) =>
					o &&
					typeof o === "object" &&
					isPresent((o as Record<string, unknown>).price),
			);
		}
		if (offers && typeof offers === "object") {
			return isPresent((offers as Record<string, unknown>).price);
		}
		return false;
	});

	// 숫자 + 통화: "30,000원", "₩50000", "10만원", "5천원", "1.5만 원".
	const priceWithNumber =
		/(?:₩|\\)\s*\d[\d,.]*|\d[\d,.]*\s*(?:원|만\s*원|천\s*원|만원|천원|won|KRW)/gi;
	// 명시적 무료/유료 — 단, 부정/예시 맥락은 호출부에서 제외.
	const freePaidPattern = /무료|유료|부가세\s*별도|vat\s*별도/gi;

	let bodySignal: string | null = null;
	for (const m of body.matchAll(priceWithNumber)) {
		const idx = m.index ?? 0;
		if (hasNegationAround(body, idx)) continue;
		bodySignal = m[0].trim();
		break;
	}
	if (bodySignal === null) {
		for (const m of body.matchAll(freePaidPattern)) {
			const idx = m.index ?? 0;
			if (hasNegationAround(body, idx)) continue;
			bodySignal = m[0].trim();
			break;
		}
	}

	const passed = hasSchemaPrice || bodySignal !== null;
	const foundLabel = hasSchemaPrice
		? "schema Offer.price"
		: (bodySignal ?? "없음");
	return {
		ruleId: "AEO-PRICE-INFO-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "가격/요금 정보 본문 포함 여부",
		description: passed
			? `실제 가격 신호("${foundLabel}")가 확인됩니다.`
			: "구체적 가격 정보(숫자+통화 또는 schema Offer.price)가 없습니다. '가격 문의' 같은 안내문만으로는 방문자가 비용을 가늠할 수 없습니다.",
		evidence: [
			`URL: ${page.url}`,
			`schema 가격: ${hasSchemaPrice ? "있음" : "없음"}`,
			`본문 가격 신호: ${bodySignal ?? "없음"}`,
		],
		recommendation:
			"'커트 25,000원'처럼 숫자와 단위를 포함한 가격을 1개 이상 명시하세요. 정확한 금액이 어렵다면 '5만원부터', '무료 상담'처럼 구체적으로 안내하면 신뢰가 올라갑니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-PROCESS-INFO-001: 절차/이용 방법 정보
// ---------------------------------------------------------------------------
export const aeoProcessInfo001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;

	// ---------------------------------------------------------------------
	// Phase 1 시맨틱 검증: "순서가 있는 단계(ordered steps)" 가 있어야 통과.
	// 기존 룰은 '안내'/'가이드'/'진행' 단어만 있어도 통과 → ~75% FP.
	// (1) schema HowTo.step[] → 즉시 통과.
	// (2) ordered list(ol) 1개 이상 → 단계 구조로 인정.
	// (3) 본문/heading 에 순서 토큰이 2개 이상(1단계·2단계 / STEP1·STEP2 / ①② / 1. 2.).
	//     단순 '다음 단계'·'가이드' 같은 generic 표현은 단계로 치지 않는다.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasHowToSteps = nodes.some((n) => {
		if (!nodeTypeIncludes(n, "HowTo")) return false;
		const step = n.step;
		if (Array.isArray(step)) return step.length >= 2;
		return isPresent(step);
	});

	const olCount = page.listTableCount?.ol ?? 0;
	const hasOrderedList = olCount >= 1;

	// 순서 토큰: 같은 종류가 2개 이상 연속/반복되어야 "순서"로 인정.
	const countOrdinal = (re: RegExp): number => {
		const set = new Set<string>();
		for (const m of body.matchAll(re)) set.add(m[0].replace(/\s+/g, ""));
		return set.size;
	};
	const stepKor = countOrdinal(/\b([1-9]|[1-9][0-9])\s*단계/g);
	const stepEng = countOrdinal(/\bstep\s*0?([1-9])/gi);
	const circled = countOrdinal(/[①②③④⑤⑥⑦⑧⑨⑩]/g);
	// "1. ... 2. ... " 형태의 번호 매김(줄 시작 또는 공백 뒤 N.) — 최소 2개 서로 다른 번호.
	const numberedDots = countOrdinal(/(?:^|\n|\s)([1-9])[.)]\s/g);
	const headingSteps = (page.headingStructure ?? []).filter((h) =>
		/\b[1-9]\s*단계|step\s*[1-9]|[①②③④⑤]/i.test(h.text),
	).length;

	const orderedStepSignals =
		(stepKor >= 2 ? 1 : 0) +
		(stepEng >= 2 ? 1 : 0) +
		(circled >= 2 ? 1 : 0) +
		(numberedDots >= 2 ? 1 : 0) +
		(headingSteps >= 2 ? 1 : 0);

	const passed = hasHowToSteps || hasOrderedList || orderedStepSignals >= 1;
	const signalLabel = hasHowToSteps
		? "schema HowTo.step"
		: hasOrderedList
			? `ordered list(ol ${olCount}개)`
			: orderedStepSignals >= 1
				? "본문 순서 단계(1단계/STEP/①…)"
				: "없음";
	return {
		ruleId: "AEO-PROCESS-INFO-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "이용 방법/절차 정보 포함 여부",
		description: passed
			? `순서가 있는 이용 절차("${signalLabel}")가 확인됩니다.`
			: "순서가 있는 이용 절차(1단계·2단계, 번호 목록 등)가 없습니다. '안내', '가이드' 같은 단어만으로는 처음 방문하는 고객이 이용 흐름을 알기 어렵습니다.",
		evidence: [
			`URL: ${page.url}`,
			`schema HowTo: ${hasHowToSteps ? "있음" : "없음"}`,
			`ol 목록: ${olCount}개`,
			`순서 단계 신호: ${signalLabel}`,
		],
		recommendation:
			"'1단계 예약 → 2단계 방문 → 3단계 서비스'처럼 번호가 매겨진 순서로 이용 절차를 안내하세요. <ol> 번호 목록이나 '1단계/2단계' 표기를 3~5개 사용하면 좋습니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-DURATION-INFO-001: 소요시간 정보 등장
// ---------------------------------------------------------------------------
export const aeoDurationInfo001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;
	// ---------------------------------------------------------------------
	// Phase 2.5 시맨틱 검증: 실제 "소요 시간" 신호여야 통과.
	// 기존 룰 /분|시간/ 은 '분석'·'분야'의 '분', '시작'의 '시', 무관한 '시간이 중요'
	// 에도 매치 → ~대량 FP.
	// (1) 숫자 + 시간 단위(분/시간/일/주/개월) 인접: "30분", "약 1시간", "2~3일",
	//     "3개월" 등. 단위 뒤가 한글로 이어지면(분석/분야/시작…) 단어 일부이므로 제외.
	// (2) 숫자 없는 즉시성 표현: "당일 완료/처리", "즉시", "바로" + 완료/처리/가능.
	// ---------------------------------------------------------------------

	// 숫자(범위 ~/- 포함) + 시간 단위. 단위 직후가 한글이면(분석/분야/시작) 단어 일부 → \b 대신
	// negative lookahead 로 한글 연속 차단.
	const durationNumberUnit =
		/\d+\s*(?:[~\-]\s*\d+\s*)?(?:분|시간|시간\s*반|일|주|주일|개월|달)(?![가-힣])/g;
	// "약 30분", "30분 소요/이내/정도" 처럼 실제 소요 문맥이 인접해야 한다.
	// 단독 날짜(예: 2025년 1월 1일)의 "1일"은 소요시간으로 보지 않는다.
	const durationContextPattern =
		/소요|걸립|걸려|이내|이상|이하|정도|완료|처리|예약|대기|배송|시공|상담|수업|코스|기간|평균|약|당일|즉시|바로/;
	const immediacyPattern = /(?:당일|즉시|바로)\s*(?:완료|처리|가능|마감)|당일\s*(?:완료|처리)/;

	let bodySignal: string | null = null;
	for (const m of body.matchAll(durationNumberUnit)) {
		const idx = m.index ?? 0;
		const around = body.slice(Math.max(0, idx - 30), idx + m[0].length + 30);
		const unit = m[0].replace(/\s+/g, " ").trim();
		if (/년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/.test(around)) continue;
		if (/[월]\s*\d{1,2}\s*일/.test(around) && /\d+\s*일/.test(unit))
			continue;
		if (!durationContextPattern.test(around)) continue;
		bodySignal = unit;
		break;
	}
	if (bodySignal === null) {
		const im = body.match(immediacyPattern);
		if (im) bodySignal = im[0].trim();
	}
	const passed = bodySignal !== null;
	const found = bodySignal;
	return {
		ruleId: "AEO-DURATION-INFO-001",
		category: "aeo",
		passed,
		severity: "low",
		title: "소요 시간 정보 포함 여부",
		description: passed
			? `소요 시간 관련 정보("${found}")가 본문에 있습니다.`
			: "홈페이지에 서비스 소요 시간 안내가 없습니다. 고객이 시간 계획을 세우기 어렵습니다.",
		evidence: [`URL: ${page.url}`, `소요 시간 발견: ${found ?? "없음"}`],
		recommendation:
			"'약 30분 소요', '당일 완료' 같이 소요 시간을 안내하면 고객의 예약 결정에 도움이 됩니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// AEO-TARGET-CUSTOMER-001: 대상 고객 정보
// ---------------------------------------------------------------------------
export const aeoTargetCustomer001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;
	// ---------------------------------------------------------------------
	// Phase 2.5 시맨틱 검증: 실제 "대상 고객 안내" 표현이어야 통과.
	// 기존 룰은 '대상'/'위한'/'입문' substring 만으로 통과 → '대상포진'의 '대상',
	// '입문서'의 '입문' 같은 무관 매치도 통과시켰다.
	// (1) "~을/를 위한" 대상 표현: 누구를 위한 서비스인지 명시.
	// (2) "(수강/이용) 대상: ~" / "대상은 ~" 명시 라벨.
	// (3) 고객군 키워드 + 안내 술어("초보자도 쉽게", "직장인도 환영", "누구나 가능").
	// ---------------------------------------------------------------------

	// 고객군 키워드. 단독 등장만으론 부족하고 (2)/(3) 술어와 함께여야 한다.
	const audienceKeyword =
		/초보자|입문자|누구나|어린이|아이들|성인|직장인|주부|학생|노인|시니어|가족|초심자|전문가|사업자|반려/;
	// "~을 위한" / "~를 위한" 대상 표현 (앞에 고객/명사 어절).
	const forPattern = /[가-힣A-Za-z]{2,}(?:을|를)\s*위한/;
	// "대상: ~" / "수강 대상" / "이용 대상" / "대상은" 명시 라벨.
	const targetLabelPattern =
		/(?:수강|이용|모집|교육|상담|체험|참여)?\s*대상\s*(?:[:：]|은|이|층)/;
	// 고객군 키워드 + 안내/포용 술어.
	const audienceWithPredicate = new RegExp(
		`(${audienceKeyword.source})(?:도|를|을|은|는|께서|분들|님)?\\s*(?:쉽게|환영|가능|추천|위해|맞춤|특화|전용|대상)`,
	);

	let found: string | null = null;
	const forMatch = body.match(forPattern);
	if (forMatch) {
		found = forMatch[0];
	}
	if (found === null) {
		const labelMatch = body.match(targetLabelPattern);
		if (labelMatch) found = labelMatch[0].replace(/\s+/g, " ").trim();
	}
	if (found === null) {
		const audMatch = body.match(audienceWithPredicate);
		if (audMatch) found = audMatch[0].replace(/\s+/g, " ").trim();
	}
	const passed = found !== null;
	return {
		ruleId: "AEO-TARGET-CUSTOMER-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "대상 고객 정보 포함 여부",
		description: passed
			? `대상 고객 관련 표현("${found}")이 본문에 있습니다.`
			: "홈페이지에 어떤 고객을 위한 서비스인지 명시되어 있지 않습니다. 자신이 해당되는지 모르는 방문자는 이탈합니다.",
		evidence: [`URL: ${page.url}`, `대상 고객 표현 발견: ${found ?? "없음"}`],
		recommendation:
			"'초보자도 쉽게', '직장인을 위한', '가족 단위 환영' 같은 대상 고객 설명을 추가하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-DIRECT-ANSWER-001: 짧은 답변 단락(50~200자) 비율
// ---------------------------------------------------------------------------
export const aeoDirectAnswer001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 3 시맨틱 검증: 50~200자 "실제 문장" 단락만 직답형으로 인정.
	// 기존 룰은 50~200자 길이만 보아 입력 폼 placeholder('소개 문구를 입력하세요…'),
	// breadcrumb('홈 > 회사소개 > 인사말 > 연락처'), form-label 조각도 직답 단락으로
	// 카운트 → FP. 비-콘텐츠(breadcrumb/placeholder/form-label) 단락을 거르고,
	// 남은 단락이 splitSentences 기준 실제 문장(종결형)을 담고 있어야 직답형으로 본다.
	// ---------------------------------------------------------------------
	const rawParagraphs = getBodyParagraphs(
		page,
		/\n{2,}|(?<=[.!?])\s+/,
	);

	// breadcrumb 류: 구분자(>·»·/·| 등)가 2개 이상이면 내비게이션 조각.
	const isBreadcrumbLike = (p: string): boolean =>
		(p.match(/[>»›·∙•|/]/g) ?? []).length >= 2;
	const isPlaceholderLike = (p: string): boolean =>
		EXAMPLE_CONTEXT_PATTERN.test(p) || FORM_LABEL_PATTERN.test(p);

	const paragraphs = rawParagraphs.filter(
		(p) => !isBreadcrumbLike(p) && !isPlaceholderLike(p),
	);

	if (paragraphs.length === 0) {
		return {
			ruleId: "AEO-DIRECT-ANSWER-001",
			category: "aeo",
			passed: false,
			severity: "medium",
			title: "직접 답변형 단락 구조",
			description:
				"No body paragraph is available for paragraphLimit=4 scanning. Add readable paragraphs with 1-4 sentences each.",
			evidence: [`URL: ${page.url}`],
			recommendation: "50~200자 길이의 명확한 답변 단락을 작성하세요.",
			actionType: "self_fix",
			difficulty: "medium",
			expectedImpact: "medium",
			ruleWeight: 6,
		};
	}
	// 50~200자이면서 실제 문장(splitSentences 로 분리되는 종결형 문장 ≥1)을 담은 단락만 직답형.
	const directParagraphs = paragraphs.filter((p) => {
		if (p.length < 50 || p.length > 200) return false;
		return splitSentences(p).some((s) => s.trim().length >= 20);
	});
	const ratio = directParagraphs.length / paragraphs.length;
	const passed = ratio >= 0.3; // 30% 이상이 직접 답변형 단락
	return {
		ruleId: "AEO-DIRECT-ANSWER-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "직접 답변형 단락 구조 (50~200자)",
		description: passed
			? `본문 단락 ${paragraphs.length}개 중 ${directParagraphs.length}개(${Math.round(ratio * 100)}%)가 직접 답변형 길이입니다.`
			: "본문 단락 대부분이 너무 길거나 짧습니다. 50~200자의 간결한 답변 단락이 AI 검색에서 인용되기 쉽습니다.",
		evidence: [
			`전체 단락 수: ${paragraphs.length}`,
			`50~200자 단락: ${directParagraphs.length}개 (${Math.round(ratio * 100)}%)`,
		],
		recommendation:
			"각 서비스나 FAQ 항목을 50~200자 단락으로 나눠 설명하세요. 짧고 명확한 문장이 AI 검색 답변으로 활용되기 쉽습니다.",
		actionType: "self_fix",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-LOCAL-SERVICE-001: 지역+서비스 조합 표현 등장
// ---------------------------------------------------------------------------
export const aeoLocalService001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const region = ctx.businessProfile.region;
	const services = ctx.businessProfile.mainServices;
	const bodyLower = page.bodyText.toLowerCase();
	const titleLower = (page.title ?? "").toLowerCase();
	const descLower = (page.description ?? "").toLowerCase();
	const allText = `${titleLower} ${descLower} ${bodyLower.slice(0, 3000)}`;

	if (region === "" || services.length === 0) {
		return {
			ruleId: "AEO-LOCAL-SERVICE-001",
			category: "aeo",
			passed: false,
			severity: "medium",
			title: "지역+서비스 조합 표현 여부",
			description: "지역 또는 서비스 정보가 입력되지 않아 분석할 수 없습니다.",
			evidence: ["businessProfile.region 또는 mainServices 없음"],
			recommendation:
				"진단 요청 시 지역과 주요 서비스를 입력하면 이 항목을 분석할 수 있습니다.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "medium",
			ruleWeight: 6,
		};
	}

	const regionLower = region.toLowerCase();
	const positionsOf = (needle: string): number[] => {
		const out: number[] = [];
		if (needle.length === 0) return out;
		let from = 0;
		while (true) {
			const idx = allText.indexOf(needle, from);
			if (idx === -1) return out;
			out.push(idx);
			from = idx + Math.max(needle.length, 1);
		}
	};
	const regionPositions = positionsOf(regionLower);
	const foundCombinations = services.filter((service) => {
		const serviceLower = service.toLowerCase();
		const servicePositions = positionsOf(serviceLower);
		return regionPositions.some((regionIdx) =>
			servicePositions.some((serviceIdx) => Math.abs(regionIdx - serviceIdx) <= 200),
		);
	});

	const passed = foundCombinations.length > 0;
	return {
		ruleId: "AEO-LOCAL-SERVICE-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "지역+서비스 조합 표현 여부",
		description: passed
			? `"${region} ${foundCombinations[0]}" 같은 지역+서비스 조합이 홈페이지에 표현되어 있습니다.`
			: `"${region} ${services[0]}" 같은 지역+서비스 조합 표현이 없습니다. 지역 기반 검색에서 노출되기 어렵습니다.`,
		evidence: [
			`지역: ${region}`,
			`주요 서비스: ${services.join(", ")}`,
			`발견된 지역+서비스 조합: ${foundCombinations.join(", ") || "없음"}`,
		],
		recommendation: `"${region} ${services[0]}"처럼 지역명과 서비스명을 함께 쓰는 표현을 제목이나 소개 문구에 포함시키세요.`,
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-ANSWER-LENGTH-001: 답변 텍스트 최소 분량 (40자 이상 문장 ≥ 3개)
// ---------------------------------------------------------------------------
export const aeoAnswerLength001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const sentences = splitSentences(page.bodyText)
		.map((s) => s.trim())
		.filter((s) => s.length >= 40);
	const passed = sentences.length >= 3;
	return {
		ruleId: "AEO-ANSWER-LENGTH-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "답변 텍스트 최소 분량 여부 (40자 이상 문장 3개 이상)",
		description: passed
			? `40자 이상의 충분한 답변 문장이 ${sentences.length}개 있습니다.`
			: `40자 이상의 답변 문장이 ${sentences.length}개 뿐입니다. AI 검색 엔진이 인용할 충분한 답변 텍스트가 없습니다.`,
		evidence: [
			`40자 이상 문장: ${sentences.length}개`,
			sentences
				.slice(0, 2)
				.map((s) => `"${s.slice(0, 40)}..."`)
				.join(", ") || "없음",
		],
		recommendation:
			"각 서비스나 안내 항목을 40자 이상의 완전한 문장으로 설명하세요. 짧은 단어 나열보다 완성된 문장이 AI 검색에서 인용되기 쉽습니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-DEFINITION-001: 업종/서비스 정의 문장 존재
// ---------------------------------------------------------------------------
export const aeoDefinition001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const industry = ctx.businessProfile.industry;
	const body = page.bodyText;
	// ---------------------------------------------------------------------
	// Phase 2.5 시맨틱 검증: 실제 "정의 문장 구조"여야 통과.
	// 기존 룰 /입니다\.|이란|란\?/ 은 'X(이)란?' 단편(서술 없음)과 정의 아닌
	// 아무 종결 문장('감사합니다.')도 통과 → FP.
	// 'X(이)란 ... <서술 술어>' 처럼 주제어 + 정의 술어(입니다/말합니다/뜻합니다/
	// 의미합니다/가리킵니다 등)가 한 문장 안에 모두 있어야 한다.
	// 'X란?' 처럼 물음표로 끝나는 단편은 정의가 아니므로 제외.
	// ---------------------------------------------------------------------
	// 'X(이)란 ... <정의 술어>' — 명시적 정의 표지(이란/란/이라 함은) + 같은 문장 안의
	// 서술 술어. 물음표가 끼면([^?\n]) 단편이므로 매치되지 않는다. 단순 종결('감사합니다.')은
	// 정의 표지가 없어 통과하지 못한다.
	const definitionSentence =
		/[가-힣A-Za-z0-9]{1,20}(?:이란|란|이라\s*함은)\s+[^?\n]{4,}?(?:입니다|이에요|예요|말합니다|뜻합니다|뜻은|의미합니다|의미입니다|가리킵니다|지칭합니다|일컫습니다)/;

	const generic = body.match(definitionSentence);
	const found = generic?.[0]?.replace(/\s+/g, " ").trim() ?? null;
	const passed = found !== null;
	return {
		ruleId: "AEO-DEFINITION-001",
		category: "aeo",
		passed,
		severity: "low",
		title: "업종/서비스 정의 문장 존재 여부",
		description: passed
			? `서비스 정의 문장("${found?.slice(0, 40)}...")이 본문에 있습니다. AI 검색이 업체를 설명하기 좋은 구조입니다.`
			: `업종(${industry || "미입력"})이나 서비스에 대한 정의·설명 문장이 없습니다. 'X란 Y입니다' 형태의 설명은 AI 검색에서 직접 인용됩니다.`,
		evidence: [
			`업종: ${industry || "미입력"}`,
			`정의 표현 발견: ${found ? `${found.slice(0, 40)}...` : "없음"}`,
		],
		recommendation:
			"'핸드드립 커피란 원두를 직접 갈아 물을 천천히 부어 추출하는 방식입니다.' 처럼 서비스 정의 문장을 1개 이상 포함하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// AEO-PARAGRAPH-STRUCTURE-001: 단락 수 적절성 (3개 이상)
// ---------------------------------------------------------------------------
export const aeoParagraphStructure001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const paragraphs = getBodyParagraphs(page, /\n{2,}/).filter(
		(p) => p.length >= 30,
	);
	const passed = paragraphs.length >= 3;
	return {
		ruleId: "AEO-PARAGRAPH-STRUCTURE-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "본문 단락 구조 적절성 (3개 이상)",
		description: passed
			? `본문이 ${paragraphs.length}개의 단락으로 잘 구분되어 있습니다.`
			: `본문 단락이 ${paragraphs.length}개로 너무 적습니다. 단락이 없으면 AI 검색 엔진이 정보를 구분하여 인용하기 어렵습니다.`,
		evidence: [`30자 이상 단락 수: ${paragraphs.length}개`],
		recommendation:
			"서비스 소개, 이용 방법, 연락처 등 주제별로 단락을 분리하여 최소 3개 이상의 단락으로 구성하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-AUTHOR-SCHEMA-001: 전문가/작성자 정보 구조화 데이터
// ---------------------------------------------------------------------------
export const aeoAuthorSchema001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;
	// ---------------------------------------------------------------------
	// Phase 3 시맨틱 검증: schema author/Person 우선, 전문가 표현은 문맥 인지.
	// 기존 룰은 /전문가|강사|.../.test(bodyText) 단순 매치 → '전문가를 모집합니다'(채용),
	// '전문가가 아닙니다'(부정), '예: 대표 홍길동'(예시 placeholder) 도 통과 → FP.
	// (1) getSchemaNodes 평탄화 후 author 키 또는 Person 노드 → 즉시 통과.
	// (2) 본문 전문가 표현이 부정/예시/form-label/채용공고 문맥이 아닌 실제 문장에 등장.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasAuthor =
		anyNodeHasPresentKey(nodes, "author") ||
		nodes.some((n) => nodeTypeIncludes(n, "Person"));

	// 전문가/운영자 표현. 채용공고('모집/채용/구합니다') 문맥은 운영자 소개가 아니다.
	const expertPattern =
		/전문가|강사|대표|원장|셰프|코치|컨설턴트|디자이너|개발자|수석|경력/g;
	const HIRING_PATTERN = /모집|채용|구인|구합니다|지원\s*자격|채용\s*공고/;
	let hasExpertText = false;
	for (const m of body.matchAll(expertPattern)) {
		const idx = m.index ?? 0;
		if (hasNegationAround(body, idx, 25)) continue;
		if (hasExampleContextAround(body, idx)) continue;
		if (hasFormLabelAround(body, idx)) continue;
		if (hasPatternAround(body, idx, HIRING_PATTERN, 25)) continue;
		hasExpertText = true;
		break;
	}
	const passed = hasAuthor || hasExpertText;
	return {
		ruleId: "AEO-AUTHOR-SCHEMA-001",
		category: "aeo",
		passed,
		severity: "low",
		title: "전문가/운영자 정보 존재 여부",
		description: passed
			? "전문가 또는 운영자 정보가 홈페이지에 있습니다. 신뢰도와 전문성이 높아집니다."
			: "전문가나 운영자 소개가 없습니다. 누가 운영하는지 알 수 없으면 AI 검색에서 신뢰 점수가 낮아집니다.",
		evidence: [
			`Person Schema: ${hasAuthor ? "있음" : "없음"}`,
			`전문가 표현: ${hasExpertText ? "있음" : "없음"}`,
		],
		recommendation:
			"대표자나 담당자 소개를 짧게 추가하세요. '10년 경력의 홍길동 대표가 운영합니다' 같은 문장이면 충분합니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// AEO-LIST-FORMAT-001: 목록(리스트) 형식 정보 제공
// ---------------------------------------------------------------------------
export const aeoListFormat001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 3 시맨틱 검증: 실제 <ul>/<ol> 구조(listTableCount) 우선.
	// 기존 룰은 bodyText 줄-시작 불릿/번호 정규식만 보아 '- 5,000원'(가격 대시),
	// '1. 첫 방문 시' 같은 산문도 목록으로 오인 → FP. 파서가 집계한 ul/ol 가 있으면
	// 그 값을 신뢰하고, 없을 때만(구버전 파서) 정규식 폴백을 쓴다.
	// ---------------------------------------------------------------------
	const listPattern = /^[\s]*[•▪▸◦]\s|^[\s]*\d+[.)]\s/m;
	let passed: boolean;
	if (page.listTableCount !== undefined) {
		passed = page.listTableCount.ul + page.listTableCount.ol >= 1;
	} else {
		passed = listPattern.test(page.bodyText);
	}
	return {
		ruleId: "AEO-LIST-FORMAT-001",
		category: "aeo",
		passed,
		severity: "low",
		title: "목록(리스트) 형식 정보 제공 여부",
		description: passed
			? "번호 목록이나 불릿 목록 형식의 정보가 있습니다. AI 검색이 목록 항목을 직접 인용하기 쉽습니다."
			: "목록(번호/불릿) 형식의 정보가 없습니다. 서비스 특징이나 이용 방법을 목록으로 나열하면 AI 검색에서 인용되기 좋습니다.",
		evidence: [
			`URL: ${page.url}`,
			`목록 형식 감지: ${passed ? "있음" : "없음"}`,
		],
		recommendation:
			"서비스 특징, 이용 절차, 주의 사항 등을 번호 또는 불릿 목록으로 작성하세요. '1. 예약 2. 방문 3. 서비스' 형태면 됩니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// AEO-DATE-RECENT-001: 최신 정보 제공 여부 (날짜 표기)
// ---------------------------------------------------------------------------
export const aeoDateRecent001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;
	// ---------------------------------------------------------------------
	// Phase 2.5 시맨틱 검증: 실제 "최신성 신호"여야 통과.
	// 기존 룰 /202[0-9]년|최신|.../ 은 '© 2025'(저작권 연도), '2021년 창업'(과거 서술)
	// 에도 매치 → FP.
	// (1) schema datePublished/dateModified → 즉시 통과.
	// (2) meta lastModified(og:updated_time 등) → 통과.
	// (3) 본문 신선도 라벨(최종 업데이트/갱신/최신/기준) + 인접 최신 연도(202[0-9]).
	//     단, 저작권(© / copyright) · 과거-게시(창업/설립/since) 문맥의 연도는 제외.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasSchemaDate = anyNodeHasPresentKey(
		nodes,
		"datePublished",
		"dateModified",
	);
	const hasLastModified =
		page.lastModified !== null &&
		page.lastModified !== undefined &&
		page.lastModified !== "";

	// 신선도 라벨이 최신 연도(202[0-9]) 인접에 등장 (라벨↔연도 순서 무관, ±40자).
	const yearPattern = /20(?:2[0-9]|3[0-9])\s*[년.\-/]/g;
	let bodySignal: string | null = null;
	for (const m of body.matchAll(yearPattern)) {
		const idx = m.index ?? 0;
		// 저작권/과거-게시 문맥의 연도는 신선도가 아니다.
		if (hasPatternAround(body, idx, COPYRIGHT_PATTERN, 25)) continue;
		if (hasPatternAround(body, idx, PAST_PUBLISH_PATTERN, 25)) continue;
		// 신선도 라벨이 인접해야 "업데이트/기준" 으로 인정.
		if (!hasPatternAround(body, idx, FRESHNESS_LABEL_PATTERN, 40)) continue;
		bodySignal = m[0].trim();
		break;
	}

	const passed = hasSchemaDate || hasLastModified || bodySignal !== null;
	const found = hasSchemaDate
		? "schema datePublished/dateModified"
		: hasLastModified
			? (page.lastModified ?? null)
			: bodySignal;
	return {
		ruleId: "AEO-DATE-RECENT-001",
		category: "aeo",
		passed,
		severity: "low",
		title: "최신 정보 제공 여부 (날짜/최신성 표기)",
		description: passed
			? `최신 정보 표기("${found}")가 있습니다. AI 검색 엔진은 최신 정보를 선호합니다.`
			: "최근 업데이트 날짜나 최신 정보 표기가 없습니다. AI 검색 엔진은 최신 콘텐츠를 더 신뢰합니다.",
		evidence: [`최신성 표기 발견: ${found ?? "없음"}`],
		recommendation:
			"'2025년 기준', '최근 업데이트' 등 최신성을 나타내는 표현을 추가하거나 콘텐츠를 정기적으로 갱신하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// AEO-CONTACT-DIRECT-001: 직접 연락 수단 명확성 (전화/카카오 등)
// ---------------------------------------------------------------------------
export const aeoContactDirect001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;
	const region = ctx.businessProfile.region;

	// ---------------------------------------------------------------------
	// Phase 2 시맨틱 검증: 실제 "연락 가능한" 전화/카카오 신호가 있어야 통과.
	// 기존 룰은 raw /\d{2,4}-\d{3,4}-\d{4}/ 로 '010-0000-0000'(placeholder),
	// '02-000-0000'(부정 문맥), '예시) 010-...' 등을 연락처로 카운트 → FP.
	// (1) schema telephone → 즉시 통과.
	// (2) extractPhones 로 추출 후 example 문맥 + 지역코드 불일치 전화 제외.
	// (3) 카카오/오픈채팅 표기.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasSchemaTel = nodes.some((n) => getTelephone(n) !== null);
	const hasTelLink = (page.contactLinks ?? []).some((link) => link.kind === "tel");
	const hasMailtoLink = (page.contactLinks ?? []).some(
		(link) => link.kind === "mailto",
	);

	const realPhones = extractPhones(body).filter((p) => {
		const idx = body.indexOf(p.raw);
		// example/placeholder 문맥(예시·sample·000-0000 등)이면 제외.
		if (idx !== -1 && hasExampleContextAround(body, idx)) return false;
		// 지역코드가 입력된 region 과 명백히 어긋나면 제외 (모바일/대표번호/미지정은 통과).
		if (!areaCodeMatchesRegion(p.areaCode, region)) return false;
		return true;
	});
	const hasPhone = hasSchemaTel || realPhones.length > 0 || hasTelLink;

	const channelLinkPattern =
		/(pf\.kakao\.com|open\.kakao\.com|kakao\.com\/(?:ch|talk)|talk\.naver|line\.me|instagram\.com|facebook\.com|t\.me|wa\.me)/i;
	const hasChannelLink = page.externalLinks.some((l) =>
		channelLinkPattern.test(l),
	);
	const channelKeyword =
		/카카오\s*채널|카카오톡|카톡\s*(?:문의|상담|예약|채널|오픈채팅)|오픈채팅|open.?chat|네이버\s*톡톡|인스타\s*DM|텔레그램/gi;
	let hasKakao = hasChannelLink;
	for (const m of body.matchAll(channelKeyword)) {
		const idx = m.index ?? 0;
		if (hasExampleContextAround(body, idx)) continue;
		hasKakao = true;
		break;
	}
	const passed = hasPhone || hasMailtoLink || hasKakao;
	return {
		ruleId: "AEO-CONTACT-DIRECT-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "직접 연락 수단 명확성 (전화/메일/카카오)",
		description: passed
			? `직접 연락 수단(전화: ${hasPhone ? "✓" : "✗"}, 메일: ${hasMailtoLink ? "✓" : "✗"}, 카카오: ${hasKakao ? "✓" : "✗"})이 확인됩니다.`
			: "전화번호, 이메일, 카카오 채널 등 즉시 연락 가능한 수단이 없습니다. AI 검색 결과에서 '연락처'를 찾는 사용자가 이탈합니다.",
		evidence: [
			`전화번호: ${hasPhone ? "있음" : "없음"}`,
			`mailto 링크: ${hasMailtoLink ? "있음" : "없음"}`,
			`카카오채널: ${hasKakao ? "있음" : "없음"}`,
		],
		recommendation:
			"전화번호, 이메일 또는 카카오 오픈채팅 링크를 홈페이지 상단(헤더)에 잘 보이도록 배치하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-TESTIMONIAL-001: 고객 후기/증언 텍스트 존재
// ---------------------------------------------------------------------------
export const aeoTestimonial001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;
	// ---------------------------------------------------------------------
	// Phase 2.5 시맨틱 검증 (HIGHEST PRIORITY): 실제 "고객 증언" 이어야 통과.
	// 기존 룰 /후기|리뷰|추천사|.../ 은 '리뷰 작성 안내'(작성 안내), '리뷰 정책'(정책),
	// '후기가 없습니다'(부정), '후기 이벤트'(모집) 같은 비-증언 문맥도 통과 → FP.
	// (1) schema Review 노드 또는 AggregateRating(평점/리뷰 수) → 즉시 통과.
	// (2) 본문: 후기 표지(후기/리뷰/고객님/추천사) 또는 긍정 평가 술어가
	//     안내/정책/부정 문맥이 아닌 실제 문장에 등장.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasReviewSchema = nodes.some((n) => {
		if (nodeTypeIncludes(n, "Review")) return true;
		// review 키(단일/배열)로 Review 가 중첩된 경우.
		if (isPresent(n.review)) return true;
		// AggregateRating: 실제 평점/리뷰 수가 있으면 사회적 증거로 인정.
		const ar = getAggregateRating(n);
		if (ar && (isPresent(ar.ratingValue) || isPresent(ar.reviewCount) || isPresent(ar.ratingCount)))
			return true;
		return false;
	});

	// 후기 표지어 + 긍정 평가 술어. 안내/정책/부정 문맥이면 제외.
	const markerPattern = /후기|리뷰|추천사|고객님|방문\s*후기|이용\s*후기/g;
	let bodySignal: string | null = null;
	if (!hasReviewSchema) {
		for (const m of body.matchAll(markerPattern)) {
			const idx = m.index ?? 0;
			// 작성 안내·정책·이벤트(모집) 문맥이면 실제 증언이 아니다.
			if (hasPatternAround(body, idx, TESTIMONIAL_INSTRUCTION_PATTERN, 35)) continue;
			// 부정(없습니다/아닙니다) 문맥이면 제외.
			if (hasNegationAround(body, idx, 30)) continue;
			if (hasExampleContextAround(body, idx)) continue;
			// 표지 주변에 긍정 평가 술어가 있어야 실제 후기로 인정 (인용부호 포함 ±60자).
			if (!hasPatternAround(body, idx, TESTIMONIAL_PRAISE_PATTERN, 60)) continue;
			bodySignal = m[0].trim();
			break;
		}
	}

	const passed = hasReviewSchema || bodySignal !== null;
	const found = hasReviewSchema ? "schema Review/AggregateRating" : bodySignal;
	return {
		ruleId: "AEO-TESTIMONIAL-001",
		category: "aeo",
		passed,
		severity: "low",
		title: "고객 후기/증언 텍스트 존재 여부",
		description: passed
			? `고객 후기 관련 표현("${found}")이 있습니다. 사회적 증거가 AI 검색 신뢰도를 높입니다.`
			: "고객 후기나 추천사가 없습니다. 실제 고객의 경험담은 AI 검색에서 신뢰할 수 있는 정보로 활용됩니다.",
		evidence: [`후기 관련 표현 발견: ${found ?? "없음"}`],
		recommendation:
			"실제 고객 후기 2~3개를 홈페이지에 추가하세요. 짧더라도 '대만족이에요', '또 방문할게요' 같은 진짜 반응이면 충분합니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// AEO-QA-PAIR-MARKUP-001: Q&A 쌍 마크업 존재 (H 태그 질문 + 바로 뒤 단락 답변)
// ---------------------------------------------------------------------------
export const aeoQaPairMarkup001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 3 시맨틱 검증: "질문 + 실제 답변" 쌍이어야 통과.
	// 기존 룰은 물음표로 끝나는 H2 단순 존재만으로 통과 → 답변 없는 수사적 질문
	// ('우리가 왜 다를까요?' 슬로건)도 Q&A 쌍으로 카운트 → FP.
	// (1) schema FAQPage.mainEntity[Question].acceptedAnswer(.text) → 즉시 통과.
	// (2) headingStructure 순서상 "질문형 heading 바로 다음에 답변 콘텐츠"가 있어야 한다.
	//     - 다음 항목이 같은/더 깊은 레벨의 또 다른 질문 heading 이면 답변이 비어 있다고 본다.
	//     - 마지막 heading 이 질문이면 그 뒤 본문 답변 문장(40자+)이 있어야 인정.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	let schemaQaPairs = 0;
	for (const n of nodes) {
		if (!isFaqPageNode(n)) continue;
		const main = n.mainEntity;
		const entities = Array.isArray(main) ? main : main ? [main] : [];
		for (const q of entities) {
			if (!q || typeof q !== "object") continue;
			const qr = q as Record<string, unknown>;
			if (!nodeTypeIncludes(qr, "Question")) continue;
			const ans = qr.acceptedAnswer ?? qr.suggestedAnswer;
			const ansText =
				ans && typeof ans === "object"
					? (ans as Record<string, unknown>).text
					: ans;
			if (isPresent(qr.name) && isPresent(ansText)) schemaQaPairs += 1;
		}
	}

	// 본문 답변 문장(40자 이상)이 최소 1개라도 있는지 — 질문 heading 뒤 답변 신호.
	const bodyAnswerSentences = splitSentences(page.bodyText).filter(
		(s) => s.trim().length >= 40,
	).length;

	const structure = page.headingStructure ?? [];
	let structuralPairs = 0;
	if (structure.length > 0) {
		for (let i = 0; i < structure.length; i++) {
			const h = structure[i]!;
			if (!isQuestionHeading(h.text)) continue;
			const next = structure[i + 1];
			if (next === undefined) {
				// 마지막 heading 이 질문 → 그 뒤 본문 답변 문장이 있으면 답변으로 인정.
				if (bodyAnswerSentences >= 1) structuralPairs += 1;
			} else if (!isQuestionHeading(next.text) || next.level > h.level) {
				// 다음이 또 다른 질문(같은 레벨)이 아니면 그 사이에 답변 콘텐츠가 있다고 본다.
				structuralPairs += 1;
			}
		}
	}

	// headingStructure 가 없는 경우(구버전 파서) 폴백: 질문형 H2 + 충분한 본문 답변.
	const questionH2 = page.h2.filter((h) => isQuestionHeading(h.trim()));
	const fallbackPairs =
		structure.length === 0 && questionH2.length >= 1 && bodyAnswerSentences >= 1
			? questionH2.length
			: 0;

	const qaPairs = schemaQaPairs + structuralPairs + fallbackPairs;
	const passed = qaPairs >= 1;
	return {
		ruleId: "AEO-QA-PAIR-MARKUP-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "Q&A 쌍 마크업 구조 여부 (질문형 H2 + 답변 단락)",
		description: passed
			? `질문 + 답변 Q&A 쌍이 ${qaPairs}개 확인됩니다 (schema ${schemaQaPairs} / 구조 ${structuralPairs + fallbackPairs}).`
			: "질문 뒤에 답변이 이어지는 Q&A 쌍이 없습니다. '질문(H2) → 답변(단락)' 구조는 AI 검색이 직접 답변을 추출하기 가장 쉬운 형식입니다.",
		evidence: [
			`Q&A 쌍 수: ${qaPairs}개`,
			`schema FAQPage Q&A: ${schemaQaPairs}개`,
			...questionH2.slice(0, 2).map((h) => `질문형 H2: "${h}"`),
		],
		recommendation:
			"'가격이 얼마인가요?' '예약은 어떻게 하나요?' 같이 물음표로 끝나는 H2를 만들고 바로 아래에 답변 단락을 작성하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-ORG-ANSWER-001: 업체 대표 답변 문장 존재 (1인칭/운영자 시점)
// ---------------------------------------------------------------------------
export const aeoOrgAnswer001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;
	const orgPattern =
		/저희|우리 가게|저는|대표|원장|저희 업체|저희 매장|운영하고 있|운영 중|함께합니다|도와드립니다/g;

	// ---------------------------------------------------------------------
	// Phase 2 시맨틱 검증: "이 업체의" 1인칭/운영자 답변이어야 통과.
	// 기존 룰은 raw '저희/우리/대표' 가 경쟁사 bio·소개글 작성 예시·사이드바에
	// 등장해도 통과 → FP.
	// (1) schema Organization.name 이 businessProfile.businessName 과 매칭되면
	//     이 업체의 정체성이 구조화 노출된 것 → 즉시 통과.
	// (2) 본문 1인칭 표현이 example/placeholder 문맥이 아닌 실제 문장에 등장.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const nameVariants = ctx.businessProfile.businessName
		? normalizeBusinessName(ctx.businessProfile.businessName).variants
		: [];
	const hasSchemaOrgName = nodes.some((n) => {
		if (!isOrganizationNode(n)) return false;
		const nm = getName(n);
		if (!nm) return false;
		const nmNorm = normalizeBusinessName(nm).variants;
		return nameVariants.some((v) =>
			nmNorm.some((w) => w.includes(v) || v.includes(w)),
		);
	});

	let found: string | null = null;
	if (!hasSchemaOrgName) {
		for (const m of body.matchAll(orgPattern)) {
			const idx = m.index ?? 0;
			if (hasExampleContextAround(body, idx)) continue;
			if (hasNegationAround(body, idx)) continue;
			found = m[0];
			break;
		}
	}
	const passed = hasSchemaOrgName || found !== null;
	const foundLabel = hasSchemaOrgName
		? "schema Organization.name"
		: (found ?? null);
	return {
		ruleId: "AEO-ORG-ANSWER-001",
		category: "aeo",
		passed,
		severity: "low",
		title: "업체 운영자 시점 답변 문장 존재 여부",
		description: passed
			? `운영자 시점 신호("${foundLabel}")가 있습니다. 업체의 목소리가 담긴 콘텐츠입니다.`
			: "업체가 직접 설명하는 1인칭 표현이 없습니다. '저희 가게에서는', '대표가 직접' 같은 표현은 AI 검색에서 업체만의 고유한 답변으로 인용됩니다.",
		evidence: [`운영자 시점 신호 발견: ${foundLabel ?? "없음"}`],
		recommendation:
			"'저희 카페는 원두를 직접 로스팅합니다', '대표가 직접 상담해드립니다' 같은 업체의 목소리를 담은 문장을 1~2개 추가하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ===========================================================================
// Phase O-D 신규 AEO 룰 (+10개) — 룰 깊이 보강
// ===========================================================================

// ---------------------------------------------------------------------------
// AEO-DIRECT-ANSWER-PARAGRAPH-001: 첫 단락이 페이지 주제에 대한 직답형 (40~200자, 정의 문장 포함)
// ---------------------------------------------------------------------------
export const aeoDirectAnswerParagraph001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 2 시맨틱 검증: "실제 본문" 첫 단락이 직답형이어야 통과.
	// 기존 룰은 40~200자 + 정의 패턴만 보아 입력 폼 placeholder('소개 문구를
	// 입력하세요...'), breadcrumb('홈 > 소개 > ...') 같은 비-콘텐츠 조각도 통과 → FP.
	// breadcrumb(구분자 >·»·/ 다수) / placeholder·form-label·example 조각은
	// "실제 직답 단락" 후보에서 제외하고, 남은 첫 단락에 길이+정의 신호를 본다.
	// ---------------------------------------------------------------------
	const paragraphs = getBodyParagraphs(
		page,
		/\n{2,}|(?<=[.!?。])\s+/,
	).filter((p) => p.length >= 30);

	// breadcrumb 류: '>' '»' '/' 또는 '·' 구분자가 2개 이상이고 종결부호가 없는 내비게이션 조각.
	const isBreadcrumbLike = (p: string): boolean => {
		const sepCount = (p.match(/[>»›·∙•|/]/g) ?? []).length;
		return sepCount >= 2;
	};
	const isPlaceholderLike = (p: string): boolean =>
		EXAMPLE_CONTEXT_PATTERN.test(p) || FORM_LABEL_PATTERN.test(p);

	const contentParagraphs = paragraphs.filter(
		(p) => !isBreadcrumbLike(p) && !isPlaceholderLike(p),
	);

	if (contentParagraphs.length === 0) {
		return {
			ruleId: "AEO-DIRECT-ANSWER-PARAGRAPH-001",
			category: "aeo",
			passed: false,
			severity: "medium",
			title: "첫 단락 직답형 구조",
			description:
				"직답형 단락으로 분석할 실제 본문 단락이 없습니다 (입력 폼/breadcrumb 등 비-콘텐츠만 감지).",
			evidence: [`URL: ${page.url}`],
			recommendation:
				"페이지 시작 부분에 40~200자 길이의 직답형 단락을 작성하세요.",
			actionType: "self_fix",
			difficulty: "medium",
			expectedImpact: "medium",
			ruleWeight: 6,
		};
	}
	const firstPara = contentParagraphs[0]!;
	const lengthOk = firstPara.length >= 40 && firstPara.length <= 200;
	// 정의/직답 신호: '~는', '~란', '~입니다', '~예요', 업체명+서비스명 등장
	const definitionPattern =
		/이란|란\s|는\s|은\s|입니다|예요|이에요|입니다\.|을 제공|를 제공|을 운영|를 운영/;
	const hasDefinition = definitionPattern.test(firstPara);
	const passed = lengthOk && hasDefinition;
	return {
		ruleId: "AEO-DIRECT-ANSWER-PARAGRAPH-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "첫 단락 직답형 구조 (40~200자 + 정의 문장)",
		description: passed
			? `첫 단락(${firstPara.length}자)이 직답형 구조를 갖추고 있습니다.`
			: !lengthOk
				? `첫 단락 길이(${firstPara.length}자)가 권장 범위(40~200자)에서 벗어납니다.`
				: "첫 단락에 직답형 정의 문장이 없습니다. AI 검색은 페이지 첫 단락을 답변으로 자주 인용합니다.",
		evidence: [
			`첫 단락 길이: ${firstPara.length}자`,
			`정의 표현: ${hasDefinition ? "있음" : "없음"}`,
			`첫 단락 일부: "${firstPara.slice(0, 60)}..."`,
		],
		recommendation:
			"페이지 맨 위에 '저희 [업체명]은 [지역]의 [서비스]를 제공하는 [업종]입니다' 형태의 40~200자 직답형 단락을 배치하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-LIST-AND-TABLE-001: 콘텐츠에 ul/ol/table 1개 이상 (AI 인용 친화)
// ---------------------------------------------------------------------------
export const aeoListAndTable001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const counts = page.listTableCount ?? { ul: 0, ol: 0, table: 0 };
	const total = counts.ul + counts.ol + counts.table;
	// listTableCount가 없으면 bodyText에서 패턴 fallback
	let fallbackTotal = total;
	if (page.listTableCount === undefined) {
		const listPattern = /^[\s]*[•\-▪▸◦]\s|^[\s]*\d+[.)\s]\s/m;
		fallbackTotal = listPattern.test(page.bodyText) ? 1 : 0;
	}
	const passed =
		(page.listTableCount !== undefined ? total : fallbackTotal) >= 1;
	return {
		ruleId: "AEO-LIST-AND-TABLE-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "목록(ul/ol)/표(table) 요소 1개 이상 존재 여부",
		description: passed
			? `목록/표 요소(ul: ${counts.ul}, ol: ${counts.ol}, table: ${counts.table})가 ${total}개 사용되고 있습니다.`
			: "목록(ul/ol)이나 표(table) 요소가 없습니다. AI 검색은 목록과 표 형태의 정보를 답변으로 직접 인용하기를 선호합니다.",
		evidence: [
			`ul: ${counts.ul}개`,
			`ol: ${counts.ol}개`,
			`table: ${counts.table}개`,
		],
		recommendation:
			"서비스 특징, 이용 방법, 가격표 등을 ul/ol/table 태그로 구조화하도록 업체에 요청하세요. AI 검색이 그대로 인용하기 좋습니다.",
		actionType: "vendor_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-SCANNABLE-001: 본문 단락 평균 길이 ≤ 4문장 (스캔 가능성)
// ---------------------------------------------------------------------------
export const aeoScannable001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const paragraphs = getBodyParagraphs(page, /\n{2,}/).filter(
		(p) => p.length >= 30,
	);
	if (paragraphs.length === 0) {
		return {
			ruleId: "AEO-SCANNABLE-001",
			category: "aeo",
			passed: false,
			severity: "low",
			title: "본문 단락 스캔 가능성 (평균 4문장 이하)",
			description: "분석 가능한 본문 단락이 없습니다.",
			evidence: [`URL: ${page.url}`],
			recommendation:
				"단락을 4문장 이하로 짧게 유지하여 스캔하기 쉽게 작성하세요.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "low",
			ruleWeight: 3,
		};
	}
	const sentenceCounts = paragraphs.map(
		(p) => splitSentences(p).filter((s) => s.trim().length > 0).length,
	);
	const avgSentences =
		sentenceCounts.reduce((sum, c) => sum + c, 0) / sentenceCounts.length;
	const passed = avgSentences <= 4;
	return {
		ruleId: "AEO-SCANNABLE-001",
		category: "aeo",
		passed,
		severity: "low",
		title: "본문 단락 스캔 가능성 (평균 4문장 이하)",
		description: passed
			? `paragraphLimit=4 is satisfied: average sentences per paragraph is ${avgSentences.toFixed(1)}.`
			: `paragraphLimit=4 is exceeded: average sentences per paragraph is ${avgSentences.toFixed(1)}, so paragraphs must be split into 4 sentences or fewer.`,
		evidence: [
			`분석 단락 수: ${paragraphs.length}개`,
			`평균 문장 수/단락: ${avgSentences.toFixed(1)}개`,
		],
		recommendation:
			"paragraphLimit=4: split any long paragraph into blocks of 4 sentences or fewer, keep one topic per paragraph, and insert blank lines between problem, service, price, and booking details.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// AEO-NUMERIC-FACTS-001: 본문에 숫자/통계/수치 포함 (신뢰성 + AI 인용)
// ---------------------------------------------------------------------------
export const aeoNumericFacts001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;
	// ---------------------------------------------------------------------
	// Phase 3 시맨틱 검증: "서비스/가격/통계 맥락" 수치만 인정.
	// 기존 룰은 전화번호(02-123-4567 의 '4567' 같은 숫자)·연도('2021년')·
	// 주소 번지('강남구 123-45')의 숫자도 잡아 FP. 의미 있는 수치(통계/가격/실적)만
	// 카운트하도록 (a) 전화번호 형태(\d-\d-\d) 주변·(b) 단순 연도('2021년' = 4자리 연도)·
	// (c) 주소 번지 맥락의 숫자를 제외한다.
	// ---------------------------------------------------------------------
	// 4자리 연도(20xx/19xx) 단독 표기는 통계가 아니라 날짜 → 제외 대상.
	const isYearLike = (numStr: string): boolean =>
		/^(?:19|20)\d{2}$/.test(numStr.replace(/[,\s]/g, ""));

	// 전화/주소 번지 맥락: 매치 위치 ±radius 에 'NN-NNN-NNNN' 전화 형태 또는
	// 주소(번지/길/로/동/호) 키워드가 있으면 통계 수치가 아니다.
	const PHONE_SHAPE = /\d{2,4}\s*-\s*\d{3,4}\s*-\s*\d{4}/;
	const ADDRESS_SHAPE =
		/\d+\s*-\s*\d+\s*(?:번지|번길)|\d+\s*(?:번지|번길|호\b)|(?:로|길)\s*\d+\b/;
	const hasPhoneOrAddressAround = (idx: number): boolean =>
		hasPatternAround(body, idx, PHONE_SHAPE, 14) ||
		hasPatternAround(body, idx, ADDRESS_SHAPE, 14);

	// 의미 있는 수치 패턴: 퍼센트, 기간(년/개월/주), 가격(원/만원), 수량(명/개…),
	// 소요시간(N분/시간 + 소요/이내…), 경력. 각 매치마다 전화/주소/연도 맥락이면 무효.
	// 통화/수량 단위 뒤는 한글 조사(이며/의/은/는…)가 흔하므로 lookahead 로 막지 않는다.
	// 대신 숫자 접두를 요구해 단어 일부 매치('분석'의 분 등)를 배제한다.
	const numericPatterns: RegExp[] = [
		/\d[\d,]*\s*%|\d[\d,]*\s*퍼센트/g,
		/\d[\d,]*\s*(?:년|개월|주)/g,
		/\d[\d,]*\s*(?:만원|천원|원)/g,
		/\d[\d,]*\s*(?:명|개|가지|곳|회|건|점)/g,
		/\d[\d,]*\s*(?:분|시간)\s*(?:소요|이내|이상|이하)/g,
		/\d[\d,]*\s*년\s*경력/g,
	];

	// 모호한 수량 단위(kind 3: 명/개/가지/곳/회/건/점)는 게시글 수·조회수·메뉴 가짓수
	// 나열에 그대로 등장해 FP 를 만든다. 이 단위는 주변에 실제 서비스/실적/이용
	// 맥락(FACT_ANCHOR)이 인접할 때만 '의미 있는 수치'로 인정한다.
	const REQUIRES_ANCHOR_KIND = 3;

	const matchedKinds = new Set<number>();
	const matchedSamples: string[] = [];
	numericPatterns.forEach((re, kind) => {
		for (const m of body.matchAll(re)) {
			const idx = m.index ?? 0;
			const numStr = (m[0].match(/\d[\d,]*/) ?? [""])[0];
			// 기간 패턴(kind 1)에서 4자리 연도('2021년')는 통계가 아니므로 제외.
			if (kind === 1 && isYearLike(numStr)) continue;
			if (hasPhoneOrAddressAround(idx)) continue;
			// per-instance 문맥 재검증: 부정/예시 또는 네비/조회수/게시글번호 같은
			// 비-사실 맥락에 있는 숫자는 통계가 아니다.
			if (hasNegationAround(body, idx) || hasNonFactContextAround(body, idx))
				continue;
			// 모호한 수량 단위(kind 3)는 사실 앵커가 인접할 때만 인정.
			if (kind === REQUIRES_ANCHOR_KIND && !hasFactAnchorAround(body, idx))
				continue;
			matchedKinds.add(kind);
			if (matchedSamples.length < 3) matchedSamples.push(m[0].trim());
			break; // 같은 종류 1회만 카운트
		}
	});
	const matchCount = matchedKinds.size;
	const passed = matchCount >= 2;
	return {
		ruleId: "AEO-NUMERIC-FACTS-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "본문 숫자/통계 표기 포함 여부",
		description: passed
			? `본문에 의미 있는 숫자 표기(${matchCount}종류 패턴)가 포함되어 있습니다.`
			: "본문에 숫자, 퍼센트, 기간 같은 구체적 수치가 부족합니다. AI 검색은 구체적 수치를 인용하기를 선호합니다.",
		evidence: [
			`수치 패턴 매치 수: ${matchCount}/${numericPatterns.length}`,
			`발견된 수치: ${matchedSamples.join(", ") || "없음"}`,
		],
		recommendation:
			"'10년 경력', '만족도 95%', '월 200명 이용' 같이 구체적 수치를 본문에 자연스럽게 포함하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-AUTHOR-ATTRIBUTION-001: 글쓴이 (author) 명시 (사람 이름 또는 schema)
// ---------------------------------------------------------------------------
export const aeoAuthorAttribution001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasAuthorSchema =
		anyNodeHasPresentKey(nodes, "author") ||
		nodes.some((node) => nodeTypeIncludes(node, "Person"));
	// ---------------------------------------------------------------------
	// Phase 2 시맨틱 검증: 사람 작성자(E-E-A-T)여야 통과.
	// 기존 룰은 raw '작성자'/'by X' 가 guest 작성자 입력란('작성자: (입력란)'),
	// 도구 크레딧('by GPT'), form-label 에 등장해도 통과 → FP.
	// (1) schema author/Person → 즉시 통과.
	// (2) 본문 작성자 표기가 form-label/tool-credit/example 문맥이 아닌 실제 문장.
	// ---------------------------------------------------------------------
	const body = page.bodyText;
	const authorTextPattern =
		/글쓴이|작성자|by\s+[가-힣A-Za-z]+|대표\s*[가-힣]{2,4}|원장\s*[가-힣]{2,4}|강사\s*[가-힣]{2,4}/g;
	let hasAuthorText = false;
	for (const m of body.matchAll(authorTextPattern)) {
		const idx = m.index ?? 0;
		// 'by GPT' 같은 도구 크레딧은 사람 작성자 신호가 아니므로 매치 자체를 거른다.
		if (TOOL_CREDIT_PATTERN.test(m[0])) continue;
		const from = Math.max(0, idx - 30);
		const to = Math.min(body.length, idx + 30);
		const around = body.slice(from, to);
		if (TOOL_CREDIT_PATTERN.test(around)) continue;
		if (hasFormLabelAround(body, idx)) continue;
		if (hasExampleContextAround(body, idx)) continue;
		hasAuthorText = true;
		break;
	}
	const passed = hasAuthorSchema || hasAuthorText;
	return {
		ruleId: "AEO-AUTHOR-ATTRIBUTION-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "글쓴이/작성자 명시 여부",
		description: passed
			? "작성자 정보(schema 또는 본문 표기)가 명시되어 있습니다. E-E-A-T 신뢰도가 올라갑니다."
			: "글쓴이/작성자 정보가 명시되어 있지 않습니다. 누가 만든 콘텐츠인지 모르면 AI 검색은 신뢰도를 낮게 평가합니다.",
		evidence: [
			`author schema: ${hasAuthorSchema ? "있음" : "없음"}`,
			`본문 작성자 표기: ${hasAuthorText ? "있음" : "없음"}`,
		],
		recommendation:
			"글/페이지 끝이나 '소개' 섹션에 '작성자: 홍길동 대표' 같이 사람 이름을 명시하세요. 가능하면 Person JSON-LD도 추가하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-LAST-UPDATED-001: 콘텐츠 마지막 업데이트 날짜 노출
// ---------------------------------------------------------------------------
export const aeoLastUpdated001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 2 시맨틱 검증: 진짜 "업데이트 날짜"여야 통과.
	// 기존 룰은 raw 날짜 정규식이 '© 2025'(저작권), '2024 게시'(과거 게시일),
	// '수정일 입력'(form-label) 에도 매치 → FP.
	// (1) schema dateModified → 즉시 통과.
	// (2) meta lastModified (og:updated_time / article:modified_time) → 통과.
	// (3) 본문 '최종 수정/업데이트/수정일' 라벨 + 인접 날짜.
	//     단, copyright/form-label/example 문맥은 제외.
	// ---------------------------------------------------------------------
	const body = page.bodyText;
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasSchemaDateModified = anyNodeHasPresentKey(nodes, "dateModified");

	// ParsedPage.lastModified (meta) — og:updated_time / article:modified_time / Last-Modified
	const hasLastModified =
		page.lastModified !== null &&
		page.lastModified !== undefined &&
		page.lastModified !== "";

	// '수정일/최종 수정/업데이트' 신선도 라벨이 "근접한" 날짜(YYYY-MM-DD 등)와 함께
	// 등장해야 함. 라벨과 날짜가 한 토큰으로 붙어 있어야 하는 건 아니다 —
	// 테이블/구조화 마크업에서 '최종 수정 | 2025-01-10', '수정일\t2025.01.10' 처럼
	// 셀/구분 토큰(| · 탭 · 줄바꿈 · 콜론)이 끼면 종전 인접-패턴이 깨져 누락됐다.
	// → 날짜(연+월/일)를 먼저 잡고, ±40자 안에 freshness 라벨이 있으면 인정.
	//   단 형식/예시/저작권/과거-게시(창업·설립·게시일) 문맥의 날짜는 제외한다.
	const updateDatePattern = /202[0-9][-./년]\s*\d{1,2}/g;
	let hasDateInBody = false;
	for (const m of body.matchAll(updateDatePattern)) {
		const idx = m.index ?? 0;
		// 입력 폼 라벨 / 예시 placeholder 의 날짜는 실제 갱신 표기가 아니다.
		if (hasFormLabelAround(body, idx)) continue;
		if (hasExampleContextAround(body, idx)) continue;
		// 저작권(© 2025) · 과거-게시(2021 창업/설립/게시일) 문맥의 연도는 갱신이 아니다.
		if (hasPatternAround(body, idx, COPYRIGHT_PATTERN, 25)) continue;
		if (hasPatternAround(body, idx, PAST_PUBLISH_PATTERN, 25)) continue;
		// 신선도 라벨이 근접(±40자, 셀 구분자 허용)해야 "최종 수정/갱신" 으로 인정.
		if (!hasPatternAround(body, idx, FRESHNESS_LABEL_PATTERN, 40)) continue;
		hasDateInBody = true;
		break;
	}
	const passed = hasSchemaDateModified || hasLastModified || hasDateInBody;
	return {
		ruleId: "AEO-LAST-UPDATED-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "마지막 업데이트 날짜 노출 여부",
		description: passed
			? `콘텐츠 업데이트 날짜(${hasSchemaDateModified ? "schema dateModified" : (page.lastModified ?? "본문 내 날짜")})가 확인됩니다.`
			: "콘텐츠가 언제 업데이트되었는지 알 수 없습니다. AI 검색은 최신 콘텐츠를 더 자주 인용합니다.",
		evidence: [
			`schema dateModified: ${hasSchemaDateModified ? "있음" : "없음"}`,
			`lastModified 메타: ${page.lastModified ?? "없음"}`,
			`본문 업데이트 날짜 표기: ${hasDateInBody ? "있음" : "없음"}`,
		],
		recommendation:
			"페이지 상단 또는 하단에 '최종 수정: 2025년 1월 1일' 같이 업데이트 날짜를 표시하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-CITATION-001: 외부 출처 인용 (출처 링크 ≥ 1)
// ---------------------------------------------------------------------------
export const aeoCitation001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 3 시맨틱 검증: "실제 출처 인용 표지" 또는 "출처성 외부 링크"여야 통과.
	// 기존 룰은 externalLinks.length >= 1 만으로 통과 → SNS 아이콘·지도 임베드·
	// 가족사이트 링크 하나만 있어도 '인용'으로 인정 → FP(대부분의 사이트가 통과).
	// (1) 본문에 명시적 인용 표지(출처:/참고:/인용:/source:/reference:) → 즉시 통과.
	// (2) 외부 링크 중 SNS/지도/공유 위젯 등 비-출처 도메인을 제외한 "출처성 링크"가
	//     1개 이상 있어야 인정.
	// ---------------------------------------------------------------------
	const citationTextPattern =
		/출처[:：]|참고[:：]|인용[:：]|reference[:：]|source[:：]|에 따르면|연구에 의하면/i;
	const hasCitationText = citationTextPattern.test(page.bodyText);

	// SNS·지도·공유·결제 등 "출처 인용"이 아닌 일반 외부 링크 도메인.
	const NON_CITATION_HOST =
		/instagram\.com|facebook\.com|fb\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|tiktok\.com|pinterest\.|threads\.net|kakao\.com|kakaocorp|pf\.kakao|open\.kakao|band\.us|blog\.naver|cafe\.naver|map\.naver|maps\.google|map\.kakao|t\.me|wa\.me|line\.me|pay\.|cdn\.|gstatic\.com|googletagmanager|google-analytics/i;
	// 비-출처 도메인(SNS/지도/공유)을 제외한 뒤, 남은 외부 링크 중에서도
	// "출처성"으로 인정할 수 있는 링크만 센다. 미등재 니치 도메인(파트너사·
	// 가족사이트·일반 상업 외부링크) 1개만으로는 인용으로 인정하지 않는다.
	// (a) 출처성 allowlist 도메인(.go.kr/.or.kr/.ac.kr/.gov/.edu/통계·연구·뉴스), 또는
	// (b) URL 경로/호스트에 출처 신호(report/research/stat/news/press 등)가 있을 때만 인정.
	const nonSnsLinks = page.externalLinks.filter(
		(u) => !NON_CITATION_HOST.test(u),
	);
	const citationLinks = nonSnsLinks.filter((u) => isCitationWorthyLink(u));
	const externalCount = page.externalLinks.length;
	// 본문 인용 표지가 있으면 즉시 통과. 표지가 없으면 "출처성" 링크가 1개 이상
	// 있을 때만 통과 — 미등재 일반 외부 링크 1개만으로는 통과시키지 않는다.
	const passed = hasCitationText || citationLinks.length >= 1;
	return {
		ruleId: "AEO-CITATION-001",
		category: "aeo",
		passed,
		severity: "low",
		title: "외부 출처 인용 여부",
		description: passed
			? `출처 인용(${hasCitationText ? "본문 출처 표기" : `출처성 외부 링크 ${citationLinks.length}개`})이 확인됩니다. 신뢰도 높은 콘텐츠입니다.`
			: "신뢰할 만한 외부 출처 링크나 인용 표기가 없습니다. SNS/지도 링크 외에 통계·연구·뉴스 등 근거 출처를 인용하면 콘텐츠 신뢰도가 올라갑니다.",
		evidence: [
			`외부 링크 수: ${externalCount}개 (출처성 ${citationLinks.length}개)`,
			`'출처:' 등 인용 표기: ${hasCitationText ? "있음" : "없음"}`,
		],
		recommendation:
			"통계·연구·뉴스 등을 인용할 때는 원본 출처 링크를 추가하세요. 1~2개의 신뢰할 만한 외부 링크만으로도 충분합니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// AEO-PUBLISHER-INFO-001: publisher schema 또는 footer에 회사 정보
// ---------------------------------------------------------------------------
export const aeoPublisherInfo001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const body = page.bodyText;

	// ---------------------------------------------------------------------
	// Phase 2 시맨틱 검증: 발행자(회사) 정보가 실제로 노출돼야 통과.
	// 기존 룰은 schema @graph 를 평탄화하지 않았고, footer 정규식이
	// 'sample 123-45-67890'(템플릿), '사업자등록번호 입력란'(form-label) 에도
	// 매치 → FP.
	// (1) getSchemaNodes 평탄화 후 publisher 키 또는 Organization 계열 노드 → 통과.
	// (2) footer 회사정보(사업자번호/대표자/상호/copyright)가 example/form-label
	//     문맥이 아닌 실제 위치에 등장.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	const hasPublisherSchema =
		anyNodeHasPresentKey(nodes, "publisher") ||
		nodes.some((n) => isOrganizationNode(n));

	const footerPattern =
		/사업자등록번호|사업자번호|copyright|©|All rights reserved|대표자|상호|법인등록번호/gi;
	let hasFooterInfo = false;
	for (const m of body.matchAll(footerPattern)) {
		const idx = m.index ?? 0;
		if (hasExampleContextAround(body, idx)) continue;
		if (hasFormLabelAround(body, idx)) continue;
		hasFooterInfo = true;
		break;
	}
	const passed = hasPublisherSchema || hasFooterInfo;
	return {
		ruleId: "AEO-PUBLISHER-INFO-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "발행자(publisher) 정보 명시 여부",
		description: passed
			? "발행자(회사) 정보가 schema 또는 footer에서 확인됩니다."
			: "발행자(회사) 정보가 명확하지 않습니다. AI 검색은 누가 발행한 콘텐츠인지 모르면 인용을 꺼립니다.",
		evidence: [
			`Organization/publisher schema: ${hasPublisherSchema ? "있음" : "없음"}`,
			`Footer 회사정보(사업자번호/copyright 등): ${hasFooterInfo ? "있음" : "없음"}`,
		],
		recommendation:
			"푸터에 상호, 대표자, 사업자등록번호, 주소를 명시하고, 가능하면 Organization JSON-LD에 publisher 정보를 추가하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// AEO-FAQ-COUNT-001: FAQ 항목 수 ≥ 5 (3개 미만 시 효과 부족)
// ---------------------------------------------------------------------------
export const aeoFaqCount001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	// ---------------------------------------------------------------------
	// Phase 3 시맨틱 검증: FAQPage schema 의 실제 Question 노드 수를 우선 집계.
	// 기존 룰은 mainEntity 배열 길이를 그대로 셌고(비-Question 항목 포함 가능),
	// fallback 도 endsWith('?') 단순 매치였다 → 질문 종결어미(까요/나요)만 있고
	// 물음표가 없는 항목을 누락하거나 비-질문 heading 을 포함할 여지가 있었다.
	// (1) getSchemaNodes 평탄화 후 FAQPage.mainEntity 중 @type=Question 만 카운트.
	// (2) schema 가 없을 때만 공용 isQuestionHeading() 로 질문형 H2/H3 추정.
	// ---------------------------------------------------------------------
	const nodes = getSchemaNodes(page.schemaJsonLd);
	let faqCount = 0;
	for (const n of nodes) {
		if (!isFaqPageNode(n)) continue;
		const main = n.mainEntity;
		const entities = Array.isArray(main) ? main : main ? [main] : [];
		for (const q of entities) {
			if (!q || typeof q !== "object") continue;
			const qr = q as Record<string, unknown>;
			// Question 타입이거나 name 을 가진 항목이면 명확한 질문 항목으로 카운트.
			// @type/name 둘 다 없는 빈 mainEntity 항목도 FAQPage 가 선언한 Q&A 슬롯으로
			// 보아 관대하게 카운트(파서가 본문 Q&A 를 schema 화한 케이스).
			if (
				nodeTypeIncludes(qr, "Question") ||
				isPresent(qr.name) ||
				!("@type" in qr)
			) {
				faqCount += 1;
			}
		}
	}
	// schema 없을 때 fallback: H2/H3 중 실제 질문형을 FAQ 항목으로 추정.
	if (faqCount === 0) {
		const questionH = [...page.h2, ...(page.h3 ?? [])].filter((h) =>
			isQuestionHeading(h.trim()),
		);
		faqCount = questionH.length;
	}
	const passed = faqCount >= 5;
	return {
		ruleId: "AEO-FAQ-COUNT-001",
		category: "aeo",
		passed,
		severity: "low",
		title: "FAQ 항목 수 충분성 (5개 이상)",
		description: passed
			? `FAQ 항목이 ${faqCount}개로 AI 검색에서 활용되기 충분합니다.`
			: `FAQ 항목이 ${faqCount}개입니다. 3개 미만이면 효과가 미미하고, 5개 이상일 때 검색 노출 효과가 좋습니다.`,
		evidence: [`FAQ 항목 수(추정): ${faqCount}개`],
		recommendation:
			"FAQ 섹션을 5개 이상의 질문-답변 쌍으로 구성하세요. 가격, 이용 방법, 소요 시간, 환불 정책, 대상 고객 등 자주 묻는 5개를 추가하면 됩니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// AEO-HEADING-QUESTION-RATIO-001: 전체 H2/H3 중 질문형 비율 ≥ 30%
// ---------------------------------------------------------------------------
export const aeoHeadingQuestionRatio001: Rule = (ctx): RuleResult => {
	const page = ctx.mainPage;
	const headings = [...page.h2, ...(page.h3 ?? [])];
	if (headings.length === 0) {
		return {
			ruleId: "AEO-HEADING-QUESTION-RATIO-001",
			category: "aeo",
			passed: false,
			severity: "medium",
			title: "H2/H3 질문형 비율 (30% 이상)",
			description: "H2/H3 소제목이 없어 비율을 계산할 수 없습니다.",
			evidence: [`H2: ${page.h2.length}개`, `H3: ${(page.h3 ?? []).length}개`],
			recommendation:
				"소제목 중 30% 이상을 질문형('어떻게...', '얼마인가요?')으로 작성하세요.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "medium",
			ruleWeight: 6,
		};
	}
	// ---------------------------------------------------------------------
	// Phase 3 시맨틱 검증: 공용 isQuestionHeading() 로 실제 질문형만 카운트.
	// 기존 룰은 '왜'/'무엇'/'어떤' substring 만으로도 질문으로 셌다 → '왜 우리인가'
	// (평서 슬로건), '무엇이든 가능'(평서) 같은 비-질문 heading 까지 분자로 잡아 FP.
	// 물음표 또는 질문 종결어미(까요/나요/인가요…)가 있는 heading 만 질문형으로 인정.
	// Phase 3.1 잔여 FP: '준비되셨나요?'/'함께하실래요?' 같은 수사형 CTA 슬로건은
	// 물음표가 있어 isQuestionHeading 은 통과하지만 AI 가 인용할 정보형 질문이 아니다.
	// 이 룰 한정으로 그런 CTA 만 분자에서 제외한다(공용 헬퍼는 건드리지 않음).
	// ---------------------------------------------------------------------
	const questionHeadings = headings.filter((h) =>
		isInformationalQuestionHeading(h.trim()),
	);
	const ratio = questionHeadings.length / headings.length;
	const passed = ratio >= 0.3;
	return {
		ruleId: "AEO-HEADING-QUESTION-RATIO-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "H2/H3 질문형 비율 (30% 이상)",
		description: passed
			? `H2/H3 ${headings.length}개 중 ${questionHeadings.length}개(${Math.round(ratio * 100)}%)가 질문형입니다.`
			: `H2/H3 ${headings.length}개 중 ${questionHeadings.length}개(${Math.round(ratio * 100)}%)만 질문형입니다. 30% 이상이면 AI 검색에서 직접 답변으로 인용되기 좋습니다.`,
		evidence: [
			`전체 H2/H3: ${headings.length}개`,
			`질문형 H2/H3: ${questionHeadings.length}개 (${Math.round(ratio * 100)}%)`,
		],
		recommendation:
			"소제목 중 30% 이상을 '얼마인가요?', '어떻게 예약하나요?' 같은 질문형으로 작성하세요. 고객이 검색할 법한 질문을 그대로 제목으로 사용합니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};
