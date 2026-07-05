// @TASK P0-layout - 루트 레이아웃 (최소화 — html/body + 전역 스타일만)
// @SPEC docs/planning/02-trd.md#1-아키텍처-개요
//
// 루트 레이아웃은 html/body + 전역 CSS(폰트·배경)만 담당한다.
// 인앱 모바일 프레임(max-w-430, AppHeader, SiteFooter)은 (app)/layout.tsx 로 분리.
// 랜딩(app/page.tsx)은 자체 헤더/푸터를 포함한 풀 반응형으로 렌더링된다.

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "보이나",
  description: "작은 가게를 위한 AI 검색 진단",
};

/** 모바일 우선 뷰포트 — 사용자 확대 허용 (접근성·스토어 심사 준수) */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale / userScalable 제한 없음 — WCAG 접근성 및 앱스토어 심사 기준 준수.
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* 폰트는 <head> link 로 직접 로드 — Tailwind v4(@import "tailwindcss") 뒤의
            CSS @import url() 가 드롭되는 이슈 회피. Pretendard·Plus Jakarta Sans·Material Symbols. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="bg-[#F8FAFC] text-[#0F172A] antialiased">{children}</body>
    </html>
  );
}
