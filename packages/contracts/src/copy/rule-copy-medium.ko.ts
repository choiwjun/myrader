/**
 * X-SAG Contracts — medium priority 룰 카피 시드 (한국어)
 *
 * @TASK TASK-COPY-008 — medium priority 60룰 × 5슬롯 카피 시드
 * @SPEC docs/features/x-sag-diagnosis-engine/BACKLOG_FH_EXPANSION_DOCS.md#F.2
 *
 * 카피 작성 원칙 (rule-copy.ko.ts 와 동일):
 *  - P1 (title): "{site}에/이/가 ~없어요/약해요/안 보여요" 또는 사장님 친화적 변형
 *  - P2 (harm): "{comparison_phrase_anchor} 이미 ~해뒀어요" 패턴 활용
 *  - P3 (action_self): "{est_time_*} 안에 사장님이 직접..." 패턴
 *  - P3 (action_pro): "{vendor_type}한테 {est_cost_*}~..."
 *  - 사장님 호칭 일관, 님·고객님·귀하 금지
 *  - 의료 효능 표현 완전 금지 (clinic compliance)
 *
 * 룰 식별 출처: packages/core-engine/src/analyzers/rules/*.ts 의 severity:"medium"
 * 기존 high priority 카피와 중복 제외, 60개 선정.
 *
 * 카테고리 분포 (총 60개):
 *  SEO     15개  (SEO-TITLE-002, SEO-META-002, SEO-H1-002, SEO-INTERNAL-LINK-001,
 *                 SEO-CTA-001, SEO-LANG-001, SEO-LINK-NEWTAB-001, SEO-WORD-COUNT-001,
 *                 SEO-NAVER-META-001, SEO-DUPLICATE-CONTENT-001,
 *                 SEO-XML-SITEMAP-VALID-001, SEO-CONTENT-FRESHNESS-001,
 *                 SEO-DUPLICATE-META-DESC-001, SEO-HEADING-HIERARCHY-001,
 *                 SEO-REDIRECT-CHAIN-001)
 *  AEO     14개  (AEO-FAQ-SCHEMA-001, AEO-PRICE-INFO-001, AEO-PROCESS-INFO-001,
 *                 AEO-TARGET-CUSTOMER-001, AEO-LOCAL-SERVICE-001, AEO-ANSWER-LENGTH-001,
 *                 AEO-PARAGRAPH-STRUCTURE-001, AEO-QA-PAIR-MARKUP-001,
 *                 AEO-DIRECT-ANSWER-PARAGRAPH-001, AEO-LIST-AND-TABLE-001,
 *                 AEO-NUMERIC-FACTS-001, AEO-AUTHOR-ATTRIBUTION-001,
 *                 AEO-LAST-UPDATED-001, AEO-HEADING-QUESTION-RATIO-001)
 *  GEO      9개  (GEO-SERVICE-001, GEO-ORGANIZATION-SCHEMA-001, GEO-AI-SUMMARY-001,
 *                 GEO-OPENING-HOURS-001, GEO-OG-IMAGE-001, GEO-NAP-CONSISTENCY-001,
 *                 GEO-BRAND-CONSISTENCY-001, GEO-BUSINESS-HOURS-DETAIL-001,
 *                 GEO-REVIEW-AGGREGATE-001)
 *  PERF     6개  (PERF-LCP-002, PERF-FID-001, PERF-CLS-002, PERF-INP-001,
 *                 PERF-TTFB-001, PERF-MOBILE-001)
 *  A11Y     6개  (A11Y-DOC-LANG-001, A11Y-DOC-TITLE-001, A11Y-HEADING-ORDER-001,
 *                 A11Y-LANDMARK-001, A11Y-FOCUS-VISIBLE-001, A11Y-ARIA-VALID-001)
 *  MOBILE   1개  (MOBILE-FONT-SIZE-001)
 *  NLP      5개  (NLP-TOPIC-RELEVANCE-001, NLP-EEAT-AUTHOR-001,
 *                 NLP-EEAT-EXPERTISE-001, NLP-EEAT-TRUST-001, NLP-SEMANTIC-ALIGN-001)
 *  BACKLINK 4개  (BACKLINK-CANONICAL-CONSISTENCY-001,
 *                 BACKLINK-STRUCTURED-DATA-DIVERSITY-001,
 *                 BACKLINK-SOCIAL-META-001, BACKLINK-INTERNAL-LINK-DEPTH-001)
 */

import type { RuleCopyTemplate } from "./types.js";

// ---------------------------------------------------------------------------
// MEDIUM_RULE_COPY_KO — 60 룰 카피 시드 (medium priority)
// ---------------------------------------------------------------------------

