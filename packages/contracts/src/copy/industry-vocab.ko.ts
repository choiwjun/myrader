/**
 * X-SAG Contracts — 산업별 어휘 사전 (한국어)
 *
 * @TASK TASK-COPY-003 — 8 산업 vocab 정의
 * @SPEC docs/features/x-sag-diagnosis-engine/industry-vocab.draft.md
 *
 * AUTO-GENERATED from industry-vocab.draft.md v0.1.0-draft
 * 8 산업 × 12 필드 완전 정의. general 은 안전값 폴백.
 */

import type { IndustryVocab, IndustryId } from "./types.js";

// ---------------------------------------------------------------------------
// 개별 산업 vocab 정의 (satisfies 타입 체크)
// ---------------------------------------------------------------------------

const cafe = {
  id: "cafe",
  name: "카페",
  plural: "카페",
  customer: "손님",
  site: "카페 사이트",
  vendor_type: "웹 디자이너",
  typical_fields: [
    "영업시간 (라스트 오더 포함)",
    "메뉴 및 음료 가격",
    "주차 안내 및 위치",
    "시즌 메뉴·이벤트",
    "좌석 수·예약 가능 여부",
  ],
  comparison_phrase_anchor: "동네 카페 대부분은",
  seasonal_concerns: [
    "여름: 시즌 음료 (딸기·자몽·복숭아 등) 교체 주기 빠름",
    "겨울: 연말·크리스마스 시즌 메뉴 및 영업시간 변경",
    "봄: 벚꽃 시즌 이벤트·포토존 홍보",
  ],
  est_time_dictionary: { short: "5분", medium: "30분", long: "반나절" },
  est_cost_dictionary: { low: "10만원 안팎", mid: "30~50만원", high: "100만원 이상" },
  compliance_notes: [
    "식품위생법상 메뉴·가격 표시 의무 (오프라인). 온라인 일치 권장",
    "원산지 표시(커피 원두 등) 가능하면 홈페이지에도 기재 권장",
  ],
} satisfies IndustryVocab;

const restaurant = {
  id: "restaurant",
  name: "식당",
  plural: "식당",
  customer: "손님",
  site: "식당 사이트",
  vendor_type: "웹 에이전시",
  typical_fields: [
    "메뉴판 및 가격 (배달 메뉴 포함)",
    "영업시간·정기 휴무일",
    "예약·단체 예약 방법",
    "주차·위치",
    "배달 가능 여부 및 배달앱 링크",
  ],
  comparison_phrase_anchor: "비슷한 식당들 대부분은",
  seasonal_concerns: [
    "명절 연휴: 영업 여부·단축 운영 안내",
    "여름: 계절 메뉴 변경 (삼계탕·냉면 등)",
    "겨울: 연말 단체 예약 수요 증가",
  ],
  est_time_dictionary: { short: "10분", medium: "30분", long: "하루" },
  est_cost_dictionary: { low: "10만원 안팎", mid: "30~50만원", high: "100만원 이상" },
  compliance_notes: [
    "음식 사진 사용 시 실제 제공 메뉴와 현저히 다른 사진 금지 (소비자보호법)",
    "배달앱 메뉴와 홈페이지 메뉴 가격 일치 권장 (혼란 방지)",
  ],
} satisfies IndustryVocab;

const clinic = {
  id: "clinic",
  name: "의원",
  plural: "의원",
  customer: "환자",
  site: "병원 홈페이지",
  vendor_type: "의료기관 전문 웹 에이전시",
  typical_fields: [
    "진료 과목 및 전문 분야",
    "진료 시간 및 예약 방법",
    "원장 약력 (학력·전문의 자격)",
    "위치·주차 안내",
    "비급여 항목 고시 (법적 의무)",
  ],
  comparison_phrase_anchor: "비슷한 의원들 대부분은",
  seasonal_concerns: [
    "환절기 (봄·가을): 호흡기·알레르기 진료 문의 급증",
    "독감 시즌 (10~12월): 독감 예방접종 일정·재고 안내",
    "방학 시즌 (여름·겨울): 소아과·정형외과 외상 문의 증가",
  ],
  est_time_dictionary: { short: "10분", medium: "1시간", long: "하루" },
  est_cost_dictionary: { low: "20만원 안팎", mid: "50~100만원", high: "200만원 이상" },
  compliance_notes: [
    "의료법 제56조: 치료 효과·비교 광고 금지. 카피에서 '최고', '최선', '00% 효과' 등 금지",
    "의료법 제46조: 환자 후기·경험담 광고 금지",
    "비급여 항목 가격 공개는 의료법상 의무 (의원급 의료기관 해당). 홈페이지 게시 권장",
    "X-SAG 진단 범위: 구조화 데이터·위치·진료시간 등 사실 정보만. 의료 효능 진단 제외",
  ],
} satisfies IndustryVocab;

