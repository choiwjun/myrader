/**
 * X-SAG Core Engine — Phase O-D 신규 룰 테스트
 *
 * 룰 깊이 보강 (+30): SEO +12, AEO +10, GEO +8
 * 각 룰마다 passed/failed 케이스 2개씩.
 */

import { describe, expect, it } from "vitest";
import type { ParsedPage } from "../../../types.js";
import type { RuleContext } from "../../types.js";

// Phase O-D SEO Rules
import {
	seoAmpValid001,
	seoBrokenLink001,
	seoCanonicalSelf001,
	seoContentFreshness001,
	seoDuplicateMetaDesc001,
	seoHeadingHierarchy001,
	seoHttp2001,
	seoPageLangConsistency001,
	seoPagination001,
	seoRedirectChain001,
	seoTrailingSlash001,
	seoXmlSitemapValid001,
} from "../seo-rules.js";

// Phase O-D AEO Rules
import {
	aeoAuthorAttribution001,
	aeoCitation001,
	aeoDirectAnswerParagraph001,
	aeoFaqCount001,
	aeoHeadingQuestionRatio001,
	aeoLastUpdated001,
	aeoListAndTable001,
	aeoNumericFacts001,
	aeoPublisherInfo001,
	aeoScannable001,
} from "../aeo-rules.js";

// Phase O-D GEO Rules
import {
	geoBrandConsistency001,
	geoBrandInH1001,
	geoBrandInTitle001,
	geoBusinessHoursDetail001,
	geoDirectionsInfo001,
	geoMapEmbed001,
	geoPhoneFormat001,
	geoReviewAggregate001,
} from "../geo-rules.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		url: "https://example.co.kr/",
		statusCode: 200,
		title: "테스트 카페 강남",
		description: "강남 핸드드립 카페입니다.",
		h1: "강남 카페 메인",
		h2: ["메뉴 안내", "오시는 길"],
		meta: {
			viewport: "width=device-width, initial-scale=1",
			description: "강남 핸드드립 카페입니다.",
		},
		bodyText: "테스트 카페에 오신 것을 환영합니다.",
		wordCount: 10,
		internalLinks: [],
		externalLinks: [],
		images: [],
		schemaJsonLd: [],
		hasFAQ: false,
		hasSchema: false,
		canonicalUrl: null,
		robotsMeta: null,
		...overrides,
	};
}

function makeCtx(
	pageOverrides: Partial<ParsedPage> = {},
	extraPages: ParsedPage[] = [],
): RuleContext {
	const mainPage = makePage(pageOverrides);
	return {
		pages: [mainPage, ...extraPages],
		mainPage,
		businessProfile: {
			businessName: "테스트카페",
			industry: "카페",
			region: "강남",
			mainServices: ["핸드드립", "원두"],
			targetKeywords: ["강남 카페", "핸드드립"],
		},
	};
}

// ===========================================================================
// SEO Phase O-D Tests
// ===========================================================================

describe("SEO-HTTP2-001: HTTP/2 사용 여부", () => {
	it("HTTP/2 또는 HTTP/3이면 통과", () => {
		const ctx = makeCtx({ httpProtocol: "2" });
		const r = seoHttp2001(ctx);
		expect(r.ruleId).toBe("SEO-HTTP2-001");
		expect(r.passed).toBe(true);
	});

	it("HTTP/1.1이면 실패", () => {
		const ctx = makeCtx({ httpProtocol: "1.1" });
		const r = seoHttp2001(ctx);
		expect(r.passed).toBe(false);
		expect(r.recommendation.length).toBeGreaterThan(10);
	});
});

describe("AEO semantic copy guards", () => {
	it("AEO-SCANNABLE-001 exposes paragraphLimit in failing guidance", () => {
		const longPara =
			"Sentence 1. Sentence 2. Sentence 3. Sentence 4. Sentence 5.";
		const r = aeoScannable001(makeCtx({ bodyText: longPara }));

		expect(r.passed).toBe(false);
		expect(r.description).toContain("paragraphLimit=4");
		expect(r.recommendation).toContain("paragraphLimit=4");
	});
});

