/**
 * X-SAG Contracts — 룰 카피 시드 (한국어)
 *
 * @TASK TASK-COPY-004 — 30 룰 × 5슬롯 카피 템플릿
 * @SPEC docs/features/x-sag-diagnosis-engine/TRD.md#v0.4.2
 * @SPEC docs/features/x-sag-diagnosis-engine/DESIGN_RESEARCH_BRIEF.md#v3.3
 *
 * 카피 작성 원칙:
 *  - P1 (title): "{site}에/이/가 ~없어요/약해요/안 보여요"
 *  - P2 (harm): "{comparison_phrase_anchor} 이미 ~해뒀어요"
 *  - P3 (action_self): "{est_time_short} 안에 사장님이 직접..."
 *  - P3 (action_pro): "{vendor_type}한테 {est_cost_low}~..."
 *  - 사장님 호칭 일관, 님·고객님·귀하 금지
 *  - 의료 효능 표현 완전 금지 (clinic compliance)
 *
 * 카테고리 분포 (총 30개):
 *  SEO  10개: SEO-TITLE-001, SEO-META-001, SEO-H1-001, SEO-ROBOTS-001,
 *             SEO-MOBILE-001, SEO-HTTPS-001, SEO-KEYWORD-001,
 *             SEO-STRUCTURED-DATA-001, SEO-OG-001, SEO-REGION-001
 *  AEO   5개: AEO-FAQ-001, AEO-SERVICE-DESC-001, AEO-QUESTION-FORMAT-001,
 *             AEO-CONTACT-DIRECT-001, AEO-DIRECT-ANSWER-001
 *  GEO   5개: GEO-BUSINESS-NAME-001, GEO-LOCAL-BUSINESS-SCHEMA-001,
 *             GEO-REGION-001, GEO-LLMS-TXT-001, GEO-INDUSTRY-001
 *  self 10개: PERF-LCP-001, PERF-CLS-001, PERF-FCP-001,
 *             A11Y-IMAGE-ALT-001, A11Y-COLOR-CONTRAST-001,
 *             MOBILE-VIEWPORT-OK-001, MOBILE-TAP-TARGET-001,
 *             NLP-READABILITY-001, NLP-KEYWORD-DENSITY-001,
 *             SEO-IMG-ALT-001
 *
 * 실측 ruleId: packages/core-engine/src/analyzers/rules/ 에서 추출
 */

import type { RuleCopyTemplate } from "./types.js";
import { MEDIUM_RULE_COPY_KO } from "./rule-copy-medium.ko.js";

// ---------------------------------------------------------------------------
// HIGH_PRIORITY_COPY — 30 룰 카피 시드 (high priority 위주)
// ---------------------------------------------------------------------------

