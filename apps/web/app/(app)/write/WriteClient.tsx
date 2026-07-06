"use client";

// allow: SIZE_OK — one client screen owns coupled fetch, copy, focus, and section state for the write menu.

import { BigCopyButton } from "@/app/components/shared/BigCopyButton";
import {
  type ActionTier,
  type AssetType,
  actionTierToLabel,
  assetTypeToLabel,
} from "@/lib/shared/ui-labels";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

interface EvidenceItem {
  label: string;
  detail: string;
}

interface ActionItem {
  id: string;
  title: string;
  tier: ActionTier;
  isTodayOne: boolean;
  deeplink?: string | null;
  doneable: boolean;
  isPaid: boolean;
  isCompleted?: boolean;
  completedAt?: string | null;
}

interface ActionData {
  actions: ActionItem[];
  todayOne: ActionItem | null;
  intro: string;
  isPaid: boolean;
}

interface GeneratedAsset {
  id: string;
  type: AssetType;
  title: string;
  content: string;
  copyable: boolean;
  isPaid?: boolean;
  sourceKeywords?: string[];
  evidence?: EvidenceItem[];
}

interface AssetData {
  assets: GeneratedAsset[];
  intro: string;
  isPaid: boolean;
}

const TIER_ORDER: ActionTier[] = ["green_self", "yellow_copy", "red_vendor", "gray_ongoing"];

const TIER_STYLE: Record<
  ActionTier,
  { icon: string; chip: string; tile: string; text: string; label: string }
> = {
  green_self: {
    icon: "edit_calendar",
    chip: "bg-[#D1FAE5] text-[#047857]",
    tile: "bg-[#ECFDF5]",
    text: "text-[#047857]",
    label: "직접 하기",
  },
  yellow_copy: {
    icon: "content_copy",
    chip: "bg-[#FEF3C7] text-[#B45309]",
    tile: "bg-[#FFFBEB]",
    text: "text-[#B45309]",
    label: "복붙하기",
  },
  red_vendor: {
    icon: "assignment_ind",
    chip: "bg-[#FEE2E2] text-[#DC2626]",
    tile: "bg-[#FEF2F2]",
    text: "text-[#DC2626]",
    label: "업체에 맡기기",
  },
  gray_ongoing: {
    icon: "photo_library",
    chip: "bg-[#E2E8F0] text-[#64748B]",
    tile: "bg-[#F1F5F9]",
    text: "text-[#64748B]",
    label: "꾸준히 하기",
  },
};

const TYPE_ICON: Record<AssetType, string> = {
  snippet: "chat",
  place_intro: "storefront",
  review_request: "rate_review",
  vendor_prescription: "mail",
};

function buildWriteHref(
  searchParams: { toString(): string },
  overrides: Record<string, string | null>,
) {
  const next = new URLSearchParams(searchParams.toString());
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  const qs = next.toString();
  return `/write${qs ? `?${qs}` : ""}`;
}

function recommendedAssetKeywords(asset: GeneratedAsset, keyword: string | null) {
  if (asset.sourceKeywords && asset.sourceKeywords.length > 0) return asset.sourceKeywords;
  return keyword ? [keyword] : [];
}

function fallbackAssetEvidence(
  asset: GeneratedAsset,
  selectedAction: ActionItem | null,
): EvidenceItem[] {
  const typeLabel = assetTypeToLabel(asset.type);
  return [
    {
      label: "근거",
      detail: selectedAction
        ? `${selectedAction.title}에 맞춰 ${typeLabel.label} 초안을 준비했어요.`
        : "진단 결과를 바탕으로 바로 쓸 초안을 준비했어요.",
    },
    {
      label: "출처",
      detail: typeLabel.description,
    },
  ];
}

function WritePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const diagnosisId = searchParams.get("diagnosisId");
  const keyword = searchParams.get("keyword");
  const radarKeywordId = searchParams.get("radarKeywordId");
  const actionId = searchParams.get("actionId");
  const focusTier = searchParams.get("tier") as ActionTier | null;
  const focusType = searchParams.get("type") as AssetType | null;

  const [actionData, setActionData] = useState<ActionData | null>(null);
  const [assetData, setAssetData] = useState<AssetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutatingActionId, setMutatingActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!diagnosisId) {
      setLoading(false);
      setError("가게 정보가 없어요. 가게 찾기부터 시작해 볼까요?");
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const actionUrl = new URL("/api/action", window.location.origin);
        actionUrl.searchParams.set("diagnosisId", diagnosisId ?? "");
        if (focusTier) actionUrl.searchParams.set("tier", focusTier);

        const assetUrl = new URL("/api/generated-asset", window.location.origin);
        assetUrl.searchParams.set("diagnosisId", diagnosisId ?? "");
        if (focusType) assetUrl.searchParams.set("type", focusType);
        if (actionId) assetUrl.searchParams.set("actionId", actionId);

        const [actionRes, assetRes] = await Promise.all([
          fetch(actionUrl.toString()),
          fetch(assetUrl.toString()),
        ]);
        const [actionJson, assetJson] = await Promise.all([actionRes.json(), assetRes.json()]);

        if (!actionRes.ok || !actionJson.success || !assetRes.ok || !assetJson.success) {
          setError("문안 정보를 불러오지 못했어요. 잠깐 후에 다시 확인해 볼까요?");
          return;
        }

        setActionData(actionJson.data);
        setAssetData(assetJson.data);
      } catch {
        setError("연결이 잠깐 끊겼어요. 다시 시도해 볼까요?");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [actionId, diagnosisId, focusTier, focusType]);

  const visibleActions = actionData?.actions ?? [];
  const visibleAssets = (assetData?.assets ?? []).filter(
    (asset) => !asset.isPaid || assetData?.isPaid,
  );
  const todayOne = actionData?.todayOne;
  const hasActions = visibleActions.length > 0;
  const hasAssets = visibleAssets.length > 0;
  const selectedAction = useMemo(() => {
    if (!actionId) return todayOne ?? null;
    return visibleActions.find((action) => action.id === actionId) ?? todayOne ?? null;
  }, [actionId, todayOne, visibleActions]);

  function syncActionFocus(nextAction: ActionItem) {
    router.replace(
      buildWriteHref(searchParams, {
        actionId: nextAction.id,
        tier: nextAction.tier,
      }),
      { scroll: false },
    );
  }

  function startAction(action: ActionItem) {
    syncActionFocus(action);
    if (action.tier === "green_self" && action.deeplink) {
      window.open(action.deeplink, "_blank", "noopener,noreferrer");
      return;
    }
    const target = document.getElementById("write-assets");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function toggleActionCompletion(action: ActionItem, completed: boolean) {
    if (!diagnosisId) return;
    setMutatingActionId(action.id);
    try {
      const res = await fetch("/api/action", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosisId, actionId: action.id, completed }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError("완료 상태를 저장하지 못했어요. 잠깐 후에 다시 해볼까요?");
        return;
      }
      setActionData((current) => {
        if (!current) return current;
        const update = (item: ActionItem | null) =>
          item && item.id === action.id
            ? {
                ...item,
                isCompleted: json.data?.isCompleted ?? completed,
                completedAt: json.data?.completedAt ?? null,
              }
            : item;
        return {
          ...current,
          actions: current.actions.map((item) => update(item) ?? item),
          todayOne: update(current.todayOne),
        };
      });
    } catch {
      setError("완료 상태를 저장하지 못했어요. 잠깐 후에 다시 해볼까요?");
    } finally {
      setMutatingActionId(null);
    }
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
    <main className="mx-auto max-w-[1040px] px-5 py-10 md:py-14">
      <header className="mb-7">
        <p className="text-[14px] font-bold text-[var(--boina-brand)]">문안</p>
        <h1 className="mt-2 text-[28px] font-extrabold leading-[36px] text-[var(--boina-ink)] md:text-[34px] md:leading-[42px]">
          오늘 할 일과 복붙 문안을 한 곳에서 실행합니다.
        </h1>
        <p className="mt-3 max-w-2xl text-[16px] font-medium leading-[24px] text-[var(--boina-ink-2)]">
          추천 액션을 고르고, 바로 쓸 소개글·리뷰 요청·검색 답변글을 복사해요.
        </p>
      </header>

      {keyword ? (
        <section className="mb-5 rounded-[20px] border border-[var(--boina-line)] bg-[var(--boina-brand-soft)] p-5">
          <p className="text-[14px] font-bold text-[var(--boina-brand-deep)]">
            이번 주 검색어로 시작
          </p>
          <h2 className="mt-1 text-[20px] font-extrabold leading-[28px] text-[var(--boina-ink)]">
            {keyword}
          </h2>
          <p className="mt-1 text-[14px] font-medium leading-[20px] text-[var(--boina-ink-2)]">
            이 말을 문안에 자연스럽게 넣어 쓸 수 있게 이어갑니다.
          </p>
          {radarKeywordId ? (
            <p className="mt-2 text-[12px] font-medium text-[var(--boina-ink-3)]">
              문안 근거: 주간 검색어 카드에서 넘어온 키워드
            </p>
          ) : null}
        </section>
      ) : null}

      {focusTier || actionId ? (
        <section className="mb-5 rounded-[16px] border border-[#E0E7FF] bg-[#F8FAFC] px-4 py-3">
          <p className="text-[13px] font-bold text-[#4338CA]">선택한 할 일</p>
          <p className="mt-1 text-[14px] leading-[20px] text-[#475569]">
            {selectedAction
              ? `${selectedAction.title}부터 이어서 봐요.`
              : "선택한 할 일을 중심으로 문안을 모아 보여드려요."}
          </p>
        </section>
      ) : null}

      <section className="mb-8 rounded-[20px] bg-[var(--boina-brand)] p-5 text-white shadow-[0_8px_24px_rgba(79,70,229,0.20)]">
        <p className="text-[14px] font-bold opacity-80">오늘 할 일</p>
        {loading ? (
          <div className="mt-3 h-20 animate-pulse rounded-[16px] bg-white/20" />
        ) : todayOne ? (
          <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[24px] font-extrabold leading-[32px]">{todayOne.title}</h2>
                {todayOne.isCompleted ? (
                  <span className="rounded-full bg-white/20 px-2.5 py-1 text-[12px] font-bold">
                    완료
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-[15px] font-medium leading-[22px] opacity-90">
                {actionTierToLabel(todayOne.tier).description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleActionCompletion(todayOne, !todayOne.isCompleted)}
                disabled={mutatingActionId === todayOne.id}
                className="min-h-12 rounded-[14px] border border-white/30 px-4 py-3 text-[14px] font-bold text-white disabled:opacity-60"
              >
                {todayOne.isCompleted ? "다시 열기" : "완료했어요"}
              </button>
              <button
                type="button"
                onClick={() => startAction(todayOne)}
                className="min-h-12 rounded-[14px] bg-white px-5 py-3 text-[15px] font-bold text-[var(--boina-brand-deep)]"
              >
                지금 해볼게요
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[18px] font-bold leading-[26px] opacity-95">
            아직 추천할 행동을 못 찾았어요. 채널 정보가 쌓이면 바로 보여드릴게요.
          </p>
        )}
      </section>

      <section className="mb-8 rounded-[20px] border border-[var(--boina-line)] bg-[var(--boina-card)] p-5 shadow-[0_1px_3px_rgba(25,31,40,0.06)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">추천 액션</p>
            <h2 className="mt-1 text-[22px] font-extrabold leading-[30px] text-[var(--boina-ink)]">
              도움이 될 수 있는 행동
            </h2>
            <p className="mt-1 text-[14px] leading-[20px] text-[var(--boina-ink-2)]">
              {actionData?.intro ?? "추천 액션을 준비 중이에요."}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-40 animate-pulse rounded-[16px] bg-[#F1F5F9]" />
            ))}
          </div>
        ) : hasActions ? (
          <div className="grid gap-3 md:grid-cols-2">
            {TIER_ORDER.flatMap((tier) =>
              visibleActions
                .filter((action) => action.tier === tier)
                .map((action) => {
                  const style = TIER_STYLE[action.tier];
                  const tierLabel = actionTierToLabel(action.tier);
                  const highlighted =
                    actionId === action.id || (!actionId && focusTier === action.tier);
                  return (
                    <article
                      key={action.id}
                      className={`rounded-[16px] border bg-white p-4 ${
                        highlighted
                          ? "border-[var(--boina-brand)] ring-2 ring-[var(--boina-brand)]/20"
                          : "border-[#E2E8F0]"
                      } ${action.isCompleted ? "opacity-70" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-[12px] ${style.tile} ${style.text}`}
                        >
                          <span className="material-symbols-outlined text-[24px]">
                            {style.icon}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${style.chip}`}
                          >
                            {style.label}
                          </span>
                          {action.isCompleted ? (
                            <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#047857]">
                              완료
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <h3 className="mt-4 text-[17px] font-bold leading-[24px] text-[var(--boina-ink)]">
                        {action.title}
                      </h3>
                      <p className="mt-1 text-[14px] leading-[20px] text-[var(--boina-ink-2)]">
                        {tierLabel.description}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startAction(action)}
                          className="inline-flex min-h-10 items-center rounded-[12px] bg-[#EEF2FF] px-3 py-2 text-[14px] font-bold text-[var(--boina-brand)]"
                        >
                          {action.tier === "green_self" && action.deeplink
                            ? "바로 가기"
                            : "문안 보기"}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActionCompletion(action, !action.isCompleted)}
                          disabled={mutatingActionId === action.id}
                          className="inline-flex min-h-10 items-center rounded-[12px] border border-[#E2E8F0] px-3 py-2 text-[14px] font-bold text-[#475569] disabled:opacity-60"
                        >
                          {action.isCompleted ? "다시 열기" : "완료했어요"}
                        </button>
                      </div>
                    </article>
                  );
                }),
            )}
          </div>
        ) : (
          <div className="rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-6 text-center">
            <p className="text-[17px] font-bold text-[var(--boina-ink)]">
              아직 추천할 행동을 못 찾았어요
            </p>
            <p className="mt-1 text-[14px] leading-[20px] text-[var(--boina-ink-2)]">
              진단이 완료되면 오늘 할 일을 여기에 보여드릴게요.
            </p>
          </div>
        )}
      </section>

      <section
        id="write-assets"
        className="rounded-[20px] border border-[var(--boina-line)] bg-[var(--boina-card)] p-5 shadow-[0_1px_3px_rgba(25,31,40,0.06)]"
      >
        <div className="mb-4">
          <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">복붙 문안</p>
          <h2 className="mt-1 text-[22px] font-extrabold leading-[30px] text-[var(--boina-ink)]">
            그대로 복사해서 쓸 글
          </h2>
          <p className="mt-1 text-[14px] leading-[20px] text-[var(--boina-ink-2)]">
            {assetData?.intro ?? "그대로 복사해서 쓰시면 돼요."}
          </p>
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((item) => (
              <div key={item} className="h-64 animate-pulse rounded-[16px] bg-[#F1F5F9]" />
            ))}
          </div>
        ) : hasAssets ? (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleAssets.map((asset) => {
              const typeLabel = assetTypeToLabel(asset.type);
              const highlighted = focusType === asset.type;
              const sourceKeywords = recommendedAssetKeywords(asset, keyword);
              const evidence = asset.evidence?.length
                ? asset.evidence
                : fallbackAssetEvidence(asset, selectedAction);
              return (
                <article
                  key={asset.id}
                  className={`flex flex-col rounded-[16px] border bg-white p-4 ${
                    highlighted
                      ? "border-[var(--boina-brand)] ring-2 ring-[var(--boina-brand)]/20"
                      : "border-[#E2E8F0]"
                  }`}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#E0E7FF] text-[var(--boina-brand)]">
                      <span className="material-symbols-outlined text-[22px]">
                        {TYPE_ICON[asset.type]}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-[17px] font-bold text-[var(--boina-ink)]">
                        {typeLabel.label}
                      </h3>
                      <p className="text-[12px] font-medium text-[var(--boina-ink-3)]">
                        문안 근거와 sourceKeywords를 함께 확인해요.
                      </p>
                    </div>
                  </div>
                  <p className="mb-2 text-[15px] font-bold text-[var(--boina-ink)]">
                    {asset.title}
                  </p>
                  <p className="mb-3 text-[13px] leading-[19px] text-[var(--boina-ink-2)]">
                    {typeLabel.description}
                  </p>
                  <div className="mb-3 flex-1 whitespace-pre-wrap rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4 text-[14px] leading-[21px] text-[#434654]">
                    {asset.content}
                  </div>
                  <div className="mb-4 rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[13px] leading-[19px] text-[#475569]">
                    <p className="font-bold text-[var(--boina-ink)]">evidence</p>
                    <ul className="mt-2 grid gap-1">
                      {evidence.map((item) => (
                        <li key={`${asset.id}-${item.label}`}>
                          {item.label}: {item.detail}
                        </li>
                      ))}
                    </ul>
                    {sourceKeywords.length > 0 ? (
                      <p className="mt-2 text-[12px] text-[#64748B]">
                        sourceKeywords: {sourceKeywords.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  {asset.copyable ? (
                    <BigCopyButton content={asset.content} label={`${typeLabel.label} 복사하기`} />
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-6 text-center">
            <p className="text-[17px] font-bold text-[var(--boina-ink)]">글을 준비 중이에요</p>
            <p className="mt-1 text-[14px] leading-[20px] text-[var(--boina-ink-2)]">
              진단이 완료되면 복붙할 글을 드릴게요.
            </p>
          </div>
        )}
      </section>

      {!loading && (
        <p className="mt-6 max-w-2xl text-[13px] leading-[19px] text-[#94A3B8]">
          아래 글은 참고용입니다. 가게 사정에 맞게 살짝 다듬으면 더 좋아요. 효과나 순위를 보장하지
          않아요.
        </p>
      )}
    </main>
  );
}

export default function WriteClient() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-[720px] px-5 py-10">
          <p className="text-[16px] font-medium text-[var(--boina-ink-2)]">
            문안 화면을 불러오는 중...
          </p>
        </main>
      }
    >
      <WritePageInner />
    </Suspense>
  );
}
