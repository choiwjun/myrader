// @TASK P2-S7 - 설정 (/settings) 화면
// @SPEC specs/screens/settings.yaml (S7: REQ-001/007 — auth: true)
// @SPEC .claude/constitutions/nextjs/auth.md (requireAuth — 미인증 차단)
// @TEST apps/web/tests/screens/settings.test.ts
//
// 컴포넌트:
//   business_info_form     — 가게 정보 보기/수정 (이름·업종·지역·네이버 플레이스·홈페이지)
//   account_info           — 로그인 이메일 표시
//   rediagnose_placeholder — "다시 살펴보기" → "곧 제공돼요" (v1 placeholder, 동작 0)
//   change_store_button    — /find 가게 재선택
//
// auth: true — requireAuth (미인증이면 /login 리다이렉트). Server Component.
// 데이터: GET /api/settings (account + businessSettings).
// UX: 모바일, 큰 버튼, 응원 톤, 전문용어 0.

import { requireAuth } from "@/lib/auth";
import SettingsClient from "./SettingsClient";

// 세션/DB 에 의존하는 동적 페이지 — 빌드타임 prerender 제외(env 없이 build 성공).
// requireAuth(getCurrentUser)가 빌드 시 DATABASE_URL 없이 호출되어 prerender 실패하던 것을 차단.
export const dynamic = "force-dynamic";

/**
 * S7 설정 (/settings) — Server Component (auth gate).
 * requireAuth → null이면 /login 리다이렉트(헌법 §requireAuth 준수).
 */
export default async function SettingsPage() {
  // auth:true — 미인증이면 /login 리다이렉트
  const user = await requireAuth();

  return <SettingsClient email={user.email} />;
}
