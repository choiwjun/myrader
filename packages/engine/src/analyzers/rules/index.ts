/**
 * X-SAG Core Engine — Analyzer Rule Exports
 *
 * SEO_RULES, AEO_RULES, GEO_RULES 배열로 각 카테고리 룰을 export.
 * Analyzer 함수들이 이 배열을 순회하며 RuleResult[] 를 생성한다.
 *
 * v2.0.0 (Phase M-A): SEO 36개, AEO 20개, GEO 19개 (합계 75개)
 * Phase O-D: +30 신규 룰 (SEO +12, AEO +10, GEO +8) → 합계 105개
 * Phase P-A: +8 NLP 룰 (NLP-KEYWORD-DENSITY, TOPIC-RELEVANCE, READABILITY, SENTENCE-LENGTH,
 *            NLP-EEAT-AUTHOR, EEAT-EXPERTISE, EEAT-TRUST, SEMANTIC-ALIGN)
 *            카테고리 매핑: seo(5) + aeo(3) → SEO_RULES, AEO_RULES 에 흡수.
 *            NLP_RULES 별도 배열도 제공.
 */

import type { Rule } from "../types.js";

// SEO Rules
export {
	seoTitle001,
	seoTitle002,
	seoMeta001,
	seoMeta002,
	seoH1001,
	seoH1002,
	seoH2001,
	seoImgAlt001,
	seoCanonical001,
	seoRobots001,
	seoSitemap001,
	seoMobile001,
	seoUrl001,
	seoKeyword001,
	seoInternalLink001,
	seoCta001,
	seoRegion001,
	seoHttps001,
	seoLang001,
	seoOg001,
	seoOg002,
	seoTwitter001,
	seoFavicon001,
	seoImgLazy001,
	seoImgDimensions001,
	seoImgFormat001,
	seoLinkNewtab001,
	seoStructuredData001,
	seoBreadcrumb001,
	seoWordCount001,
	seoKoreanUrl001,
	seoHreflang001,
	seoPageDepth001,
	seoNaverMeta001,
	seoDuplicateContent001,
	seoExternalLinkCount001,
	// Phase O-D 신규 SEO 룰 (+12)
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
} from "./seo-rules.js";

// AEO Rules
export {
	aeoFaq001,
	aeoFaqSchema001,
	aeoQuestionFormat001,
	aeoServiceDesc001,
	aeoPriceInfo001,
	aeoProcessInfo001,
	aeoDurationInfo001,
	aeoTargetCustomer001,
	aeoDirectAnswer001,
	aeoLocalService001,
	aeoAnswerLength001,
	aeoDefinition001,
	aeoParagraphStructure001,
	aeoAuthorSchema001,
	aeoListFormat001,
	aeoDateRecent001,
	aeoContactDirect001,
	aeoTestimonial001,
	aeoQaPairMarkup001,
	aeoOrgAnswer001,
	// Phase O-D 신규 AEO 룰 (+10)
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
} from "./aeo-rules.js";

// GEO Rules
export {
	geoBusinessName001,
	geoIndustry001,
	geoRegion001,
	geoService001,
	geoTrust001,
	geoLocalBusinessSchema001,
	geoOrganizationSchema001,
	geoLlmsTxt001,
	geoAiSummary001,
	geoSocialProof001,
	geoContact001,
	geoOpeningHours001,
	geoPhone001,
	geoAddress001,
	geoBrandMention001,
	geoOgImage001,
	geoNapConsistency001,
	geoLocationSchema001,
	geoMultipleLang001,
	// Phase O-D 신규 GEO 룰 (+8)
	geoBrandInTitle001,
	geoBrandInH1001,
	geoBrandConsistency001,
	geoMapEmbed001,
	geoDirectionsInfo001,
	geoBusinessHoursDetail001,
	geoPhoneFormat001,
	geoReviewAggregate001,
} from "./geo-rules.js";