describe("SEO-PAGE-LANG-CONSISTENCY-001: html lang + Content-Language 헤더 일치", () => {
	it("두 값이 일치하면 통과", () => {
		const ctx = makeCtx({
			htmlLang: "ko-KR",
			contentLanguageHeader: "ko-KR",
		});
		const r = seoPageLangConsistency001(ctx);
		expect(r.passed).toBe(true);
	});

	it("두 값이 다르면 실패", () => {
		const ctx = makeCtx({
			htmlLang: "ko",
			contentLanguageHeader: "en-US",
		});
		const r = seoPageLangConsistency001(ctx);
		expect(r.passed).toBe(false);
	});

	it("한국어 외 언어로 감지되면 낮은 심각도의 경고를 반환한다", () => {
		const ctx = makeCtx({
			htmlLang: "en-US",
			contentLanguageHeader: "en-US",
		});
		const r = seoPageLangConsistency001(ctx);
		expect(r.passed).toBe(false);
		expect(r.severity).toBe("low");
	});
});

describe("SEO-AMP-VALID-001: AMP 페이지 amphtml 링크 유효성", () => {
	it("AMP 페이지 아니면 통과", () => {
		const ctx = makeCtx({ bodyText: "일반 HTML 페이지입니다." });
		const r = seoAmpValid001(ctx);
		expect(r.passed).toBe(true);
	});

	// Phase 2 DOWNGRADE: 파서가 AMP link 신호를 노출하지 않으므로 bodyText 의 '⚡'/'amphtml'
	// 문자열에 의존하던 기존 검사는 일반 문서 텍스트에 오발화하는 FP 였다. 이제 informational
	// (passed=true) 로 강등되어, 본문에 ⚡ 가 섞여 있어도 AMP 로 오판하지 않는다.
	it("본문에 ⚡ 가 섞여 있어도 AMP 로 오판하지 않고 통과(informational)", () => {
		const ctx = makeCtx({
			bodyText: "AMP(⚡) 를 설명하는 일반 블로그 글입니다. amphtml 링크가 어쩌고.",
		});
		const r = seoAmpValid001(ctx);
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toContain("미수집");
	});
});

