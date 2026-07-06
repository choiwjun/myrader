"use client";

// allow: SIZE_OK — one client screen owns coupled fetch, error, and section state for the rivals menu.

import { type GapActionTier, gapActionTierToClass } from "@/lib/diagnosis/gap-service";
import { type ActionTier, actionTierToLabel } from "@/lib/shared/ui-labels";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type MeasurementLabel = "measured" | "estimated" | "unavailable";

interface EvidenceItem {
  label: string;
  detail: string;
}

interface CompetitorItem {
  id: string;
  name: string;
  channel: string;
  beatsMe: boolean;
  source: string;
  rank?: number;
  collectedAt?: string | null;
  measurementLabel?: MeasurementLabel | null;
  evidence?: EvidenceItem[];
}

interface CompetitorData {
  competitors: CompetitorItem[];
  headline: string;
}

interface GapItem {
  id: string;
  label: string;
  competitorHas: boolean;
  iHave: boolean;
  category: string;
  actionTier: GapActionTier;
  priority: number;
  isPaid: boolean;
  source?: string | null;
  collectedAt?: string | null;
  measurementLabel?: MeasurementLabel | null;
  evidence?: EvidenceItem[];
}

interface GapData {
  items: GapItem[];
  intro: string;
  isPaid: boolean;
}

const AXES = ["키워드", "사진", "메뉴", "리뷰", "소개글", "AI 인용 재료"];

const TIER_SHORT: Record<ActionTier, string> = {
  green_self: "직접",
  yellow_copy: "복붙",
  red_vendor: "업체",
  gray_ongoing: "꾸준히",
};

function sourceToLabel(source: string) {
  if (source === "naver_serp") return "네이버 검색에서 확인";
  if (source === "gpt_grounded") return "AI가 확인";
  return "확인된 자료 기준";
}

function sourceToCollectedAtLabel(source: string) {
  if (source === "naver_serp") return "검색 결과 기준";
  if (source === "gpt_grounded") return "AI 응답 기준";
  return "확인된 자료 기준";
}

function measurementLabelToText(label: MeasurementLabel | null | undefined) {
  switch (label) {
    case "measured":
      return "실측";
    case "estimated":
      return "추정";
    case "unavailable":
      return "확인 전";
    default:
      return "확인 전";
  }
}

function fallbackMeasurementLabel(source?: string | null): MeasurementLabel {
  if (source === "naver_serp" || source === "gpt_grounded") return "measured";
  return "unavailable";
}