// NLP Rules (Phase P-A)
export {
	nlpKeywordDensity001,
	nlpTopicRelevance001,
	nlpReadability001,
	nlpSentenceLength001,
	nlpEeatAuthor001,
	nlpEeatExpertise001,
	nlpEeatTrust001,
	nlpSemanticAlign001,
} from "./nlp-rules.js";

// BACKLINK Rules (Phase R-D — 8 룰, informational)
export {
	backlinkDa001,
	backlinkHttps001,
	backlinkCanonicalConsistency001,
	backlinkStructuredDataDiversity001,
	backlinkSocialMeta001,
	backlinkInternalLinkDepth001,
	backlinkLinkEquity001,
	backlinkAgeSignal001,
} from "./backlink-rules.js";

// A11Y Rules (Phase R-D — 15 룰, informational)
export {
	a11yColorContrast001,
	a11yImageAlt001,
	a11yFormLabel001,
	a11yButtonName001,
	a11yLinkName001,
	a11yDocLang001,
	a11yDocTitle001,
	a11yHeadingOrder001,
	a11yLandmark001,
	a11yFocusVisible001,
	a11yAriaValid001,
	a11yList001,
	a11yTabindex001,
	a11yAutoplay001,
	a11yFocusOrder001,
} from "./a11y-rules.js";

// ---------------------------------------------------------------------------
// Rule arrays for each category
// ---------------------------------------------------------------------------

import {
	seoAmpValid001 as _seoAmpValid001,
	seoBreadcrumb001 as _seoBreadcrumb001,
	seoBrokenLink001 as _seoBrokenLink001,
	seoCanonical001 as _seoCanonical001,
	seoCanonicalSelf001 as _seoCanonicalSelf001,
	seoContentFreshness001 as _seoContentFreshness001,
	seoCta001 as _seoCta001,
	seoDuplicateContent001 as _seoDuplicateContent001,
	seoDuplicateMetaDesc001 as _seoDuplicateMetaDesc001,
	seoExternalLinkCount001 as _seoExternalLinkCount001,
	seoFavicon001 as _seoFavicon001,
	seoH1001 as _seoH1001,
	seoH1002 as _seoH1002,
	seoH2001 as _seoH2001,
	seoHeadingHierarchy001 as _seoHeadingHierarchy001,
	seoHreflang001 as _seoHreflang001,
	// Phase O-D
	seoHttp2001 as _seoHttp2001,
	seoHttps001 as _seoHttps001,
	seoImgAlt001 as _seoImgAlt001,
	seoImgDimensions001 as _seoImgDimensions001,
	seoImgFormat001 as _seoImgFormat001,
	seoImgLazy001 as _seoImgLazy001,
	seoInternalLink001 as _seoInternalLink001,
	seoKeyword001 as _seoKeyword001,
	seoKoreanUrl001 as _seoKoreanUrl001,
	seoLang001 as _seoLang001,
	seoLinkNewtab001 as _seoLinkNewtab001,
	seoMeta001 as _seoMeta001,
	seoMeta002 as _seoMeta002,
	seoMobile001 as _seoMobile001,
	seoNaverMeta001 as _seoNaverMeta001,
	seoOg001 as _seoOg001,
	seoOg002 as _seoOg002,
	seoPageDepth001 as _seoPageDepth001,
	seoPageLangConsistency001 as _seoPageLangConsistency001,
	seoPagination001 as _seoPagination001,
	seoRedirectChain001 as _seoRedirectChain001,
	seoRegion001 as _seoRegion001,
	seoRobots001 as _seoRobots001,
	seoSitemap001 as _seoSitemap001,
	seoStructuredData001 as _seoStructuredData001,
	seoTitle001 as _seoTitle001,
	seoTitle002 as _seoTitle002,
	seoTrailingSlash001 as _seoTrailingSlash001,
	seoTwitter001 as _seoTwitter001,
	seoUrl001 as _seoUrl001,
	seoWordCount001 as _seoWordCount001,
	seoXmlSitemapValid001 as _seoXmlSitemapValid001,
} from "./seo-rules.js";

