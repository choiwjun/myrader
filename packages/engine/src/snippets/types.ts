/**
 * X-SAG Core Engine — Snippet Generator Types
 *
 * TASK-CORE-009: Snippet Generator (7가지)
 * TRD § 10.9
 */

import type { SnippetType } from "@boina/contracts/enums";

// ---------------------------------------------------------------------------
// SnippetInput — 스니펫 생성에 필요한 업체 프로필 입력
// ---------------------------------------------------------------------------

export interface OperatingHour {
	day: string; // e.g. "Mo", "Tu", "월요일~금요일"
	open: string; // e.g. "09:00"
	close: string; // e.g. "18:00"
}

export interface BusinessProfile {
	businessName: string;
	industry: string;
	region: string;
	websiteUrl: string;
	mainServices: string[];
	targetKeywords?: string[];
	phone?: string;
	email?: string;
	address?: string;
	operatingHours?: OperatingHour[];
}

export interface FaqItem {
	question: string;
	answer: string;
}

export interface BreadcrumbItem {
	name: string;
	url: string;
}

export interface SnippetInput {
	businessProfile: BusinessProfile;
	// FAQ_SCHEMA / FAQ_HTML 용
	faqs?: FaqItem[];
	// BREADCRUMB 용
	breadcrumbs?: BreadcrumbItem[];
}

// ---------------------------------------------------------------------------
// SnippetOutput — 스니펫 생성 결과
// ---------------------------------------------------------------------------

export interface SnippetOutput {
	type: SnippetType;
	format: "json-ld" | "html" | "plain-text";
	code: string;
	/** 한국어 설치 안내 */
	installGuide: string;
	installLocation: "head" | "body" | "root";
	/** 업체 전달 문구 */
	vendorInstruction: string;
	/** 적용 확인 방법 */
	verifyMethod: string;
	/** false — 규칙 기반 생성 (AI 미사용) */
	aiGenerated: boolean;
}

// ---------------------------------------------------------------------------
// SnippetGenerator — 단일 스니펫 생성 함수 타입
// ---------------------------------------------------------------------------

export type SnippetGenerator = (input: SnippetInput) => SnippetOutput;
