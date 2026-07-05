/**
 * X-SAG Core Engine — Cross-Page NLP Analyzer
 *
 * Phase R-C: 다중 페이지를 한 번에 분석하여 사이트 전반의 콘텐츠 품질을 평가.
 *
 * 분석 항목:
 * - 토픽 분포 (TopicClusterAnalyzer 위임)
 * - 중복 콘텐츠 비율 (페이지 간 본문 유사도)
 * - 페이지 깊이 평균 (평균 단어 수)
 * - 키워드 카니발리제이션 (같은 키워드를 2개 이상 페이지가 타겟팅)
 *
 * POLICY § 7.1: 결정적·재현 가능.
 */

import type { ParsedPage } from "../../types.js";
import { KoreanMorphologyAnalyzer } from "./providers/korean-morphology.js";
import { TopicClusterAnalyzer } from "./topic-cluster.js";
import type { CrossPageAnalysis } from "./types.js";

interface CrossPageContext {
	industry: string;
	region: string;
	targetKeywords: string[];
}

/** Jaccard 유사도 — 두 단어 집합의 교집합 / 합집합. */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 && b.size === 0) return 0;
	let intersection = 0;
	for (const w of a) {
		if (b.has(w)) intersection += 1;
	}
	const union = a.size + b.size - intersection;
	return union > 0 ? intersection / union : 0;
}

/** 페이지 본문에서 명사 집합 추출. */
function buildNounSet(
	morph: KoreanMorphologyAnalyzer,
	text: string,
): Set<string> {
	const nouns = morph.extractNouns(text, { minLength: 2 });
	return new Set(nouns.map((n) => n.word));
}

/** 키워드를 타겟팅하는 페이지 — 키워드가 title 또는 H1/H2 또는 본문 다수 등장. */
function detectKeywordTargeting(page: ParsedPage, keyword: string): boolean {
	const lower = keyword.toLowerCase();
	if (!lower) return false;

	const title = (page.title ?? "").toLowerCase();
	if (title.includes(lower)) return true;

	const h1 = (page.h1 ?? "").toLowerCase();
	if (h1.includes(lower)) return true;

	for (const h2 of page.h2) {
		if (h2.toLowerCase().includes(lower)) return true;
	}

	// 본문에 3회 이상 등장하면 타겟팅으로 간주
	const safe = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(safe, "giu");
	const matches = page.bodyText.match(re);
	if (matches && matches.length >= 3) return true;

	return false;
}

/**
 * 사이트 전체 NLP 분석을 수행한다.
 *
 * @param pages 크롤링된 페이지 배열
 * @param context industry/region/targetKeywords
 */
export async function analyzeCrossPage(
	pages: ParsedPage[],
	context: CrossPageContext,
): Promise<CrossPageAnalysis> {
	const morph = new KoreanMorphologyAnalyzer();
	const topicAnalyzer = new TopicClusterAnalyzer(morph);

	// 빈 입력
	if (!pages || pages.length === 0) {
		return {
			totalPages: 0,
			totalWords: 0,
			topicDistribution: [],
			duplicateContentRatio: 0,
			avgWordsPerPage: 0,
			cannibalization: [],
		};
	}

	// 1) 토픽 분포 (TopicClusterAnalyzer)
	const topicInput = {
		pages: pages.map((p) => ({
			url: p.url,
			title: p.title ?? "",
			bodyText: p.bodyText,
		})),
		industry: context.industry,
		region: context.region,
		targetKeywords: context.targetKeywords,
	};
	const topicResult = await topicAnalyzer.analyze(topicInput);

	// 2) 총 단어 수
	const totalWords = pages.reduce((sum, p) => sum + (p.wordCount ?? 0), 0);
	const avgWordsPerPage =
		pages.length > 0 ? Math.round((totalWords / pages.length) * 100) / 100 : 0;

	// 3) 중복 콘텐츠 비율 — 페이지 쌍 간 Jaccard 유사도 평균
	// 명사 집합 기반. > 0.7 면 중복으로 간주.
	let duplicateContentRatio = 0;
	if (pages.length >= 2) {
		const nounSets = pages.map((p) => buildNounSet(morph, p.bodyText));
		let highSimPairs = 0;
		let totalPairs = 0;
		for (let i = 0; i < nounSets.length; i++) {
			for (let j = i + 1; j < nounSets.length; j++) {
				const setA = nounSets[i]!;
				const setB = nounSets[j]!;
				if (setA.size === 0 || setB.size === 0) {
					totalPairs += 1;
					continue;
				}
				const sim = jaccardSimilarity(setA, setB);
				if (sim > 0.7) highSimPairs += 1;
				totalPairs += 1;
			}
		}
		duplicateContentRatio =
			totalPairs > 0
				? Math.round((highSimPairs / totalPairs) * 10000) / 10000
				: 0;
	}

	// 4) 키워드 카니발리제이션 — targetKeywords + 토픽 단어들 검사
	const cannibalizationMap = new Map<string, string[]>();
	const keywordsToCheck = new Set<string>([
		...context.targetKeywords,
		...topicResult.clusters.flatMap((c) => c.keywords).slice(0, 20),
	]);

	for (const kw of keywordsToCheck) {
		if (!kw || kw.length < 2) continue;
		const targetingPages: string[] = [];
		for (const page of pages) {
			if (detectKeywordTargeting(page, kw)) {
				targetingPages.push(page.url);
			}
		}
		if (targetingPages.length >= 2) {
			cannibalizationMap.set(kw, targetingPages);
		}
	}

	const cannibalization = Array.from(cannibalizationMap.entries())
		.map(([keyword, pageUrls]) => ({ keyword, pages: pageUrls }))
		.sort((a, b) => b.pages.length - a.pages.length);

	return {
		totalPages: pages.length,
		totalWords,
		topicDistribution: topicResult.clusters,
		duplicateContentRatio,
		avgWordsPerPage,
		cannibalization,
	};
}