import {
	aeoAnswerLength001 as _aeoAnswerLength001,
	aeoAuthorAttribution001 as _aeoAuthorAttribution001,
	aeoAuthorSchema001 as _aeoAuthorSchema001,
	aeoCitation001 as _aeoCitation001,
	aeoContactDirect001 as _aeoContactDirect001,
	aeoDateRecent001 as _aeoDateRecent001,
	aeoDefinition001 as _aeoDefinition001,
	aeoDirectAnswer001 as _aeoDirectAnswer001,
	// Phase O-D
	aeoDirectAnswerParagraph001 as _aeoDirectAnswerParagraph001,
	aeoDurationInfo001 as _aeoDurationInfo001,
	aeoFaq001 as _aeoFaq001,
	aeoFaqCount001 as _aeoFaqCount001,
	aeoFaqSchema001 as _aeoFaqSchema001,
	aeoHeadingQuestionRatio001 as _aeoHeadingQuestionRatio001,
	aeoLastUpdated001 as _aeoLastUpdated001,
	aeoListAndTable001 as _aeoListAndTable001,
	aeoListFormat001 as _aeoListFormat001,
	aeoLocalService001 as _aeoLocalService001,
	aeoNumericFacts001 as _aeoNumericFacts001,
	aeoOrgAnswer001 as _aeoOrgAnswer001,
	aeoParagraphStructure001 as _aeoParagraphStructure001,
	aeoPriceInfo001 as _aeoPriceInfo001,
	aeoProcessInfo001 as _aeoProcessInfo001,
	aeoPublisherInfo001 as _aeoPublisherInfo001,
	aeoQaPairMarkup001 as _aeoQaPairMarkup001,
	aeoQuestionFormat001 as _aeoQuestionFormat001,
	aeoScannable001 as _aeoScannable001,
	aeoServiceDesc001 as _aeoServiceDesc001,
	aeoTargetCustomer001 as _aeoTargetCustomer001,
	aeoTestimonial001 as _aeoTestimonial001,
} from "./aeo-rules.js";

import {
	geoAddress001 as _geoAddress001,
	geoAiSummary001 as _geoAiSummary001,
	geoBrandConsistency001 as _geoBrandConsistency001,
	geoBrandInH1001 as _geoBrandInH1001,
	// Phase O-D
	geoBrandInTitle001 as _geoBrandInTitle001,
	geoBrandMention001 as _geoBrandMention001,
	geoBusinessHoursDetail001 as _geoBusinessHoursDetail001,
	geoBusinessName001 as _geoBusinessName001,
	geoContact001 as _geoContact001,
	geoDirectionsInfo001 as _geoDirectionsInfo001,
	geoIndustry001 as _geoIndustry001,
	geoLlmsTxt001 as _geoLlmsTxt001,
	geoLocalBusinessSchema001 as _geoLocalBusinessSchema001,
	geoLocationSchema001 as _geoLocationSchema001,
	geoMapEmbed001 as _geoMapEmbed001,
	geoMultipleLang001 as _geoMultipleLang001,
	geoNapConsistency001 as _geoNapConsistency001,
	geoOgImage001 as _geoOgImage001,
	geoOpeningHours001 as _geoOpeningHours001,
	geoOrganizationSchema001 as _geoOrganizationSchema001,
	geoPhone001 as _geoPhone001,
	geoPhoneFormat001 as _geoPhoneFormat001,
	geoRegion001 as _geoRegion001,
	geoReviewAggregate001 as _geoReviewAggregate001,
	geoService001 as _geoService001,
	geoSocialProof001 as _geoSocialProof001,
	geoTrust001 as _geoTrust001,
} from "./geo-rules.js";

import {
	nlpEeatAuthor001 as _nlpEeatAuthor001,
	nlpEeatExpertise001 as _nlpEeatExpertise001,
	nlpEeatTrust001 as _nlpEeatTrust001,
	nlpKeywordDensity001 as _nlpKeywordDensity001,
	nlpReadability001 as _nlpReadability001,
	nlpSemanticAlign001 as _nlpSemanticAlign001,
	nlpSentenceLength001 as _nlpSentenceLength001,
	nlpTopicRelevance001 as _nlpTopicRelevance001,
} from "./nlp-rules.js";

