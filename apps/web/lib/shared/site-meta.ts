// @TASK trust-set - 운영주체 메타 단일 출처 (SITE_META)
// @SPEC docs/planning/05-design-system.md §5 (정직성: 빈 값 = 빈 문자열, 가짜값 0)
//
// 오픈 전 TODO 항목은 SiteFooter에서 "(오픈 전 등록 예정)"으로 표시됨.

export const SITE_META = {
  serviceName: "보이나",
  companyName: "", // TODO(오픈전 필수): 사업자등록증 상 상호
  ceoName: "", // TODO(오픈전 필수): 대표자명
  bizRegNo: "", // TODO(오픈전 필수): 사업자등록번호
  mailOrderNo: "", // TODO(오픈전): 통신판매업 신고번호 (유료결제 시 필요)
  address: "", // TODO(오픈전 필수): 사업장 주소
  contactEmail: "", // TODO(오픈전 필수): 고객센터 이메일
  contactPhone: "", // TODO(선택): 고객센터 전화
} as const;