const academy = {
  id: "academy",
  name: "학원",
  plural: "학원",
  customer: "학부모",
  site: "학원 홈페이지",
  vendor_type: "교육기관 전문 웹 에이전시",
  typical_fields: [
    "커리큘럼 및 레벨 구성",
    "수강료 (월 기준, 레벨별)",
    "시간표 (요일·시간대)",
    "원장 경력·합격 실적",
    "수강 등록·상담 방법",
  ],
  comparison_phrase_anchor: "비슷한 학원들 대부분은",
  seasonal_concerns: [
    "입시 시즌 (9~11월): 수능·내신 특강 일정 및 합격 실적 노출 수요 급증",
    "방학 (여름·겨울): 특강·집중반 일정 업데이트 필요",
    "새학기 (3월·9월): 신규 등록 문의 피크. 시간표·수강료 최신화 중요",
  ],
  est_time_dictionary: { short: "10분", medium: "30분", long: "하루" },
  est_cost_dictionary: { low: "10만원 안팎", mid: "30~50만원", high: "100만원 이상" },
  compliance_notes: [
    "학원법: 수강료 게시 의무 (오프라인). 홈페이지 일치 권장",
    "학원 합격 실적 표기 시 학생·학부모 동의 및 사실 기반 필수",
    "광고법: '1등', '최다 합격' 등 비교·과장 광고 표현 주의",
    "학부모·학생 의사결정 분리: title 슬롯은 학부모 대상, action은 학생도 읽음",
  ],
} satisfies IndustryVocab;

const salon = {
  id: "salon",
  name: "미용실",
  plural: "미용실",
  customer: "손님",
  site: "미용실 사이트",
  vendor_type: "웹 디자이너",
  typical_fields: [
    "시술 메뉴 및 가격표 (디자이너별 등급 포함)",
    "예약 방법 (네이버 예약·카카오채널 링크)",
    "영업시간·정기 휴무",
    "시술 사례 사진 (포트폴리오)",
    "위치·주차",
  ],
  comparison_phrase_anchor: "동네 미용실 대부분은",
  seasonal_concerns: [
    "봄·가을 환절기: 펌·염색 수요 증가. 시즌 이벤트 홍보",
    "연말 (11~12월): 웨딩·송년 헤어 예약 문의 급증",
    "설·추석 연휴 전: 단기 예약 마감 공지 필요",
  ],
  est_time_dictionary: { short: "5분", medium: "30분", long: "반나절" },
  est_cost_dictionary: { low: "10만원 안팎", mid: "30~50만원", high: "100만원 이상" },
  compliance_notes: [
    "가격 미공개 정책 충돌: 시술 복잡도별 가격 차이 설명 방법 고민 필요 (범위형 가격 'OO원~OO원' 권장)",
    "시술 사례 사진 게시 전 고객 사진 동의서 확보 권장",
    "디자이너별 가격 차등 구조는 FAQ로 설명 가능 ('주임/실장/원장 가격이 다를 수 있어요')",
  ],
} satisfies IndustryVocab;

const workshop = {
  id: "workshop",
  name: "공방",
  plural: "공방",
  customer: "손님",
  site: "공방 사이트",
  vendor_type: "웹 디자이너",
  typical_fields: [
    "클래스 메뉴 및 가격 (원데이·정기반 구분)",
    "클래스 일정 및 예약 방법",
    "완성품 사진 및 난이도 안내",
    "인원 제한·소요 시간·준비물",
    "위치·교통 안내",
  ],
  comparison_phrase_anchor: "비슷한 공방들 대부분은",
  seasonal_concerns: [
    "봄 (4~5월): 체험 시즌. 클래스 수요 급증",
    "연말 (11~12월): 크리스마스·연말 선물용 원데이 클래스 수요",
    "발렌타인·화이트데이 (2·3월): 커플 체험 클래스 문의",
  ],
  est_time_dictionary: { short: "10분", medium: "30분", long: "하루" },
  est_cost_dictionary: { low: "10만원 안팎", mid: "30~50만원", high: "100만원 이상" },
  compliance_notes: [
    "클래스 일정이 SNS에만 있고 홈페이지에 없는 경우 AI 검색 인덱싱 불가",
    "참가자 얼굴이 포함된 사진 게시 전 개인정보 동의 필요",
    "원데이 클래스 취소·환불 정책을 홈페이지에 명시 권장 (소비자분쟁 예방)",
  ],
} satisfies IndustryVocab;