// Phase R-D: BACKLINK + A11Y
import {
	backlinkAgeSignal001 as _backlinkAgeSignal001,
	backlinkCanonicalConsistency001 as _backlinkCanonicalConsistency001,
	backlinkDa001 as _backlinkDa001,
	backlinkHttps001 as _backlinkHttps001,
	backlinkInternalLinkDepth001 as _backlinkInternalLinkDepth001,
	backlinkLinkEquity001 as _backlinkLinkEquity001,
	backlinkSocialMeta001 as _backlinkSocialMeta001,
	backlinkStructuredDataDiversity001 as _backlinkStructuredDataDiversity001,
} from "./backlink-rules.js";

import {
	a11yAriaValid001 as _a11yAriaValid001,
	a11yAutoplay001 as _a11yAutoplay001,
	a11yButtonName001 as _a11yButtonName001,
	a11yColorContrast001 as _a11yColorContrast001,
	a11yDocLang001 as _a11yDocLang001,
	a11yDocTitle001 as _a11yDocTitle001,
	a11yFocusOrder001 as _a11yFocusOrder001,
	a11yFocusVisible001 as _a11yFocusVisible001,
	a11yFormLabel001 as _a11yFormLabel001,
	a11yHeadingOrder001 as _a11yHeadingOrder001,
	a11yImageAlt001 as _a11yImageAlt001,
	a11yLandmark001 as _a11yLandmark001,
	a11yLinkName001 as _a11yLinkName001,
	a11yList001 as _a11yList001,
	a11yTabindex001 as _a11yTabindex001,
} from "./a11y-rules.js";

/** SEO 규칙 배열 (48개) — Phase M-A 36 + Phase O-D 12 */
export const SEO_RULES: Rule[] = [
	_seoTitle001,
	_seoTitle002,
	_seoMeta001,
	_seoMeta002,
	_seoH1001,
	_seoH1002,
	_seoH2001,
	_seoImgAlt001,
	_seoCanonical001,
	_seoRobots001,
	_seoSitemap001,
	_seoMobile001,
	_seoUrl001,
	_seoKeyword001,
	_seoInternalLink001,
	_seoCta001,
	_seoRegion001,
	_seoHttps001,
	_seoLang001,
	_seoOg001,
	_seoOg002,
	_seoTwitter001,
	_seoFavicon001,
	_seoImgLazy001,
	_seoImgDimensions001,
	_seoImgFormat001,
	_seoLinkNewtab001,
	_seoStructuredData001,
	_seoBreadcrumb001,
	_seoWordCount001,
	_seoKoreanUrl001,
	_seoHreflang001,
	_seoPageDepth001,
	_seoNaverMeta001,
	_seoDuplicateContent001,
	_seoExternalLinkCount001,
	// Phase O-D 신규 (+12)
	_seoHttp2001,
	_seoPageLangConsistency001,
	_seoAmpValid001,
	_seoXmlSitemapValid001,
	_seoPagination001,
	_seoContentFreshness001,
	_seoDuplicateMetaDesc001,
	_seoHeadingHierarchy001,
	_seoTrailingSlash001,
	_seoCanonicalSelf001,
	_seoBrokenLink001,
	_seoRedirectChain001,
	// Phase P-A NLP 룰 (+5, category="seo")
	_nlpKeywordDensity001,
	_nlpTopicRelevance001,
	_nlpReadability001,
	_nlpSentenceLength001,
	_nlpSemanticAlign001,
];

