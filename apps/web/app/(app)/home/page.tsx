"use client";

import { RadarPreviewCard } from "@/app/components/shared/RadarPreviewCard";
import type { UnsubscribedRadarPreview } from "@/lib/radar/radar-preview";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const cardClass =
  "rounded-[20px] border border-[var(--boina-line)] bg-[var(--boina-card)] p-5 shadow-[0_1px_3px_rgba(25,31,40,0.06)]";

function withDiagnosisId(href: string, diagnosisId: string | null): string {
  return diagnosisId ? `${href}?diagnosisId=${encodeURIComponent(diagnosisId)}` : href;
}

function HomePageInner() {
  const searchParams = useSearchParams();
  const diagnosisId = searchParams.get("diagnosisId");
  const [radarPreview, setRadarPreview] = useState<UnsubscribedRadarPreview | null>(null);
  const [radarLoading, setRadarLoading] = useState(Boolean(diagnosisId));

  useEffect(() => {
    if (!diagnosisId) {
      setRadarLoading(false);
      setRadarPreview(null);
      return;
    }

    const currentDiagnosisId = diagnosisId;

    async function loadRadarPreview() {
      setRadarLoading(true);
      try {
        const res = await fetch(
          `/api/radar/preview?diagnosisId=${encodeURIComponent(currentDiagnosisId)}`,
        );
        const json = await res.json();
        if (res.ok && json.success) {
          setRadarPreview(json.data ?? null);
          return;
        }
        setRadarPreview(null);
      } catch {
        setRadarPreview(null);
      } finally {
        setRadarLoading(false);
      }
    }

    loadRadarPreview();
  }, [diagnosisId]);

  const statusHref = withDiagnosisId("/status", diagnosisId);
  const rivalsHref = withDiagnosisId("/rivals", diagnosisId);
  const writeHref = withDiagnosisId("/write", diagnosisId);
  const findHref = "/find";

  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-4 px-5 py-8 md:py-12">
      <section className="rounded-[24px] bg-[var(--boina-brand)] px-5 py-6 text-white">
        <p className="text-[14px] font-bold opacity-80">① 오늘 볼 것</p>
        <h1 className="mt-2 text-[24px] font-extrabold leading-[32px]">
          오늘은 가게가 잘 보이게 만드는 일 하나만 해요.
        </h1>
        <p className="mt-3 text-[16px] font-medium leading-[24px] opacity-90">
          상태를 확인하고, 바로 쓸 문안까지 한 번에 이어집니다.
        </p>
        <Link
          href={writeHref}
          className="mt-5 inline-flex min-h-12 items-center rounded-[14px] bg-white px-4 py-3 text-[15px] font-bold text-[var(--boina-brand-deep)]"
        >
          오늘 할 일 보기
        </Link>
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">② 채널 상태</p>
            <h2 className="mt-1 text-[18px] font-bold leading-[26px] text-[var(--boina-ink)]">
              검색과 AI가 읽을 재료를 확인해요.
            </h2>
            <p className="mt-1 text-[14px] font-medium leading-[20px] text-[var(--boina-ink-2)]">
              네이버, 구글, AI 상태는 자세한 화면에서 봅니다.
            </p>
          </div>
          <Link
            href={statusHref}
            className="shrink-0 rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[14px] font-bold text-[var(--boina-brand)]"
          >
            상태
          </Link>
        </div>
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">③ 라이벌 한 줄</p>
            <h2 className="mt-1 text-[18px] font-bold leading-[26px] text-[var(--boina-ink)]">
              옆집은 있고, 우리는 빠진 것을 봅니다.
            </h2>
            <p className="mt-1 text-[14px] font-medium leading-[20px] text-[var(--boina-ink-2)]">
              비교와 차이는 한 화면에서 이어서 확인해요.
            </p>
          </div>
          <Link
            href={rivalsHref}
            className="shrink-0 rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[14px] font-bold text-[var(--boina-brand)]"
          >
            라이벌
          </Link>
        </div>
      </section>

      <section aria-label="④ 이번 주 사람들이 찾는 말">
        <RadarPreviewCard preview={radarPreview} loading={radarLoading} />
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-bold text-[var(--boina-ink-3)]">⑤ 꾸준한 한 걸음</p>
            <h2 className="mt-1 text-[18px] font-bold leading-[26px] text-[var(--boina-ink)]">
              리뷰, 사진, 소개글처럼 쌓이는 일을 챙겨요.
            </h2>
            <p className="mt-1 text-[14px] font-medium leading-[20px] text-[var(--boina-ink-2)]">
              가게를 바꾸거나 다시 살펴볼 때는 가게 찾기로 돌아갑니다.
            </p>
          </div>
          <Link
            href={diagnosisId ? writeHref : findHref}
            className="shrink-0 rounded-[14px] border border-[var(--boina-line)] px-3 py-2 text-[14px] font-bold text-[var(--boina-brand)]"
          >
            문안
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-[640px] px-5 py-12">
          <p className="text-[16px] font-medium text-[var(--boina-ink-2)]">홈을 불러오는 중...</p>
        </main>
      }
    >
      <HomePageInner />
    </Suspense>
  );
}
