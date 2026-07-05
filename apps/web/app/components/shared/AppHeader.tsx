// @TASK P1-S0 - app_header 공통 컴포넌트
// @SPEC specs/shared/components.yaml#app_header
// @SPEC docs/planning/05-design-system.md (모바일 우선·큰 글씨)
//
// [RESOLVED] OQ-1: 제품명 = "보이나" 확정 (DECISION_LOG 2026-06-14).
// getCurrentUser 는 서버 컴포넌트에서 호출 — 헤더에 인증 상태 반영.

import Link from "next/link";

/** [RESOLVED] OQ-1: 제품명 확정 = "보이나". */
const BRAND_NAME = "보이나"; // OQ-1 해소 (2026-06-14)

export interface AppHeaderProps {
  /** 현재 로그인한 사용자의 가게명 (미인증이면 null) */
  storeName?: string | null;
}

/**
 * 상단 헤더 — 가게명 + 설정(/settings) 진입.
 * Server Component: getCurrentUser 결과를 상위에서 props로 주입한다.
 *
 * 접근성: role="banner", 설정 링크에 aria-label.
 */
export function AppHeader({ storeName }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-white border-b border-gray-100 px-4 py-3 min-h-[52px]">
      {/* 브랜드 영역 — [RESOLVED] OQ-1: 보이나 (최소 가독 크기·색 — 홈과 위계 격차 완화) */}
      <span className="text-sm font-bold text-gray-700 tracking-wide select-none">
        {BRAND_NAME}
      </span>

      {/* 가게명 — 인증된 경우 중앙 표시 */}
      {storeName ? (
        <span className="absolute left-1/2 -translate-x-1/2 text-base font-bold text-gray-900 truncate max-w-[160px]">
          {storeName}
        </span>
      ) : null}

      {/* 설정 진입 */}
      <Link
        href="/settings"
        aria-label="설정 화면으로 이동"
        className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-gray-600"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </Link>
    </header>
  );
}