/** AEO 규칙 배열 (30개) — Phase M-A 20 + Phase O-D 10 */
export const AEO_RULES: Rule[] = [
	_aeoFaq001,
	_aeoFaqSchema001,
	_aeoQuestionFormat001,
	_aeoServiceDesc001,
	_aeoPriceInfo001,
	_aeoProcessInfo001,
	_aeoDurationInfo001,
	_aeoTargetCustomer001,
	_aeoDirectAnswer001,
	_aeoLocalService001,
	_aeoAnswerLength001,
	_aeoDefinition001,
	_aeoParagraphStructure001,
	_aeoAuthorSchema001,
	_aeoListFormat001,
	_aeoDateRecent001,
	_aeoContactDirect001,
	_aeoTestimonial001,
	_aeoQaPairMarkup001,
	_aeoOrgAnswer001,
	// Phase O-D 신규 (+10)
	_aeoDirectAnswerParagraph001,
	_aeoListAndTable001,
	_aeoScannable001,
	_aeoNumericFacts001,
	_aeoAuthorAttribution001,
	_aeoLastUpdated001,
	_aeoCitation001,
	_aeoPublisherInfo001,
	_aeoFaqCount001,
	_aeoHeadingQuestionRatio001,
	// Phase P-A NLP 룰 (+3, category="aeo")
	_nlpEeatAuthor001,
	_nlpEeatExpertise001,
	_nlpEeatTrust001,
];

/** GEO 규칙 배열 (27개) — Phase M-A 19 + Phase O-D 8 */
export const GEO_RULES: Rule[] = [
	_geoBusinessName001,
	_geoIndustry001,
	_geoRegion001,
	_geoService001,
	_geoTrust001,
	_geoLocalBusinessSchema001,
	_geoOrganizationSchema001,
	_geoLlmsTxt001,
	_geoAiSummary001,
	_geoSocialProof001,
	_geoContact001,
	_geoOpeningHours001,
	_geoPhone001,
	_geoAddress001,
	_geoBrandMention001,
	_geoOgImage001,
	_geoNapConsistency001,
	_geoLocationSchema001,
	_geoMultipleLang001,
	// Phase O-D 신규 (+8)
	_geoBrandInTitle001,
	_geoBrandInH1001,
	_geoBrandConsistency001,
	_geoMapEmbed001,
	_geoDirectionsInfo001,
	_geoBusinessHoursDetail001,
	_geoPhoneFormat001,
	_geoReviewAggregate001,
];

/**
 * NLP 룰 배열 (8개) — Phase P-A.
 *
 * 이 배열은 카탈로그/디버깅용 평면 목록이다.
 * 실제 Analyzer 실행 경로에서는 각 룰이 category("seo"|"aeo") 에 따라
 * 이미 SEO_RULES / AEO_RULES 에도 포함되어 있다.
 */
export const NLP_RULES: Rule[] = [
	_nlpKeywordDensity001,
	_nlpTopicRelevance001,
	_nlpReadability001,
	_nlpSentenceLength001,
	_nlpEeatAuthor001,
	_nlpEeatExpertise001,
	_nlpEeatTrust001,
	_nlpSemanticAlign001,
];

/**
 * BACKLINK 룰 배열 (8개) — Phase R-D.
 *
 * informational. 점수 가중치(scoring.ts)에 포함되지 않는다.
 * ctx.backlinkResult 없으면 모든 룰이 passed=true 로 반환된다.
 */
export const BACKLINK_RULES: Rule[] = [
	_backlinkDa001,
	_backlinkHttps001,
	_backlinkCanonicalConsistency001,
	_backlinkStructuredDataDiversity001,
	_backlinkSocialMeta001,
	_backlinkInternalLinkDepth001,
	_backlinkLinkEquity001,
	_backlinkAgeSignal001,
];

/**
 * A11Y 룰 배열 (15개) — Phase R-D.
 *
 * informational. 점수 가중치(scoring.ts)에 포함되지 않는다.
 * ctx.a11yResult 없으면 모든 룰이 passed=true 로 반환된다.
 */
export const A11Y_RULES: Rule[] = [
	_a11yColorContrast001,
	_a11yImageAlt001,
	_a11yFormLabel001,
	_a11yButtonName001,
	_a11yLinkName001,
	_a11yDocLang001,
	_a11yDocTitle001,
	_a11yHeadingOrder001,
	_a11yLandmark001,
	_a11yFocusVisible001,
	_a11yAriaValid001,
	_a11yList001,
	_a11yTabindex001,
	_a11yAutoplay001,
	_a11yFocusOrder001,
];
