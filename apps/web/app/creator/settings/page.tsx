import Link from "next/link";

export default function CreatorSettingsPage() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
      <p className="text-sm font-semibold text-[var(--creator-signal-ai)]">S7 설정 / 구독</p>
      <h1 className="mt-2 text-3xl font-extrabold">주제, 알림, 플랜 한도를 관리합니다</h1>
      <div className="mt-6 rounded-2xl border border-[rgba(255,176,32,.35)] bg-[rgba(255,176,32,.08)] p-4 text-sm text-[var(--creator-signal-hot)]">
        Toss 정기결제는 아직 운영 연결 전입니다. 현재 화면은 PRD 기준 가격과 한도, 결제 준비 상태를
        표시합니다.
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <article
            key={plan.name}
            className={`rounded-2xl border bg-[var(--creator-bg-panel)] p-5 ${
              plan.current
                ? "border-[var(--creator-signal-ai)] shadow-[0_0_28px_rgba(77,216,255,.14)]"
                : "border-[var(--creator-line-subtle)]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold">{plan.name}</h2>
              {plan.current ? (
                <span className="rounded-full bg-[rgba(77,216,255,.12)] px-2 py-1 text-xs font-bold text-[var(--creator-signal-ai)]">
                  현재
                </span>
              ) : null}
            </div>
            <p className="mt-3 font-mono text-2xl font-extrabold">{plan.price}</p>
            <ul className="mt-4 grid gap-2 text-sm text-[var(--creator-text-body)]">
              {plan.limits.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
            <button
              type="button"
              disabled
              className="mt-5 min-h-11 w-full rounded-xl border border-[var(--creator-line-subtle)] font-bold text-[var(--creator-text-dim)]"
            >
              Toss 결제 준비 중
            </button>
          </article>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel
          title="주제 관리"
          body="Free는 주제 1개, Starter는 2개, Pro는 5개까지 감시합니다. 주제 추가와 삭제는 API 저장소 연결 후 즉시 반영됩니다."
        />
        <Panel
          title="알림 채널"
          body="메일 알림은 필수입니다. 인용 발견 후 24시간 이내 알림을 보내도록 운영 잡과 연결되는 구조입니다."
        />
        <Panel
          title="해지 플로우"
          body="해지 요청은 다음 결제일부터 갱신을 멈추는 방식입니다. 현재는 결제 미연결 상태라 실제 과금 변경은 발생하지 않습니다."
        />
        <Panel
          title="탈퇴 / 데이터 삭제"
          body="탈퇴 확정 전 추적 글, 리포트, 레이더 기록 삭제 범위를 다시 보여주고 확인 후 처리합니다."
        />
      </div>
      <div className="mt-6 flex flex-wrap gap-2 text-sm text-[var(--creator-text-dim)]">
        <Link
          href="/terms"
          className="rounded-full border border-[var(--creator-line-subtle)] px-3 py-2"
        >
          이용약관
        </Link>
        <Link
          href="/privacy"
          className="rounded-full border border-[var(--creator-line-subtle)] px-3 py-2"
        >
          개인정보처리방침
        </Link>
        <Link
          href="/refund-policy"
          className="rounded-full border border-[var(--creator-line-subtle)] px-3 py-2"
        >
          환불정책
        </Link>
      </div>
    </section>
  );
}

const PLANS = [
  {
    name: "Free",
    price: "0원",
    limits: ["주제 1개", "주 1회 레이더, 키워드 5개", "즉시 조회 3회/일", "글 진단 월 2회"],
    current: true,
  },
  {
    name: "Starter",
    price: "월 9,900원",
    limits: ["주제 2개", "일 1회 레이더", "즉시 조회 20회/일", "추적 글 3개"],
    current: false,
  },
  {
    name: "Pro",
    price: "월 24,900원",
    limits: ["주제 5개", "수동 스캔 포함", "즉시 조회 무제한", "추적 글 20개와 인용 알림"],
    current: false,
  },
] as const;

function Panel({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <article className="rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-5">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-3 text-[var(--creator-text-body)]">{body}</p>
    </article>
  );
}
