// @TASK P2-R6 - generatedAsset 본문 템플릿 (REFACTOR: 템플릿 분리)
// @SPEC specs/domain/resources.yaml (generatedAsset: type/title/content)
// @SPEC docs/planning/07-coding-convention.md §4 (인과·과장 0·AI 생성 라벨) / §5 (대행연결 금지)
// @SPEC apps/web/lib/shared/ui-labels.ts (assetTypeToLabel — 사장님 언어 title 단일 사전)
//
// 생성물 본문(content)을 만드는 순수 템플릿 모음. 각 함수는 사장님 언어·응원 톤의 복붙용
// 텍스트만 반환한다 — 효과 단정·인과·과장 0(점수↔실인용 무상관), 전문용어(snippet/SEO) 0.
// vendor_prescription 은 "이렇게 보내세요" 이메일 초안까지만 — 업체 중개/매칭/정산 문구 0(07 §5).
//
// AI 생성 라벨: 모든 본문은 끝에 정직한 안내(사람이 다듬어 쓰라는 응원)를 붙인다 — 효과 보장 0.

/** 템플릿 입력 — S1 business 프로필(사장님 언어 그대로). */
export interface AssetProfile {
  /** 가게 이름. */
  businessName: string;
  /** 업종(예: 분식집, 미용실). */
  category: string;
  /** 지역(예: 서울 마포구). */
  region: string;
  /** 자주 묻는 질문/답변(snippet=검색 답변글 입력; 없으면 snippet 생성 안 함). */
  faqs?: { question: string; answer: string }[];
}

/**
 * snippet starter 본문(검색 답변글 시작 템플릿) — FAQ 원자료가 없을 때의 골격.
 *
 * place_intro 등과 동일하게 프로필 기반 복붙 템플릿이다(추측 단정 0). 손님이 자주 묻는
 * 3가지(영업시간·위치/주차·예약/문의) 질문 골격에 사장님이 답을 채워 쓰도록 안내한다.
 * 전문용어(snippet/schema) 0 · 효과 단정 0 · 응원 톤. FAQ 가 있으면 이 대신 답변 합성을 쓴다.
 */
export function buildSnippetStarterContent(p: AssetProfile): string {
  const lines = [
    `${p.businessName} 자주 묻는 질문 — 답은 가게에 맞게 채워 주세요.`,
    "",
    "Q. 영업시간이 어떻게 되나요?",
    "A. (예: 매일 오전 10시 ~ 오후 9시, 일요일은 쉬어요)",
    "",
    `Q. ${p.region} 어디에 있나요? 주차할 수 있나요?`,
    "A. (예: OO역 2번 출구에서 도보 5분, 가게 앞 주차 2대)",
    "",
    "Q. 예약이나 문의는 어떻게 하나요?",
    "A. (예: 전화로 미리 예약 받아요 / 바로 오셔도 괜찮아요)",
  ];
  return lines.join("\n");
}

/** place_intro 본문(네이버 플레이스 소개글) — 사실 묘사·응원 톤. 효과 단정 0. */
export function buildPlaceIntroContent(p: AssetProfile): string {
  const lines = [
    `${p.region}에 있는 ${p.category} ${p.businessName}입니다.`,
    "찾아주시는 손님 한 분 한 분 정성껏 모시고 있어요.",
    "궁금한 점은 편하게 문의해 주세요. 기다리고 있겠습니다!",
  ];
  return lines.join("\n");
}

/** review_request 본문(문자/카톡용 리뷰 요청 문구) — 부탁·감사 톤. 강요·대가 단정 0. */
export function buildReviewRequestContent(p: AssetProfile): string {
  const lines = [
    `안녕하세요, ${p.businessName}입니다.`,
    "오늘 방문해 주셔서 진심으로 감사합니다.",
    "괜찮으셨다면 짧게 리뷰를 남겨주시면 큰 도움이 돼요.",
    "남겨주신 한마디가 저희에게 정말 힘이 됩니다. 감사합니다!",
  ];
  return lines.join("\n");
}

/**
 * vendor_prescription 본문(업체에 보낼 이메일 초안) — "이렇게 보내세요"까지만.
 *
 * 07 §5 절대 준수: 업체 연결/매칭/중개/정산 문구·코드 0. 이 함수는 사장님이 *직접* 아는
 * 업체(홈페이지 제작사 등)에게 *복사해서 보낼* 텍스트를 만든다 — 우리가 업체를 연결하지 않는다.
 *
 * @param requestSummary 업체에 요청할 개선 항목 한 줄(사장님 언어). 기본은 일반 안내.
 */
export function buildVendorPrescriptionContent(p: AssetProfile, requestSummary?: string): string {
  const ask =
    requestSummary && requestSummary.trim().length > 0
      ? requestSummary.trim()
      : "가게 정보(영업시간·소개·연락처)가 검색에 잘 보이도록 홈페이지를 다듬어 주세요.";
  const lines = [
    "안녕하세요, 홈페이지 담당자님.",
    "",
    `${p.region} ${p.category} ${p.businessName} 사장입니다.`,
    "아래 내용을 검토하시고 반영을 부탁드립니다.",
    "",
    `- 요청 사항: ${ask}`,
    "- 반영 후 어떻게 적용했는지 회신 주시면 감사하겠습니다.",
    "",
    "바쁘신 와중에 읽어주셔서 감사합니다. 잘 부탁드립니다.",
  ];
  return lines.join("\n");
}
