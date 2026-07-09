import type { CreatorRadarSnapshot } from "@/lib/creator/types";

export function CreatorRadarHeader({
  scanStage,
  scanning,
  snapshot,
  onLookup,
  onScan,
}: {
  readonly scanStage: string | null;
  readonly scanning: boolean;
  readonly snapshot: CreatorRadarSnapshot;
  readonly onLookup: (keyword: string) => void;
  readonly onScan: () => void;
}) {
  const scanUsage = `${snapshot.quota.scansUsed}/${snapshot.quota.scansLimit}`;
  const lookupUsage = `${snapshot.quota.lookupsUsed}/${snapshot.quota.lookupsLimit}`;

  return (
    <div className="mb-4 rounded-2xl border border-[var(--creator-line-subtle)] bg-[var(--creator-bg-panel)] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold text-[var(--creator-text-dim)]">현재 주제</p>
          <h1 className="mt-1 text-2xl font-extrabold">{snapshot.topic.name}</h1>
          <p className="mt-1 text-xs text-[var(--creator-text-dim)]">
            마지막 스캔 {formatDateTime(snapshot.scan.lastScannedAt)} · 다음 스캔{" "}
            {formatDateTime(snapshot.scan.nextScanAt)}
          </p>
          {snapshot.topic.channelUrl ? (
            <p className="mt-1 truncate text-xs text-[var(--creator-text-dim)]">
              채널 {snapshot.topic.channelUrl}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2 sm:min-w-52">
          <div className="rounded-xl bg-[var(--creator-bg-raised)] p-3 text-xs text-[var(--creator-text-body)]">
            스캔 {scanUsage} · 조회 {lookupUsage}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onLookup(snapshot.topic.name)}
              className="min-h-10 flex-1 rounded-xl border border-[var(--creator-line-focus)] px-3 text-sm font-bold text-[var(--creator-signal-ai)]"
            >
              즉시 조회
            </button>
            <button
              type="button"
              onClick={onScan}
              disabled={scanning}
              className="min-h-10 flex-1 rounded-xl bg-[var(--creator-signal-ai)] px-3 text-sm font-bold text-[#06101c] disabled:opacity-60"
            >
              {scanning ? scanStage : "지금 스캔"}
            </button>
          </div>
        </div>
      </div>
    </div>
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
