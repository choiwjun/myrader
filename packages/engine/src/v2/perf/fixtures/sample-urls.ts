/**
 * X-SAG Core Engine — PERF 룰 보정용 한국 샘플 URL 코퍼스
 *
 * 카테고리별 대표 URL 100개 메타데이터:
 * - 커피숍(10), 식당(10), 미용실(8), 헬스장(8), 학원(8)
 * - 병원(7, 일부 차단 가능), 쇼핑몰(12), 뉴스(12), 블로그(12), 정부기관(10)
 * - 금융/대기업(3)
 *
 * 실제 공개 URL + placeholder 혼합.
 * 사용: scripts/measure-lighthouse-corpus.ts에서 대량 측정 시 입력 소스
 */

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

export interface SampleUrlMetadata {
	/** 측정할 URL */
	url: string;
	/** 카테고리 */
	category:
		| "cafe"
		| "restaurant"
		| "beauty"
		| "fitness"
		| "academy"
		| "hospital"
		| "ecommerce"
		| "news"
		| "blog"
		| "government"
		| "finance";
	/** 지역 (선택사항) */
	region?: string;
	/** 예상 성능 범위 힌트 (참고용) */
	expectedRangeHint?: "low" | "medium" | "high";
	/** 설명 */
	description?: string;
}

// ---------------------------------------------------------------------------
// 샘플 URL 카탈로그 (총 100개)
// ---------------------------------------------------------------------------

