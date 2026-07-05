/**
 * X-SAG Core Engine — Topic Cluster Analyzer
 *
 * Phase R-C: 단일/다중 페이지에서 토픽을 클러스터링한다.
 *
 * 알고리즘 (rule-based, 결정적):
 * 1. 각 페이지에서 명사 추출 (KoreanMorphologyAnalyzer.extractNouns).
 * 2. 명사 빈도 → TF-IDF (페이지 간 분산도) 로 가중치 계산.
 * 3. 공출현 빈도 → 같은 페이지에 함께 등장한 명사 그룹화.
 * 4. 그룹의 가장 높은 TF-IDF 명사를 topic 으로 명명.
 * 5. INDUSTRY_TOPICS 의 권장 토픽과 대조 → missing/irrelevant 추출.
 *
 * POLICY § 7.1: 결정적·재현 가능.
 */

import type { KoreanMorphologyAnalyzer } from "./providers/korean-morphology.js";
import type { TopicCluster, TopicClusterResult } from "./types.js";

// ---------------------------------------------------------------------------
// 업종별 권장 토픽 dictionary (20+ 업종)
// 각 업종에서 사이트가 다뤄야 할 표준 토픽들. 비정형 키워드 매칭에 사용.
// ---------------------------------------------------------------------------
export const INDUSTRY_TOPICS: Record<string, readonly string[]> = {
	카페: [
		"메뉴",
		"원두",
		"분위기",
		"위치",
		"운영시간",
		"와이파이",
		"주차",
		"디저트",
		"음료",
		"커피",
	],
	미용실: [
		"헤어",
		"스타일",
		"가격",
		"디자이너",
		"예약",
		"샴푸",
		"펌",
		"염색",
		"위치",
		"커트",
	],
	음식점: [
		"메뉴",
		"맛",
		"가격",
		"분위기",
		"주차",
		"예약",
		"재료",
		"위치",
		"코스",
		"운영시간",
	],
	병원: [
		"진료",
		"예약",
		"위치",
		"의료진",
		"전문",
		"치료",
		"수술",
		"보험",
		"검진",
		"상담",
	],
	치과: [
		"임플란트",
		"교정",
		"충치",
		"스케일링",
		"치료",
		"예약",
		"위치",
		"보험",
		"상담",
		"통증",
	],
	변호사: [
		"상담",
		"사건",
		"이혼",
		"형사",
		"민사",
		"수임료",
		"경력",
		"성공사례",
		"전문",
		"위치",
	],
	세무사: [
		"세무",
		"신고",
		"기장",
		"절세",
		"상담",
		"수수료",
		"위치",
		"경력",
		"법인",
		"개인사업자",
	],
	헬스장: [
		"PT",
		"회원권",
		"트레이너",
		"운동",
		"기구",
		"샤워실",
		"위치",
		"이용시간",
		"락커",
		"GX",
	],
	학원: [
		"강의",
		"강사",
		"수강료",
		"시간표",
		"교재",
		"위치",
		"후기",
		"합격",
		"커리큘럼",
		"상담",
	],
	부동산: [
		"매물",
		"전세",
		"월세",
		"매매",
		"시세",
		"지역",
		"평수",
		"관리비",
		"층수",
		"상담",
	],
	자동차정비: [
		"정비",
		"수리",
		"엔진",
		"타이어",
		"오일",
		"견적",
		"위치",
		"경력",
		"정품",
		"보증",
	],
	여행사: [
		"패키지",
		"항공",
		"호텔",
		"투어",
		"일정",
		"가격",
		"출발",
		"예약",
		"여행지",
		"후기",
	],
	펜션: [
		"객실",
		"수영장",
		"바베큐",
		"예약",
		"위치",
		"조식",
		"가격",
		"주차",
		"와이파이",
		"체크인",
	],
	꽃집: [
		"꽃다발",
		"결혼식",
		"장례식",
		"배달",
		"주문",
		"가격",
		"위치",
		"선물",
		"디자인",
		"조화",
	],
	사진관: [
		"촬영",
		"스튜디오",
		"가족사진",
		"증명사진",
		"웨딩",
		"프로필",
		"예약",
		"가격",
		"위치",
		"보정",
	],
	가죽공방: [
		"클래스",
		"수업",
		"가죽",
		"공방",
		"체험",
		"가방",
		"지갑",
		"예약",
		"위치",
		"재료",
	],
	네일샵: [
		"네일아트",
		"젤네일",
		"케어",
		"예약",
		"가격",
		"디자인",
		"위치",
		"디자이너",
		"패디큐어",
		"리무브",
	],
	요가원: [
		"요가",
		"필라테스",
		"강사",
		"회원권",
		"수업",
		"예약",
		"위치",
		"그룹",
		"개인레슨",
		"체험",
	],
	애견샵: [
		"미용",
		"분양",
		"사료",
		"용품",
		"위치",
		"예약",
		"강아지",
		"고양이",
		"케어",
		"병원",
	],
	세탁소: [
		"세탁",
		"드라이",
		"수선",
		"가격",
		"위치",
		"픽업",
		"배달",
		"운영시간",
		"특수세탁",
		"이불",
	],
	안경원: [
		"안경",
		"선글라스",
		"렌즈",
		"시력검사",
		"가격",
		"위치",
		"브랜드",
		"예약",
		"수리",
		"보증",
	],
};

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface TopicInputPage {
	url: string;
	title: string;
	bodyText: string;
}