export const MEDIUM_RULE_COPY_KO: Record<string, RuleCopyTemplate> = {

  // ==========================================================================
  // SEO — 15개
  // ==========================================================================

  "SEO-TITLE-002": {
    ruleId: "SEO-TITLE-002",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 이름표가 너무 짧거나 길어요",
      harm: "{comparison_phrase_anchor} 이름표 길이를 알맞게 맞춰뒀어요. 너무 짧거나 길면 검색 결과에서 잘리거나 잘 안 보여요",
      action_self: "{est_time_short} 안에 사장님이 직접 수정하실 수 있어요. {name} + 핵심 서비스 한 줄로 30자 안팎이면 좋아요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-META-002": {
    ruleId: "SEO-META-002",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 소개 문구 길이가 어중간해요",
      harm: "{comparison_phrase_anchor} 소개 문구를 100자 안팎으로 맞춰뒀어요. 너무 짧으면 정보가 부족하고, 너무 길면 검색 결과에서 잘려요",
      action_self: "{est_time_short} 안에 사장님이 직접 다듬으실 수 있어요. {name}이 뭐 하는 곳인지 두 줄로 정리하면 충분해요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-H1-002": {
    ruleId: "SEO-H1-002",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 첫 줄 제목이 두 개 이상 있어요",
      harm: "{comparison_phrase_anchor} 첫 줄 제목을 하나만 깔끔하게 써뒀어요. 첫 줄 제목이 여러 개면 검색엔진이 어떤 게 진짜 제목인지 헷갈려요",
      action_self: "{est_time_short} 안에 사장님이 직접 정리하실 수 있어요. 첫 화면의 큰 제목을 하나만 남기고 나머지는 소제목으로 바꿔보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-INTERNAL-LINK-001": {
    ruleId: "SEO-INTERNAL-LINK-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 안에서 페이지끼리 연결이 약해요",
      harm: "{comparison_phrase_anchor} 메뉴·소개·예약 페이지를 서로 잘 연결해뒀어요. 연결이 없으면 {customer}이 다른 정보를 찾다가 그냥 나가요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 본문에서 다른 페이지로 가는 링크 2~3개만 넣어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-CTA-001": {
    ruleId: "SEO-CTA-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에서 다음 행동 안내가 잘 안 보여요",
      harm: "{comparison_phrase_anchor} '예약하기'·'전화하기' 같은 큰 버튼을 잘 보이게 뒀어요. 버튼이 없으면 {customer}이 뭘 해야 할지 몰라요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 첫 화면에 '예약하기' 또는 '전화하기' 버튼을 하나만 크게 넣어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-LANG-001": {
    ruleId: "SEO-LANG-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}가 한국어 사이트인지 표시가 없어요",
      harm: "{comparison_phrase_anchor} 한국어 사이트라는 표시를 해뒀어요. 표시가 없으면 검색엔진이 외국어 사이트인 줄 알아요",
      action_self: "{est_time_short} 안에 사장님이 확인하실 수 있어요. 홈페이지 관리자 페이지에서 언어 설정을 한국어로 맞춰주세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-LINK-NEWTAB-001": {
    ruleId: "SEO-LINK-NEWTAB-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 외부 링크 처리가 안전하지 않아요",
      harm: "{comparison_phrase_anchor} 외부 링크를 새 창에서 안전하게 열도록 설정해뒀어요. 그냥 두면 보안 경고가 뜰 수 있어요",
      action_self: "{est_time_medium} 안에 사장님이 확인하실 수 있어요. 외부 사이트로 가는 링크가 새 창에서 열리는지 한 번씩 눌러보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-WORD-COUNT-001": {
    ruleId: "SEO-WORD-COUNT-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 글 분량이 너무 적어요",
      harm: "{comparison_phrase_anchor} 페이지마다 충분한 설명을 써뒀어요. 글이 너무 짧으면 검색엔진이 정보가 부족하다고 판단해요",
      action_self: "{est_time_medium} 안에 사장님이 직접 추가하실 수 있어요. 소개·서비스 페이지에 한두 단락만 더 써보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "내용 보강",
    },
  },

  "SEO-NAVER-META-001": {
    ruleId: "SEO-NAVER-META-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}가 네이버 검색 등록 확인이 안 돼 있어요",
      harm: "{comparison_phrase_anchor} 네이버 사이트 등록 확인을 해뒀어요. 확인이 없으면 네이버에서 {name}이 늦게 잡혀요",
      action_self: "{est_time_medium} 안에 사장님이 직접 등록하실 수 있어요. 네이버 서치어드바이저에 가입하고 사이트를 추가하면 돼요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "네이버 등록",
    },
  },

  "SEO-DUPLICATE-CONTENT-001": {
    ruleId: "SEO-DUPLICATE-CONTENT-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 같은 내용이 여러 페이지에 반복돼요",
      harm: "{comparison_phrase_anchor} 페이지마다 다른 내용을 써뒀어요. 같은 내용이 여러 곳에 있으면 검색엔진이 어떤 페이지를 보여줘야 할지 헷갈려요",
      action_self: "{est_time_medium} 안에 사장님이 직접 정리하실 수 있어요. 비슷한 페이지를 합치거나 각 페이지에 다른 내용을 채워보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "내용 정리",
    },
  },

  "SEO-XML-SITEMAP-VALID-001": {
    ruleId: "SEO-XML-SITEMAP-VALID-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 페이지 목록 파일이 제대로 안 되어 있어요",
      harm: "{comparison_phrase_anchor} 검색엔진이 보는 페이지 목록 파일을 정확하게 만들어뒀어요. 파일이 깨지면 새 페이지가 검색에 늦게 잡혀요",
      action_self: "{est_time_medium} 안에 사장님이 확인하실 수 있어요. 홈페이지 관리자 페이지에서 사이트맵 자동 생성 기능을 켜주세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-CONTENT-FRESHNESS-001": {
    ruleId: "SEO-CONTENT-FRESHNESS-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 내용이 오랫동안 안 바뀌었어요",
      harm: "{comparison_phrase_anchor} 꾸준히 새 소식·메뉴·이벤트를 업데이트해요. 오래 그대로면 검색엔진이 {name}을 운영 안 하는 곳으로 봐요",
      action_self: "{est_time_medium} 안에 사장님이 직접 새 소식 한 줄만 올려도 달라져요. 이번 달 이벤트나 새 메뉴를 적어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "새 소식 올리기",
    },
  },

  "SEO-DUPLICATE-META-DESC-001": {
    ruleId: "SEO-DUPLICATE-META-DESC-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 페이지마다 소개 문구가 똑같아요",
      harm: "{comparison_phrase_anchor} 페이지마다 다른 소개 문구를 써뒀어요. 똑같으면 검색 결과에서 어떤 페이지를 골라야 할지 {customer}이 헷갈려요",
      action_self: "{est_time_medium} 안에 사장님이 직접 다듬으실 수 있어요. 메뉴·예약·소개 페이지에 각각 다른 한 줄을 써보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-HEADING-HIERARCHY-001": {
    ruleId: "SEO-HEADING-HIERARCHY-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 소제목 순서가 뒤죽박죽이에요",
      harm: "{comparison_phrase_anchor} 큰 제목·중간 제목·작은 제목 순서를 잘 맞춰뒀어요. 순서가 어긋나면 검색엔진이 글의 흐름을 못 따라가요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 페이지에서 제목 크기가 큰 것부터 작은 것으로 내려가는지 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-REDIRECT-CHAIN-001": {
    ruleId: "SEO-REDIRECT-CHAIN-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 주소가 여러 번 옮겨다녀요",
      harm: "{comparison_phrase_anchor} 옛 주소를 새 주소로 한 번에 연결해뒀어요. 여러 단계를 거치면 페이지 열리는 속도가 느려져요",
      action_self: "{est_time_medium} 안에 사장님이 확인하실 수 있어요. 옛 주소를 누르면 몇 번 만에 새 주소로 가는지 한 번 체크해보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  // ==========================================================================
  // AEO — 14개
  // ==========================================================================

  "AEO-FAQ-SCHEMA-001": {
    ruleId: "AEO-FAQ-SCHEMA-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} FAQ가 AI에 제대로 안 읽혀요",
      harm: "{comparison_phrase_anchor} FAQ에 AI가 읽을 수 있는 표시를 해뒀어요. 표시가 없으면 AI가 자주 묻는 질문을 그냥 지나쳐요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. X-SAG 스니펫 생성 기능으로 FAQ 코드를 만들 수 있어요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "스니펫 만들기",
    },
  },

  "AEO-PRICE-INFO-001": {
    ruleId: "AEO-PRICE-INFO-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 가격 안내가 없어요",
      harm: "{comparison_phrase_anchor} 가격 정보를 한눈에 보이게 써뒀어요. 가격이 없으면 {customer}이 부담스러워서 그냥 다른 곳으로 가요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 정확한 금액이 어려우면 'OO원부터' 형태로 적어도 좋아요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "가격 안내 추가",
    },
  },

  "AEO-PROCESS-INFO-001": {
    ruleId: "AEO-PROCESS-INFO-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 이용 절차 설명이 없어요",
      harm: "{comparison_phrase_anchor} '예약 → 방문 → 결제' 같은 절차를 단계별로 써뒀어요. 절차가 없으면 {customer}이 어떻게 이용해야 할지 몰라요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 1·2·3 번호를 매겨서 세 단계로만 적어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "절차 추가",
    },
  },

  "AEO-TARGET-CUSTOMER-001": {
    ruleId: "AEO-TARGET-CUSTOMER-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}가 누구를 위한 곳인지 잘 안 보여요",
      harm: "{comparison_phrase_anchor} 어떤 {customer}이 오면 좋은지 명확히 써뒀어요. 대상이 또렷하면 AI가 {name}을 이해하도록 돕는 기본이에요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 소개글에 '특히 OO한 분에게 추천해요' 한 줄만 더해보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "AEO-LOCAL-SERVICE-001": {
    ruleId: "AEO-LOCAL-SERVICE-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}가 어느 동네 사람에게 좋은지 안 보여요",
      harm: "{comparison_phrase_anchor} 동네 이름과 서비스를 같이 적어뒀어요. AI가 '근처 {plural}' 추천할 때 동네 이름이 꼭 필요해요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 소개글에 '동네이름 + {name}' 한 줄을 넣어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "AEO-ANSWER-LENGTH-001": {
    ruleId: "AEO-ANSWER-LENGTH-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 답변 문장이 너무 길어서 AI가 못 골라요",
      harm: "{comparison_phrase_anchor} 답변을 한두 문장으로 짧게 정리해뒀어요. 짧고 명확한 답은 AI가 내용을 읽어가도록 돕는 기본이에요",
      action_self: "{est_time_medium} 안에 사장님이 직접 다듬으실 수 있어요. 한 답변을 두세 문장 안으로 줄여보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "AEO-PARAGRAPH-STRUCTURE-001": {
    ruleId: "AEO-PARAGRAPH-STRUCTURE-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 글 단락이 너무 길어서 읽기 힘들어요",
      harm: "{comparison_phrase_anchor} 단락을 짧게 끊어뒀어요. 한 단락이 너무 길면 {customer}도 AI도 핵심을 못 찾아요",
      action_self: "{est_time_medium} 안에 사장님이 직접 수정하실 수 있어요. 한 단락을 3~4문장으로만 끊어주세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "AEO-QA-PAIR-MARKUP-001": {
    ruleId: "AEO-QA-PAIR-MARKUP-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 질문·답 쌍이 AI에 안 읽혀요",
      harm: "{comparison_phrase_anchor} 질문 바로 아래 답이 오도록 정리해뒀어요. 흩어져 있으면 AI가 어떤 답이 어떤 질문인지 헷갈려요",
      action_self: "{est_time_medium} 안에 사장님이 직접 정리하실 수 있어요. 질문을 굵게 쓰고 바로 아래에 답을 적어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "AEO-DIRECT-ANSWER-PARAGRAPH-001": {
    ruleId: "AEO-DIRECT-ANSWER-PARAGRAPH-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 핵심 답이 첫 문장에 없어요",
      harm: "{comparison_phrase_anchor} 첫 문장에 결론을 먼저 써뒀어요. 첫 문장에 결론이 있으면 AI가 핵심을 빠르게 파악하도록 돕는 기본이에요",
      action_self: "{est_time_medium} 안에 사장님이 직접 다듬으실 수 있어요. 각 단락의 첫 문장에 핵심을 먼저 말하고 설명은 뒤에 붙여보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "AEO-LIST-AND-TABLE-001": {
    ruleId: "AEO-LIST-AND-TABLE-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 목록·표 정리가 부족해요",
      harm: "{comparison_phrase_anchor} 메뉴·가격·시간을 표나 목록으로 깔끔하게 정리해뒀어요. 표·목록 정리는 AI가 정보를 읽어가도록 돕는 기본이에요",
      action_self: "{est_time_medium} 안에 사장님이 직접 정리하실 수 있어요. 메뉴와 가격을 표로 만들거나 점(·)으로 정리해보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "AEO-NUMERIC-FACTS-001": {
    ruleId: "AEO-NUMERIC-FACTS-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 숫자로 된 사실 정보가 부족해요",
      harm: "{comparison_phrase_anchor} 영업 OO년, 평균 OO분, 가격 OO원처럼 숫자 정보를 같이 적어뒀어요. AI는 숫자가 있는 답을 더 신뢰해요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. '운영 N년', '평균 대기 N분' 같이 숫자 한두 개만 넣어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "AEO-AUTHOR-ATTRIBUTION-001": {
    ruleId: "AEO-AUTHOR-ATTRIBUTION-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 글을 누가 썼는지 안 보여요",
      harm: "{comparison_phrase_anchor} 글마다 작성자나 사장님 이름을 적어뒀어요. 작성자가 없으면 AI가 글의 신뢰도를 낮게 봐요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 글 마지막에 '{name} 대표' 한 줄만 넣어도 충분해요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "AEO-LAST-UPDATED-001": {
    ruleId: "AEO-LAST-UPDATED-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 글이 언제 쓰였는지 안 보여요",
      harm: "{comparison_phrase_anchor} 글마다 '최근 업데이트' 날짜를 적어뒀어요. 날짜가 없으면 AI가 오래된 정보로 판단해서 건너뛰어요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 글 위쪽에 '최종 수정: YYYY-MM-DD' 한 줄을 넣어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "AEO-HEADING-QUESTION-RATIO-001": {
    ruleId: "AEO-HEADING-QUESTION-RATIO-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 소제목 중 질문형이 너무 적어요",
      harm: "{comparison_phrase_anchor} 소제목 중 일부를 '얼마인가요?'처럼 질문 형태로 써뒀어요. 질문형 소제목은 AI가 내용을 읽고 답을 찾도록 돕는 기본이에요",
      action_self: "{est_time_short} 안에 사장님이 직접 수정하실 수 있어요. 소제목 한두 개만 질문 형태로 바꿔보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  // ==========================================================================
  // GEO — 9개
  // ==========================================================================

  "GEO-SERVICE-001": {
    ruleId: "GEO-SERVICE-001",
    category: "geo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 어떤 서비스를 하는지 자세히 안 적혀 있어요",
      harm: "{comparison_phrase_anchor} 주요 서비스를 한 줄씩 정리해뒀어요. AI가 '근처에 OO 잘하는 {plural}' 추천할 때 이 정보를 봐요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 잘하는 서비스 3~5개만 골라 적어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "GEO-ORGANIZATION-SCHEMA-001": {
    ruleId: "GEO-ORGANIZATION-SCHEMA-001",
    category: "geo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 가게 정보가 AI에 정리된 형태로 안 들어가 있어요",
      harm: "{comparison_phrase_anchor} 사업자 정보 코드를 넣어뒀어요. 없으면 AI가 {name}의 기본 정보를 다른 곳에서 찾아야 해요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. X-SAG 스니펫 생성 기능으로 코드를 만들 수 있어요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "스니펫 만들기",
    },
  },

  "GEO-AI-SUMMARY-001": {
    ruleId: "GEO-AI-SUMMARY-001",
    category: "geo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 AI가 인용할 짧은 요약이 없어요",
      harm: "{comparison_phrase_anchor} 첫 화면 위쪽에 한두 줄 요약을 넣어뒀어요. 짧은 요약은 AI가 {name}을 빠르게 파악하도록 돕는 기본이에요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. '{name}은 OO동의 OO한 {name}이에요' 한 줄을 첫머리에 넣어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "GEO-OPENING-HOURS-001": {
    ruleId: "GEO-OPENING-HOURS-001",
    category: "geo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 영업시간이 명확하지 않아요",
      harm: "{comparison_phrase_anchor} 요일별 영업시간을 한눈에 보이게 적어뒀어요. 영업시간이 없으면 {customer}이 헛걸음할까 봐 망설여요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. '평일 OO~OO, 주말 OO~OO, 휴무일 OO' 형식으로 적어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "영업시간 추가",
    },
  },

  "GEO-OG-IMAGE-001": {
    ruleId: "GEO-OG-IMAGE-001",
    category: "geo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 링크를 공유하면 대표 이미지가 안 보여요",
      harm: "{comparison_phrase_anchor} 공유할 때 보이는 대표 이미지를 설정해뒀어요. 이미지가 없으면 공유 링크가 휑해 보여서 클릭이 안 나와요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 카카오톡에 {site} 주소를 붙여보고 이미지가 뜨는지 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "GEO-NAP-CONSISTENCY-001": {
    ruleId: "GEO-NAP-CONSISTENCY-001",
    category: "geo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 이름·주소·전화번호가 곳곳에서 달라요",
      harm: "{comparison_phrase_anchor} 홈페이지·네이버·카카오에서 똑같이 적어뒀어요. 정보를 똑같이 맞추면 AI가 {name}을 또렷하게 알아보도록 돕는 기본이에요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 홈페이지·네이버 플레이스·카카오맵의 정보를 똑같이 맞춰보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "정보 맞추기",
    },
  },

  "GEO-BRAND-CONSISTENCY-001": {
    ruleId: "GEO-BRAND-CONSISTENCY-001",
    category: "geo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에서 가게 이름 표기가 들쭉날쭉이에요",
      harm: "{comparison_phrase_anchor} {name}을 페이지마다 같은 표기로 통일해뒀어요. 이름이 다르게 적히면 AI가 같은 곳인지 못 알아봐요",
      action_self: "{est_time_short} 안에 사장님이 직접 확인하실 수 있어요. 페이지마다 {name} 표기가 똑같은지 한 번씩 확인해보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "GEO-BUSINESS-HOURS-DETAIL-001": {
    ruleId: "GEO-BUSINESS-HOURS-DETAIL-001",
    category: "geo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 휴무일·점심시간 같은 자세한 시간 안내가 없어요",
      harm: "{comparison_phrase_anchor} 정기 휴무·연휴 영업·점심 시간까지 적어뒀어요. 자세하지 않으면 {customer}이 헛걸음할 수 있어요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. '매주 OO 휴무, 점심 OO~OO 브레이크' 같이 한 줄만 더해주세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "시간 안내 보강",
    },
  },

  "GEO-REVIEW-AGGREGATE-001": {
    ruleId: "GEO-REVIEW-AGGREGATE-001",
    category: "geo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 별점·평판 정보가 정리되어 있지 않아요",
      harm: "{comparison_phrase_anchor} 평균 별점과 공개 평판 지표를 한곳에 모아 보여줘요. 정리되어 있으면 검색 결과에 별점이 같이 떠서 클릭이 늘어요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 네이버·카카오에 표시되는 공개 평판 지표를 확인해 홈페이지에 적어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "평판 정리",
    },
  },

  // ==========================================================================
  // PERF — 6개
  // ==========================================================================

  "PERF-LCP-002": {
    ruleId: "PERF-LCP-002",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 첫 화면이 4초가 넘어도 안 떠요",
      harm: "{comparison_phrase_anchor} 첫 화면이 빠르게 열려요. 4초가 넘으면 {customer} 절반 이상이 기다리지 않고 나가요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 스마트폰 데이터로 {site}를 한 번 열어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_mid}이면 끝나요",
      cta: "속도 개선",
    },
  },

  "PERF-FID-001": {
    ruleId: "PERF-FID-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 버튼을 눌러도 반응이 늦어요",
      harm: "{comparison_phrase_anchor} 버튼을 누르면 바로 반응해요. 반응이 느리면 {customer}이 답답해서 한 번 더 누르거나 그냥 나가요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 스마트폰으로 메뉴·예약 버튼을 눌러 반응 속도를 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_mid}이면 끝나요",
      cta: "속도 개선",
    },
  },

  "PERF-CLS-002": {
    ruleId: "PERF-CLS-002",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 화면이 로딩 중에 너무 많이 흔들려요",
      harm: "{comparison_phrase_anchor} 로딩 중에도 화면이 안정적으로 떠요. 흔들리면 {customer}이 잘못 클릭하고 짜증이 나서 나가요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. {site}를 처음 열 때 광고·배너가 갑자기 끼어들지 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_mid}이면 끝나요",
      cta: "속도 개선",
    },
  },

  "PERF-INP-001": {
    ruleId: "PERF-INP-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 메뉴·버튼 누른 뒤 화면 바뀌는 게 느려요",
      harm: "{comparison_phrase_anchor} 버튼을 누른 뒤 화면이 바로 바뀌어요. 반응이 늦으면 {customer}이 '이거 망가졌나' 하고 떠나요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 스마트폰에서 메뉴 열기, 예약하기를 차례로 눌러보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_mid}이면 끝나요",
      cta: "속도 개선",
    },
  },

  "PERF-TTFB-001": {
    ruleId: "PERF-TTFB-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 서버가 응답을 늦게 줘요",
      harm: "{comparison_phrase_anchor} 서버 응답이 1초 안에 와요. 늦으면 검색엔진도 느린 사이트로 분류해서 순위가 떨어져요",
      action_self: "{est_time_long} 안에 사장님이 확인하실 수 있어요. 호스팅 업체에 서버 응답 속도를 점검해 달라고 요청해보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_mid}이면 끝나요",
      cta: "서버 점검",
    },
  },

  "PERF-MOBILE-001": {
    ruleId: "PERF-MOBILE-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}가 스마트폰에서 특히 느려요",
      harm: "{comparison_phrase_anchor} 스마트폰에서도 매끄럽게 열려요. {customer} 10명 중 7명이 스마트폰으로 검색해요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 점심·저녁 시간에 스마트폰 데이터로 {site}에 들어가 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_mid}이면 끝나요",
      cta: "속도 개선",
    },
  },

  // ==========================================================================
  // A11Y — 6개
  // ==========================================================================

  "A11Y-DOC-LANG-001": {
    ruleId: "A11Y-DOC-LANG-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}가 한국어로 만들어졌다는 표시가 빠졌어요",
      harm: "{comparison_phrase_anchor} 한국어 사이트라는 표시를 해뒀어요. 표시가 없으면 화면 읽기 도구가 외국어로 읽거나 잘못 읽어요",
      action_self: "{est_time_short} 안에 사장님이 확인하실 수 있어요. 홈페이지 관리자 페이지에서 언어를 한국어로 설정해 주세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "A11Y-DOC-TITLE-001": {
    ruleId: "A11Y-DOC-TITLE-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 페이지마다 이름표가 또렷하지 않아요",
      harm: "{comparison_phrase_anchor} 페이지마다 다른 이름표를 달아뒀어요. 이름표가 없으면 즐겨찾기·탭에서 어떤 페이지인지 구분이 안 돼요",
      action_self: "{est_time_short} 안에 사장님이 직접 다듬으실 수 있어요. 메뉴·예약·소개 페이지에 다른 이름표를 적어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "A11Y-HEADING-ORDER-001": {
    ruleId: "A11Y-HEADING-ORDER-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 소제목 단계가 건너뛰어져 있어요",
      harm: "{comparison_phrase_anchor} 큰 제목·중간 제목·작은 제목 순서를 차례대로 써뒀어요. 단계가 건너뛰면 화면 읽기 도구가 글의 흐름을 못 따라가요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 페이지 위에서 아래로 제목 크기가 자연스레 작아지는지 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "A11Y-LANDMARK-001": {
    ruleId: "A11Y-LANDMARK-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 본문 시작점이 표시되어 있지 않아요",
      harm: "{comparison_phrase_anchor} 본문·머리·메뉴 구역을 구분해서 표시해뒀어요. 구분이 없으면 화면 읽기 도구가 어디부터 읽어야 할지 몰라요",
      action_self: "{est_time_medium} 안에 사장님이 확인하실 수 있어요. 본문이 메뉴와 분리된 영역에 들어 있는지 {vendor_type}에게 점검 부탁해 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "A11Y-FOCUS-VISIBLE-001": {
    ruleId: "A11Y-FOCUS-VISIBLE-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에서 키보드로 이동할 때 어디가 선택됐는지 안 보여요",
      harm: "{comparison_phrase_anchor} 키보드로 누른 자리에 표시가 떠요. 표시가 없으면 {customer}이 어떤 버튼을 누르려 했는지 헷갈려요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 키보드 Tab 키로 메뉴를 옮겨가며 표시가 보이는지 살펴보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "A11Y-ARIA-VALID-001": {
    ruleId: "A11Y-ARIA-VALID-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 화면 읽기 도구용 표시가 잘못돼 있어요",
      harm: "{comparison_phrase_anchor} 화면 읽기 도구가 알아볼 수 있게 정확히 표시해뒀어요. 잘못 표시하면 오히려 더 헷갈리게 읽혀요",
      action_self: "{est_time_medium} 안에 사장님이 확인하실 수 있어요. 자세한 점검은 {vendor_type}에게 맡기는 게 안전해요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  // ==========================================================================
  // MOBILE — 1개
  // ==========================================================================

  "MOBILE-FONT-SIZE-001": {
    ruleId: "MOBILE-FONT-SIZE-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 글자가 스마트폰에서 너무 작아요",
      harm: "{comparison_phrase_anchor} 스마트폰에서도 읽기 좋은 크기로 맞춰뒀어요. 너무 작으면 {customer}이 확대하다 지쳐서 나가요",
      action_self: "{est_time_short} 안에 사장님이 직접 확인하실 수 있어요. 스마트폰으로 {site} 본문을 손가락으로 확대 안 하고 읽을 수 있는지 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  // ==========================================================================
  // NLP — 5개
  // ==========================================================================

  "NLP-TOPIC-RELEVANCE-001": {
    ruleId: "NLP-TOPIC-RELEVANCE-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 본문이 주제에서 벗어나 있어요",
      harm: "{comparison_phrase_anchor} 본문 내용이 {name}의 핵심 서비스에 집중돼 있어요. 본문이 다른 주제로 새면 검색에서 {name}이 잘 안 나와요",
      action_self: "{est_time_medium} 안에 사장님이 직접 정리하실 수 있어요. 본문 중 {name} 운영과 관련 없는 부분은 빼거나 짧게 줄여보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "NLP-EEAT-AUTHOR-001": {
    ruleId: "NLP-EEAT-AUTHOR-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 글에 누가 운영하는지 안 보여요",
      harm: "{comparison_phrase_anchor} 사장님 소개나 운영자 정보를 적어뒀어요. 운영자가 안 보이면 AI가 글의 신뢰도를 낮게 매겨요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. '안녕하세요, {name} 대표 OOO입니다' 한 줄만 넣어도 좋아요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "소개 추가",
    },
  },

  "NLP-EEAT-EXPERTISE-001": {
    ruleId: "NLP-EEAT-EXPERTISE-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 사장님의 경력·전문성이 잘 안 드러나요",
      harm: "{comparison_phrase_anchor} 운영 N년·자격·경험을 같이 적어뒀어요. 전문성·경력을 적어두면 AI가 {name}을 이해하도록 돕는 기본이에요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. '운영 N년, OO 분야 경험'처럼 사실 위주로 적어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "경력 추가",
    },
  },

  "NLP-EEAT-TRUST-001": {
    ruleId: "NLP-EEAT-TRUST-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 사업자 정보·연락처가 충분히 안 보여요",
      harm: "{comparison_phrase_anchor} 사업자번호·주소·전화번호를 잘 보이는 곳에 적어뒀어요. 정보가 부족하면 AI도 {customer}도 {name}을 신뢰하기 어려워해요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 페이지 아래쪽에 사업자번호·주소·연락처를 한 줄로 정리해주세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "정보 추가",
    },
  },

  "NLP-SEMANTIC-ALIGN-001": {
    ruleId: "NLP-SEMANTIC-ALIGN-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 제목과 본문 내용이 잘 안 맞아요",
      harm: "{comparison_phrase_anchor} 제목에서 약속한 내용을 본문에서 그대로 보여줘요. 안 맞으면 {customer}이 속았다고 느끼고 검색엔진도 점수를 깎아요",
      action_self: "{est_time_medium} 안에 사장님이 직접 다듬으실 수 있어요. 제목이 말하는 핵심이 본문 첫 부분에 나오는지 확인해 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  // ==========================================================================
  // BACKLINK — 4개
  // ==========================================================================

  "BACKLINK-CANONICAL-CONSISTENCY-001": {
    ruleId: "BACKLINK-CANONICAL-CONSISTENCY-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 대표 주소가 일관되지 않아요",
      harm: "{comparison_phrase_anchor} 모든 페이지에서 같은 대표 주소를 가리키도록 설정해뒀어요. 대표 주소가 다르면 검색엔진이 {name} 점수를 여러 곳으로 흩어요",
      action_self: "{est_time_medium} 안에 사장님이 확인하실 수 있어요. 자세한 점검은 {vendor_type}에게 맡기는 게 빨라요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "BACKLINK-STRUCTURED-DATA-DIVERSITY-001": {
    ruleId: "BACKLINK-STRUCTURED-DATA-DIVERSITY-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 검색엔진이 읽는 정보 종류가 적어요",
      harm: "{comparison_phrase_anchor} 가게 정보·FAQ·영업 정보 등 여러 종류의 정보를 정리해뒀어요. 종류가 많을수록 검색 결과에서 더 풍성하게 보여요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. X-SAG 스니펫 생성 기능으로 부족한 정보 종류를 채워보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "스니펫 만들기",
    },
  },

  "BACKLINK-SOCIAL-META-001": {
    ruleId: "BACKLINK-SOCIAL-META-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 링크를 SNS에 올릴 때 정보가 부족해요",
      harm: "{comparison_phrase_anchor} 카카오톡·페이스북에 공유될 때 미리보기가 잘 떠요. 미리보기 정보가 부족하면 공유해도 클릭이 잘 안 나와요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 카카오톡에 {site} 주소를 붙여 이미지·제목·설명이 다 뜨는지 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "BACKLINK-INTERNAL-LINK-DEPTH-001": {
    ruleId: "BACKLINK-INTERNAL-LINK-DEPTH-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 중요한 페이지가 너무 깊이 숨어 있어요",
      harm: "{comparison_phrase_anchor} 중요한 페이지를 첫 화면에서 두세 번 안에 갈 수 있게 해뒀어요. 깊이 숨으면 검색엔진과 {customer} 모두 못 찾아요",
      action_self: "{est_time_short} 안에 사장님이 직접 정리하실 수 있어요. 메뉴에 핵심 페이지 링크를 추가해서 첫 화면에서 바로 가게 해주세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },
};
