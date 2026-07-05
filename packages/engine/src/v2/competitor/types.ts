/**
 * X-SAG Core Engine — Competitor Discovery 타입 정의
 *
 * TRD § 19.2.4 CompetitorDiscoveryEngine 인터페이스.
 * POLICY § 5.4: 의료/SNS 도메인 제외
 * POLICY § 23.4: 인기 점수 가중치
 */

import type { SerpCompetitor } from "../serp/types.js";

// ---------------------------------------------------------------------------
// DiscoveryInput
// ---------------------------------------------------------------------------

export interface DiscoveryInput {
	/** 업종 (예: "카페/음식점") */
	industry: string;
	/** 지역 (예: "서울 강남구") */
	region: string;
	/** 검색 키워드 목록 */
	targetKeywords: string[];
	/** 제외할 URL 목록 (자기 매장 등) */
	excludeUrls?: string[];
	/** 반환할 최대 경쟁사 수. Pro: 3, Business: 10 */
	topN: number;
}

// ---------------------------------------------------------------------------
// DiscoveredCompetitor
// ---------------------------------------------------------------------------

export interface DiscoveredCompetitor extends SerpCompetitor {
	/** 추정 점수 (경쟁사 진단 완료 후 채워짐) */
	estimatedScores?: {
		seo: number;
		aeo: number;
		geo: number;
		overall: number;
	};
	/** 연결된 진단 리포트 ID (있는 경우) */
	diagnosisReportId?: string;
}

// ---------------------------------------------------------------------------
// DiscoveryResult
// ---------------------------------------------------------------------------

export type DiscoverySignalSource = "serp" | "cache" | "manual";

export interface DiscoveryResult {
	/** 발견된 경쟁사 목록 (랭킹 순) */
	competitors: DiscoveredCompetitor[];
	/** 신호 출처 */
	signalSource: DiscoverySignalSource;
	/** 발견 시각 (ISO 8601) */
	discoveredAt: string;
}
