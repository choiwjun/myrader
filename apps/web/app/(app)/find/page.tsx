// @TASK P2-S1 - 가게 찾기 (/find) 화면 — 반응형 디자인 시스템 통합
// @SPEC specs/screens/store-finder.yaml (S1: REQ-001)
// @SPEC design/mockups/find.html (Stitch 목업 — 중앙 글래스 검색카드 + 신뢰 배지)
// @SPEC docs/planning/05-design-system.md §2 (큰 버튼·입력 최소) §5 (정직성: 전문용어 0, 점수 0)
// @TEST apps/web/tests/screens/store-finder.test.ts
//
// 컴포넌트:
//   store_search_form  — 이름 한 칸 + 지역 (입력 최소)
//   candidate_list     — 후보 + 주소 구분
//   website_url_input  — 선택 칸 (없어도 살펴보기 가능)
//   start_diagnosis_button — 큰 버튼 (카피: "가게 살펴볼게요")
//   progress_indicator — queued→running→done → /status 이동, failed → 재시도
// 정직성 가드: "진단" 카피 0 — "살펴보기" 사용. 점수 0. 전문용어 0. 인과 단정 0.

"use client";

import { type DiagnosisStatus, diagnosisStatusToLabel } from "@/lib/shared/ui-labels";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// ── 타입 ─────────────────────────────────────────────────────────────────────

interface PlaceCandidate {
  placeUrl: string;
  name: string;
  address: string;
  category: string;
}

interface ConfirmedBusiness {
  id: string;
  name: string;
  placeUrl: string | null;
  websiteUrl?: string | null;
}

type ScreenPhase = "search" | "candidates" | "confirm" | "progress";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function diagnosisIdFromEnqueueSuccess(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const data = "data" in json ? (json as { data?: unknown }).data : null;
  if (typeof data !== "object" || data === null) return null;
  const diagnosisId =
    "diagnosisId" in data ? (data as { diagnosisId?: unknown }).diagnosisId : null;
  return typeof diagnosisId === "string" && UUID_V4.test(diagnosisId) ? diagnosisId : null;
}

export function diagnosisStatusFromPollSuccess(json: unknown): DiagnosisStatus | null {
  if (typeof json !== "object" || json === null) return null;
  const data = "data" in json ? (json as { data?: unknown }).data : null;
  if (typeof data !== "object" || data === null) return null;
  const status = "status" in data ? (data as { status?: unknown }).status : null;

  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "completed":
    case "partial":
      return "done";
    case "failed":
      return "failed";
    default:
      return null;
  }
}
const inputCls =
  "w-full min-h-[52px] rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-base text-[#0F172A] placeholder:text-[#94A3B8] transition focus:border-[var(--boina-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--boina-brand)]/20";

// ── 메인 페이지 ──────────────────────────────────────────────────────────────

/**
 * S1 가게 찾기 (/find) — 풀 반응형.
 * auth: false — 누구나 접근.
 * UX: 전문용어 0, 점수 0, 입력 최소, 큰 버튼, 응원 톤.
 */
