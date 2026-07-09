import { WeeklyReportImageButton } from "@/app/creator/_components/WeeklyReportImageButton";
import { getCreatorWeeklyReport } from "@/lib/creator/service";
import type { CreatorKeyword } from "@/lib/creator/types";

export default async function CreatorCurrentReportPage() {
  const report = await getCreatorWeeklyReport();
  const selected = report.topKeywords[0];
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
      <p className="text-sm font-semibold text-[var(--creator-signal-ai)]">S6 주간 리포트</p>
      <h1 className="mt-2 text-3xl font-extrabold">월요일 아침에 보는 이번 주 글감</h1>
      <p className="mt-2 text-[var(--creator-text-body)]">{report.week}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <WeeklyReportImageButton report={report} />
        {report.archiveWeeks.map((week) => (
          <span
            key={week}
            className="inline-flex min-h-11 items-center rounded-xl border border-[var(--creator-line-subtle)] px-3 text-sm font-bold text-[var(--creator-text-body)]"
          >
            {week}
          </span>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {report.topKeywords.map((keyword) => (
          <ReportKeywordCard
            key={keyword.id}
            keyword={keyword}
            selected={selected?.id === keyword.id}
          />
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-5">
        <h2 className="text-xl font-bold">인용 이벤트</h2>
        {report.citationEvents.length === 0 ? (
          <p className="mt-3 text-[var(--creator-text-body)]">
            이번 주 확인된 인용은 없습니다. 추적 중인 글의 구조 수정 후보를 먼저 처리하세요.
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            {report.citationEvents.map((event) => (
              <article
                key={event.id}
                className="rounded-xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-raised)] p-4"
              >
                <p className="text-sm font-bold">{event.question}</p>
                <p className="mt-2 text-sm text-[var(--creator-text-body)]">{event.excerpt}</p>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="mt-6 rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-5">
        <h2 className="text-xl font-bold">놓친 기회</h2>
        <ul className="mt-3 grid gap-2 text-[var(--creator-text-body)]">
          {report.missedOpportunities.map((item) => (
            <li key={item}>다음 주 후보: {item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ReportKeywordCard({
  keyword,
  selected,
}: {
  readonly keyword: CreatorKeyword;
  readonly selected: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border bg-[var(--creator-bg-panel)] p-5 ${
        selected ? "border-[var(--creator-signal-ai)]" : "border-[var(--creator-line-subtle)]"
      }`}
    >
      <p className="text-lg font-bold">{keyword.text}</p>
      <p className="mt-3 font-mono text-sm text-[var(--creator-signal-ai)]">
        N {keyword.naverScore} · AI {keyword.aiScore ?? "측정 대기"}
      </p>
      <p className="mt-3 text-sm text-[var(--creator-text-body)]">{keyword.angle}</p>
    </article>
  );
}
