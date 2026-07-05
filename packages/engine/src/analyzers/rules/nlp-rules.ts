/**
 * X-SAG Core Engine — NLP 기반 룰 카탈로그
 *
 * Phase P-A: NLP 콘텐츠 분석 룰 8개.
 *
 * 룰들은 RuleContext.nlpResult 가 있을 때만 실질 평가하고,
 * 없으면 passed=true 로 처리한다 (정보 부족 — 규칙 위반 아님).
 *
 * 카테고리 매핑:
 * - 키워드/토픽/가독성/의미 일치도 → "seo"
 * - E-E-A-T (Author/Expertise/Trust) → "aeo"
 *
 * ruleWeight: high=10, medium=6, low=3
 */

import type { NlpResult } from "../../v2/nlp/types.js";
import type { Rule, RuleResult } from "../types.js";

// ---------------------------------------------------------------------------
// 공통: nlpResult 없을 때 반환할 placeholder (정보 부족 = passed)
// ---------------------------------------------------------------------------

function nlpUnavailable(
	ruleId: string,
	category: "seo" | "aeo",
	severity: "high" | "medium" | "low",
	title: string,
	weight: number,
): RuleResult {
	return {
		ruleId,
		category,
		passed: true,
		severity,
		title,
		description: "NLP 분석 결과가 없어 평가를 건너뜁니다.",
		evidence: ["NLP 분석 미실행"],
		recommendation:
			"NLP 분석을 활성화하려면 ChatMock 또는 rule-based NLP 어댑터를 연결하세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: weight,
	};
}

// ---------------------------------------------------------------------------
// NLP-KEYWORD-DENSITY-001: 목표 키워드 밀도 1~3%
// ---------------------------------------------------------------------------