export const SAMPLE_URLS: SampleUrlMetadata[] = [
	// Cafes (10)
	{
		url: "https://cafe.naver.com",
		category: "cafe",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "네이버 카페 메인",
	},
	{
		url: "https://example-cafe-hongdae-1.kr",
		category: "cafe",
		region: "Seoul",
		expectedRangeHint: "medium",
	},
	{
		url: "https://example-cafe-gangnam-1.kr",
		category: "cafe",
		region: "Seoul",
		expectedRangeHint: "medium",
	},
	{
		url: "https://example-cafe-itaewon-1.kr",
		category: "cafe",
		region: "Seoul",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-cafe-busan-1.kr",
		category: "cafe",
		region: "Busan",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-cafe-incheon-1.kr",
		category: "cafe",
		region: "Incheon",
		expectedRangeHint: "medium",
	},
	{
		url: "https://example-cafe-daegu-1.kr",
		category: "cafe",
		region: "Daegu",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-cafe-gwangju-1.kr",
		category: "cafe",
		region: "Gwangju",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-cafe-daejeon-1.kr",
		category: "cafe",
		region: "Daejeon",
		expectedRangeHint: "medium",
	},
	{
		url: "https://example-cafe-premium-1.kr",
		category: "cafe",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "프리미엄 카페 체인",
	},

	// Restaurants (10)
	{
		url: "https://www.baedal.com",
		category: "restaurant",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "배달의민족 메인",
	},
	{
		url: "https://example-restaurant-korean-1.kr",
		category: "restaurant",
		region: "Seoul",
		expectedRangeHint: "low",
		description: "로컬 한식당",
	},
	{
		url: "https://example-restaurant-bbq-1.kr",
		category: "restaurant",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "구이 전문점",
	},
	{
		url: "https://example-restaurant-sushi-1.kr",
		category: "restaurant",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "일식당",
	},
	{
		url: "https://example-restaurant-pizza-1.kr",
		category: "restaurant",
		region: "Busan",
		expectedRangeHint: "medium",
	},
	{
		url: "https://example-restaurant-fine-dining-1.kr",
		category: "restaurant",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "파인 다이닝",
	},
	{
		url: "https://example-restaurant-chain-1.kr",
		category: "restaurant",
		region: "Incheon",
		expectedRangeHint: "medium",
		description: "프랜차이즈 음식점",
	},
	{
		url: "https://example-restaurant-fusion-1.kr",
		category: "restaurant",
		region: "Seoul",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-restaurant-buffet-1.kr",
		category: "restaurant",
		region: "Daegu",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-restaurant-cafe-fusion-1.kr",
		category: "restaurant",
		region: "Seoul",
		expectedRangeHint: "medium",
	},

	// Beauty (8)
	{
		url: "https://example-beauty-salon-1.kr",
		category: "beauty",
		region: "Seoul",
		expectedRangeHint: "low",
		description: "로컬 미용실",
	},
	{
		url: "https://example-beauty-chain-1.kr",
		category: "beauty",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "미용실 체인",
	},
	{
		url: "https://example-beauty-premium-1.kr",
		category: "beauty",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "프리미엄 헤어살롱",
	},
	{
		url: "https://example-beauty-nailart-1.kr",
		category: "beauty",
		region: "Busan",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-beauty-spa-1.kr",
		category: "beauty",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "스파",
	},
	{
		url: "https://example-beauty-skincare-1.kr",
		category: "beauty",
		region: "Incheon",
		expectedRangeHint: "medium",
	},
	{
		url: "https://example-beauty-makeup-1.kr",
		category: "beauty",
		region: "Seoul",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-beauty-barber-1.kr",
		category: "beauty",
		region: "Daejeon",
		expectedRangeHint: "low",
	},

	// Fitness (8)
	{
		url: "https://example-gym-premium-1.kr",
		category: "fitness",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "프리미엄 헬스장",
	},
	{
		url: "https://example-gym-chain-1.kr",
		category: "fitness",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "헬스장 체인",
	},
	{
		url: "https://example-gym-local-1.kr",
		category: "fitness",
		region: "Busan",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-pilates-studio-1.kr",
		category: "fitness",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "필라테스 스튜디오",
	},
	{
		url: "https://example-yoga-studio-1.kr",
		category: "fitness",
		region: "Seoul",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-crossfit-box-1.kr",
		category: "fitness",
		region: "Incheon",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-swimming-pool-1.kr",
		category: "fitness",
		region: "Daegu",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-fitness-multiclub-1.kr",
		category: "fitness",
		region: "Seoul",
		expectedRangeHint: "medium",
	},

	// Academy (8)
	{
		url: "https://example-academy-english-1.kr",
		category: "academy",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "영어학원",
	},
	{
		url: "https://example-academy-math-1.kr",
		category: "academy",
		region: "Seoul",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-academy-coding-1.kr",
		category: "academy",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "코딩학원",
	},
	{
		url: "https://example-academy-art-1.kr",
		category: "academy",
		region: "Busan",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-academy-music-1.kr",
		category: "academy",
		region: "Seoul",
		expectedRangeHint: "medium",
	},
	{
		url: "https://example-academy-test-prep-1.kr",
		category: "academy",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "입시학원",
	},
	{
		url: "https://example-academy-language-1.kr",
		category: "academy",
		region: "Incheon",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-academy-chain-1.kr",
		category: "academy",
		region: "Daejeon",
		expectedRangeHint: "medium",
		description: "학원 체인",
	},

	// Hospital (7)
	{
		url: "https://example-hospital-general-1.kr",
		category: "hospital",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "종합병원",
	},
	{
		url: "https://example-clinic-family-1.kr",
		category: "hospital",
		region: "Seoul",
		expectedRangeHint: "low",
		description: "가정의학과",
	},
	{
		url: "https://example-dental-clinic-1.kr",
		category: "hospital",
		region: "Busan",
		expectedRangeHint: "low",
		description: "치과",
	},
	{
		url: "https://example-orthopedic-clinic-1.kr",
		category: "hospital",
		region: "Seoul",
		expectedRangeHint: "low",
		description: "정형외과",
	},
	{
		url: "https://example-hospital-skin-1.kr",
		category: "hospital",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "피부과",
	},
	{
		url: "https://example-clinic-internal-1.kr",
		category: "hospital",
		region: "Incheon",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-hospital-maternity-1.kr",
		category: "hospital",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "산부인과",
	},

	// E-commerce (12)
	{
		url: "https://www.coupang.com",
		category: "ecommerce",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "쿠팡",
	},
	{
		url: "https://www.naver.com/shop",
		category: "ecommerce",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "네이버 쇼핑",
	},
	{
		url: "https://www.gmarket.co.kr",
		category: "ecommerce",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "G마켓",
	},
	{
		url: "https://example-ecommerce-fashion-1.kr",
		category: "ecommerce",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "패션 쇼핑몰",
	},
	{
		url: "https://example-ecommerce-beauty-1.kr",
		category: "ecommerce",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "뷰티 쇼핑몰",
	},
	{
		url: "https://example-ecommerce-home-1.kr",
		category: "ecommerce",
		region: "Busan",
		expectedRangeHint: "low",
		description: "홈데코 쇼핑몰",
	},
	{
		url: "https://example-ecommerce-electronics-1.kr",
		category: "ecommerce",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "전자제품",
	},
	{
		url: "https://example-ecommerce-food-1.kr",
		category: "ecommerce",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "식품 쇼핑몰",
	},
	{
		url: "https://example-ecommerce-sports-1.kr",
		category: "ecommerce",
		region: "Incheon",
		expectedRangeHint: "low",
		description: "스포츠용품",
	},
	{
		url: "https://example-ecommerce-toys-1.kr",
		category: "ecommerce",
		region: "Daegu",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-ecommerce-books-1.kr",
		category: "ecommerce",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "도서",
	},
	{
		url: "https://example-ecommerce-niche-1.kr",
		category: "ecommerce",
		region: "Daejeon",
		expectedRangeHint: "low",
		description: "틈새 쇼핑몰",
	},

	// News (12)
	{
		url: "https://www.naver.com",
		category: "news",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "네이버 뉴스",
	},
	{
		url: "https://www.daum.net",
		category: "news",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "다음 뉴스",
	},
	{
		url: "https://news.google.com",
		category: "news",
		region: "Global",
		expectedRangeHint: "high",
		description: "구글 뉴스",
	},
	{
		url: "https://example-news-chosun-1.kr",
		category: "news",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "조선일보",
	},
	{
		url: "https://example-news-joongang-1.kr",
		category: "news",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "중앙일보",
	},
	{
		url: "https://example-news-kyunghyang-1.kr",
		category: "news",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "경향신문",
	},
	{
		url: "https://example-news-hankyoreh-1.kr",
		category: "news",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "한겨레",
	},
	{
		url: "https://example-news-tech-1.kr",
		category: "news",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "테크 뉴스",
	},
	{
		url: "https://example-news-local-seoul-1.kr",
		category: "news",
		region: "Seoul",
		expectedRangeHint: "low",
		description: "서울 지역뉴스",
	},
	{
		url: "https://example-news-local-busan-1.kr",
		category: "news",
		region: "Busan",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-news-portal-1.kr",
		category: "news",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "뉴스 포털",
	},
	{
		url: "https://example-news-magazine-1.kr",
		category: "news",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "매거진 사이트",
	},

	// Blog (12)
	{
		url: "https://blog.naver.com",
		category: "blog",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "네이버 블로그",
	},
	{
		url: "https://www.tistory.com",
		category: "blog",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "티스토리",
	},
	{
		url: "https://example-blog-travel-1.kr",
		category: "blog",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "여행 블로그",
	},
	{
		url: "https://example-blog-food-1.kr",
		category: "blog",
		region: "Seoul",
		expectedRangeHint: "low",
		description: "음식 블로그",
	},
	{
		url: "https://example-blog-parenting-1.kr",
		category: "blog",
		region: "Seoul",
		expectedRangeHint: "low",
		description: "육아 블로그",
	},
	{
		url: "https://example-blog-fashion-1.kr",
		category: "blog",
		region: "Seoul",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-blog-tech-1.kr",
		category: "blog",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "기술 블로그",
	},
	{
		url: "https://example-blog-finance-1.kr",
		category: "blog",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "재테크 블로그",
	},
	{
		url: "https://example-blog-diy-1.kr",
		category: "blog",
		region: "Busan",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-blog-hobby-1.kr",
		category: "blog",
		region: "Seoul",
		expectedRangeHint: "low",
	},
	{
		url: "https://example-blog-review-1.kr",
		category: "blog",
		region: "Seoul",
		expectedRangeHint: "low",
		description: "리뷰 블로그",
	},
	{
		url: "https://example-blog-photography-1.kr",
		category: "blog",
		region: "Incheon",
		expectedRangeHint: "low",
	},

	// Government (10)
	{
		url: "https://www.korea.go.kr",
		category: "government",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "대한민국 정부",
	},
	{
		url: "https://www.gov.kr",
		category: "government",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "정부24",
	},
	{
		url: "https://example-gov-seoul-1.kr",
		category: "government",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "서울시청",
	},
	{
		url: "https://example-gov-busan-1.kr",
		category: "government",
		region: "Busan",
		expectedRangeHint: "medium",
		description: "부산시청",
	},
	{
		url: "https://example-gov-incheon-1.kr",
		category: "government",
		region: "Incheon",
		expectedRangeHint: "medium",
	},
	{
		url: "https://example-gov-education-1.kr",
		category: "government",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "교육청",
	},
	{
		url: "https://example-gov-police-1.kr",
		category: "government",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "경찰청",
	},
	{
		url: "https://example-gov-health-1.kr",
		category: "government",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "보건복지부",
	},
	{
		url: "https://example-gov-customs-1.kr",
		category: "government",
		region: "Incheon",
		expectedRangeHint: "medium",
		description: "관세청",
	},
	{
		url: "https://example-gov-tax-1.kr",
		category: "government",
		region: "Seoul",
		expectedRangeHint: "medium",
		description: "국세청",
	},

	// Finance (3)
	{
		url: "https://www.kb.co.kr",
		category: "finance",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "국민은행",
	},
	{
		url: "https://www.shinhan.com",
		category: "finance",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "신한은행",
	},
	{
		url: "https://www.woori.co.kr",
		category: "finance",
		region: "Seoul",
		expectedRangeHint: "high",
		description: "우리은행",
	},
];

// ---------------------------------------------------------------------------
// 유틸리티
// ---------------------------------------------------------------------------

export function getUrlsByCategory(
	category: SampleUrlMetadata["category"],
): SampleUrlMetadata[] {
	return SAMPLE_URLS.filter((url) => url.category === category);
}

export function getUrlsByRegion(region: string): SampleUrlMetadata[] {
	return SAMPLE_URLS.filter((url) => url.region === region);
}

export function filterByPerformanceHint(
	hint: SampleUrlMetadata["expectedRangeHint"],
): SampleUrlMetadata[] {
	return SAMPLE_URLS.filter((url) => url.expectedRangeHint === hint);
}

export function getSampleUrlsAsJson(): SampleUrlMetadata[] {
	return SAMPLE_URLS;
}
