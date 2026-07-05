// @TASK login-screen - 로그인 후 복귀 경로 안전 검증 (오픈 리다이렉트 방지)
// @SPEC .claude/constitutions/nextjs/auth.md (단일 인증 / 안전한 복귀)
// @TEST apps/web/tests/auth/safe-redirect.test.ts
//
// 이 값은 공격자가 조작할 수 있으므로(open redirect), **동일 출처 내부 경로만** 허용한다.
// 외부/프로토콜 상대/스킴/역슬래시/제어문자가 섞이면 안전 기본값으로 폴백한다.

/** 미인증 사용자의 기본 복귀 목적지(유일한 보호 라우트). */
export const DEFAULT_REDIRECT = "/settings";

/** 문자열에 제어문자(코드포인트 < 0x20)가 하나라도 있으면 true. */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

/**
 * 로그인 성공 후 이동할 경로를 안전하게 정규화한다.
 * - 허용: 단일 슬래시로 시작하는 내부 경로(`/settings`, `/home?returnTo=/x`)
 * - 차단: 빈 값 / `//host`(프로토콜 상대) / `http(s):` 스킴 / 역슬래시 / 제어문자
 *   → `fallback`(기본 `/settings`) 반환
 */
export function safeRedirectPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (!raw) return fallback;
  const v = raw.trim();
  if (v === "") return fallback;
  // 내부 절대경로만: 단일 슬래시 시작
  if (!v.startsWith("/")) return fallback;
  // 프로토콜 상대(`//evil.com`) → 외부 이동 가능 → 차단
  if (v.startsWith("//")) return fallback;
  // 역슬래시(`/\evil` → 브라우저가 `//evil` 로 정규화) → 차단
  if (v.includes("\\")) return fallback;
  // 제어문자/개행 삽입(`/\nhttp://...`) → 차단
  if (hasControlChar(v)) return fallback;
  // `/https://evil` 처럼 경로 안에 스킴이 끼는 변형 → 보수적으로 차단
  if (/^\/+[^/]*:/.test(v)) return fallback;
  return v;
}