const HIGH_PRIORITY_COPY: Record<string, RuleCopyTemplate> = {

  // ==========================================================================
  // SEO — 10개 (category: "seo")
  // ==========================================================================

  "SEO-TITLE-001": {
    ruleId: "SEO-TITLE-001",
    category: "seo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site}에 이름표가 없어요",
      harm: "{comparison_phrase_anchor} 이미 이름표를 달아뒀어요. 이름표가 없으면 검색할 때 {name}이 안 나와요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 페이지 상단에 가게 이름 + 한 줄 소개",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-META-001": {
    ruleId: "SEO-META-001",
    category: "seo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site} 소개 문구가 검색에 안 보여요",
      harm: "{comparison_phrase_anchor} 이미 소개 문구를 달아뒀어요. 없으면 {customer}이 클릭을 망설여요",
      action_self: "{est_time_short} 안에 사장님이 직접 쓰실 수 있어요. {name}이 뭐 하는 곳인지 두 줄만 쓰면 돼요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-H1-001": {
    ruleId: "SEO-H1-001",
    category: "seo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site} 첫 줄 제목이 없어요",
      harm: "{comparison_phrase_anchor} 이미 첫 줄 제목을 넣어뒀어요. 제목이 없으면 검색엔진이 어떤 곳인지 몰라요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. {name} + 핵심 서비스 한 줄이면 충분해요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-ROBOTS-001": {
    ruleId: "SEO-ROBOTS-001",
    category: "seo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site}가 검색엔진에 숨겨져 있어요",
      harm: "{comparison_phrase_anchor} 검색에 잘 잡혀요. 지금 이 설정이면 {plural}을 아무리 검색해도 {name}이 안 나와요",
      action_self: "{est_time_medium} 안에 사장님이 확인하실 수 있어요. 홈페이지 설정에서 noindex 항목을 찾아보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-MOBILE-001": {
    ruleId: "SEO-MOBILE-001",
    category: "seo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site}가 스마트폰에서 작게 보여요",
      harm: "{comparison_phrase_anchor} 이미 모바일 최적화가 돼 있어요. {customer} 10명 중 7명이 스마트폰으로 검색해요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 스마트폰으로 {site}에 접속해 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-HTTPS-001": {
    ruleId: "SEO-HTTPS-001",
    category: "seo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site}가 보안 연결이 아니에요",
      harm: "{comparison_phrase_anchor} 이미 보안 연결을 적용해뒀어요. 보안이 없으면 검색 순위에서 불이익을 받아요",
      action_self: "{est_time_medium} 안에 사장님이 확인하실 수 있어요. 주소창에서 https로 시작하는지 확인해 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-KEYWORD-001": {
    ruleId: "SEO-KEYWORD-001",
    category: "seo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site}에서 핵심 단어를 못 찾겠어요",
      harm: "{comparison_phrase_anchor} 이미 핵심 단어를 제목에 넣어뒀어요. 핵심 단어가 없으면 검색해도 {name}이 안 나와요",
      action_self: "{est_time_short} 안에 사장님이 직접 수정하실 수 있어요. 제목에 '{name}' 같은 업종 이름과 주요 서비스 이름을 넣어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-STRUCTURED-DATA-001": {
    ruleId: "SEO-STRUCTURED-DATA-001",
    category: "seo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site} 정보가 검색엔진에 제대로 안 읽혀요",
      harm: "{comparison_phrase_anchor} 이미 구조화 코드를 넣어뒀어요. 없으면 검색 결과에서 별점·영업시간이 안 떠요",
      action_self: "{est_time_medium} 안에 사장님이 확인하실 수 있어요. X-SAG 스니펫 생성 기능으로 코드를 만들 수 있어요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "스니펫 만들기",
    },
  },

  "SEO-OG-001": {
    ruleId: "SEO-OG-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 링크를 카카오톡에 공유하면 미리보기가 안 나와요",
      harm: "{comparison_phrase_anchor} 이미 SNS 미리보기를 설정해뒀어요. 없으면 공유해도 이미지가 안 보여요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 카카오톡에 {site} 주소를 붙여넣어 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-REGION-001": {
    ruleId: "SEO-REGION-001",
    category: "seo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 위치 정보가 없어요",
      harm: "{comparison_phrase_anchor} 이미 지역 정보를 넣어뒀어요. 없으면 '근처 {plural}' 검색에서 안 나와요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 소개글에 동네 이름만 넣어도 달라져요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  // ==========================================================================
  // AEO — 5개 (category: "aeo")
  // ==========================================================================

  "AEO-FAQ-001": {
    ruleId: "AEO-FAQ-001",
    category: "aeo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{customer}들이 묻는 걸 {site}에 답이 없어요",
      harm: "{comparison_phrase_anchor} 이미 FAQ를 넣어뒀어요. AI가 {name}을 추천할 때 이 정보가 필요해요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 자주 받는 질문 5개만 써보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "FAQ 추가하기",
    },
  },

  "AEO-SERVICE-DESC-001": {
    ruleId: "AEO-SERVICE-DESC-001",
    category: "aeo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site}에서 무슨 서비스를 하는지 잘 안 보여요",
      harm: "{comparison_phrase_anchor} 이미 서비스를 자세히 설명해뒀어요. AI가 {name}을 소개할 때 쓸 정보가 없어요",
      action_self: "{est_time_short} 안에 사장님이 직접 쓰실 수 있어요. 주요 서비스 2~3줄씩만 설명해 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "AEO-QUESTION-FORMAT-001": {
    ruleId: "AEO-QUESTION-FORMAT-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 질문형 소제목이 없어요",
      harm: "{comparison_phrase_anchor} 이미 '어떻게 되나요?' 형태의 소제목을 달아뒀어요. 질문형 소제목은 AI가 내용을 읽고 답을 찾도록 돕는 기본이에요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. '가격이 얼마인가요?' 같은 소제목 2~3개를 넣어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "AEO-CONTACT-DIRECT-001": {
    ruleId: "AEO-CONTACT-DIRECT-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에서 바로 연락할 방법이 안 보여요",
      harm: "{comparison_phrase_anchor} 이미 전화번호나 카카오 링크를 잘 보이는 곳에 뒀어요. 없으면 {customer}이 찾다 그냥 나가요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 전화번호 하나만 제일 위에 올려도 달라져요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "연락처 추가",
    },
  },

  "AEO-DIRECT-ANSWER-001": {
    ruleId: "AEO-DIRECT-ANSWER-001",
    category: "aeo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 내용이 너무 길어서 AI가 못 읽어요",
      harm: "{comparison_phrase_anchor} 이미 짧고 명확한 문장으로 써뒀어요. 짧고 명확한 문장은 AI가 내용을 읽어가도록 돕는 기본이에요",
      action_self: "{est_time_medium} 안에 사장님이 직접 수정하실 수 있어요. 한 단락을 3~4문장으로 짧게 끊어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  // ==========================================================================
  // GEO — 5개 (category: "geo")
  // ==========================================================================

  "GEO-BUSINESS-NAME-001": {
    ruleId: "GEO-BUSINESS-NAME-001",
    category: "geo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site}에 {name} 이름이 잘 안 보여요",
      harm: "{comparison_phrase_anchor} 이미 가게 이름을 제목에 넣어뒀어요. 제목에 이름이 또렷하면 AI가 {name}을 정확히 알아보도록 돕는 기본이에요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 제목과 소개글에 {name}을 한 번씩 넣어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "GEO-LOCAL-BUSINESS-SCHEMA-001": {
    ruleId: "GEO-LOCAL-BUSINESS-SCHEMA-001",
    category: "geo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site} {name} 정보가 구글·AI에 제대로 안 등록돼요",
      harm: "{comparison_phrase_anchor} 이미 구조화 코드를 넣어뒀어요. 없으면 AI가 {name}의 위치·영업시간을 틀리게 알아요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. X-SAG 스니펫 생성 기능으로 코드를 만들 수 있어요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "스니펫 만들기",
    },
  },

  "GEO-REGION-001": {
    ruleId: "GEO-REGION-001",
    category: "geo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site}에 동네 이름이 없어요",
      harm: "{comparison_phrase_anchor} 이미 지역 정보를 넣어뒀어요. AI가 '근처 {plural}' 추천할 때 지역 정보가 꼭 필요해요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 소개글에 동네 이름을 한 번만 넣어도 돼요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "GEO-LLMS-TXT-001": {
    ruleId: "GEO-LLMS-TXT-001",
    category: "geo",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에 AI 읽기 허가 파일이 없어요",
      harm: "{comparison_phrase_anchor} 이미 llms.txt를 달아뒀어요. 없으면 AI 검색 로봇이 {site}를 스킵할 수 있어요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. X-SAG가 파일 생성을 도와드릴 수 있어요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "파일 만들기",
    },
  },

  "GEO-INDUSTRY-001": {
    ruleId: "GEO-INDUSTRY-001",
    category: "geo",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site}에서 어떤 업종인지 잘 안 보여요",
      harm: "{comparison_phrase_anchor} 이미 업종을 명확히 써뒀어요. 업종이 또렷하면 AI가 {name}이 어떤 곳인지 이해하도록 돕는 기본이에요",
      action_self: "{est_time_short} 안에 사장님이 직접 추가하실 수 있어요. 소개글에 {name} 업종을 한 줄만 써보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  // ==========================================================================
  // self — 10개 (PERF/A11Y/Mobile/NLP/이미지 등 기타)
  // ==========================================================================

  "PERF-LCP-001": {
    ruleId: "PERF-LCP-001",
    category: "self",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site}가 열리는 데 너무 오래 걸려요",
      harm: "{comparison_phrase_anchor} 이미 빠르게 열려요. {customer}이 2.5초 넘게 기다리면 그냥 나가요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 스마트폰으로 {site}에 들어가 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_mid}이면 끝나요",
      cta: "속도 개선",
    },
  },

  "PERF-CLS-001": {
    ruleId: "PERF-CLS-001",
    category: "self",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site}에서 버튼이 갑자기 움직여요",
      harm: "{comparison_phrase_anchor} 이미 안정적으로 고쳐뒀어요. 화면이 흔들리면 {customer}이 잘못 클릭하고 나가요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 스마트폰으로 {site}를 위아래로 스크롤해 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_mid}이면 끝나요",
      cta: "속도 개선",
    },
  },

  "PERF-FCP-001": {
    ruleId: "PERF-FCP-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 첫 화면이 느리게 채워져요",
      harm: "{comparison_phrase_anchor} 이미 첫 화면이 빠르게 떠요. 느리면 {customer}이 아직 로딩 중인 줄 알고 나가요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. PageSpeed Insights로 점수를 확인해 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_mid}이면 끝나요",
      cta: "속도 개선",
    },
  },

  "A11Y-IMAGE-ALT-001": {
    ruleId: "A11Y-IMAGE-ALT-001",
    category: "self",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site} 사진에 설명이 없어요",
      harm: "{comparison_phrase_anchor} 이미 사진마다 설명을 달아뒀어요. 설명이 없으면 이미지 검색에서 {name}이 안 나와요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 각 사진에 짧은 설명만 넣으면 돼요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "A11Y-COLOR-CONTRAST-001": {
    ruleId: "A11Y-COLOR-CONTRAST-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 글자가 배경에 잘 안 보여요",
      harm: "{comparison_phrase_anchor} 이미 글자 색이 잘 보이도록 맞춰뒀어요. 안 보이면 {customer}이 불편해서 나가요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 햇빛 아래 스마트폰으로 {site}를 열어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "MOBILE-VIEWPORT-OK-001": {
    ruleId: "MOBILE-VIEWPORT-OK-001",
    category: "self",
    defaultPriority: "high",
    version: "1.0.0",
    slots: {
      title: "{site}가 스마트폰 화면에 안 맞아요",
      harm: "{comparison_phrase_anchor} 이미 스마트폰에 맞게 조절돼 있어요. 작게 보이면 {customer}이 글씨를 못 읽고 나가요",
      action_self: "{est_time_short} 안에 사장님이 직접 확인하실 수 있어요. 스마트폰으로 {site}에 접속해 보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "MOBILE-TAP-TARGET-001": {
    ruleId: "MOBILE-TAP-TARGET-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 버튼이 너무 작아서 잘못 눌러요",
      harm: "{comparison_phrase_anchor} 이미 버튼 크기를 충분히 키워뒀어요. 작은 버튼은 {customer}이 잘못 눌러서 짜증이 나요",
      action_self: "{est_time_short} 안에 사장님이 직접 확인하실 수 있어요. 스마트폰으로 각 버튼을 눌러보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "NLP-READABILITY-001": {
    ruleId: "NLP-READABILITY-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 내용이 너무 어렵게 쓰여 있어요",
      harm: "{comparison_phrase_anchor} 이미 쉬운 말로 써뒀어요. 어려운 단어가 많으면 {customer}이 읽다 지쳐요",
      action_self: "{est_time_medium} 안에 사장님이 직접 수정하실 수 있어요. 어려운 단어를 평소 말하는 식으로 바꿔보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "NLP-KEYWORD-DENSITY-001": {
    ruleId: "NLP-KEYWORD-DENSITY-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site}에서 핵심 단어가 너무 적어요",
      harm: "{comparison_phrase_anchor} 이미 핵심 단어를 자연스럽게 넣어뒀어요. 핵심 단어가 없으면 검색에서 {name}이 잘 안 나와요",
      action_self: "{est_time_medium} 안에 사장님이 직접 수정하실 수 있어요. 소개글에 {name} 관련 단어를 자연스럽게 넣어보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },

  "SEO-IMG-ALT-001": {
    ruleId: "SEO-IMG-ALT-001",
    category: "self",
    defaultPriority: "medium",
    version: "1.0.0",
    slots: {
      title: "{site} 사진에 설명 텍스트가 없어요",
      harm: "{comparison_phrase_anchor} 이미 사진마다 설명을 달아뒀어요. 없으면 이미지 검색에서 {name}이 안 나와요",
      action_self: "{est_time_medium} 안에 사장님이 직접 확인하실 수 있어요. 사진 설명을 짧게 한 줄씩 넣어 달라고 해보세요",
      action_pro: "{vendor_type}한테 부탁하시면 {est_cost_low}이면 끝나요",
      cta: "바로 고치기",
    },
  },
};

// ---------------------------------------------------------------------------
// RULE_COPY — high(30) + medium(60) 통합 카피 시드
// ---------------------------------------------------------------------------

export const RULE_COPY: Record<string, RuleCopyTemplate> = {
  ...HIGH_PRIORITY_COPY,
  ...MEDIUM_RULE_COPY_KO,
};
