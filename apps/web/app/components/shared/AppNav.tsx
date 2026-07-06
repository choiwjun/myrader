// @TASK platform-shell - 인앱 반응형 상단 내비 (랜딩 톤 일치 · Stitch 목업 포팅)
// @SPEC design/mockups/status.html (TopNavBar) · design/UX-DESIGN-SPEC.md §4
// @SPEC docs/planning/05-design-system.md §5 (정직성: 가짜 아바타/알림 0 — 설정만)
//
// 인앱 화면 공통 셸의 상단 내비. 모바일-430 프레임 + AppHeader 를 대체하는
// 풀 반응형 데스크톱/모바일 내비. 퍼널(내 상태→경쟁→갭→행동) 링크는 diagnosisId 를
// 이어준다. 가짜 프로필 사진/알림 벨은 노출하지 않는다(정직성) — 설정 진입만.

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const BRAND = "보이나";

const SECTIONS: { href: string; label: string; mobileLabel: string; carryId: boolean }[] = [
  { href: "/home", label: "홈", mobileLabel: "홈", carryId: true },
  { href: "/status", label: "내 상태", mobileLabel: "상태", carryId: true },
  { href: "/rivals", label: "라이벌", mobileLabel: "라이벌", carryId: true },
  { href: "/write", label: "문안", mobileLabel: "문안", carryId: true },
  { href: "/settings", label: "설정", mobileLabel: "설정", carryId: false },
];
const MOBILE_ICONS: Record<(typeof SECTIONS)[number]["href"], string> = {
  "/home": "home",
  "/status": "monitoring",
  "/rivals": "groups",
  "/write": "edit_note",
  "/settings": "settings",
};

export interface AppNavProps {
  /** 인증 사용자의 최신 가게명 (미인증/미선택이면 null) — 데스크톱 칩에 표시 */
  storeName?: string | null;
}

export function AppNav({ storeName }: AppNavProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const diagnosisId = params.get("diagnosisId");

  const hrefFor = (s: (typeof SECTIONS)[number]) => {
    if (!s.carryId || !diagnosisId) return s.href;

    const hrefParams = new URLSearchParams();
    hrefParams.set("diagnosisId", diagnosisId);
    return `${s.href}?${hrefParams.toString()}`;
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[#D8E5DD] bg-[#F6F7F5]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* 로고 → 랜딩 */}
        <Link
          href="/"
          className="text-[22px] font-extrabold tracking-tight text-[var(--boina-brand-deep)]"
        >
          {BRAND}
        </Link>

        {/* 데스크톱 섹션 내비 */}
        <div className="hidden items-center gap-7 md:flex">
          {SECTIONS.map((s) => {
            const active = pathname === s.href;
            return (
              <Link
                key={s.href}
                href={hrefFor(s)}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "border-b-2 border-[var(--boina-brand)] pb-1 text-sm font-bold text-[var(--boina-brand)]"
                    : "pb-1 text-sm font-medium text-[#64748B] transition-colors hover:text-[#0F172A]"
                }
              >
                {s.label}
              </Link>
            );
          })}
        </div>

        {/* 가게명 칩(있을 때) + 설정 */}
        <div className="flex items-center gap-2">
          {storeName ? (
            <span className="hidden max-w-[180px] items-center gap-1.5 truncate rounded-full bg-[var(--boina-brand-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--boina-brand-deep)] sm:flex">
              <span className="material-symbols-outlined text-[18px]">storefront</span>
              <span className="truncate">{storeName}</span>
            </span>
          ) : null}
          <Link
            href="/settings"
            aria-label="설정"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[var(--boina-brand-soft)] hover:text-[#0F172A]"
          >
            <span className="material-symbols-outlined">settings</span>
          </Link>
        </div>
      </div>
      {/* 모바일 하단 내비 — 주요 5개 경로만 노출하고 carryId 경로는 diagnosisId를 이어준다. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#D8E5DD] bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(25,31,40,0.08)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {SECTIONS.map((s) => {
            const active = pathname === s.href;
            return (
              <Link
                key={`mobile-${s.href}`}
                href={hrefFor(s)}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl bg-[var(--boina-brand-soft)] text-[var(--boina-brand-deep)]"
                    : "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                }
              >
                <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                  {MOBILE_ICONS[s.href]}
                </span>
                <span className="text-[12px] font-bold leading-none">{s.mobileLabel}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
