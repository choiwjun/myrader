// @TASK P0-landing - 랜딩 페이지 (풀 반응형, 정적, DB 접근 0)
// @SPEC docs/planning/05-design-system.md §5 (정직성: 가짜 숫자 0, 가짜 후기 0)
// @SPEC design/mockups/landing.html (인디고 팔레트 Stitch 목업 충실 포팅)
// @SPEC docs/planning/DECISION_LOG.md OQ-1: 제품명 = 보이나
//
// - "Boina" 영문 → "보이나" 전부 통일
// - 가짜 "1,200+ 사장님" 숫자 제거 → 정직 베타 문구
// - CTA: /find 이동 (query: q=가게이름)
// - 아이콘: Material Symbols Outlined (이모지 금지)
// - 정적 페이지 — env 없이 빌드 가능

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LandingPage() {
  const router = useRouter();
  const [shopName, setShopName] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = shopName.trim();
    if (q) {
      router.push(`/find?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/find");
    }
  }

  return (
    <>
      {/* ── 전역 배경 메시 그라디언트 ─────────────────────────────── */}
      <div
        className="min-h-screen"
        style={{
          backgroundColor: "#f8fafc",
          backgroundImage:
            "radial-gradient(at 0% 0%, rgba(99,102,241,0.05) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(99,102,241,0.03) 0px, transparent 50%)",
        }}
      >
        {/* ══════════════════════════════════════════
            TopNavBar
        ══════════════════════════════════════════ */}
        <header
          className="fixed top-0 w-full z-50 border-b border-slate-100"
          style={{ backgroundColor: "rgba(248,250,252,0.8)", backdropFilter: "blur(12px)" }}
        >
          <div className="max-w-[1200px] mx-auto flex justify-between items-center px-6 py-4">
            {/* 로고 */}
            <div
              className="text-[24px] tracking-tighter font-extrabold text-[#0F172A]"
              style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
            >
              보이나
            </div>

            {/* 데스크톱 nav — 불필요한 메뉴 제거, 로그인만 */}
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="text-[#0F172A] hover:opacity-70 transition-opacity text-sm font-medium"
              >
                로그인
              </Link>
            </div>
          </div>
        </header>

        <main className="pt-32">
          {/* ══════════════════════════════════════════
              Hero Section
          ══════════════════════════════════════════ */}
          <section className="max-w-[1200px] mx-auto px-6 mb-16">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              {/* ── 왼쪽: 헤드라인 + 입력 + 배지 ── */}
              <div className="space-y-8">
                <h1
                  className="text-[40px] md:text-[48px] font-bold leading-tight text-[#0F172A] tracking-tight"
                  style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
                >
                  요즘 손님은 검색하고, AI한테 물어보고 가게를 골라요.
                </h1>
                <p className="text-[18px] leading-relaxed text-[#64748B] max-w-lg">
                  그때 내 가게는 어떻게 보일까요? 1분이면 무료로 확인해요.
                </p>

                {/* 가게 이름 입력 폼 */}
                <form
                  onSubmit={handleSearch}
                  className="flex flex-col sm:flex-row gap-4 p-1 bg-white rounded-xl shadow-sm border border-[#CBD5E1] max-w-xl"
                >
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="우리 가게 이름을 검색해보세요"
                    className="flex-grow bg-transparent border-none outline-none px-4 py-3 text-[#0F172A] text-[16px] placeholder:text-[#94A3B8]"
                  />
                  <button
                    type="submit"
                    className="bg-[#4F46E5] text-white px-6 py-3 rounded-lg font-semibold text-[15px] hover:bg-[#4338CA] active:scale-95 transition-all whitespace-nowrap"
                  >
                    내 가게 무료로 살펴보기
                  </button>
                </form>

                {/* 신뢰 배지 */}
                <div className="flex flex-wrap gap-5 pt-2">
                  {[
                    { icon: "verified", label: "무료 진단" },
                    { icon: "credit_card_off", label: "카드 불필요" },
                    { icon: "handshake", label: "대행사 아님" },
                    { icon: "timer", label: "1분 소요" },
                  ].map(({ icon, label }) => (
                    <div
                      key={label}
                      className="flex items-center gap-1.5 text-[#64748B] text-sm font-medium"
                    >
                      <span className="material-symbols-outlined text-[18px]">{icon}</span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── 오른쪽: 제품 카드 ── */}
              <div className="relative">
                {/* 글로우 */}
                <div
                  className="absolute -inset-10 bg-[#4F46E5]/5 rounded-full blur-[100px]"
                  aria-hidden="true"
                />

                {/* 글래스 카드 */}
                <div
                  className="relative rounded-3xl p-8 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.08)] overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,0.8)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(241,245,249,1)",
                  }}
                >
                  {/* 카드 헤더 */}
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h3 className="text-[20px] font-semibold text-[#0F172A]">종합 노출 상태</h3>
                      <p className="text-sm text-[#64748B] mt-0.5">지난 24시간 기준 업데이트</p>
                    </div>
                    <div className="px-3 py-1 bg-[#34D399] text-[#002113] rounded-full text-xs font-bold uppercase tracking-wider">
                      Live
                    </div>
                  </div>

                  {/* 채널 행 */}
                  <div className="space-y-3 mb-8">
                    {/* 네이버 */}
                    <div className="flex items-center justify-between p-4 bg-[#EEF2FF] rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
                          <span className="material-symbols-outlined text-[#4F46E5]">search</span>
                        </div>
                        <span className="font-semibold text-[#0F172A]">네이버</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full bg-[#4EDEA3]"
                          style={{
                            animation: "pulse-green 2s infinite",
                          }}
                        />
                        <span className="text-sm font-medium text-[#005438]">정상</span>
                      </div>
                    </div>

                    {/* 구글 */}
                    <div className="flex items-center justify-between p-4 bg-[#EEF2FF] rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
                          <span className="material-symbols-outlined text-[#EA4335]">language</span>
                        </div>
                        <span className="font-semibold text-[#0F172A]">구글 지도</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#F59E0B]" />
                        <span className="text-sm font-medium text-[#B45309]">개선 필요</span>
                      </div>
                    </div>

                    {/* AI */}
                    <div className="flex items-center justify-between p-4 bg-[#EEF2FF] rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm">
                          <span className="material-symbols-outlined text-[#005438]">
                            smart_toy
                          </span>
                        </div>
                        <span className="font-semibold text-[#0F172A]">AI 답변 엔진</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#94A3B8]" />
                        <span className="text-sm font-medium text-[#64748B]">데이터 부족</span>
                      </div>
                    </div>
                  </div>

                  {/* 준비 상태 — 점수/랭킹 노출 금지(신호등·진행 표현만, 정직성) */}
                  <div className="border-t border-[#CBD5E1] pt-6">
                    <div className="flex justify-between items-end mb-3">
                      <span className="text-sm text-[#0F172A] font-semibold">
                        AI가 우리 가게를 익히는 중
                      </span>
                      <span className="text-xs text-[#64748B]">조금씩 채워지고 있어요</span>
                    </div>
                    <div className="h-4 bg-[#EEF2FF] rounded-full overflow-hidden flex">
                      <div className="h-full bg-[#4F46E5] rounded-full" style={{ width: "60%" }} />
                    </div>
                    <div className="flex justify-between mt-2">
                      <span className="text-[10px] text-[#64748B] font-medium">지금 준비 중</span>
                      <span className="text-[10px] text-[#64748B] font-medium">다 채우면 완료</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════
              어떻게 하나요? (4스텝)
          ══════════════════════════════════════════ */}
          <section className="max-w-[1200px] mx-auto px-6 py-16">
            <div className="text-center mb-16">
              <h2
                className="text-[32px] font-bold text-[#0F172A] mb-4"
                style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
              >
                준비는 보이나가 다 해둘게요
              </h2>
              <p className="text-[16px] text-[#64748B]">사장님은 딱 1분만 시간 내주세요.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative">
              {/* 데스크톱 연결선 */}
              <div
                className="hidden lg:block absolute top-1/2 left-0 w-full h-px -z-10"
                style={{
                  background: "linear-gradient(to right, transparent, #CBD5E1, transparent)",
                  transform: "translateY(-50%)",
                }}
                aria-hidden="true"
              />

              {[
                {
                  step: 1,
                  icon: "storefront",
                  title: "가게 찾기",
                  desc: "내 가게의 이름을 검색해 정보를 불러옵니다.",
                },
                {
                  step: 2,
                  icon: "visibility",
                  title: "노출 현황 확인",
                  desc: "검색과 AI 엔진에서 어떻게 보이는지 진단합니다.",
                },
                {
                  step: 3,
                  icon: "compare_arrows",
                  title: "이웃과 비교",
                  desc: "주변 인기 가게와 비교해 무엇이 다른지 보여드려요.",
                },
                {
                  step: 4,
                  icon: "bolt",
                  title: "오늘의 한 조치",
                  desc: "지금 바로 해볼 수 있는 한 가지를 알려드려요.",
                },
              ].map(({ step, icon, title, desc }) => (
                <div
                  key={step}
                  className="bg-white p-8 rounded-2xl border border-[#CBD5E1] shadow-sm text-center transition-transform duration-300 hover:-translate-y-1"
                  style={{ transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}
                >
                  <div className="w-12 h-12 bg-[#E0E7FF] rounded-xl flex items-center justify-center mx-auto mb-8">
                    <span className="material-symbols-outlined text-[#4F46E5]">{icon}</span>
                  </div>
                  <span className="text-xs text-[#4F46E5] font-bold mb-2 block tracking-wider">
                    STEP {step}
                  </span>
                  <h3 className="font-semibold text-[#0F172A] mb-2">{title}</h3>
                  <p className="text-sm text-[#64748B]">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════════
              베타 / 선점 섹션
              (정직성: 가짜 숫자 제거, 베타 문구)
          ══════════════════════════════════════════ */}
          <section className="max-w-[1200px] mx-auto px-6 mb-16">
            <div
              className="bg-[#EEF2FF] rounded-3xl p-12 text-center"
              style={{ border: "1px solid rgba(203,213,225,0.5)" }}
            >
              {/* 베타 배지 */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#4F46E5] text-[#E0E7FF] rounded-full text-xs font-bold mb-8">
                <span className="material-symbols-outlined text-[14px]">info</span>
                BETA SERVICE
              </div>

              <h2
                className="text-[32px] font-bold text-[#0F172A] mb-8"
                style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
              >
                아직 대부분 가게가 준비 안 돼 있어요 — <br className="hidden md:block" />
                지금 보면 먼저 잡습니다.
              </h2>

              <div className="flex flex-col items-center gap-4">
                {/* 정직 베타 문구 (가짜 숫자 제거) */}
                <p className="text-[16px] text-[#64748B] max-w-2xl leading-relaxed">
                  지금은 베타로 운영 중이에요. 써보고 불편한 점은 편하게 알려주세요.
                  <br />더 정확한 데이터로 사장님의 비즈니스를 돕겠습니다.
                </p>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════
              최종 CTA
          ══════════════════════════════════════════ */}
          <section className="py-16 text-center bg-white border-y border-[#CBD5E1]">
            <div className="max-w-[800px] mx-auto px-6">
              <h2
                className="text-[32px] font-bold text-[#0F172A] mb-5"
                style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
              >
                우리 가게는 얼마나 잘 노출되고 있나요?
              </h2>
              <p className="text-[16px] text-[#64748B] mb-10">
                회원가입 없이 1분 만에 결과 리포트를 받아보세요.
              </p>
              <Link
                href="/find"
                className="inline-block bg-[#4F46E5] text-white text-[18px] font-bold px-12 py-5 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all"
                style={{ boxShadow: "0 8px 24px rgba(79,70,229,0.2)" }}
              >
                지금 바로 무료 진단 시작하기
              </Link>
            </div>
          </section>
        </main>

        {/* ══════════════════════════════════════════
            Footer
        ══════════════════════════════════════════ */}
        <footer className="w-full py-16 bg-[#EEF2FF] border-t border-[#CBD5E1] mt-16">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              {/* 브랜드 */}
              <div className="space-y-4">
                <div
                  className="text-[20px] font-extrabold text-[#0F172A]"
                  style={{ fontFamily: "'Plus Jakarta Sans', 'Pretendard', sans-serif" }}
                >
                  보이나
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-[#64748B]">사업자등록번호: (오픈 전 등록 예정)</p>
                  <p className="text-sm text-[#64748B]">대표: (오픈 전 등록 예정)</p>
                  <p className="text-sm text-[#64748B]">주소: (오픈 전 등록 예정)</p>
                </div>
              </div>

              {/* 링크 + 저작권 */}
              <div className="flex flex-col md:items-end justify-end gap-4">
                <div className="flex gap-8">
                  <Link
                    href="/terms"
                    className="text-[#64748B] hover:text-[#4F46E5] transition-colors text-sm"
                  >
                    이용약관
                  </Link>
                  <Link
                    href="/privacy"
                    className="text-[#64748B] hover:text-[#4F46E5] transition-colors text-sm"
                  >
                    개인정보처리방침
                  </Link>
                </div>
                <p className="text-sm text-[#64748B]">© 2026 보이나. All rights reserved.</p>
              </div>
            </div>
          </div>
        </footer>

        {/* pulse-green 키프레임 */}
        <style>{`
          @keyframes pulse-green {
            0%   { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16,185,129,0.7); }
            70%  { transform: scale(1);    box-shadow: 0 0 0 6px rgba(16,185,129,0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16,185,129,0); }
          }
        `}</style>
      </div>
    </>
  );
}