const retail = {
  id: "retail",
  name: "가게",
  plural: "가게",
  customer: "손님",
  site: "가게 사이트",
  vendor_type: "웹 에이전시",
  typical_fields: [
    "취급 품목·브랜드 목록",
    "영업시간·정기 휴무",
    "위치·주차",
    "가격 안내 (범위형 또는 주요 상품 기준가)",
    "문의·재고 확인 연락처",
  ],
  comparison_phrase_anchor: "비슷한 가게들 대부분은",
  seasonal_concerns: [
    "명절 연휴 (설·추석): 영업 여부·단축 운영 공지",
    "연말 (12월): 선물 수요 증가. 인기 상품·선물 포장 안내",
    "여름·겨울 세일 시즌: 행사 일정·할인 품목 온라인 노출",
  ],
  est_time_dictionary: { short: "10분", medium: "30분", long: "하루" },
  est_cost_dictionary: { low: "10만원 안팎", mid: "30~50만원", high: "100만원 이상" },
  compliance_notes: [
    "표시광고법: 가격 표시 시 할인 전·후 가격 명시 의무",
    "온라인 쇼핑몰 병행 시 공정거래위원회 전자상거래법 준수 필요",
    "재고 미보유 품목 '품절' 표기 권장 (허위 재고 오해 방지)",
  ],
} satisfies IndustryVocab;

const general = {
  id: "general",
  name: "가게",
  plural: "업체",
  customer: "고객",
  site: "사이트",
  vendor_type: "웹 전문가",
  typical_fields: [
    "제공 서비스·상품 목록",
    "영업시간·연락처",
    "위치 및 교통 안내",
    "가격 및 문의 방법",
    "자주 묻는 질문 (FAQ)",
  ],
  comparison_phrase_anchor: "비슷한 업체들 대부분은",
  seasonal_concerns: [
    "명절·연휴: 영업 여부 공지",
    "연말: 연간 결산 및 새해 안내",
  ],
  est_time_dictionary: { short: "10분", medium: "30분", long: "하루" },
  est_cost_dictionary: { low: "10만원 안팎", mid: "30~50만원", high: "100만원 이상" },
  compliance_notes: [
    "폴백 산업이므로 compliance_notes는 최소화. 구체적 법령 적용 없음",
    "구현 시 실제 산업 감지 후 해당 산업 vocab으로 교체하는 것이 최우선",
  ],
} satisfies IndustryVocab;

// ---------------------------------------------------------------------------
// INDUSTRY_VOCAB — 8 산업 전체 Record
// ---------------------------------------------------------------------------

export const INDUSTRY_VOCAB: Record<IndustryId, IndustryVocab> = {
  cafe,
  restaurant,
  clinic,
  academy,
  salon,
  workshop,
  retail,
  general,
};

// ---------------------------------------------------------------------------
// 헬퍼 함수
// ---------------------------------------------------------------------------

/**
 * IndustryVocab 12 필드 누락 검증 헬퍼.
 * vocab-completeness.test.ts 에서 사용.
 */
export function isCompleteVocab(vocab: IndustryVocab): boolean {
  return (
    typeof vocab.id === "string" &&
    typeof vocab.name === "string" &&
    vocab.name.length > 0 &&
    typeof vocab.plural === "string" &&
    vocab.plural.length > 0 &&
    typeof vocab.customer === "string" &&
    vocab.customer.length > 0 &&
    typeof vocab.site === "string" &&
    vocab.site.length > 0 &&
    typeof vocab.vendor_type === "string" &&
    vocab.vendor_type.length > 0 &&
    Array.isArray(vocab.typical_fields) &&
    vocab.typical_fields.length >= 1 &&
    vocab.typical_fields.length <= 5 &&
    typeof vocab.comparison_phrase_anchor === "string" &&
    vocab.comparison_phrase_anchor.length > 0 &&
    Array.isArray(vocab.seasonal_concerns) &&
    typeof vocab.est_time_dictionary === "object" &&
    typeof vocab.est_time_dictionary.short === "string" &&
    typeof vocab.est_time_dictionary.medium === "string" &&
    typeof vocab.est_time_dictionary.long === "string" &&
    typeof vocab.est_cost_dictionary === "object" &&
    typeof vocab.est_cost_dictionary.low === "string" &&
    typeof vocab.est_cost_dictionary.mid === "string" &&
    typeof vocab.est_cost_dictionary.high === "string" &&
    Array.isArray(vocab.compliance_notes)
  );
}

/**
 * general 폴백 헬퍼.
 * 산업 미지정 또는 존재하지 않는 산업 ID 입력 시 general 반환.
 */
export function getVocabOrFallback(industry: IndustryId | undefined): IndustryVocab {
  if (industry && industry in INDUSTRY_VOCAB) return INDUSTRY_VOCAB[industry];
  return INDUSTRY_VOCAB.general;
}
