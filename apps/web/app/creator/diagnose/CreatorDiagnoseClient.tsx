"use client";

import { GaugeRing } from "@/app/creator/_components/GaugeRing";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";

const diagnosisResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    score: z.number(),
    grade: z.string(),
    checklist: z.array(
      z.object({
        status: z.string(),
        title: z.string(),
        fix: z.string(),
        impact: z.string(),
      }),
    ),
    methodology: z.string(),
  }),
});

export function CreatorDiagnoseClient() {
  const [url, setUrl] = useState("https://example.com/blog/ai-search");
  const [status, setStatus] = useState("대기 중");
  const [result, setResult] = useState<z.infer<typeof diagnosisResponseSchema>["data"] | null>(
    null,
  );
  const [recent, setRecent] = useState<readonly string[]>(["https://example.com/blog/ai-search"]);
  const [error, setError] = useState<string | null>(null);

  async function runDiagnosis() {
    setError(null);
    setStatus("글 읽는 중 → 구조 분석 → AI 기준 대조");
    try {
      const response = await fetch("/api/creator/diagnoses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = diagnosisResponseSchema.parse(await response.json());
      setResult(body.data);
      setRecent((current) => [url, ...current.filter((item) => item !== url)].slice(0, 5));
      setStatus("진단 완료");
    } catch (diagnosisError) {
      setResult(null);
      setError(diagnosisError instanceof Error ? diagnosisError.message : "진단에 실패했습니다.");
      setStatus("다시 시도 필요");
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
      <p className="text-sm font-semibold text-[var(--creator-signal-ai)]">S4 글 진단</p>
      <h1 className="mt-2 text-3xl font-extrabold">AI 인용 가능성을 높일 수정점을 찾습니다</h1>
      <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="min-h-12 rounded-xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-raised)] px-4 outline-none"
        />
        <button
          type="button"
          onClick={runDiagnosis}
          className="min-h-12 rounded-xl bg-[var(--creator-signal-ai)] px-5 font-bold text-[#06101c]"
        >
          진단 실행
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {recent.map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setUrl(item)}
            className="min-h-9 rounded-full border border-[var(--creator-line-subtle)] px-3 text-xs font-bold text-[var(--creator-text-body)]"
          >
            {item}
          </button>
        ))}
      </div>
      <p className="mt-4 rounded-xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-4 text-sm text-[var(--creator-text-body)]">
        {status}
      </p>
      {error ? (
        <p className="mt-3 rounded-xl border border-[rgba(255,176,32,.4)] bg-[rgba(255,176,32,.08)] p-4 text-sm text-[var(--creator-signal-hot)]">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-6 text-center">
            <GaugeRing score={result.score} label="AI 인용 점수" />
            <p className="mt-2 font-bold">{result.grade}</p>
            <p className="mt-4 text-xs text-[var(--creator-text-dim)]">{result.methodology}</p>
            <Link
              href={`/creator/citations?url=${encodeURIComponent(url)}`}
              className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--creator-signal-naver)] px-4 font-bold text-[#06150f]"
            >
              이 글 추적
            </Link>
          </div>
          <div className="grid gap-3">
            {result.checklist.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[var(--creator-signal-ai)]">
                    {item.status === "pass" ? "check_circle" : "build_circle"}
                  </span>
                  <p className="text-sm font-bold">{item.title}</p>
                </div>
                <p className="mt-2 text-sm text-[var(--creator-text-body)]">{item.fix}</p>
                <p className="mt-2 text-xs text-[var(--creator-text-dim)]">
                  상태 {item.status} · 영향 {item.impact}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
