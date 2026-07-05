/**
 * X-SAG Core Engine — ExtractedEntities (Phase 0 인프라)
 *
 * POLICY § 7.1: 규칙 기반 정적 분석. 결정적. AI 호출 없음.
 *
 * bodyText 1회 파싱으로 phones/addresses/businessNameVariants 를 추출해 룰 간 공유한다.
 * analyzeAEO/analyzeGEO 가 ctx.extractedEntities 가 undefined 일 때 1회 채운다.
 * 룰은 `ctx.extractedEntities ?? buildExtractedEntities(ctx.mainPage, ctx.businessProfile)`
 * 패턴으로 읽어 누락 시에도 절대 크래시하지 않도록 한다.
 */

import type { ParsedPage } from "../../types.js";
import type { BusinessProfile } from "../types.js";
import {
	type ExtractedAddress,
	type ExtractedPhone,
	extractAddresses,
	extractPhones,
	normalizeBusinessName,
} from "../shared/nap-extractor.js";
import { splitSentences } from "../shared/text-utils.js";

export interface ExtractedEntities {
	phones: ExtractedPhone[];
	addresses: ExtractedAddress[];
	businessNameVariants: string[];
	sentences?: string[];
	wordCount: number;
}

/**
 * page.bodyText 1회 스캔으로 NAP 엔티티를 추출한다.
 * region 은 주소 정렬 힌트로만 사용된다 (필터링 X — nap-extractor GOTCHA 참고).
 */
export function buildExtractedEntities(
	page: ParsedPage,
	profile: BusinessProfile,
): ExtractedEntities {
	const text = page.bodyText ?? "";
	const phones = extractPhones(text);
	const addresses = extractAddresses(text, profile.region);
	const businessNameVariants = profile.businessName
		? normalizeBusinessName(profile.businessName).variants
		: [];
	const sentences = splitSentences(text)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	const wordCount =
		typeof page.wordCount === "number"
			? page.wordCount
			: text.split(/\s+/).filter((w) => w.length > 0).length;
	return {
		phones,
		addresses,
		businessNameVariants,
		sentences,
		wordCount,
	};
}
