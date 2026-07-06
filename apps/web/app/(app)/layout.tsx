// @TASK platform-shell - 인앱 라우트 그룹 레이아웃 (풀 반응형 셸)
// @SPEC docs/planning/02-trd.md#1-아키텍처-개요
// @SPEC design/UX-DESIGN-SPEC.md §4 (반응형 플랫폼 셸 — 모바일 430 프레임 폐기)
// @SPEC .claude/constitutions/nextjs/auth.md §1 (getCurrentUser 단일 Auth 레이어)
//
// (app) 라우트 그룹 — URL에 영향 없음.
// 모두 이 레이아웃을 상속한다. 후발주자 플랫폼 톤을 위해 모바일-430 프레임을 폐기하고
// 랜딩과 동일한 풀 반응형(상단 AppNav + SiteFooter)으로 통일. 콘텐츠 폭은 각 화면이 정한다.
// 랜딩(app/page.tsx)은 이 그룹 밖이므로 자체 헤더/푸터를 쓴다.

import { AppNav } from "@/app/components/shared/AppNav";
import { SiteFooter } from "@/app/components/shared/SiteFooter";
import { getCurrentUser } from "@/lib/auth";
import { getDefaultBusinessRepository } from "@/lib/business";
import { type ReactNode, Suspense } from "react";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  // P1-R1 getCurrentUser — 미인증이면 null. 빌드타임 DATABASE_URL 미설정만 내비 null 허용.
  // #2 내비 칩 = 가게명(이메일 금지). 인증 사용자의 최신 가게명, 없으면 null.
  let storeName: string | null = null;
  const isBuildTime = !process.env.DATABASE_URL;
  if (!isBuildTime) {
    try {
      const user = await getCurrentUser();
      if (user) {
        const business = await getDefaultBusinessRepository().findLatestByAccountId(user.id);
        storeName = business?.name ?? null;
      }
    } catch (err) {
      // 런타임 에러(DB 장애·세션 오류 등)는 미인증처럼 숨기지 않고 에러 경계로 올린다.
      console.error("[app-layout] getCurrentUser/가게명 조회 런타임 에러:", err);
      throw err;
    }
  }
  // isBuildTime(DATABASE_URL 미설정): 빌드타임 정상 상황 — 조용히 null 유지.

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* useSearchParams(퍼널 diagnosisId 이어주기) 사용 → Suspense 경계 필수 */}
      <Suspense
        fallback={
          <div className="sticky top-0 z-50 w-full border-b border-[#D8E5DD] bg-[#F6F7F5]/90 px-6 py-4 backdrop-blur-md">
            <span className="text-[22px] font-extrabold tracking-tight text-[var(--boina-brand-deep)]">
              보이나
            </span>
          </div>
        }
      >
        <AppNav storeName={storeName} />
      </Suspense>

      <main className="flex-1 pb-24 md:pb-0">{children}</main>

      <SiteFooter />
    </div>
  );
}