export interface TopicInput {
	pages: TopicInputPage[];
	industry: string;
	region: string;
	targetKeywords: string[];
}

// ---------------------------------------------------------------------------
// Internal — TF-IDF
// ---------------------------------------------------------------------------

interface PageNounMap {
	url: string;
	title: string;
	/** word → count in this page */
	counts: Map<string, number>;
	totalNouns: number;
}

function buildPageNouns(
	morph: KoreanMorphologyAnalyzer,
	pages: TopicInputPage[],
): PageNounMap[] {
	return pages.map((page) => {
		const nouns = morph.extractNouns(`${page.title} ${page.bodyText}`, {
			minLength: 2,
		});
		const counts = new Map<string, number>();
		let total = 0;
		for (const n of nouns) {
			counts.set(n.word, n.count);
			total += n.count;
		}
		return {
			url: page.url,
			title: page.title,
			counts,
			totalNouns: total,
		};
	});
}

/** TF-IDF 가중치. tf = 페이지 내 빈도/페이지 총명사. idf = log(N/df). */
function calculateTfIdf(
	pageMaps: PageNounMap[],
): Map<string, Map<string, number>> {
	const totalPages = pageMaps.length;
	// df: document frequency — 단어가 등장하는 페이지 수
	const df = new Map<string, number>();
	for (const p of pageMaps) {
		for (const word of p.counts.keys()) {
			df.set(word, (df.get(word) ?? 0) + 1);
		}
	}

	// 페이지별 word → tfidf
	const result = new Map<string, Map<string, number>>();
	for (const p of pageMaps) {
		const m = new Map<string, number>();
		for (const [word, count] of p.counts.entries()) {
			const tf = count / Math.max(p.totalNouns, 1);
			const documentFreq = df.get(word) ?? 1;
			// idf = log((N + 1) / (df + 1)) + 1 (smoothed)
			const idf = Math.log((totalPages + 1) / (documentFreq + 1)) + 1;
			m.set(word, tf * idf);
		}
		result.set(p.url, m);
	}
	return result;
}

// ---------------------------------------------------------------------------
// 공출현 그룹화 — 같은 페이지에 함께 등장한 명사들을 묶어 토픽 클러스터로
// ---------------------------------------------------------------------------

interface CooccurrenceGroup {
	centerWord: string;
	related: string[];
	pageUrls: Set<string>;
	totalScore: number;
}

function clusterByCooccurrence(
	pageMaps: PageNounMap[],
	tfidfByPage: Map<string, Map<string, number>>,
	maxClusters: number,
): CooccurrenceGroup[] {
	// 전역 TF-IDF 합산 — 각 단어의 사이트 전체 중요도
	const globalScore = new Map<string, number>();
	for (const m of tfidfByPage.values()) {
		for (const [word, score] of m.entries()) {
			globalScore.set(word, (globalScore.get(word) ?? 0) + score);
		}
	}

	// 상위 후보 단어 (toN * 5)
	const candidates = Array.from(globalScore.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, Math.max(maxClusters * 5, 20))
		.map(([word]) => word);

	const used = new Set<string>();
	const groups: CooccurrenceGroup[] = [];

	for (const center of candidates) {
		if (groups.length >= maxClusters) break;
		if (used.has(center)) continue;

		// center 가 등장한 페이지들
		const centerPages = new Set<string>();
		for (const p of pageMaps) {
			if (p.counts.has(center)) centerPages.add(p.url);
		}
		if (centerPages.size === 0) continue;

		// center 와 자주 함께 등장한 단어들
		const cooccur = new Map<string, number>();
		for (const p of pageMaps) {
			if (!p.counts.has(center)) continue;
			for (const word of p.counts.keys()) {
				if (word === center) continue;
				if (used.has(word)) continue;
				cooccur.set(word, (cooccur.get(word) ?? 0) + 1);
			}
		}
		// 공출현 상위 5개 (페이지 2+ 공출현만)
		const minCooccur = Math.max(1, Math.floor(centerPages.size * 0.4));
		const related = Array.from(cooccur.entries())
			.filter(([, cnt]) => cnt >= minCooccur)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([word]) => word);

		used.add(center);
		for (const r of related) used.add(r);

		groups.push({
			centerWord: center,
			related,
			pageUrls: centerPages,
			totalScore: globalScore.get(center) ?? 0,
		});
	}

	return groups;
}