export const nlpKeywordDensity001: Rule = (ctx): RuleResult => {
	const nlp: NlpResult | undefined = ctx.nlpResult;
	if (!nlp) {
		return nlpUnavailable(
			"NLP-KEYWORD-DENSITY-001",
			"seo",
			"medium",
			"목표 키워드 밀도 적절성",
			6,
		);
	}
	const targets = nlp.keywordDensity.targetKeywords;
	if (targets.length === 0) {
		return {
			ruleId: "NLP-KEYWORD-DENSITY-001",
			category: "seo",
			passed: true,
			severity: "medium",
			title: "목표 키워드 밀도 적절성",
			description: "목표 키워드가 입력되지 않아 평가를 건너뜁니다.",
			evidence: ["targetKeywords 없음"],
			recommendation:
				"진단 요청 시 핵심 키워드 2~5개를 입력하면 키워드 밀도 분석이 가능합니다.",
			actionType: "self_fix",
			difficulty: "easy",
			expectedImpact: "medium",
			ruleWeight: 6,
		};
	}
	// 목표: 키워드 밀도 1% ~ 3%
	const inRange = targets.filter((t) => t.density >= 0.01 && t.density <= 0.03);
	const tooLow = targets.filter((t) => t.density < 0.01);
	const tooHigh = targets.filter((t) => t.density > 0.03);
	const passed = inRange.length >= Math.ceil(targets.length * 0.5);

	return {
		ruleId: "NLP-KEYWORD-DENSITY-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "목표 키워드 밀도 적절성 (1~3%)",
		description: passed
			? `목표 키워드의 절반 이상(${inRange.length}/${targets.length})이 권장 밀도 범위(1~3%) 안에 있습니다.`
			: `목표 키워드 밀도가 권장 범위를 벗어났습니다. 너무 낮음 ${tooLow.length}개 / 너무 높음 ${tooHigh.length}개.`,
		evidence: targets
			.slice(0, 5)
			.map(
				(t) =>
					`${t.keyword}: ${t.count}회 (밀도 ${(t.density * 100).toFixed(2)}%)`,
			),
		recommendation:
			"핵심 키워드는 본문 100단어당 1~3회 등장하는 것이 적절합니다. 너무 적으면 검색 노출이 어렵고, 너무 많으면 키워드 스터핑으로 페널티가 있을 수 있습니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// NLP-TOPIC-RELEVANCE-001: industry/region 이 추출된 topics 에 등장
// ---------------------------------------------------------------------------

export const nlpTopicRelevance001: Rule = (ctx): RuleResult => {
	const nlp = ctx.nlpResult;
	if (!nlp) {
		return nlpUnavailable(
			"NLP-TOPIC-RELEVANCE-001",
			"seo",
			"medium",
			"업종/지역 토픽 관련성",
			6,
		);
	}
	const industry = ctx.businessProfile.industry?.trim() ?? "";
	const region = ctx.businessProfile.region?.trim() ?? "";
	const topics = nlp.topics.map((t) => t.topic.toLowerCase());
	const allTopicText = topics.join(" ");

	const industryFound =
		industry.length > 0 && allTopicText.includes(industry.toLowerCase());
	const regionFound =
		region.length > 0 && allTopicText.includes(region.toLowerCase());

	const passed = industryFound || regionFound;

	return {
		ruleId: "NLP-TOPIC-RELEVANCE-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "업종/지역 토픽 관련성",
		description: passed
			? `추출된 토픽에서 ${industryFound ? "업종" : ""}${industryFound && regionFound ? "·" : ""}${regionFound ? "지역" : ""} 키워드가 발견되었습니다.`
			: `추출된 토픽에 업종(${industry || "(없음)"})과 지역(${region || "(없음)"}) 키워드가 모두 누락되었습니다.`,
		evidence: [
			`업종: ${industry || "(없음)"}`,
			`지역: ${region || "(없음)"}`,
			`추출된 토픽: ${nlp.topics.map((t) => t.topic).join(", ") || "(없음)"}`,
		],
		recommendation:
			"홈페이지 콘텐츠에 업종과 지역 키워드를 자연스럽게 자주 사용하세요. 예: '강남 가죽공방', '서울 인테리어 시공' 처럼 지역+업종 조합을 본문·소제목에 배치하면 좋습니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// NLP-READABILITY-001: 가독성 점수 ≥ 60
// ---------------------------------------------------------------------------

export const nlpReadability001: Rule = (ctx): RuleResult => {
	const nlp = ctx.nlpResult;
	if (!nlp) {
		return nlpUnavailable(
			"NLP-READABILITY-001",
			"seo",
			"medium",
			"콘텐츠 가독성 점수",
			6,
		);
	}
	const score = nlp.readability.score;
	const passed = score >= 60;

	return {
		ruleId: "NLP-READABILITY-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "콘텐츠 가독성 점수 (≥60)",
		description: passed
			? `가독성 점수 ${score}점으로 권장 수준(60점 이상)을 만족합니다.`
			: `가독성 점수 ${score}점으로 낮습니다. 문장이 너무 길거나 단락이 길어 읽기 어려울 수 있습니다.`,
		evidence: [
			`가독성 점수: ${score}/100`,
			`평균 어절 수: ${nlp.readability.avgSentenceLength}`,
			`평균 문장 수/단락: ${nlp.readability.avgParagraphLength}`,
		],
		recommendation:
			"한 문장은 20~25 어절 이내, 한 단락은 3~5 문장이 가독성에 좋습니다. 긴 문장은 둘로 나누고, 핵심을 앞에 두는 두괄식 구성으로 다시 써보세요.",
		actionType: "self_fix",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// NLP-SENTENCE-LENGTH-001: 평균 어절 수 ≤ 25
// ---------------------------------------------------------------------------

export const nlpSentenceLength001: Rule = (ctx): RuleResult => {
	const nlp = ctx.nlpResult;
	if (!nlp) {
		return nlpUnavailable(
			"NLP-SENTENCE-LENGTH-001",
			"seo",
			"low",
			"평균 문장 길이 적절성",
			3,
		);
	}
	const avg = nlp.readability.avgSentenceLength;
	const passed = avg <= 25 && avg > 0;

	return {
		ruleId: "NLP-SENTENCE-LENGTH-001",
		category: "seo",
		passed,
		severity: "low",
		title: "평균 문장 길이 (≤25 어절)",
		description: passed
			? `평균 문장 길이 ${avg} 어절로 한국어 권장 수준(25어절 이하)을 만족합니다.`
			: avg === 0
				? "본문이 비어 있어 문장 길이를 측정할 수 없습니다."
				: `평균 문장 길이가 ${avg} 어절로 너무 깁니다. 모바일에서 읽기 어렵습니다.`,
		evidence: [`평균 어절 수: ${avg}`],
		recommendation:
			"한국어 권장 문장 길이는 20~25 어절입니다. 긴 문장은 '그러나', '그래서' 등의 접속사로 나누거나 마침표로 끊어 짧게 만드세요.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "low",
		ruleWeight: 3,
	};
};

// ---------------------------------------------------------------------------
// NLP-EEAT-AUTHOR-001: hasAuthor = true
// ---------------------------------------------------------------------------

export const nlpEeatAuthor001: Rule = (ctx): RuleResult => {
	const nlp = ctx.nlpResult;
	if (!nlp) {
		return nlpUnavailable(
			"NLP-EEAT-AUTHOR-001",
			"aeo",
			"medium",
			"작성자 정보 표시 여부",
			6,
		);
	}
	const passed = nlp.eeat.hasAuthor;

	return {
		ruleId: "NLP-EEAT-AUTHOR-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "작성자(저자) 정보 표시 여부",
		description: passed
			? "콘텐츠에 작성자 정보가 명시되어 있어 E-E-A-T(전문성·권위·신뢰) 신호가 됩니다."
			: "콘텐츠에 작성자 정보가 없습니다. AI 검색은 작성자 정보가 명시된 콘텐츠를 더 신뢰합니다.",
		evidence: [`hasAuthor: ${passed ? "있음" : "없음"}`],
		recommendation:
			"각 페이지/포스트 상단 또는 하단에 작성자명, 직책, 간단한 약력을 표시하세요. 가능하면 Author Schema(JSON-LD)도 함께 적용하면 좋습니다.",
		actionType: "snippet_action",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// NLP-EEAT-EXPERTISE-001: hasExpertiseSignals ≥ 2
// ---------------------------------------------------------------------------

export const nlpEeatExpertise001: Rule = (ctx): RuleResult => {
	const nlp = ctx.nlpResult;
	if (!nlp) {
		return nlpUnavailable(
			"NLP-EEAT-EXPERTISE-001",
			"aeo",
			"medium",
			"전문성 신호 충분성",
			6,
		);
	}
	const count = nlp.eeat.hasExpertiseSignals;
	const passed = count >= 2;

	return {
		ruleId: "NLP-EEAT-EXPERTISE-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "전문성 신호 (자격·경력·전문가 언급)",
		description: passed
			? `전문성 신호 ${count}건이 발견되어 E-E-A-T 평가에 유리합니다.`
			: `전문성 관련 언급이 ${count}건으로 부족합니다. 권장: 2건 이상.`,
		evidence: [`전문성 신호 카운트: ${count}`],
		recommendation:
			"자격증, 경력(예: 'N년 이상'), 학위, 인증, 전문 자격 등을 본문에 자연스럽게 언급하세요. 'About' 페이지나 회사 소개 영역에 정리하면 효과적입니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// NLP-EEAT-TRUST-001: hasTrustSignals ≥ 2 OR hasFreshness=true
// ---------------------------------------------------------------------------

export const nlpEeatTrust001: Rule = (ctx): RuleResult => {
	const nlp = ctx.nlpResult;
	if (!nlp) {
		return nlpUnavailable(
			"NLP-EEAT-TRUST-001",
			"aeo",
			"medium",
			"신뢰성 신호 (후기·인증·신선도)",
			6,
		);
	}
	const trustCount = nlp.eeat.hasTrustSignals;
	const fresh = nlp.eeat.hasFreshness;
	const passed = trustCount >= 2 || fresh;

	return {
		ruleId: "NLP-EEAT-TRUST-001",
		category: "aeo",
		passed,
		severity: "medium",
		title: "신뢰성 신호 (후기/인증/콘텐츠 최신성)",
		description: passed
			? `신뢰 신호가 충분합니다 (후기·인증 ${trustCount}건${fresh ? ", 최신 날짜 표기 있음" : ""}).`
			: `신뢰 신호가 부족합니다. 후기·인증 ${trustCount}건, 최신 날짜 ${fresh ? "있음" : "없음"}.`,
		evidence: [
			`Trust 카운트: ${trustCount}`,
			`Freshness: ${fresh ? "있음" : "없음"}`,
		],
		recommendation:
			"고객 후기, 수상·인증 내역, 최근 작성/업데이트 날짜를 명시하세요. '최종 업데이트: 2025-01-15' 같은 표시가 콘텐츠 신선도 신호로 작용합니다.",
		actionType: "self_fix",
		difficulty: "easy",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};

// ---------------------------------------------------------------------------
// NLP-SEMANTIC-ALIGN-001: titleBodyAlignment ≥ 0.5
// ---------------------------------------------------------------------------

export const nlpSemanticAlign001: Rule = (ctx): RuleResult => {
	const nlp = ctx.nlpResult;
	if (!nlp) {
		return nlpUnavailable(
			"NLP-SEMANTIC-ALIGN-001",
			"seo",
			"medium",
			"제목-본문 의미 일치도",
			6,
		);
	}
	const align = nlp.semanticRelevance.titleBodyAlignment;
	const passed = align >= 0.5;

	return {
		ruleId: "NLP-SEMANTIC-ALIGN-001",
		category: "seo",
		passed,
		severity: "medium",
		title: "제목-본문 의미 일치도 (≥0.5)",
		description: passed
			? `제목과 본문의 의미 일치도가 ${(align * 100).toFixed(0)}%로 적절합니다.`
			: `제목과 본문의 의미 일치도가 ${(align * 100).toFixed(0)}%로 낮습니다. 제목이 본문 내용을 정확히 반영하지 못하고 있습니다.`,
		evidence: [
			`titleBodyAlignment: ${align.toFixed(3)}`,
			`keywordIntegration: ${nlp.semanticRelevance.keywordIntegration.toFixed(3)}`,
		],
		recommendation:
			"제목에 사용된 핵심 단어가 본문에도 자연스럽게 등장해야 합니다. 제목과 본문이 같은 주제·키워드를 다루는지 다시 점검하세요. 클릭 유도용 과장된 제목은 검색 품질 평가에서 불리합니다.",
		actionType: "self_fix",
		difficulty: "medium",
		expectedImpact: "medium",
		ruleWeight: 6,
	};
};
