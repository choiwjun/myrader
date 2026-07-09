import { previewCreatorTopic } from "@/lib/creator/service";
import Link from "next/link";

export default async function CreatorOnboardingPage({
  searchParams,
}: {
  readonly searchParams?: Promise<{ readonly topic?: string; readonly channelUrl?: string }>;
}) {
  const params = await searchParams;
  const topic = params?.topic ?? "제주 여행";
  const channelUrl = params?.channelUrl ?? "";
  const preview = await previewCreatorTopic(topic);
  const radarHref = `/creator/radar?topic=${encodeURIComponent(topic)}${
    channelUrl ? `&channelUrl=${encodeURIComponent(channelUrl)}` : ""
  }`;

  return (
    <section className="relative mx-auto flex min-h-[calc(100dvh-72px)] max-w-3xl items-center px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(77,216,255,.18),transparent_42%)]" />
      <div className="relative w-full rounded-2xl border border-[var(--creator-line-subtle)] bg-[rgba(16,22,36,.9)] p-6 shadow-[0_0_60px_rgba(77,216,255,.08)]">
        <p className="text-sm font-semibold text-[var(--creator-signal-ai)]">S1 온보딩</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">어떤 주제를 감시할까요?</h1>
        <form action="/creator/onboarding" className="mt-6 grid gap-3">
          <input
            name="topic"
            defaultValue={topic}
            placeholder="예: 제주 여행, 홈카페, 사이드프로젝트"
            className="min-h-12 rounded-xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-raised)] px-4 text-[var(--creator-text-hi)] outline-none focus:border-[var(--creator-line-focus)]"
          />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              name="channelUrl"
              defaultValue={channelUrl}
              placeholder="선택: 블로그나 채널 URL"
              className="min-h-12 rounded-xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-raised)] px-4 text-[var(--creator-text-hi)] outline-none focus:border-[var(--creator-line-focus)]"
            />
            <button
              type="submit"
              className="min-h-12 rounded-xl bg-[var(--creator-signal-ai)] px-5 font-bold text-[#06101c]"
            >
              미리보기
            </button>
          </div>
        </form>
        <div className="mt-5 flex flex-wrap gap-2">
          {preview.keywords.map((keyword) => (
            <span
              key={keyword}
              className="rounded-full border border-[var(--creator-line-subtle)] bg-[rgba(77,216,255,.08)] px-3 py-2 text-sm text-[var(--creator-text-body)]"
            >
              {keyword}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm text-[var(--creator-text-dim)]">{preview.message}</p>
        {preview.warnings.length > 0 ? (
          <p className="mt-3 rounded-xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-raised)] p-3 text-sm text-[var(--creator-text-body)]">
            {preview.warnings.join(" · ")}
          </p>
        ) : null}
        <Link
          href={radarHref}
          className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-[var(--creator-signal-naver)] px-5 font-bold text-[#06150f]"
        >
          레이더 가동
        </Link>
      </div>
    </section>
  );
}
