/**
 * X-SAG Core Engine — NAP(Name/Address/Phone) 추출기 (Phase 0 인프라)
 *
 * POLICY § 7.1: 규칙 기반 정적 분석. 결정적. AI 호출 없음.
 *
 * bodyText 에서 전화번호/주소/업체명 후보를 추출하고, 예시(example) 문맥을 판별한다.
 * 본문에서만 사용하고 저장하지 않는다 (POLICY § 4.4).
 */

// ---------------------------------------------------------------------------
// 예시 문맥 판별
// ---------------------------------------------------------------------------

/**
 * 매치 주변이 "예시/샘플/형식 안내" 문맥인지 판별하는 패턴.
 * 예: (예시), 예시:, 예를 들어, 형식입니다, e.g., example, sample, 가이드/문서/플레이스홀더 표기 등.
 */
export const EXAMPLE_CONTEXT_PATTERN =
	/예시|예\s*\)|예를\s*들어|샘플|형식입니다|형식\s*입니다|형식\s*:|입력\s*예|placeholder|예제|보기\s*:|e\.?g\.?|example|sample|dummy|test@|xxx-|000-0000|0000-0000|기입|작성\s*예|양식/i;

/**
 * text 의 matchIndex 위치 주변(radius 자) 에 예시 문맥 패턴이 있으면 true.
 * 빈 입력/음수 인덱스는 false.
 */
export function hasExampleContextAround(
	text: string,
	matchIndex: number,
	radius = 40,
): boolean {
	if (!text || matchIndex < 0) return false;
	const from = Math.max(0, matchIndex - radius);
	const to = Math.min(text.length, matchIndex + radius);
	return EXAMPLE_CONTEXT_PATTERN.test(text.slice(from, to));
}

// ---------------------------------------------------------------------------
// 전화번호 추출
// ---------------------------------------------------------------------------

export interface ExtractedPhone {
	raw: string;
	normalized: string;
	areaCode: string;
}

// 02-1234-5678 / 031-123-4567 / 010-1234-5678 / 1588-1234 / 15881234 형태.
const PHONE_PATTERN = /(\d{2,4})[-.\s]?(\d{3,4})[-.\s]?(\d{4})|(1[5-9]\d{2})[-.\s]?(\d{4})/g;

/**
 * 본문에서 전화번호 후보를 추출한다. 중복(normalized 기준) 은 제거.
 */
export function extractPhones(text: string): ExtractedPhone[] {
	if (!text) return [];
	const out: ExtractedPhone[] = [];
	const seen = new Set<string>();
	for (const m of text.matchAll(PHONE_PATTERN)) {
		const raw = m[0];
		let areaCode: string;
		let digits: string;
		if (m[4] !== undefined) {
			// 대표번호 15xx-19xx
			areaCode = m[4];
			digits = m[4] + m[5];
		} else {
			areaCode = m[1] ?? "";
			digits = (m[1] ?? "") + (m[2] ?? "") + (m[3] ?? "");
		}
		const normalized = digits.replace(/\D/g, "");
		// 너무 짧거나(8자리 미만) 긴(12자리 초과) 후보는 전화번호로 보지 않음
		if (normalized.length < 8 || normalized.length > 12) continue;
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		out.push({ raw, normalized, areaCode });
	}
	return out;
}

// ---------------------------------------------------------------------------
// 주소 추출
// ---------------------------------------------------------------------------

export interface ExtractedAddress {
	raw: string;
	road: boolean;
	normalized: string;
}

// 행정구역 토큰 (시/도, 시/군/구, 동/읍/면/리)
const ADMIN_PREFIX = "(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구|읍|면|동|리)\\s+)*";
// 도로명: ...로/길/대로 + 번호
const ROAD_PATTERN = new RegExp(
	`(${ADMIN_PREFIX}[가-힣A-Za-z0-9]+(?:대로|로|길))\\s*(\\d+(?:-\\d+)?)`,
	"g",
);
// 지번/행정 주소(도로명 아님): 시/도 + 구/군 + 동 형태
const ADMIN_PATTERN =
	/([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시)\s+[가-힣]+(?:시|군|구)(?:\s+[가-힣]+(?:읍|면|동|리))?)/g;

/**
 * 본문에서 주소 후보를 추출한다.
 * - 도로명 주소(road=true) 우선
 * - region 인자는 region 문자열을 normalized 에 포함한 주소를 STABLE-SORT 로 앞에 정렬할 뿐,
 *   필터링하지 않는다(handoff GOTCHA). normalized 에 region 이 없을 수도 있다.
 */