export default function FindPage() {
  const router = useRouter();

  const [phase, setPhase] = useState<ScreenPhase>("search");

  const [name, setName] = useState("");
  const [region, setRegion] = useState("");

  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [selected, setSelected] = useState<PlaceCandidate | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");

  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);
  const [diagnosisStatus, setDiagnosisStatus] = useState<DiagnosisStatus>("queued");
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSearchError(null);
    setIsSearching(true);
    setCandidates([]);

    try {
      const params = new URLSearchParams({ name: name.trim() });
      if (region.trim()) params.set("region", region.trim());

      const res = await fetch(`/api/business?${params}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        setSearchError("가게를 찾는 중 문제가 생겼어요. 다시 시도해 볼까요?");
        return;
      }

      const list: PlaceCandidate[] = json.data?.candidates ?? [];
      if (list.length === 0) {
        setSearchError("가게를 찾지 못했어요. 이름을 조금 다르게 입력해 볼까요?");
        return;
      }

      setCandidates(list);
      setPhase("candidates");
    } catch {
      setSearchError("연결이 잠깐 끊겼어요. 다시 시도해 볼까요?");
    } finally {
      setIsSearching(false);
    }
  }

  function handleSelectCandidate(candidate: PlaceCandidate) {
    setSelected(candidate);
    setPhase("confirm");
  }

  async function handleStartDiagnosis() {
    if (!selected) return;

    setStartError(null);
    setIsStarting(true);

    try {
      const confirmRes = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate: {
            placeUrl: selected.placeUrl,
            name: selected.name,
            address: selected.address,
            category: selected.category,
          },
          websiteUrl: websiteUrl.trim() || undefined,
          region: region.trim() || undefined,
        }),
      });

      const confirmJson = await confirmRes.json();

      if (!confirmRes.ok || !confirmJson.success) {
        setStartError("잠깐 멈췄어요. 다시 해볼까요?");
        return;
      }

      const business: ConfirmedBusiness = confirmJson.data?.business;
      await enqueueWithBusiness(business, selected);
    } catch {
      setStartError("잠깐 멈췄어요. 다시 해볼까요?");
    } finally {
      setIsStarting(false);
    }
  }

  async function enqueueWithBusiness(business: ConfirmedBusiness, candidate: PlaceCandidate) {
    const target = business.websiteUrl?.trim() || business.placeUrl || candidate.placeUrl;
    const sourceType = business.websiteUrl?.trim() ? "website" : "naver_place";

    const res = await fetch("/api/diagnosis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target,
        businessId: business.id,
        businessProfile: {
          businessName: candidate.name,
          industry: candidate.category || "음식점",
          region: region.trim() || "전국",
          mainServices: [candidate.category || "일반"],
          targetKeywords: [candidate.name],
        },
        sourceType,
        requestLlmValidation: true,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      setStartError("잠깐 멈췄어요. 다시 해볼까요?");
      return;
    }

    const id = diagnosisIdFromEnqueueSuccess(json);
    if (!id) {
      setStartError("결과를 시작하지 못했어요. 잠깐 후 다시 시도해 볼까요?");
      return;
    }

    setDiagnosisId(id);
    setDiagnosisStatus("queued");
    setPhase("progress");
    startPolling(id);
  }

  function startPolling(id: string) {
    pollCountRef.current = 0;
    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;

      if (pollCountRef.current > POLL_MAX_ATTEMPTS) {
        if (pollRef.current) clearInterval(pollRef.current);
        setDiagnosisStatus("failed");
        return;
      }

      try {
        const res = await fetch(`/api/diagnosis?id=${id}`);
        const json = await res.json();
        if (!res.ok || !json.success) return;

        const mappedStatus = diagnosisStatusFromPollSuccess(json);
        if (!mappedStatus) {
          if (pollRef.current) clearInterval(pollRef.current);
          setDiagnosisStatus("failed");
          return;
        }

        setDiagnosisStatus(mappedStatus);

        if (mappedStatus === "done") {
          if (pollRef.current) clearInterval(pollRef.current);
          router.push(`/home?diagnosisId=${id}`);
        } else if (mappedStatus === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // 네트워크 오류 무시 — 다음 폴링에서 재시도
      }
    }, POLL_INTERVAL_MS);
  }

  function handleRetry() {
    setStartError(null);
    setPhase("confirm");
    setDiagnosisId(null);
    setDiagnosisStatus("queued");
    if (pollRef.current) clearInterval(pollRef.current);
  }

  return (
    <div className="mx-auto max-w-[640px] px-6 py-12 md:py-16">
      {phase === "search" && (
        <StoreSearchForm
          name={name}
          region={region}
          onNameChange={setName}
          onRegionChange={setRegion}
          onSubmit={handleSearch}
          isLoading={isSearching}
          error={searchError}
        />
      )}

      {phase === "candidates" && (
        <CandidateList
          candidates={candidates}
          onSelect={handleSelectCandidate}
          onBack={() => setPhase("search")}
        />
      )}

      {phase === "confirm" && selected && (
        <ConfirmStep
          selected={selected}
          websiteUrl={websiteUrl}
          onWebsiteUrlChange={setWebsiteUrl}
          onStart={handleStartDiagnosis}
          onBack={() => setPhase("candidates")}
          isStarting={isStarting}
          error={startError}
        />
      )}

      {phase === "progress" && (
        <ProgressIndicator
          status={diagnosisStatus}
          diagnosisId={diagnosisId ?? undefined}
          onRetry={diagnosisStatus === "failed" ? handleRetry : undefined}
        />
      )}
    </div>
  );
}

// ── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

const headingCls = "leading-snug text-[#0F172A]";
const displayFont = "'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif";

/** store_search_form — 이름 한 칸 + 지역 (입력 최소) */
function StoreSearchForm({
  name,
  region,
  onNameChange,
  onRegionChange,
  onSubmit,
  isLoading,
  error,
}: {
  name: string;
  region: string;
  onNameChange: (v: string) => void;
  onRegionChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <section aria-label="가게 찾기" className="flex flex-col items-center">
      <h1
        className={`mb-2 text-center text-[28px] font-bold md:text-[34px] ${headingCls}`}
        style={{ fontFamily: displayFont }}
      >
        가게 이름을 알려주세요
      </h1>
      <p className="mb-8 text-center text-[16px] leading-relaxed text-[#64748B]">
        네이버에 등록된 가게를 찾아볼게요.
      </p>

      <form
        onSubmit={onSubmit}
        noValidate
        className="w-full max-w-[560px] space-y-5 rounded-2xl border border-[#E2E8F0] bg-white p-6 text-left md:p-8"
        style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.03)" }}
      >
        <div>
          <label htmlFor="store-name" className="mb-1.5 block text-sm font-semibold text-[#434654]">
            가게 이름{" "}
            <span aria-label="필수" className="text-[#DC2626]">
              *
            </span>
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[#94A3B8]">
              storefront
            </span>
            <input
              id="store-name"
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="예: 홍길동 치킨"
              required
              autoComplete="off"
              aria-required="true"
              className={`${inputCls} pl-12`}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="store-region"
            className="mb-1.5 block text-sm font-semibold text-[#434654]"
          >
            지역 <span className="font-normal text-[#94A3B8]">(선택)</span>
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[#94A3B8]">
              location_on
            </span>
            <input
              id="store-region"
              type="text"
              value={region}
              onChange={(e) => onRegionChange(e.target.value)}
              placeholder="예: 서울 마포구"
              autoComplete="off"
              className={`${inputCls} pl-12`}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-sm text-[#DC2626]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!name.trim() || isLoading}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--boina-brand)] text-lg font-bold text-white transition-all hover:bg-[var(--boina-brand-deep)] active:scale-[0.98] disabled:opacity-40"
          style={{ boxShadow: "0 8px 24px rgba(11,122,85,0.18)" }}
          aria-busy={isLoading}
        >
          {isLoading ? (
            "찾는 중..."
          ) : (
            <>
              가게 찾기
              <span className="material-symbols-outlined">arrow_forward</span>
            </>
          )}
        </button>
      </form>

      {/* 신뢰 배지 — 무료·회원가입 불필요·1분 (Stitch find 디자인) */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-5 text-sm text-[#64748B]">
        {[
          { icon: "verified", label: "무료" },
          { icon: "block", label: "회원가입 불필요" },
          { icon: "schedule", label: "1분 소요" },
        ].map(({ icon, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

/** candidate_list — 후보 목록 + 주소로 동명 구분 */
function CandidateList({
  candidates,
  onSelect,
  onBack,
}: {
  candidates: PlaceCandidate[];
  onSelect: (c: PlaceCandidate) => void;
  onBack: () => void;
}) {
  return (
    <section aria-label="가게 후보 목록">
      <h1
        className={`mb-2 text-[24px] font-bold md:text-[28px] ${headingCls}`}
        style={{ fontFamily: displayFont }}
      >
        내 가게를 골라주세요
      </h1>
      <p className="mb-6 text-[15px] text-[#64748B]">주소를 보고 정확한 가게를 선택해 주세요.</p>

      <ul className="mb-6 space-y-3">
        {candidates.map((c) => (
          <li key={c.placeUrl}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              aria-label={`${c.name} — ${c.address}`}
              className="flex min-h-[72px] w-full items-center justify-between gap-3 rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#9BD8BB] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--boina-brand)]/40"
            >
              <div className="min-w-0">
                <p className="mb-0.5 truncate text-[16px] font-bold leading-tight text-[#0F172A]">
                  {c.name}
                </p>
                <p className="truncate text-sm leading-snug text-[#64748B]">{c.address}</p>
                {c.category && <p className="mt-1 text-xs text-[#94A3B8]">{c.category}</p>}
              </div>
              <span className="material-symbols-outlined shrink-0 text-[var(--boina-brand)]">
                chevron_right
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onBack}
        className="min-h-[52px] w-full rounded-2xl bg-[#F1F5F9] text-base font-bold text-[#434654] transition-colors hover:bg-[#E2E8F0]"
      >
        다시 찾기
      </button>
    </section>
  );
}

/** 선택 확인 + website_url_input + start_diagnosis_button */
function ConfirmStep({
  selected,
  websiteUrl,
  onWebsiteUrlChange,
  onStart,
  onBack,
  isStarting,
  error,
}: {
  selected: PlaceCandidate;
  websiteUrl: string;
  onWebsiteUrlChange: (v: string) => void;
  onStart: () => void;
  onBack: () => void;
  isStarting: boolean;
  error: string | null;
}) {
  return (
    <section aria-label="가게 확인 및 살펴보기 시작">
      <h1
        className={`mb-5 text-[24px] font-bold md:text-[28px] ${headingCls}`}
        style={{ fontFamily: displayFont }}
      >
        이 가게 맞나요?
      </h1>

      <div className="mb-6 rounded-2xl border-2 border-[#CFEADD] bg-[var(--boina-brand-soft)] px-5 py-5">
        <p className="mb-0.5 text-[18px] font-bold text-[#0F172A]">{selected.name}</p>
        <p className="text-sm text-[#64748B]">{selected.address}</p>
        {selected.category && <p className="mt-1 text-xs text-[#94A3B8]">{selected.category}</p>}
      </div>

      <div className="mb-6">
        <label htmlFor="website-url" className="mb-1.5 block text-sm font-semibold text-[#434654]">
          홈페이지 주소 <span className="font-normal text-[#94A3B8]">(없어도 돼요)</span>
        </label>
        <input
          id="website-url"
          type="url"
          value={websiteUrl}
          onChange={(e) => onWebsiteUrlChange(e.target.value)}
          placeholder="https://..."
          autoComplete="url"
          className={inputCls}
        />
        <p className="mt-1.5 text-xs leading-relaxed text-[#94A3B8]">
          홈페이지가 없어도 살펴볼 수 있어요.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl bg-[#FEF2F2] px-4 py-3">
          <p className="text-sm text-[#DC2626]">{error}</p>
          <p className="mt-1 text-xs text-[#F87171]">잠깐 멈췄어요. 다시 눌러볼까요?</p>
        </div>
      )}

      <button
        type="button"
        onClick={onStart}
        disabled={isStarting}
        className="mb-3 min-h-[60px] w-full rounded-2xl bg-[var(--boina-brand)] text-xl font-bold text-white transition-all hover:bg-[var(--boina-brand-deep)] active:scale-[0.98] disabled:opacity-40"
        style={{ boxShadow: "0 8px 24px rgba(11,122,85,0.18)" }}
        aria-busy={isStarting}
      >
        {isStarting ? "준비하는 중..." : "가게 살펴볼게요"}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="min-h-[52px] w-full rounded-2xl bg-[#F1F5F9] text-base font-bold text-[#434654] transition-colors hover:bg-[#E2E8F0]"
      >
        다른 가게 선택
      </button>
    </section>
  );
}

/** progress_indicator — queued→running→done→failed (응원 톤) */
function ProgressIndicator({
  status,
  diagnosisId: _diagnosisId,
  onRetry,
}: {
  status: DiagnosisStatus;
  diagnosisId?: string;
  onRetry?: () => void;
}) {
  const statusLabel = diagnosisStatusToLabel(status);
  const stepIcon =
    status === "queued"
      ? "hourglass_empty"
      : status === "running"
        ? "search"
        : status === "done"
          ? "check_circle"
          : "refresh";

  return (
    <section
      aria-label="살펴보기 진행 상황"
      aria-live="polite"
      aria-atomic="true"
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <span
        className="material-symbols-outlined mb-6 text-6xl text-[var(--boina-brand)]"
        aria-hidden="true"
      >
        {stepIcon}
      </span>

      <h1 className="mb-3 text-[26px] font-bold text-[#0F172A]" style={{ fontFamily: displayFont }}>
        {statusLabel.label}
      </h1>
      <p className="mb-8 max-w-[300px] text-[16px] leading-relaxed text-[#64748B]">
        {statusLabel.description}
      </p>

      {(status === "queued" || status === "running") && (
        <div className="flex gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2.5 w-2.5 rounded-full bg-[var(--boina-brand)] opacity-60"
              style={{
                animationName: "pulse",
                animationDuration: "1.5s",
                animationDelay: `${i * 0.3}s`,
                animationIterationCount: "infinite",
              }}
            />
          ))}
        </div>
      )}

      {status === "failed" && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[56px] w-full max-w-[300px] rounded-2xl bg-[var(--boina-brand)] text-lg font-bold text-white transition-all hover:bg-[var(--boina-brand-deep)] active:scale-[0.98]"
        >
          다시 해볼게요
        </button>
      )}
    </section>
  );
}
