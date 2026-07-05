// @TASK P1-R1 - 세션 쿠키 상수 (Edge-safe, node:crypto 미import)
// @SPEC .claude/constitutions/nextjs/auth.md
//
// middleware.ts(Edge 런타임)는 node:crypto 를 번들할 수 없다. 미들웨어가 필요로 하는
// 쿠키 이름/만료 상수만 이 모듈로 분리해, session.ts(crypto) 와 결합을 끊는다.

/** 세션 쿠키 이름 (앱 전역 단일). */
export const SESSION_COOKIE = "boina_session";

/** 세션 유효기간(초). 기본 7일. */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

/** 관리자 세션 쿠키 이름 (고객 세션과 격리). */
export const ADMIN_COOKIE = "boina_admin";

/** 관리자 세션 유효기간(초). 기본 12시간(운영 도구, 짧게). */
export const ADMIN_MAX_AGE_SEC = 60 * 60 * 12;