describe("SEO-XML-SITEMAP-VALID-001: sitemap.xml 등록", () => {
	it("내부 링크에 sitemap.xml이 있으면 통과", () => {
		const ctx = makeCtx({
			internalLinks: ["https://example.co.kr/sitemap.xml"],
		});
		const r = seoXmlSitemapValid001(ctx);
		expect(r.passed).toBe(true);
	});

	it("sitemap.xml 단서가 없으면 실패", () => {
		const ctx = makeCtx();
		const r = seoXmlSitemapValid001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("SEO-PAGINATION-001: 페이지네이션 rel=prev/next (Phase 4 실측 승격)", () => {
	// Phase 4: commit bbd2d96 가 page.linkTags 를 추가하면서 rel=prev/next 를 직접 실측한다.
	// 'rel="prev"' 는 가시 bodyText 에 절대 나타나지 않으므로 본문/URL 신호는 참고용일 뿐
	// 판정에서 제외한다. 페이지네이션 신호가 없으면(대다수 SMB) 정보성 통과, 있으면 href 누락
	// 같은 깨진 선언만 부드럽게 실패한다.
	it("페이지네이션 <link> 가 없으면 정보성 통과", () => {
		const ctx = makeCtx();
		const r = seoPagination001(ctx);
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toMatch(/rel="next"> 수: 0/);
	});

	it("URL 이 ?page= 여도 rel=prev/next <link> 가 없으면 본문/URL 은 판정 제외 → 통과", () => {
		const ctx = makeCtx({ url: "https://example.co.kr/blog?page=2" }, [
			makePage({ url: "https://example.co.kr/blog?page=3" }),
		]);
		const r = seoPagination001(ctx);
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toMatch(/판정 제외/);
	});

	it("rel=prev/next <link> 가 유효하게 선언되면 실측 통과", () => {
		const ctx = makeCtx({
			url: "https://example.co.kr/blog?page=2",
			linkTags: [
				{ rel: "prev", href: "https://example.co.kr/blog?page=1", hreflang: null },
				{ rel: "next", href: "https://example.co.kr/blog?page=3", hreflang: null },
			],
		});
		const r = seoPagination001(ctx);
		expect(r.passed).toBe(true);
		expect(r.evidence.join(" ")).toMatch(/rel="next"> 수: 1/);
	});
});

describe("SEO-CONTENT-FRESHNESS-001: 콘텐츠 최신성 메타데이터", () => {
	it("article:modified_time이 있으면 통과", () => {
		const ctx = makeCtx({
			meta: { "article:modified_time": "2025-01-01T00:00:00Z" },
		});
		const r = seoContentFreshness001(ctx);
		expect(r.passed).toBe(true);
	});

	it("최신성 메타가 없으면 실패", () => {
		const ctx = makeCtx({ meta: {} });
		const r = seoContentFreshness001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("SEO-DUPLICATE-META-DESC-001: 중복 meta description 감지", () => {
	it("모두 고유한 description이면 통과", () => {
		const ctx = makeCtx({ description: "강남 카페입니다" }, [
			makePage({
				url: "https://example.co.kr/menu",
				description: "메뉴 안내",
			}),
		]);
		const r = seoDuplicateMetaDesc001(ctx);
		expect(r.passed).toBe(true);
	});

	it("중복 description이 있으면 실패", () => {
		const dup = "같은 설명을 사용한 두 페이지";
		const ctx = makeCtx({ description: dup }, [
			makePage({ url: "https://example.co.kr/menu", description: dup }),
		]);
		const r = seoDuplicateMetaDesc001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("SEO-HEADING-HIERARCHY-001: 제목 위계 구조", () => {
	it("H1→H2→H3 위계가 적절하면 통과", () => {
		const ctx = makeCtx({
			headingStructure: [
				{ level: 1, text: "메인 제목" },
				{ level: 2, text: "섹션 1" },
				{ level: 3, text: "하위 1" },
				{ level: 2, text: "섹션 2" },
			],
		});
		const r = seoHeadingHierarchy001(ctx);
		expect(r.passed).toBe(true);
	});

	it("H1→H3 건너뛰면 실패", () => {
		const ctx = makeCtx({
			headingStructure: [
				{ level: 1, text: "메인" },
				{ level: 3, text: "건너뛴 H3" },
			],
		});
		const r = seoHeadingHierarchy001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("SEO-TRAILING-SLASH-001: trailing slash 일관성", () => {
	it("모두 같은 방식이면 통과", () => {
		const ctx = makeCtx({ url: "https://example.co.kr/menu/" }, [
			makePage({ url: "https://example.co.kr/about/" }),
			makePage({ url: "https://example.co.kr/contact/" }),
		]);
		const r = seoTrailingSlash001(ctx);
		expect(r.passed).toBe(true);
	});

	it("일관되지 않으면 실패", () => {
		const ctx = makeCtx({ url: "https://example.co.kr/menu/" }, [
			makePage({ url: "https://example.co.kr/about" }),
			makePage({ url: "https://example.co.kr/contact/" }),
		]);
		const r = seoTrailingSlash001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("SEO-CANONICAL-SELF-001: canonical 자기 참조", () => {
	it("canonical이 자기 자신이면 통과", () => {
		const ctx = makeCtx({
			url: "https://example.co.kr/",
			canonicalUrl: "https://example.co.kr/",
		});
		const r = seoCanonicalSelf001(ctx);
		expect(r.passed).toBe(true);
	});

	it("canonical이 다른 페이지면 실패", () => {
		const ctx = makeCtx({
			url: "https://example.co.kr/",
			canonicalUrl: "https://other.co.kr/",
		});
		const r = seoCanonicalSelf001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("SEO-BROKEN-LINK-001: 내부 링크 깨짐", () => {
	it("모든 페이지가 200이면 통과", () => {
		const ctx = makeCtx({ statusCode: 200 }, [
			makePage({ url: "https://example.co.kr/menu", statusCode: 200 }),
		]);
		const r = seoBrokenLink001(ctx);
		expect(r.passed).toBe(true);
	});

	it("404 페이지가 있으면 실패", () => {
		const ctx = makeCtx({ statusCode: 200 }, [
			makePage({ url: "https://example.co.kr/broken", statusCode: 404 }),
		]);
		const r = seoBrokenLink001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("SEO-REDIRECT-CHAIN-001: 리다이렉트 체인 길이", () => {
	it("리다이렉트 0~2회면 통과", () => {
		const ctx = makeCtx({ redirectChainLength: 1 });
		const r = seoRedirectChain001(ctx);
		expect(r.passed).toBe(true);
	});

	it("리다이렉트 3회 이상이면 실패", () => {
		const ctx = makeCtx({ redirectChainLength: 4 });
		const r = seoRedirectChain001(ctx);
		expect(r.passed).toBe(false);
	});
});

// ===========================================================================
// AEO Phase O-D Tests
// ===========================================================================

describe("AEO-DIRECT-ANSWER-PARAGRAPH-001: 첫 단락 직답형", () => {
	it("첫 단락이 40~200자 직답형이면 통과", () => {
		const ctx = makeCtx({
			bodyText:
				"테스트카페는 강남구 역삼동에 위치한 핸드드립 전문 카페로 신선한 원두를 직접 로스팅하여 제공하는 곳입니다",
		});
		const r = aeoDirectAnswerParagraph001(ctx);
		expect(r.passed).toBe(true);
	});

	it("첫 단락이 너무 짧으면 실패", () => {
		const ctx = makeCtx({ bodyText: "환영합니다." });
		const r = aeoDirectAnswerParagraph001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("AEO-LIST-AND-TABLE-001: 목록/표 요소", () => {
	it("ul/ol/table이 1개 이상이면 통과", () => {
		const ctx = makeCtx({ listTableCount: { ul: 2, ol: 0, table: 1 } });
		const r = aeoListAndTable001(ctx);
		expect(r.passed).toBe(true);
	});

	it("모두 0이면 실패", () => {
		const ctx = makeCtx({ listTableCount: { ul: 0, ol: 0, table: 0 } });
		const r = aeoListAndTable001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("AEO-SCANNABLE-001: 단락 평균 문장 수 ≤ 4", () => {
	it("단락이 4문장 이하면 통과", () => {
		const bodyText = [
			"강남 카페입니다. 핸드드립을 제공합니다. 신선한 원두를 사용합니다.",
			"",
			"이용 시간은 오전 10시부터 오후 9시까지입니다. 예약은 전화로 받습니다.",
		].join("\n\n");
		const ctx = makeCtx({ bodyText });
		const r = aeoScannable001(ctx);
		expect(r.passed).toBe(true);
	});

	it("단락 평균 문장 수가 5개 이상이면 실패", () => {
		const longPara =
			"문장1. 문장2. 문장3. 문장4. 문장5. 문장6. 문장7. 문장8. 문장9. 문장10.";
		const ctx = makeCtx({ bodyText: `${longPara}\n\n${longPara}` });
		const r = aeoScannable001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("AEO-NUMERIC-FACTS-001: 본문 숫자/통계 포함", () => {
	it("의미 있는 수치 패턴 2개 이상이면 통과", () => {
		const ctx = makeCtx({
			bodyText:
				"10년 경력의 바리스타가 운영합니다. 월 200명 이상이 방문합니다. 만족도 95% 이상.",
		});
		const r = aeoNumericFacts001(ctx);
		expect(r.passed).toBe(true);
	});

	it("수치 없으면 실패", () => {
		const ctx = makeCtx({ bodyText: "맛있는 커피를 드세요." });
		const r = aeoNumericFacts001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("AEO-AUTHOR-ATTRIBUTION-001: 작성자 명시", () => {
	it("Person schema가 있으면 통과", () => {
		const ctx = makeCtx({
			schemaJsonLd: [{ "@type": "Person", name: "홍길동" }],
		});
		const r = aeoAuthorAttribution001(ctx);
		expect(r.passed).toBe(true);
	});

	it("schema도 본문 표기도 없으면 실패", () => {
		const ctx = makeCtx({ bodyText: "카페에 오세요." });
		const r = aeoAuthorAttribution001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("AEO-LAST-UPDATED-001: 마지막 업데이트 날짜 노출", () => {
	it("lastModified가 있으면 통과", () => {
		const ctx = makeCtx({ lastModified: "2025-01-01T00:00:00Z" });
		const r = aeoLastUpdated001(ctx);
		expect(r.passed).toBe(true);
	});

	it("날짜 정보 전혀 없으면 실패", () => {
		const ctx = makeCtx({
			bodyText: "콘텐츠입니다.",
			lastModified: null,
		});
		const r = aeoLastUpdated001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("AEO-CITATION-001: 외부 출처 인용", () => {
	it("외부 링크가 1개 이상이면 통과", () => {
		const ctx = makeCtx({ externalLinks: ["https://reference.com"] });
		const r = aeoCitation001(ctx);
		expect(r.passed).toBe(true);
	});

	it("외부 링크와 출처 표기 모두 없으면 실패", () => {
		const ctx = makeCtx({ bodyText: "내용입니다.", externalLinks: [] });
		const r = aeoCitation001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("AEO-PUBLISHER-INFO-001: publisher/회사정보", () => {
	it("푸터에 사업자번호가 있으면 통과", () => {
		const ctx = makeCtx({
			bodyText: "© 2025 테스트카페. 사업자등록번호 123-45-67890.",
		});
		const r = aeoPublisherInfo001(ctx);
		expect(r.passed).toBe(true);
	});

	it("publisher schema도 footer 정보도 없으면 실패", () => {
		const ctx = makeCtx({ bodyText: "맛있는 커피." });
		const r = aeoPublisherInfo001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("AEO-FAQ-COUNT-001: FAQ 항목 수 5개 이상", () => {
	it("FAQPage schema에 mainEntity 5개 이상이면 통과", () => {
		const ctx = makeCtx({
			schemaJsonLd: [
				{
					"@type": "FAQPage",
					mainEntity: [{}, {}, {}, {}, {}, {}],
				},
			],
		});
		const r = aeoFaqCount001(ctx);
		expect(r.passed).toBe(true);
	});

	it("FAQ 항목 3개 이하면 실패", () => {
		const ctx = makeCtx({
			h2: ["가격이 얼마인가요?", "예약은 어떻게 하나요?"],
		});
		const r = aeoFaqCount001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("AEO-HEADING-QUESTION-RATIO-001: H2/H3 질문형 비율", () => {
	it("질문형이 30% 이상이면 통과", () => {
		const ctx = makeCtx({
			h2: ["가격이 얼마인가요?", "예약은 어떻게 하나요?", "메뉴 안내"],
		});
		const r = aeoHeadingQuestionRatio001(ctx);
		expect(r.passed).toBe(true);
	});

	it("질문형이 0%면 실패", () => {
		const ctx = makeCtx({
			h2: ["메뉴", "오시는 길", "예약 안내", "이용 후기"],
		});
		const r = aeoHeadingQuestionRatio001(ctx);
		expect(r.passed).toBe(false);
	});
});

// ===========================================================================
// GEO Phase O-D Tests
// ===========================================================================

describe("GEO-BRAND-IN-TITLE-001: title에 브랜드명", () => {
	it("title에 브랜드명이 있으면 통과", () => {
		const ctx = makeCtx({ title: "테스트카페 | 강남 핸드드립" });
		const r = geoBrandInTitle001(ctx);
		expect(r.passed).toBe(true);
	});

	it("title에 브랜드명 없으면 실패", () => {
		const ctx = makeCtx({ title: "강남 핸드드립 카페" });
		const r = geoBrandInTitle001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("GEO-BRAND-IN-H1-001: H1에 브랜드명", () => {
	it("H1에 브랜드명이 있으면 통과", () => {
		const ctx = makeCtx({ h1: "테스트카페 - 강남 핸드드립 전문점" });
		const r = geoBrandInH1001(ctx);
		expect(r.passed).toBe(true);
	});

	it("H1에 브랜드명 없으면 실패", () => {
		const ctx = makeCtx({ h1: "환영합니다" });
		const r = geoBrandInH1001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("GEO-BRAND-CONSISTENCY-001: 브랜드명 표기 일관성", () => {
	it("3곳 이상에 일관되게 등장하면 통과", () => {
		const ctx = makeCtx({
			title: "테스트카페 | 강남",
			h1: "테스트카페",
			description: "테스트카페는 강남에 있습니다.",
			bodyText: "테스트카페에 오신 것을 환영합니다.",
		});
		const r = geoBrandConsistency001(ctx);
		expect(r.passed).toBe(true);
	});

	it("1곳에만 있으면 실패", () => {
		const ctx = makeCtx({
			title: "강남 카페",
			h1: "메인",
			description: "어서오세요",
			bodyText: "테스트카페만 본문에 있음.",
		});
		const r = geoBrandConsistency001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("GEO-MAP-EMBED-001: 지도 임베드/링크", () => {
	it("네이버맵 외부 링크가 있으면 통과", () => {
		const ctx = makeCtx({
			externalLinks: ["https://map.naver.com/v5/entry/place/12345"],
		});
		const r = geoMapEmbed001(ctx);
		expect(r.passed).toBe(true);
	});

	it("지도 단서 전혀 없으면 실패", () => {
		const ctx = makeCtx({ externalLinks: [], bodyText: "환영합니다." });
		const r = geoMapEmbed001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("GEO-DIRECTIONS-INFO-001: 교통/길찾기 안내", () => {
	it("'찾아오시는 길' 표현이 있으면 통과", () => {
		const ctx = makeCtx({
			bodyText: "찾아오시는 길: 강남역 3번 출구에서 도보 5분 거리입니다.",
		});
		const r = geoDirectionsInfo001(ctx);
		expect(r.passed).toBe(true);
	});

	it("교통 안내가 전혀 없으면 실패", () => {
		const ctx = makeCtx({ bodyText: "맛있는 커피를 즐기세요." });
		const r = geoDirectionsInfo001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("GEO-BUSINESS-HOURS-DETAIL-001: 요일별 운영시간 상세", () => {
	it("요일별 구분 표기가 있으면 통과", () => {
		const ctx = makeCtx({
			bodyText: "평일 10:00~21:00, 토요일 10:00~18:00, 일요일 휴무입니다.",
		});
		const r = geoBusinessHoursDetail001(ctx);
		expect(r.passed).toBe(true);
	});

	it("단순 시간만 있고 요일 구분 없으면 실패", () => {
		const ctx = makeCtx({ bodyText: "영업시간 09:00 - 18:00" });
		const r = geoBusinessHoursDetail001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("GEO-PHONE-FORMAT-001: 전화번호 클릭 가능 (tel:)", () => {
	it("전화번호 + tel: 단서가 있으면 통과", () => {
		const ctx = makeCtx({
			bodyText: "문의 전화: tel:02-1234-5678 또는 02-1234-5678",
		});
		const r = geoPhoneFormat001(ctx);
		expect(r.passed).toBe(true);
	});

	it("전화번호만 있고 tel: 단서 없으면 실패", () => {
		const ctx = makeCtx({ bodyText: "전화: 02-1234-5678" });
		const r = geoPhoneFormat001(ctx);
		expect(r.passed).toBe(false);
	});
});

describe("GEO-REVIEW-AGGREGATE-001: AggregateRating/평점 표시", () => {
	it("AggregateRating schema가 있으면 통과", () => {
		const ctx = makeCtx({
			schemaJsonLd: [
				{ "@type": "LocalBusiness", aggregateRating: { ratingValue: 4.8 } },
			],
		});
		const r = geoReviewAggregate001(ctx);
		expect(r.passed).toBe(true);
	});

	it("평점 표기 전혀 없으면 실패", () => {
		const ctx = makeCtx({ bodyText: "맛있는 커피", schemaJsonLd: [] });
		const r = geoReviewAggregate001(ctx);
		expect(r.passed).toBe(false);
	});
});

// ===========================================================================
// 공통 구조 확인
// ===========================================================================

describe("Phase O-D 룰 결과 구조 검증", () => {
	const allRules = [
		seoHttp2001,
		seoPageLangConsistency001,
		seoAmpValid001,
		seoXmlSitemapValid001,
		seoPagination001,
		seoContentFreshness001,
		seoDuplicateMetaDesc001,
		seoHeadingHierarchy001,
		seoTrailingSlash001,
		seoCanonicalSelf001,
		seoBrokenLink001,
		seoRedirectChain001,
		aeoDirectAnswerParagraph001,
		aeoListAndTable001,
		aeoScannable001,
		aeoNumericFacts001,
		aeoAuthorAttribution001,
		aeoLastUpdated001,
		aeoCitation001,
		aeoPublisherInfo001,
		aeoFaqCount001,
		aeoHeadingQuestionRatio001,
		geoBrandInTitle001,
		geoBrandInH1001,
		geoBrandConsistency001,
		geoMapEmbed001,
		geoDirectionsInfo001,
		geoBusinessHoursDetail001,
		geoPhoneFormat001,
		geoReviewAggregate001,
	];

	it("모든 신규 룰이 30개여야 함 (SEO 12 + AEO 10 + GEO 8)", () => {
		expect(allRules.length).toBe(30);
	});

	it("모든 룰이 RuleResult 필수 필드를 갖는다", () => {
		const ctx = makeCtx();
		for (const rule of allRules) {
			const r = rule(ctx);
			expect(r.ruleId).toBeTruthy();
			expect(["seo", "aeo", "geo"]).toContain(r.category);
			expect(typeof r.passed).toBe("boolean");
			expect(["high", "medium", "low"]).toContain(r.severity);
			expect([
				"self_fix",
				"snippet_action",
				"vendor_action",
				"si_action",
			]).toContain(r.actionType);
			expect(["easy", "medium", "hard"]).toContain(r.difficulty);
			expect(["low", "medium", "high"]).toContain(r.expectedImpact);
			expect(r.ruleWeight).toBeGreaterThanOrEqual(0);
			expect(r.ruleWeight).toBeLessThanOrEqual(10);
			expect(Array.isArray(r.evidence)).toBe(true);
			expect(r.recommendation.length).toBeGreaterThan(5);
		}
	});
});
