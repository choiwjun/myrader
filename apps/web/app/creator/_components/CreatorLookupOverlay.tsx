"use client";

import { DualScore } from "@/app/creator/_components/DualScore";
import { EvidenceRow } from "@/app/creator/_components/EvidenceRow";
import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";

const lookupResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    id: z.string(),
    text: z.string(),
    naverScore: z.number(),
    aiScore: z.number().nullable(),
    aiStatus: z.string(),
    angle: z.string(),
    naverEvidence: z.object({
      volume: z.number().nullable(),
      docs: z.number().nullable(),
      saturation: z.number().nullable(),
      trend7d: z.number().nullable(),
      reasons: z.array(z.string()),
    }),
    aiEvidence: z
      .object({
        probeSummary: z.string(),
        citedSources: z.number(),
        blogGap: z.string(),
        queryText: z.string(),
        methodology: z.string(),
      })
      .nullable(),
  }),
});

type LookupResult = z.infer<typeof lookupResponseSchema>["data"];

export function CreatorLookupOverlay({
  open,
  initialKeyword = "",
  onClose,
}: {
  readonly open: boolean;
  readonly initialKeyword?: string;
  readonly onClose: () => void;
}) {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [history, setHistory] = useState<readonly string[]>([]);
  const [status, setStatus] = useState("네이버 축은 즉시, AI 축은 선택 실행합니다.");

  useEffect(() => {
    if (!open) return;
    setKeyword(initialKeyword);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [initialKeyword, onClose, open]);

  if (!open) return null;

  async function runLookup(includeAi: boolean) {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setStatus("조회할 키워드를 입력해 주세요.");
      return;
    }
    setStatus(
      includeAi ? "네이버 축 확인 후 AI 질문 세트를 대조합니다." : "네이버 축을 확인합니다.",
    );
    try {
      const response = await fetch("/api/creator/lookups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: trimmed, includeAi }),
      });
      const body = lookupResponseSchema.parse(await response.json());
      setResult(body.data);
      setStatus("조회 완료");
      setHistory((current) => [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 5));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "조회에 실패했습니다.");
    }
  }

  async function copyBriefing() {
    if (!result) return;
    await navigator.clipboard.writeText(
      `${result.text}\nN ${result.naverScore} / AI ${result.aiScore ?? "측정 대기"}\n${result.angle}`,
    );
    setStatus("브리핑을 복사했습니다.");
  }

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/70 p-4 backdrop-blur">
      <section className="mx-auto mt-10 max-w-2xl rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-5 shadow-[0_24px_80px_rgba(0,0,0,.42)] md:mt-20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-[var(--creator-text-dim)]">
              S2.5 키워드 즉시 조회
            </p>
            <h2 className="mt-1 text-2xl font-extrabold">키워드 신호 확인</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid min-h-11 min-w-11 place-items-center rounded-full border border-[var(--creator-line-subtle)] text-[var(--creator-text-body)]"
            aria-label="키워드 조회 닫기"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        <form
          className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void runLookup(false);
          }}
        >
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="min-h-12 rounded-xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-raised)] px-4 outline-none focus:border-[var(--creator-line-focus)]"
            placeholder="이미 마음에 둔 키워드"
          />
          <button
            type="submit"
            className="min-h-12 rounded-xl bg-[var(--creator-signal-naver)] px-4 font-bold text-[#06150f]"
          >
            네이버 확인
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runLookup(true)}
            className="min-h-11 rounded-xl bg-[var(--creator-signal-ai)] px-4 font-bold text-[#06101c]"
          >
            AI 인용 가능성 확인
          </button>
          {history.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setKeyword(item)}
              className="min-h-9 rounded-full border border-[var(--creator-line-subtle)] px-3 text-xs font-bold text-[var(--creator-text-body)]"
            >
              {item}
            </button>
          ))}
        </div>
        <p className="mt-4 rounded-xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-raised)] p-3 text-sm text-[var(--creator-text-body)]">
          {status}
        </p>
        {result ? (
          <div className="mt-4 grid gap-3">
            <div className="rounded-xl border border-[var(--creator-line-subtle)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-extrabold">{result.text}</p>
                  <p className="mt-2 text-sm text-[var(--creator-text-body)]">{result.angle}</p>
                </div>
                <DualScore naver={result.naverScore} ai={result.aiScore} />
              </div>
            </div>
            <EvidenceRow
              label="검색량/문서수"
              value={`${result.naverEvidence.volume ?? "대기"} / ${
                result.naverEvidence.docs ?? "대기"
              }`}
              summary={result.naverEvidence.reasons[0] ?? "네이버 축 근거를 확인했습니다."}
              tone="naver"
            />
            <EvidenceRow
              label="AI 근거"
              value={result.aiScore === null ? "선택 대기" : `${result.aiScore}`}
              summary={
                result.aiEvidence?.probeSummary ?? "AI 조회 버튼을 누르면 질문 세트를 확인합니다."
              }
              tone="ai"
            />
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/creator/radar?topic=${encodeURIComponent(result.text)}`}
                className="inline-flex min-h-11 items-center rounded-xl bg-[var(--creator-signal-naver)] px-4 font-bold text-[#06150f]"
              >
                주제로 등록
              </Link>
              <button
                type="button"
                onClick={() => void copyBriefing()}
                className="min-h-11 rounded-xl border border-[var(--creator-line-focus)] px-4 font-bold text-[var(--creator-signal-ai)]"
              >
                브리핑 복사
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
