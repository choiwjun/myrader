/**
 * X-SAG Core Engine — JSON-LD 스키마 검증 (Phase 0 인프라)
 *
 * POLICY § 7.1: 규칙 기반 정적 분석. 결정적. AI 호출 없음.
 *
 * ctx.mainPage.schemaJsonLd (unknown[]) 을 안전하게 순회하기 위한 타입 가드 + 접근자 모음.
 * @type 은 string 또는 string[] 일 수 있으며 모든 가드가 두 형태를 처리한다.
 * getSchemaNodes 는 중첩 배열과 @graph 를 평탄화하므로, 한 번 호출 후 결과 위에서
 * 가드를 돌리는 것이 ctx.mainPage.schemaJsonLd 를 재순회하는 것보다 안전하다.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// zod 스키마 (느슨하게 — JSON-LD 는 임의 키를 허용하므로 passthrough)
// ---------------------------------------------------------------------------

export const PostalAddressSchema = z
	.object({
		"@type": z.union([z.string(), z.array(z.string())]).optional(),
		streetAddress: z.string().optional(),
		addressLocality: z.string().optional(),
		addressRegion: z.string().optional(),
		postalCode: z.string().optional(),
		addressCountry: z
			.union([z.string(), z.record(z.string(), z.unknown())])
			.optional(),
	})
	.passthrough();

export const AggregateRatingSchema = z
	.object({
		"@type": z.union([z.string(), z.array(z.string())]).optional(),
		ratingValue: z.union([z.string(), z.number()]).optional(),
		reviewCount: z.union([z.string(), z.number()]).optional(),
		ratingCount: z.union([z.string(), z.number()]).optional(),
		bestRating: z.union([z.string(), z.number()]).optional(),
	})
	.passthrough();

export const SchemaNodeSchema = z
	.object({
		"@type": z.union([z.string(), z.array(z.string())]).optional(),
		"@graph": z.array(z.unknown()).optional(),
		name: z.string().optional(),
		telephone: z.string().optional(),
		address: z.union([z.string(), PostalAddressSchema]).optional(),
		aggregateRating: AggregateRatingSchema.optional(),
		openingHours: z.union([z.string(), z.array(z.string())]).optional(),
	})
	.passthrough();

export type PostalAddress = z.infer<typeof PostalAddressSchema>;
export type AggregateRating = z.infer<typeof AggregateRatingSchema>;
export type SchemaNode = z.infer<typeof SchemaNodeSchema>;

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> | null {
	if (typeof v === "object" && v !== null && !Array.isArray(v)) {
		return v as Record<string, unknown>;
	}
	return null;
}

function typeTokens(node: unknown): string[] {
	const rec = asRecord(node);
	if (!rec) return [];
	const t = rec["@type"];
	if (typeof t === "string") return [t];
	if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
	return [];
}

// ---------------------------------------------------------------------------
// 값 존재 판정
// ---------------------------------------------------------------------------

/** 비어있지 않은 문자열 또는 비어있지 않은 객체/배열이면 true. */
export function isPresent(v: unknown): boolean {
	if (typeof v === "string") return v.trim().length > 0;
	if (typeof v === "number") return Number.isFinite(v);
	if (Array.isArray(v)) return v.length > 0;
	if (typeof v === "object" && v !== null)
		return Object.keys(v as Record<string, unknown>).length > 0;
	return false;
}

// ---------------------------------------------------------------------------
// 노드 평탄화 — 중첩 배열 + @graph 전개
// ---------------------------------------------------------------------------

/**
 * schemaJsonLd 를 평탄한 노드 배열로 전개한다.
 * - 배열 중첩을 재귀적으로 평탄화
 * - { "@graph": [...] } 컨테이너는 graph 멤버를 전개 (컨테이너 자신도 포함)
 * 한 번 호출한 결과를 가드들에 재사용할 것.
 */
export function getSchemaNodes(
	schemaJsonLd: unknown[],
): Record<string, unknown>[] {
	const out: Record<string, unknown>[] = [];
	const visit = (item: unknown): void => {
		if (Array.isArray(item)) {
			for (const el of item) visit(el);
			return;
		}
		const rec = asRecord(item);
		if (!rec) return;
		out.push(rec);
		const graph = rec["@graph"];
		if (Array.isArray(graph)) {
			for (const el of graph) visit(el);
		}
	};
	for (const item of schemaJsonLd) visit(item);
	return out;
}

