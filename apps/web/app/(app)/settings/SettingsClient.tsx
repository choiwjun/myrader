// @TASK P2-S7 - 설정 클라이언트 컴포넌트 — Stitch 반응형 디자인 통합
// @SPEC specs/screens/settings.yaml (S7: business_info_form, account_info, rediagnose_placeholder, change_store_button)
// @SPEC design/mockups/settings.html (2단 벤토: 가게정보 폼 + 계정/재진단 사이드바)
// @TEST apps/web/tests/screens/settings.test.ts
//
// 가게 정보 폼, 계정 이메일, 재진단 placeholder(v1), 가게 바꾸기.
// 정직성: 랭킹/점수 노출 0(목업의 "TOP 10" 이미지 카피 제거). 응원 톤, 전문용어 0.

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface BusinessSettings {
  businessId: string;
  name: string;
  category: string | null;
  region: string | null;
  placeUrl: string | null;
  websiteUrl: string | null;
}

interface SettingsClientProps {
  email: string;
}

const inputCls =
  "h-12 w-full rounded-xl border border-[#CBD5E1]/60 bg-[var(--boina-brand-soft)] px-4 text-[16px] font-medium text-[#0F172A] placeholder:text-[#94A3B8] transition-all focus:border-[var(--boina-brand)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--boina-brand)]/15";

