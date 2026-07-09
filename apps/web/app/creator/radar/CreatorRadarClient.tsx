"use client";

import { CreatorLookupOverlay } from "@/app/creator/_components/CreatorLookupOverlay";
import { CreatorRadarHeader } from "@/app/creator/_components/CreatorRadarHeader";
import { DualScore } from "@/app/creator/_components/DualScore";
import { KeywordCard } from "@/app/creator/_components/KeywordCard";
import { KeywordDetailPanel } from "@/app/creator/_components/KeywordDetailPanel";
import { LiveTicker } from "@/app/creator/_components/LiveTicker";
import { type RadarFilter, RadarFilterBar } from "@/app/creator/_components/RadarFilterBar";
import { RadarMobileTab } from "@/app/creator/_components/RadarMobileTab";
import { StarChart } from "@/app/creator/_components/StarChart";
import type { CreatorKeyword, CreatorRadarSnapshot } from "@/lib/creator/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type RadarMobileView = "stars" | "cards";

export function CreatorRadarClient({
  initialSnapshot,
}: {
  readonly initialSnapshot: CreatorRadarSnapshot;
}) {
  const [selected, setSelected] = useState<CreatorKeyword | null>(
    initialSnapshot.keywords[0] ?? null,
  );
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupKeyword, setLookupKeyword] = useState("");
  const [mobileView, setMobileView] = useState<RadarMobileView>("stars");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [filter, setFilter] = useState<RadarFilter>("all");
  const [scanStage, setScanStage] = useState<string | null>(null);
  const visibleKeywords = useMemo(
    () => filterKeywords(initialSnapshot.keywords, filter),
    [filter, initialSnapshot.keywords],
  );
  const selectedKeyword =
    visibleKeywords.find((keyword) => keyword.id === selected?.id) ?? visibleKeywords[0] ?? null;
  const scanning = scanStage !== null;

  const startScan = useCallback(() => {
    if (scanning) return;
    setScanStage("큐 등록");
    const stages = ["네이버 후보 수집", "검색량/포화도 계산", "AI 프로브", "스냅샷 갱신"];
    stages.forEach((stage, index) => {
      window.setTimeout(() => setScanStage(stage), 420 * (index + 1));
    });
    window.setTimeout(() => setScanStage(null), 2400);
  }, [scanning]);

  useEffect(() => {
    const onScan = () => startScan();
    window.addEventListener("creator:scan", onScan);
    return () => window.removeEventListener("creator:scan", onScan);
  }, [startScan]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key) || visibleKeywords.length === 0) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      const index = Math.max(
        0,
        visibleKeywords.findIndex((keyword) => keyword.id === selectedKeyword?.id),
      );
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next =
        visibleKeywords[(index + delta + visibleKeywords.length) % visibleKeywords.length];
      if (next) setSelected(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedKeyword?.id, visibleKeywords]);

  function openLookup(keyword: string) {
    setLookupKeyword(keyword);
    setLookupOpen(true);
  }

  if (!selectedKeyword) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-6">
          <h1 className="text-2xl font-extrabold">이 필터에는 신호가 없어요</h1>
          <p className="mt-3 text-[var(--creator-text-body)]">
            필터를 바꾸거나 주제를 넓혀 다시 스캔해 주세요.
          </p>
          <div className="mt-4">
            <RadarFilterBar active={filter} onChange={setFilter} />
          </div>
        </div>
      </section>
    );
  }

  const detailContent = <KeywordDetailPanel keyword={selectedKeyword} onLookup={openLookup} />;
  const keywordGrid = visibleKeywords.map((keyword) => (
    <KeywordCard
      key={keyword.id}
      keyword={keyword}
      selected={selectedKeyword.id === keyword.id}
      onSelect={setSelected}
    />
  ));

  return (
    <div className="pb-28">
      <section className="mx-auto grid w-full max-w-7xl gap-4 overflow-x-hidden px-4 py-6 lg:grid-cols-[240px_minmax(0,1fr)_360px] lg:px-6">
        <aside className="order-2 min-w-0 rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-4 lg:order-none">
          <p className="text-xs font-bold text-[var(--creator-text-dim)]">수집 채널</p>
          <div className="mt-4 flex gap-3 overflow-x-auto lg:grid lg:overflow-visible">
            {initialSnapshot.channels.map((channel) => (
              <div
                key={channel.name}
                className="min-w-[180px] rounded-xl bg-[var(--creator-bg-raised)] p-3 lg:min-w-0"
              >
                <p className="font-semibold">{channel.name}</p>
                <p className="mt-1 text-xs text-[var(--creator-text-dim)]">{channel.detail}</p>
              </div>
            ))}
          </div>
        </aside>
        <section className="order-1 min-w-0 lg:order-none">
          <CreatorRadarHeader
            scanStage={scanStage}
            scanning={scanning}
            snapshot={initialSnapshot}
            onLookup={openLookup}
            onScan={startScan}
          />
          <div className="mb-4 rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-4">
            <p className="text-xs font-bold text-[var(--creator-signal-hot)]">TOP SIGNAL</p>
            <h1 className="mt-2 text-2xl font-extrabold">{initialSnapshot.topSignal.keyword}</h1>
            <p className="mt-1 text-sm text-[var(--creator-text-body)]">
              {initialSnapshot.topSignal.reason}
            </p>
            <p className="mt-3 text-xs text-[var(--creator-text-dim)]">
              {scanStage ?? initialSnapshot.scan.stageDetail}
            </p>
          </div>
          <RadarFilterBar active={filter} onChange={setFilter} />
          <div className="mb-4 grid grid-cols-2 rounded-xl bg-[var(--creator-bg-panel)] p-1 lg:hidden">
            <RadarMobileTab active={mobileView === "stars"} onClick={() => setMobileView("stars")}>
              성도
            </RadarMobileTab>
            <RadarMobileTab active={mobileView === "cards"} onClick={() => setMobileView("cards")}>
              카드
            </RadarMobileTab>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className={mobileView === "stars" ? "block" : "hidden lg:block"}>
              <StarChart
                keywords={visibleKeywords}
                selectedId={selectedKeyword.id}
                onSelect={setSelected}
              />
            </div>
            <div
              className={`gap-3 sm:grid-cols-2 xl:grid-cols-1 ${
                mobileView === "cards" ? "grid" : "hidden lg:grid"
              }`}
            >
              {keywordGrid.slice(0, 6)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileDetailOpen(true)}
            className="mt-4 flex w-full items-center justify-between rounded-2xl border border-[var(--creator-line-focus)] bg-[rgba(77,216,255,.08)] p-4 text-left lg:hidden"
          >
            <span>
              <span className="block text-sm font-bold">{selectedKeyword.text}</span>
              <span className="mt-1 flex gap-2">
                <DualScore
                  naver={selectedKeyword.naverScore}
                  ai={selectedKeyword.aiScore}
                  size="sm"
                />
              </span>
            </span>
            <span className="text-sm font-bold text-[var(--creator-signal-ai)]">상세</span>
          </button>
        </section>
        <aside className="order-3 hidden rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-5 lg:order-none lg:block">
          {detailContent}
        </aside>
      </section>
      <LiveTicker keywords={visibleKeywords} onSelect={setSelected} />
      {mobileDetailOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur lg:hidden">
          <button
            type="button"
            aria-label="키워드 상세 닫기"
            onClick={() => setMobileDetailOpen(false)}
            className="absolute inset-0"
          />
          <section className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-5 pb-24">
            <div className="mb-4 flex justify-center">
              <span className="h-1 w-12 rounded-full bg-[var(--creator-bg-raised)]" />
            </div>
            {detailContent}
          </section>
        </div>
      ) : null}
      <CreatorLookupOverlay
        open={lookupOpen}
        initialKeyword={lookupKeyword}
        onClose={() => setLookupOpen(false)}
      />
    </div>
  );
}

function filterKeywords(keywords: readonly CreatorKeyword[], filter: RadarFilter) {
  if (filter === "rising") {
    return keywords.filter((keyword) => (keyword.naverEvidence.trend7d ?? 0) >= 50);
  }
  if (filter === "ai-gap") {
    return keywords.filter((keyword) => keyword.aiEvidence?.blogGap !== "crowded");
  }
  return keywords;
}