// ---------------------------------------------------------------------------
// Relevance scoring — industry/keywords 와의 의미적 거리
// ---------------------------------------------------------------------------

function calculateRelevance(
	topicKeywords: string[],
	industry: string,
	targetKeywords: string[],
): number {
	const expected = INDUSTRY_TOPICS[industry] ?? [];
	const allReferences = [...expected, ...targetKeywords, industry].map((s) =>
		s.toLowerCase(),
	);
	if (allReferences.length === 0) return 0.5;

	let matched = 0;
	for (const kw of topicKeywords) {
		const lower = kw.toLowerCase();
		for (const ref of allReferences) {
			if (!ref) continue;
			if (lower === ref || lower.includes(ref) || ref.includes(lower)) {
				matched += 1;
				break;
			}
		}
	}
	if (topicKeywords.length === 0) return 0;
	return Math.min(matched / topicKeywords.length, 1);
}

// ---------------------------------------------------------------------------
// Public Analyzer
// ---------------------------------------------------------------------------

export class TopicClusterAnalyzer {
	constructor(private readonly morph: KoreanMorphologyAnalyzer) {}

	async analyze(input: TopicInput): Promise<TopicClusterResult> {
		if (!input.pages || input.pages.length === 0) {
			return {
				clusters: [],
				missingTopics: INDUSTRY_TOPICS[input.industry]
					? [...INDUSTRY_TOPICS[input.industry]!]
					: [],
				irrelevantTopics: [],
				source: "rule-based",
			};
		}

		const pageMaps = buildPageNouns(this.morph, input.pages);
		const totalSiteWords = pageMaps.reduce((sum, p) => sum + p.totalNouns, 0);

		const tfidf = calculateTfIdf(pageMaps);
		const groups = clusterByCooccurrence(pageMaps, tfidf, 10);

		const clusters: TopicCluster[] = groups.map((g) => {
			const topicKeywords = [g.centerWord, ...g.related];
			const relevance = calculateRelevance(
				topicKeywords,
				input.industry,
				input.targetKeywords,
			);

			// coverage: 이 topic 의 단어들이 사이트 전체 명사 중 차지 비율
			let topicWordCount = 0;
			for (const p of pageMaps) {
				for (const kw of topicKeywords) {
					topicWordCount += p.counts.get(kw) ?? 0;
				}
			}
			const coverage =
				totalSiteWords > 0
					? Math.round((topicWordCount / totalSiteWords) * 10000) / 10000
					: 0;

			return {
				topic: g.centerWord,
				keywords: topicKeywords,
				pageCount: g.pageUrls.size,
				pageUrls: Array.from(g.pageUrls),
				relevance: Math.round(relevance * 10000) / 10000,
				coverage,
			};
		});

		// 정렬: relevance × coverage 내림차순
		clusters.sort(
			(a, b) => b.relevance * b.coverage - a.relevance * a.coverage,
		);

		// Missing / Irrelevant 분석
		const expectedTopics = INDUSTRY_TOPICS[input.industry] ?? [];
		const foundKeywords = new Set<string>();
		for (const c of clusters) {
			for (const kw of c.keywords) foundKeywords.add(kw.toLowerCase());
		}
		// 모든 페이지 본문에서도 검색
		const allBodyText = input.pages
			.map((p) => `${p.title} ${p.bodyText}`)
			.join(" ")
			.toLowerCase();

		const missingTopics = expectedTopics.filter((t) => {
			const lower = t.toLowerCase();
			if (foundKeywords.has(lower)) return false;
			if (allBodyText.includes(lower)) return false;
			return true;
		});

		// Irrelevant: cluster 중 relevance < 0.2 인 토픽
		const irrelevantTopics = clusters
			.filter((c) => c.relevance < 0.2)
			.map((c) => c.topic);

		return {
			clusters,
			missingTopics,
			irrelevantTopics,
			source: "rule-based",
		};
	}
}