// ---------------------------------------------------------------------------
// 타입 가드
// ---------------------------------------------------------------------------

/**
 * LocalBusiness 계열 여부.
 * literal 'LocalBusiness' 또는 *Store/*Shop/*Salon/*Restaurant/*Cafe/*School/*Service
 * 접미사 타입을 LocalBusiness 로 간주한다. @type 은 string|string[] 모두 처리.
 */
export function isLocalBusinessNode(node: unknown): boolean {
	return typeTokens(node).some(
		(t) =>
			t === "LocalBusiness" ||
			t.endsWith("Store") ||
			t.endsWith("Shop") ||
			t.endsWith("Salon") ||
			t.endsWith("Restaurant") ||
			t.endsWith("Cafe") ||
			t.endsWith("School") ||
			t.endsWith("Service"),
	);
}

/**
 * Organization 계열 여부.
 * Organization / Corporation / NGO + *Organization 접미사.
 */
export function isOrganizationNode(node: unknown): boolean {
	return typeTokens(node).some(
		(t) =>
			t === "Organization" ||
			t === "Corporation" ||
			t === "NGO" ||
			t.endsWith("Organization"),
	);
}

/** FAQPage 노드 여부. */
export function isFaqPageNode(node: unknown): boolean {
	return typeTokens(node).some((t) => t === "FAQPage");
}

// ---------------------------------------------------------------------------
// 속성 접근자
// ---------------------------------------------------------------------------

/** name 문자열 (없으면 null). */
export function getName(node: unknown): string | null {
	const rec = asRecord(node);
	if (!rec) return null;
	const name = rec.name;
	if (typeof name === "string" && name.trim().length > 0) return name.trim();
	return null;
}

/**
 * telephone 문자열 (없으면 null).
 * 최상위 telephone 우선, 없으면 contactPoint(.telephone) 도 탐색.
 */
export function getTelephone(node: unknown): string | null {
	const rec = asRecord(node);
	if (!rec) return null;
	const tel = rec.telephone;
	if (typeof tel === "string" && tel.trim().length > 0) return tel.trim();
	// contactPoint: 객체 또는 객체 배열
	const cp = rec.contactPoint;
	const fromContact = (c: unknown): string | null => {
		const cr = asRecord(c);
		if (!cr) return null;
		const t = cr.telephone;
		return typeof t === "string" && t.trim().length > 0 ? t.trim() : null;
	};
	if (Array.isArray(cp)) {
		for (const c of cp) {
			const t = fromContact(c);
			if (t) return t;
		}
	} else {
		const t = fromContact(cp);
		if (t) return t;
	}
	return null;
}

/** address (string | PostalAddress) 또는 null. */
export function getPostalAddress(
	node: unknown,
): string | PostalAddress | null {
	const rec = asRecord(node);
	if (!rec) return null;
	const addr = rec.address;
	if (typeof addr === "string" && addr.trim().length > 0) return addr.trim();
	const addrRec = asRecord(addr);
	if (addrRec && Object.keys(addrRec).length > 0) {
		const parsed = PostalAddressSchema.safeParse(addrRec);
		if (parsed.success) return parsed.data;
		return addrRec as PostalAddress;
	}
	return null;
}

/** aggregateRating 객체 또는 null. */
export function getAggregateRating(node: unknown): AggregateRating | null {
	const rec = asRecord(node);
	if (!rec) return null;
	const ar = rec.aggregateRating;
	const arRec = asRecord(ar);
	if (!arRec || Object.keys(arRec).length === 0) return null;
	const parsed = AggregateRatingSchema.safeParse(arRec);
	if (parsed.success) return parsed.data;
	return arRec as AggregateRating;
}

/** openingHours 문자열 배열 (없으면 빈 배열). */
export function getOpeningHours(node: unknown): string[] {
	const rec = asRecord(node);
	if (!rec) return [];
	const oh = rec.openingHours ?? rec.openingHoursSpecification;
	if (typeof oh === "string" && oh.trim().length > 0) return [oh.trim()];
	if (Array.isArray(oh)) {
		return oh.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
	}
	return [];
}