function RivalsPageInner() {
  const router = useRouter();
  const diagnosisId = useSearchParams().get("diagnosisId");
  const [competitorData, setCompetitorData] = useState<CompetitorData | null>(null);
  const [gapData, setGapData] = useState<GapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!diagnosisId) {
      setLoading(false);
      setError("비교할 가게 정보가 없어요. 가게 찾기부터 시작해 볼까요?");
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [competitorRes, gapRes] = await Promise.all([
          fetch(`/api/competitor?diagnosisId=${diagnosisId}`),
          fetch(`/api/gap?diagnosisId=${diagnosisId}`),
        ]);
        const [competitorJson, gapJson] = await Promise.all([competitorRes.json(), gapRes.json()]);

        if (!competitorRes.ok || !competitorJson.success || !gapRes.ok || !gapJson.success) {
          setError("라이벌 정보를 불러오지 못했어요. 잠깐 후에 다시 확인해 볼까요?");
          return;
        }

        setCompetitorData(competitorJson.data);
        setGapData(gapJson.data);
      } catch {
        setError("연결이 잠깐 끊겼어요. 다시 시도해 볼까요?");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [diagnosisId]);

  const competitors = (competitorData?.competitors ?? []).filter((item) => item.beatsMe);
  const gaps = (gapData?.items ?? []).sort((a, b) => a.priority - b.priority);
  const hasCompetitors = competitors.length > 0;
  const hasGaps = gaps.length > 0;

  function goWrite(item?: GapItem) {
    const params = new URLSearchParams();
    if (diagnosisId) params.set("diagnosisId", diagnosisId);
    if (item) {
      params.set("tier", gapActionTierToClass(item.actionTier));
      params.set("actionId", item.id);
    }
    router.push(`/write${params.toString() ? `?${params.toString()}` : ""}`);
  }

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-5 py-20">
        <div
          role="alert"
          className="rounded-[20px] border border-[#F59E0B]/40 bg-[#FFFBEB] px-5 py-6 text-center"
        >
          <p className="mb-1 text-[18px] font-bold text-[#B45309]">잠깐, 문제가 생겼어요</p>
          <p className="text-[14px] leading-[20px] text-[#92400E]">{error}</p>
          <button
            type="button"
            onClick={() => router.push("/find")}
            className="mt-4 rounded-[14px] bg-[var(--boina-brand)] px-5 py-3 text-[14px] font-bold text-white"
          >
            가게 찾기로 가기
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[960px] px-5 py-10 md:py-14">
      <header className="mb-7">
        <p className="text-[14px] font-bold text-[var(--boina-brand)]">라이벌</p>
        <h1 className="mt-2 text-[28px] font-extrabold leading-[36px] text-[var(--boina-ink)] md:text-[34px] md:leading-[42px]">
          옆집은 있고, 우리는 없는 것을 봅니다.
        </h1>
        <p className="mt-3 text-[16px] font-medium leading-[24px] text-[var(--boina-ink-2)]">
          경쟁자 한 줄 요약부터 바로 채울 수 있는 차이까지 한 화면에서 확인해요.
        </p>
      </header>

      <section className="mb-6 rounded-[20px] border border-[var(--boina-line)] bg-[var(--boina-card)] p-5 shadow-[0_1px_3px_rgba(25,31,40,0.06)]">
        <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">비교 축</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {AXES.map((axis) => (
            <span
              key={axis}
              className="rounded-full bg-[#EEF2FF] px-3 py-1.5 text-[13px] font-bold text-[var(--boina-brand-deep)]"
            >
              {axis}
            </span>
          ))}
        </div>
      </section>

      <section className="mb-8 rounded-[20px] border border-[var(--boina-line)] bg-[var(--boina-card)] p-5 shadow-[0_1px_3px_rgba(25,31,40,0.06)]">
        <div className="mb-4">
          <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">경쟁자 한 줄 요약</p>
          {loading ? (
            <div className="mt-3 h-8 w-3/4 animate-pulse rounded-[12px] bg-[#EEF2FF]" />
          ) : (
            <h2 className="mt-1 text-[22px] font-extrabold leading-[30px] text-[var(--boina-ink)]">
              {competitorData?.headline ?? "아직 옆집 비교 데이터를 못 모았어요."}
            </h2>
          )}
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-40 animate-pulse rounded-[16px] bg-[#F1F5F9]" />
            ))}
          </div>
        ) : hasCompetitors ? (
          <div className="grid gap-3 md:grid-cols-3">
            {competitors.map((competitor) => (
              <article
                key={competitor.id}
                className="rounded-[16px] border border-[#E2E8F0] bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="truncate text-[17px] font-bold text-[var(--boina-ink)]">
                    {competitor.name}
                  </h3>
                  <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-bold text-[#4338CA]">
                    {measurementLabelToText(
                      competitor.measurementLabel ?? fallbackMeasurementLabel(competitor.source),
                    )}
                  </span>
                </div>
                <div className="mt-4 grid gap-2">
                  <div className="flex items-center justify-between rounded-[12px] bg-[#ECFDF5] px-3 py-2.5">
                    <span className="text-[14px] font-semibold text-[#065F46]">옆집</span>
                    <span className="text-[14px] font-bold text-[#047857]">먼저 보여요</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[12px] bg-[#F1F5F9] px-3 py-2.5">
                    <span className="text-[14px] font-semibold text-[#64748B]">우리 가게</span>
                    <span className="text-[14px] font-bold text-[#94A3B8]">아직이에요</span>
                  </div>
                </div>
                <p className="mt-4 text-[12px] font-medium leading-[18px] text-[#94A3B8]">
                  {sourceToLabel(competitor.source)}
                  {competitor.rank ? ` · ${competitor.rank}번째` : ""}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[16px] border border-[#A7F3D0] bg-[#ECFDF5] px-5 py-6">
            <p className="text-[17px] font-bold text-[#065F46]">잘 지키고 계세요!</p>
            <p className="mt-1 text-[14px] leading-[20px] text-[#047857]">
              이 채널에서는 먼저 보이는 경쟁 가게가 아직 확인되지 않았어요.
            </p>
          </div>
        )}
      </section>

      <section className="mb-8 rounded-[20px] border border-[var(--boina-line)] bg-[var(--boina-card)] p-5 shadow-[0_1px_3px_rgba(25,31,40,0.06)]">
        <div className="mb-4">
          <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">옆집과 우리 차이</p>
          {loading ? (
            <div className="mt-3 h-8 w-2/3 animate-pulse rounded-[12px] bg-[#EEF2FF]" />
          ) : (
            <h2 className="mt-1 text-[22px] font-extrabold leading-[30px] text-[var(--boina-ink)]">
              {gapData?.intro ?? "옆집은 갖췄고 우리는 아직인 것들이에요."}
            </h2>
          )}
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-44 animate-pulse rounded-[16px] bg-[#F1F5F9]" />
            ))}
          </div>
        ) : hasGaps ? (
          <div className="grid gap-3 md:grid-cols-3">
            {gaps.map((item) => {
              const tier = gapActionTierToClass(item.actionTier);
              const tierLabel = actionTierToLabel(tier);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goWrite(item)}
                  className="rounded-[16px] border border-[#E2E8F0] bg-white p-4 text-left transition hover:border-[var(--boina-brand)]"
                  aria-label={`${item.label} 문안 보기`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex rounded-full bg-[#E0E7FF] px-2.5 py-1 text-[12px] font-bold text-[#4338CA]">
                      {TIER_SHORT[tier]}
                    </span>
                    <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-bold text-[#4338CA]">
                      {measurementLabelToText(item.measurementLabel ?? fallbackMeasurementLabel(item.source))}
                    </span>
                  </div>
                  <h3 className="mt-3 text-[17px] font-bold leading-[24px] text-[var(--boina-ink)]">
                    {item.label}
                  </h3>
                  <p className="mt-1 text-[13px] leading-[19px] text-[var(--boina-ink-2)]">
                    {tierLabel.description}
                  </p>
                  <div className="mt-4 grid gap-2">
                    <div className="flex items-center justify-between rounded-[12px] bg-[#ECFDF5] px-3 py-2">
                      <span className="text-[13px] font-semibold text-[#065F46]">옆집</span>
                      <span className="text-[13px] font-bold text-[#047857]">
                        {item.competitorHas ? "갖췄어요" : "확인 전"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-[12px] bg-[#F1F5F9] px-3 py-2">
                      <span className="text-[13px] font-semibold text-[#64748B]">우리</span>
                      <span className="text-[13px] font-bold text-[#94A3B8]">
                        {item.iHave ? "갖췄어요" : "아직이에요"}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[16px] border border-[#A7F3D0] bg-[#ECFDF5] px-5 py-6">
            <p className="text-[17px] font-bold text-[#065F46]">잘 갖추고 계세요!</p>
            <p className="mt-1 text-[14px] leading-[20px] text-[#047857]">
              아직 확인된 차이가 없어요. 문안 화면에서 오늘 할 일을 더 살펴볼까요?
            </p>
          </div>
        )}
      </section>

      <section className="mb-8 rounded-[20px] border border-[var(--boina-line)] bg-[#F8FAFC] p-5">
        <div className="mb-4">
          <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">비교 근거</p>
          <h2 className="mt-1 text-[22px] font-extrabold leading-[30px] text-[var(--boina-ink)]">
            evidence sheet
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(hasCompetitors
            ? competitors.map((item) => ({
                id: item.id,
                title: item.name,
                source: item.source,
                collectedAt: item.collectedAt,
                measurementLabel: item.measurementLabel ?? fallbackMeasurementLabel(item.source),
                evidence: item.evidence,
              }))
            : [
                {
                  id: "empty-competitor",
                  title: "비교 준비 중",
                  source: "none",
                  collectedAt: null,
                  measurementLabel: "unavailable" as MeasurementLabel,
                  evidence: [],
                },
              ]
          ).concat(
            gaps.map((item) => ({
              id: `gap-${item.id}`,
              title: item.label,
              source: item.source ?? "gap",
              collectedAt: item.collectedAt ?? null,
              measurementLabel: item.measurementLabel ?? fallbackMeasurementLabel(item.source),
              evidence: item.evidence ?? [],
            })),
          ).map((item) => (
            <div key={item.id} className="rounded-[14px] border border-[#E2E8F0] bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[14px] font-bold text-[var(--boina-ink)]">{item.title}</p>
                <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-bold text-[#4338CA]">
                  {measurementLabelToText(item.measurementLabel)}
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-[19px] text-[var(--boina-ink-2)]">
                {sourceToLabel(item.source)} · {item.collectedAt ?? sourceToCollectedAtLabel(item.source)}
              </p>
              {(item.evidence?.length ?? 0) > 0 ? (
                <ul className="mt-2 grid gap-1 text-[12px] leading-[18px] text-[#64748B]">
                  {item.evidence?.map((evidence) => (
                    <li key={`${item.id}-${evidence.label}`}>
                      {evidence.label}: {evidence.detail}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[12px] leading-[18px] text-[#64748B]">
                  measured/unavailable/estimated 라벨과 함께 원본 근거가 쌓이면 여기에서 보여드릴게요.
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] leading-[19px] text-[#94A3B8]">
          검색 결과와 AI 응답에서 확인된 자료만 사용하며, 실제 매출이나 순위를 단정하지 않아요.
        </p>
      </section>

      {!loading && (
        <section className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => goWrite()}
            className="flex w-full max-w-md items-center justify-center gap-2 rounded-[18px] bg-[var(--boina-brand)] px-6 py-4 text-[17px] font-bold text-white"
          >
            바로 쓸 문안 보기
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              arrow_forward
            </span>
          </button>
          <p className="text-[14px] leading-[20px] text-[#94A3B8]">
            확인한 차이를 오늘 할 일과 복붙 문안으로 이어갑니다.
          </p>
        </section>
      )}
    </main>
  );
}

export default function RivalsClient() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-[720px] px-5 py-10">
          <p className="text-[16px] font-medium text-[var(--boina-ink-2)]">
            라이벌 화면을 불러오는 중...
          </p>
        </main>
      }
    >
      <RivalsPageInner />
    </Suspense>
  );
}
