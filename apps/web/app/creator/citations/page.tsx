import { CitationTrackerTable } from "@/app/creator/_components/CitationTrackerTable";
import { getCreatorCitations } from "@/lib/creator/service";
import Link from "next/link";

export default function CreatorCitationsPage() {
  const citations = getCreatorCitations();
  return (
    <section className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <p className="text-sm font-semibold text-[var(--creator-signal-ai)]">S5 인용 추적</p>
      <h1 className="mt-2 text-3xl font-extrabold">내 글이 AI 답변에 등장하는 순간을 추적합니다</h1>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <Metric label="추적 중" value={`${citations.trackedCount}개`} />
        <Metric label="이번 주 인용" value={`${citations.weeklyCitationCount}건`} />
        <Metric label="지난주 대비" value={`${citations.previousWeekDelta}`} />
      </div>
      <div className="mt-6 rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-extrabold">인용 타임라인</h2>
          <span className="text-xs font-bold text-[var(--creator-text-dim)]">주간 자동 측정</span>
        </div>
        {citations.events.length === 0 ? (
          <div className="mt-4">
            <h3 className="text-xl font-extrabold">아직 인용 전이에요</h3>
            <p className="mt-3 text-[var(--creator-text-body)]">
              먼저 글 진단에서 첫 문단, 출처, 문서 구조를 고치면 인용 가능성을 높일 수 있습니다.
            </p>
            <Link
              href="/creator/diagnose"
              className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--creator-signal-ai)] px-4 font-bold text-[#06101c]"
            >
              글 진단으로 이동
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {citations.events.map((event) => (
              <article
                key={event.id}
                className="rounded-xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-raised)] p-4"
              >
                <p className="text-sm font-bold">{event.question}</p>
                <p className="mt-2 text-sm text-[var(--creator-text-body)]">{event.excerpt}</p>
                <p className="mt-2 text-xs text-[var(--creator-text-dim)]">
                  {event.model} · {event.kind} · {formatDateTime(event.foundAt)}
                </p>
              </article>
            ))}
          </div>
        )}
        <p className="mt-6 text-xs text-[var(--creator-text-dim)]">{citations.methodology}</p>
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)]">
        <div className="border-b border-[var(--creator-line-subtle)] p-4">
          <h2 className="text-xl font-extrabold">추적 대상 관리</h2>
        </div>
        <CitationTrackerTable targets={citations.trackedTargets} />
      </div>
    </section>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-4">
      <p className="text-sm text-[var(--creator-text-dim)]">{label}</p>
      <p className="mt-2 font-mono text-3xl font-bold text-[var(--creator-signal-ai)]">{value}</p>
    </div>
  );
}
