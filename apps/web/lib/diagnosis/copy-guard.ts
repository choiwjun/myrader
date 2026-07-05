// @TASK P2-R6 - 생성물 카피 가드 (07 §4 생성물 가드 코드 강제)
// @SPEC docs/planning/07-coding-convention.md §4 (생성물 가드: 인과·과장 0·전문용어 0) / §5 (대행연결 금지)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드)
// @TEST apps/web/tests/diagnosis/generated-asset-service.test.ts
//
// 생성물(content/title)이 UI·이메일로 나가기 전 반드시 통과해야 하는 카피 가드(07 §4).
// snippet 엔진 출력도 이 가드를 통과해야 출력된다. 통과 못 하면 출력하지 않는다(정직 폴백).
//
// 차단 대상(양보 불가):
//   (a) 인과·과장 단정 — "고치면 1위/매출↑/반드시/보장" 류(점수↔실인용 무상관, 효과 단정 금지).
//   (b) 전문용어 — SEO/AEO/GEO/snippet/SERP/schema.org/JSON-LD/마이크로데이터(사장님 노출 0).
//   (c) 대행연결 — 중개/매칭/정산/수수료/마켓플레이스/견적받기/업체 연결(07 §5 스코프 금지).
//
// 휴먼 리뷰 의존을 줄이기 위해 코드로 강제한다(07 Risks). 정직 카피는 "사실 묘사 + 도움이
// 돼요" 톤만 통과한다.

/** (a) 인과·과장 단정 차단 패턴 — 효과 보장/매출/순위 단정. */
const CAUSAL_CLAIM =
  /1위|1등|일등|매출\s*↑|매출이?\s*(?:늘|올라|상승|증가)|수익\s*(?:늘|증가|상승)|반드시|확실히|무조건|보장|따라\s*하면|고치면\s*(?:추천|1위|상위|노출)|상위\s*노출\s*보장|효과\s*보장|매출\s*보장/;

/** (b) 전문용어 차단 패턴 — 사장님 언어 0 위반(엔진 출력 누수 포함). */
const TECHNICAL_JARGON =
  /\bSERP\b|grounded|\bsnippet\b|스니펫|\bAEO\b|\bGEO\b|\bSEO\b|메타태그|robots\.txt|schema\.org|JSON-?LD|마이크로데이터|구조화\s*데이터|크롤(?:링|러)/i;

/** (c) 대행연결(중개·매칭·정산) 차단 패턴 — 07 §5 비범위. */
const BROKERAGE =
  /중개|매칭해|정산|수수료|마켓플레이스|견적\s*받기|업체\s*연결해|업체\s*추천해\s*드릴|대행사\s*연결|업체\s*매칭/;

/** 룰 코드값(엔진 내부 식별자) 노출 차단 — UI 본문에 코드값 0. */
const RULE_CODE = /[A-Z]{2,}-[A-Z0-9-]*-?\d{2,}/;

/**
 * 생성물 카피가 가드를 통과하는지 검사한다(07 §4 — UI/이메일 출력 전 필수).
 *
 * @returns true=통과(출력 가능) / false=차단(출력 금지, 정직 폴백).
 */
export function passesCopyGuard(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  if (CAUSAL_CLAIM.test(text)) return false;
  if (TECHNICAL_JARGON.test(text)) return false;
  if (BROKERAGE.test(text)) return false;
  if (RULE_CODE.test(text)) return false;
  return true;
}

/** 가드 위반 사유(디버그·로깅용 — 사용자 노출 0). */
export function copyGuardViolation(text: string): string | null {
  if (!text || text.trim().length === 0) return "empty";
  if (CAUSAL_CLAIM.test(text)) return "causal-claim";
  if (TECHNICAL_JARGON.test(text)) return "technical-jargon";
  if (BROKERAGE.test(text)) return "brokerage";
  if (RULE_CODE.test(text)) return "rule-code";
  return null;
}