export function extractAddresses(
	text: string,
	region?: string,
): ExtractedAddress[] {
	if (!text) return [];
	const out: ExtractedAddress[] = [];
	const seen = new Set<string>();

	for (const m of text.matchAll(ROAD_PATTERN)) {
		const raw = m[0].trim();
		const street = (m[1] ?? "").trim();
		const number = (m[2] ?? "").trim();
		const normalized = `${street} ${number}`.replace(/\s+/g, " ").trim();
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		out.push({ raw, road: true, normalized });
	}
	for (const m of text.matchAll(ADMIN_PATTERN)) {
		const raw = m[0].trim();
		const normalized = raw.replace(/\s+/g, " ");
		if (seen.has(normalized)) continue;
		// 이미 도로명 주소가 이 텍스트를 포함하면 중복 회피
		if (out.some((a) => a.normalized.includes(normalized))) continue;
		seen.add(normalized);
		out.push({ raw, road: false, normalized });
	}

	if (region && region.trim().length > 0) {
		const r = region.trim();
		// region 포함 주소를 앞으로 STABLE-SORT (Array.prototype.sort 는 V8 에서 stable)
		out.sort((a, b) => {
			const aHit = a.normalized.includes(r) ? 0 : 1;
			const bHit = b.normalized.includes(r) ? 0 : 1;
			return aHit - bHit;
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// 업체명 정규화
// ---------------------------------------------------------------------------

export interface NormalizedBusinessName {
	korean: string;
	ascii: string;
	variants: string[];
}

/**
 * 업체명을 정규화한다.
 * - korean: 공백 정리한 원본
 * - ascii: 라틴 문자/숫자만 소문자로 (영문 브랜드 매칭용)
 * - variants: 공백제거/소문자/한글만/영문만 등 매칭에 쓸 변형 모음 (빈 값 제외, 중복 제거)
 */
export function normalizeBusinessName(name: string): NormalizedBusinessName {
	const korean = (name ?? "").replace(/\s+/g, " ").trim();
	const ascii = korean
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
	const koreanOnly = korean.replace(/[^가-힣0-9]/g, "");
	const noSpace = korean.replace(/\s+/g, "");
	const lower = korean.toLowerCase();
	const variants = Array.from(
		new Set(
			[korean, noSpace, lower, koreanOnly, ascii].filter(
				(v) => v.length > 0,
			),
		),
	);
	return { korean, ascii, variants };
}

// ---------------------------------------------------------------------------
// 지역코드 ↔ region 매칭
// ---------------------------------------------------------------------------

// 한국 지역번호 → 대표 행정구역 키워드.
// 광역시/도뿐 아니라 자주 쓰이는 자치구/시 단위 키워드도 포함한다
// (예: region 입력이 '강남', '분당' 처럼 구/동 단위인 경우가 흔하므로).
const AREA_CODE_REGION: Record<string, string[]> = {
	"02": [
		"서울",
		"강남",
		"서초",
		"송파",
		"강동",
		"마포",
		"용산",
		"종로",
		"중구",
		"성동",
		"광진",
		"동대문",
		"성북",
		"강북",
		"노원",
		"도봉",
		"중랑",
		"은평",
		"서대문",
		"양천",
		"강서",
		"구로",
		"금천",
		"영등포",
		"동작",
		"관악",
		"여의도",
		"잠실",
		"홍대",
		"신촌",
		"이태원",
	],
	"031": [
		"경기",
		"수원",
		"성남",
		"분당",
		"판교",
		"용인",
		"고양",
		"일산",
		"안양",
		"부천",
		"의정부",
		"평택",
		"안산",
		"화성",
		"남양주",
		"파주",
		"광명",
		"군포",
		"하남",
		"김포",
	],
	"032": ["인천", "부천", "김포", "송도", "청라"],
	"033": ["강원", "춘천", "원주", "강릉", "속초"],
	"041": ["충남", "천안", "아산", "서산", "당진"],
	"042": ["대전", "유성", "둔산"],
	"043": ["충북", "청주", "충주", "제천"],
	"044": ["세종"],
	"051": ["부산", "해운대", "서면", "광안리"],
	"052": ["울산"],
	"053": ["대구", "동성로", "수성"],
	"054": ["경북", "포항", "구미", "경주", "안동"],
	"055": ["경남", "창원", "김해", "진주", "양산"],
	"061": ["전남", "여수", "순천", "목포"],
	"062": ["광주", "상무"],
	"063": ["전북", "전주", "익산", "군산"],
	"064": ["제주", "서귀포"],
};

const MOBILE_PREFIXES = ["010", "011", "016", "017", "018", "019"];

/**
 * 지역번호가 region 과 부합하는지 판정한다.
 * - 빈 입력 / 알 수 없는 지역번호 → true (과탐 방지: 모르면 통과)
 * - 모바일(01x) / 대표번호(15xx-19xx) → true (지역 무관)
 * - 알려진 지역번호인데 region 키워드가 매핑과 불일치 → false
 */
export function areaCodeMatchesRegion(
	areaCode: string,
	region: string,
): boolean {
	if (!areaCode || !region || region.trim().length === 0) return true;
	const code = areaCode.replace(/\D/g, "");
	if (MOBILE_PREFIXES.includes(code)) return true;
	// 대표번호 15xx-19xx
	if (/^1[5-9]\d{2}$/.test(code)) return true;
	// 02 는 2자리, 그 외 0XX 는 3자리
	const normalizedCode = code.startsWith("02") ? "02" : code.slice(0, 3);
	const regions = AREA_CODE_REGION[normalizedCode];
	if (!regions) return true; // 알 수 없는 지역번호 → 통과
	const regionLower = region.trim();
	return regions.some(
		(kw) => regionLower.includes(kw) || kw.includes(regionLower),
	);
}
