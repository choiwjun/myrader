/**
 * X-SAG Core Engine — Analyzer Types
 *
 * TASK-CORE-003, TASK-CORE-004, TASK-CORE-005
 * POLICY § 7.1: 규칙 기반 항목은 결정적·재현 가능해야 한다.
 * TRD § 10.3~10.5: Analyzer 입출력 명세.
 * TRD § 19.2.3: PERF 카테고리 추가 (Phase M-C).
 * Phase R-D: backlink, a11y 카테고리 추가 (informational, 점수 미포함).
 */

import type { ParsedPage } from "../types.js";
import type { A11yResult } from "../v2/a11y/types.js";
import type { BacklinkResult } from "../v2/backlink/types.js";
import type { NlpResult } from "../v2/nlp/types.js";
import type { LighthouseResult } from "../v2/perf/types.js";
import type { ExtractedEntities } from "./types/extracted-entities.js";

// Phase 0: bodyText 1회 파싱으로 추출한 NAP 엔티티를 룰 간 공유 (additive, optional).
export type { ExtractedEntities };

// ---------------------------------------------------------------------------
// Category — 모든 룰의 카테고리 union
// ---------------------------------------------------------------------------

export type Category = "seo" | "aeo" | "geo" | "perf" | "backlink" | "a11y";

// ---------------------------------------------------------------------------
// RuleContext — 모든 Analyzer 룰 함수가 공유하는 입력 컨텍스트
// ---------------------------------------------------------------------------

export interface BusinessProfile {
	businessName: string;
	industry: string;
	region: string;
	mainServices: string[];
	targetKeywords: string[];
}

export interface RuleContext {
	/** 동일 사이트의 분석된 페이지들 */
	pages: ParsedPage[];
	/** 메인 페이지 (isMainPage === true or pages[0]) */
	mainPage: ParsedPage;
	/** 진단 요청 시 사용자가 입력한 업체 정보 */
	businessProfile: BusinessProfile;
	/** Lighthouse 측정 결과 (PERF 룰 전용, 없으면 undefined) */
	lighthouseResult?: LighthouseResult;
	/** NLP 분석 결과 (NLP 룰 전용, 없으면 undefined — 룰은 정보 부족으로 passed=true 처리) */
	nlpResult?: NlpResult;
	/** 백링크/도메인 권위 결과 (BACKLINK 룰 전용, 없으면 informational 처리) */
	backlinkResult?: BacklinkResult;
	/** 접근성 분석 결과 (A11Y 룰 전용, 없으면 informational 처리) */
	a11yResult?: A11yResult;
	/** 크롤러가 sitemap.xml 을 실제 URL 선정에 사용했는지 여부 (SEO sitemap 룰 실측 신호) */
	sitemapUsed?: boolean;
	/**
	 * Phase 0: bodyText 에서 1회 추출한 NAP 엔티티 (전화/주소/업체명 변형 등).
	 * analyzeAEO/analyzeGEO 가 undefined 일 때 채운다. 룰은 inline-fallback
	 * (buildExtractedEntities) 으로 누락 시에도 안전하게 읽는다.
	 */
	extractedEntities?: ExtractedEntities;
}

// ---------------------------------------------------------------------------
// RuleResult — 각 규칙이 반환하는 결과 (Scoring Engine 입력)
// ---------------------------------------------------------------------------

export interface RuleResult {
	/** 규칙 고유 ID. 예: "SEO-TITLE-001" */
	ruleId: string;
	category: Category;
	/** true = 통과, false = 문제 발견 */
	passed: boolean;
	severity: "high" | "medium" | "low";
	/** 사용자에게 보일 항목명 */
	title: string;
	/** 사용자 친화 설명 (왜 문제인지) */
	description: string;
	/** 어떤 데이터로 판단했는지 (URL, 텍스트 발췌) */
	evidence: string[];
	/** 권장 수정안 — 규칙 기반 정적 텍스트. AI 생성 X (POLICY § 7.1) */
	recommendation: string;
	actionType: "self_fix" | "snippet_action" | "vendor_action" | "si_action";
	difficulty: "easy" | "medium" | "hard";
	expectedImpact: "low" | "medium" | "high";
	/** Optional scoring participation metadata. Absent means scored for ordinary positive-weight rules. */
	scoreImpact?: "scored" | "informational" | "not_applicable" | "unavailable";
	/** 0~10. Scoring Engine 이 가중치 계산에 사용. high=10, medium=6, low=3 */
	ruleWeight: number;
}

// ---------------------------------------------------------------------------
// Rule — 단일 규칙 함수 타입
// ---------------------------------------------------------------------------

export type Rule = (ctx: RuleContext) => RuleResult;

// ---------------------------------------------------------------------------
// AnalyzerResult — Analyzer 최종 출력
// ---------------------------------------------------------------------------

export interface AnalyzerResult {
	category: Category;
	results: RuleResult[];
}