export default function SettingsClient({ email }: SettingsClientProps) {
  const router = useRouter();

  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showRediagnosePlaceholder, setShowRediagnosePlaceholder] = useState(false);

  // 폼 상태
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/settings");
      const json = await res.json();
      if (res.ok && json.success && json.data.businessSettings) {
        const biz: BusinessSettings = json.data.businessSettings;
        setBusiness(biz);
        setName(biz.name ?? "");
        setCategory(biz.category ?? "");
        setRegion(biz.region ?? "");
        setWebsiteUrl(biz.websiteUrl ?? "");
        return;
      }

      setBusiness(null);
      setLoadError("가게 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } catch {
      setBusiness(null);
      setLoadError("연결이 잠깐 끊겼어요. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!business?.businessId) {
      setSaveMessage("가게 정보를 먼저 불러온 뒤 저장해 주세요.");
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSaveMessage("가게 이름을 입력해 주세요.");
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: business.businessId,
          name: trimmedName,
          category: category.trim() || null,
          region: region.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSaveMessage("저장됐어요!");
        setTimeout(() => setSaveMessage(null), 2000);
      } else {
        setSaveMessage("저장에 실패했어요. 다시 시도해 볼까요?");
      }
    } catch {
      setSaveMessage("연결이 잠깐 끊겼어요. 다시 시도해 볼까요?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-12 md:py-16">
      {/* ── 헤더 ── */}
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#0F172A] md:text-[32px]">
            내 가게 관리
          </h1>
          <p className="mt-1 text-[15px] text-[#64748B]">
            가게의 소중한 정보를 안전하게 관리하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/find")}
          aria-label="다른 가게로 바꾸기 — 가게 찾기로 이동"
          className="flex items-center gap-1.5 self-start rounded-xl px-4 py-2.5 font-semibold text-[var(--boina-brand)] transition-all hover:bg-[var(--boina-brand-soft)] active:scale-95 sm:self-auto"
        >
          <span className="material-symbols-outlined text-[20px]">store</span>
          <span className="text-sm">다른 가게 보기</span>
        </button>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* ── 가게 기본 정보 (메인) ── */}
        <section aria-label="가게 정보" className="lg:col-span-8">
          <div
            className="rounded-2xl border border-[#E2E8F0] bg-white p-6 md:p-8"
            style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)" }}
          >
            <div className="mb-6 flex items-center gap-4 border-b border-[#E2E8F0] pb-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--boina-brand)] text-white">
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  store
                </span>
              </div>
              <div>
                <h2 className="text-[20px] font-bold text-[#0F172A]">가게 기본 정보</h2>
                <p className="text-sm text-[#64748B]">정확한 정보일수록 더 잘 살펴봐 드려요.</p>
              </div>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-xl bg-[var(--boina-brand-soft)]"
                  />
                ))}
              </div>
            ) : loadError ? (
              <div className="rounded-2xl border border-[#F59E0B]/40 bg-[#FFFBEB] p-5 text-center">
                <p className="text-base font-bold text-[#B45309]">가게 정보를 불러오지 못했어요</p>
                <p className="mt-2 text-sm leading-relaxed text-[#92400E]">{loadError}</p>
                <button
                  type="button"
                  onClick={loadSettings}
                  className="mt-4 min-h-[52px] rounded-xl bg-white px-5 font-bold text-[#B45309] shadow-sm transition-colors hover:bg-[#FEF3C7]"
                  aria-label="가게 정보 다시 불러오기"
                >
                  다시 불러오기
                </button>
              </div>
            ) : (
              <form onSubmit={handleSave} noValidate className="flex flex-col gap-5">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="store-name" className="px-1 text-sm font-medium text-[#434654]">
                      가게 이름 <span className="text-[#B45309]">(필수)</span>
                    </label>
                    <input
                      id="store-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      aria-required="true"
                      placeholder="예) 맛있는 한식당"
                      className={inputCls}
                      aria-label="가게 이름 입력"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="store-category"
                      className="px-1 text-sm font-medium text-[#434654]"
                    >
                      업종
                    </label>
                    <input
                      id="store-category"
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="예) 한식, 카페, 미용실"
                      className={inputCls}
                      aria-label="업종 입력"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="store-region" className="px-1 text-sm font-medium text-[#434654]">
                    지역
                  </label>
                  <input
                    id="store-region"
                    type="text"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="예) 서울 마포구"
                    className={inputCls}
                    aria-label="지역 입력"
                  />
                </div>

                {business?.placeUrl && (
                  <div className="flex flex-col gap-1.5">
                    <span className="px-1 text-sm font-medium text-[#434654]">
                      네이버 플레이스 연결
                    </span>
                    <div className="flex h-12 items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] px-4">
                      <span className="truncate text-sm text-[#64748B]">{business.placeUrl}</span>
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#10B981]/10 px-2 py-0.5 text-xs font-semibold text-[#047857]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#10B981]" />
                        연결됨
                      </span>
                    </div>
                    <p className="px-1 text-xs text-[#94A3B8]">가게 재선택으로 변경할 수 있어요.</p>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="store-website"
                    className="px-1 text-sm font-medium text-[#434654]"
                  >
                    홈페이지 <span className="font-normal text-[#94A3B8]">(선택)</span>
                  </label>
                  <input
                    id="store-website"
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://..."
                    className={inputCls}
                    aria-label="홈페이지 주소 입력"
                  />
                </div>

                <div className="flex items-center justify-end gap-4 pt-1">
                  {saveMessage && (
                    <output
                      aria-live="polite"
                      className={`text-sm font-semibold ${
                        saveMessage.includes("저장됐") ? "text-[#047857]" : "text-[#B45309]"
                      }`}
                    >
                      {saveMessage}
                    </output>
                  )}
                  <button
                    type="submit"
                    disabled={saving || !business?.businessId}
                    className="min-h-[52px] rounded-xl bg-[var(--boina-brand)] px-8 font-bold text-white shadow-sm transition-all hover:bg-[var(--boina-brand-deep)] active:scale-95 disabled:opacity-60"
                    aria-label={
                      saving ? "저장 중..." : business?.businessId ? "저장하기" : "가게 정보 없음"
                    }
                  >
                    {saving ? "저장하는 중..." : "저장하기"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

        {/* ── 사이드바 ── */}
        <aside className="flex flex-col gap-6 lg:col-span-4">
          {/* 계정 정보 */}
          <section
            aria-label="계정 정보"
            className="rounded-2xl border border-[#E2E8F0] bg-white p-6"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#64748B]">account_circle</span>
              <h2 className="text-[16px] font-bold text-[#0F172A]">계정 정보</h2>
            </div>
            <div className="rounded-xl bg-[var(--boina-brand-soft)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                현재 로그인 계정
              </p>
              <p className="mt-0.5 font-medium text-[#0F172A]">{email}</p>
            </div>
          </section>

          {/* 다시 살펴보기 (v1 placeholder) */}
          <section
            aria-label="다시 살펴보기"
            className="rounded-2xl border border-[#E2E8F0] bg-white p-6"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#64748B]">autorenew</span>
                <h2 className="text-[16px] font-bold text-[#0F172A]">다시 살펴보기</h2>
              </div>
              <span className="rounded-full bg-[var(--boina-brand-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--boina-brand-deep)]">
                곧 제공돼요
              </span>
            </div>

            {showRediagnosePlaceholder ? (
              <output
                aria-live="polite"
                className="block rounded-xl border border-[#CFEADD] bg-[var(--boina-brand-soft)] px-4 py-4 text-center"
              >
                <p className="mb-1 text-base font-bold text-[var(--boina-brand-deep)]">
                  곧 제공돼요
                </p>
                <p className="text-sm leading-relaxed text-[var(--boina-brand)]">
                  다시 살펴보기 기능은 곧 추가될 예정이에요. 기대해 주세요!
                </p>
              </output>
            ) : (
              <>
                <p className="mb-3 text-sm leading-relaxed text-[#64748B]">
                  가게의 변화를 감지해 새로운 살펴보기를 제안해 드릴 예정이에요.
                </p>
                <button
                  type="button"
                  onClick={() => setShowRediagnosePlaceholder(true)}
                  className="min-h-[52px] w-full rounded-xl border border-[#E2E8F0] bg-white font-bold text-[#434654] transition-colors hover:bg-[#F8FAFC]"
                  aria-label="다시 살펴보기 (곧 제공 예정)"
                >
                  다시 살펴보기
                </button>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
