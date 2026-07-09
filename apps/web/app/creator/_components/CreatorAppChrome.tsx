"use client";

import { CreatorLookupOverlay } from "@/app/creator/_components/CreatorLookupOverlay";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

const CREATOR_NAV = [
  { href: "/creator/radar", label: "레이더", icon: "radar" },
  { href: "/creator/diagnose", label: "글 진단", icon: "article" },
  { href: "/creator/citations", label: "인용 추적", icon: "track_changes" },
  { href: "/creator/reports/current", label: "주간 리포트", icon: "summarize" },
  { href: "/creator/settings", label: "설정", icon: "settings" },
] as const;

export function CreatorAppChrome({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [lookupOpen, setLookupOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setLookupOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && /^[1-5]$/.test(key)) {
        event.preventDefault();
        const target = CREATOR_NAV[Number(key) - 1];
        if (target) router.push(target.href);
      }
      if (key === "s") {
        if (pathname?.startsWith("/creator/radar")) {
          window.dispatchEvent(new Event("creator:scan"));
        } else {
          router.push("/creator/radar");
        }
      }
      if (key === "d") router.push("/creator/diagnose");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname, router]);

  return (
    <div className="min-h-dvh bg-[var(--creator-bg-space)] text-[var(--creator-text-hi)]">
      <header className="sticky top-0 z-50 border-b border-[var(--creator-line-subtle)] bg-[rgba(10,14,26,.86)] backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <Link href="/creator/radar" className="flex items-center gap-2 text-lg font-extrabold">
            <span className="material-symbols-outlined text-[var(--creator-signal-ai)]">radar</span>
            SearchRadar
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {CREATOR_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                  pathname === item.href
                    ? "bg-[var(--creator-bg-raised)] text-[var(--creator-text-hi)]"
                    : "text-[var(--creator-text-body)] hover:bg-[var(--creator-bg-raised)] hover:text-[var(--creator-text-hi)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLookupOpen(true)}
              className="grid min-h-10 min-w-10 place-items-center rounded-full border border-[var(--creator-line-subtle)] text-[var(--creator-text-body)]"
              aria-label="키워드 즉시 조회 열기"
            >
              <span className="material-symbols-outlined text-xl">search</span>
            </button>
            <Link
              href="/home"
              className="hidden rounded-full border border-[var(--creator-line-subtle)] px-3 py-2 text-sm font-semibold text-[var(--creator-text-body)] sm:inline-flex"
            >
              보이나로 이동
            </Link>
          </div>
        </nav>
      </header>
      <main className="pb-6 md:pb-0">{children}</main>
      <nav className="border-t border-[var(--creator-line-subtle)] bg-[rgba(10,14,26,.94)] px-2 pb-[max(env(safe-area-inset-bottom),.5rem)] pt-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-5 gap-1">
          {CREATOR_NAV.map((item) => (
            <Link
              key={`mobile-${item.href}`}
              href={item.href}
              className={`flex min-h-14 flex-col items-center justify-center rounded-xl text-[11px] font-bold ${
                pathname === item.href
                  ? "bg-[var(--creator-bg-raised)] text-[var(--creator-signal-ai)]"
                  : "text-[var(--creator-text-body)]"
              }`}
            >
              <span className="material-symbols-outlined text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
      <CreatorLookupOverlay open={lookupOpen} onClose={() => setLookupOpen(false)} />
    </div>
  );
}
