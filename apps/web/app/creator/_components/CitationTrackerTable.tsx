"use client";

import type { CreatorTrackedTarget } from "@/lib/creator/types";
import Link from "next/link";
import { useState } from "react";

export function CitationTrackerTable({
  targets,
}: {
  readonly targets: readonly CreatorTrackedTarget[];
}) {
  const [rows, setRows] = useState(targets);
  const [probingId, setProbingId] = useState<string | null>(null);

  async function removeTarget(id: string) {
    setRows((current) => current.filter((target) => target.id !== id));
    await fetch(`/api/creator/citations?targetId=${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async function probeTarget(id: string) {
    setProbingId(id);
    await fetch(`/api/creator/citations?targetId=${encodeURIComponent(id)}`, { method: "POST" });
    window.setTimeout(() => setProbingId(null), 700);
  }

  if (rows.length === 0) {
    return (
      <div className="p-6 text-sm text-[var(--creator-text-body)]">
        추적 중인 글이 없습니다. 글 진단 결과에서 인용 추적을 등록해 주세요.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="text-xs text-[var(--creator-text-dim)]">
          <tr>
            <th className="px-4 py-3">글</th>
            <th className="px-4 py-3">키워드</th>
            <th className="px-4 py-3">마지막 측정</th>
            <th className="px-4 py-3">인용</th>
            <th className="px-4 py-3">상태</th>
            <th className="px-4 py-3">관리</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((target) => (
            <tr key={target.id} className="border-t border-[var(--creator-line-subtle)]">
              <td className="px-4 py-3">
                <Link href={target.url} className="font-bold text-[var(--creator-text-hi)]">
                  {target.title}
                </Link>
                <p className="mt-1 text-xs text-[var(--creator-text-dim)]">
                  등록 {formatDateTime(target.registeredAt)}
                </p>
              </td>
              <td className="px-4 py-3 text-[var(--creator-text-body)]">{target.keyword}</td>
              <td className="px-4 py-3 text-[var(--creator-text-body)]">
                {probingId === target.id ? "측정 중" : formatDateTime(target.lastProbedAt)}
              </td>
              <td className="px-4 py-3 font-mono text-[var(--creator-signal-ai)]">
                {target.citationCount}
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full border border-[var(--creator-line-subtle)] px-2 py-1 text-xs text-[var(--creator-text-body)]">
                  {target.status === "needs_fix" ? "수정 권장" : "추적 중"}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => probeTarget(target.id)}
                    className="min-h-9 rounded-xl border border-[var(--creator-line-focus)] px-3 font-bold text-[var(--creator-signal-ai)]"
                  >
                    수동 측정
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTarget(target.id)}
                    className="min-h-9 rounded-xl border border-[var(--creator-line-subtle)] px-3 font-bold text-[var(--creator-text-body)]"
                  >
                    해제
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
