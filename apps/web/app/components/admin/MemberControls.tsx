// @SPEC docs/superpowers/plans/2026-06-17-admin-member-management.md (Task 6 — 제어 패널)
"use client";
import { useState } from "react";

type Action =
  | { action: "setPlan"; plan: string }
  | { action: "block" }
  | { action: "unblock" }
  | { action: "forceLogout" }
  | { action: "softDelete" }
  | { action: "restore" };

export function MemberControls({
  id,
  plan,
  status,
}: {
  id: string;
  plan: string;
  status: "active" | "blocked" | "deleted";
}) {
  const [busy, setBusy] = useState(false);
  const [planValue, setPlanValue] = useState(plan);

  async function send(body: Action, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/members/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      window.alert(`작업 실패: ${res.status}`);
    } catch {
      window.alert("네트워크 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3" aria-busy={busy}>
      <div className="flex items-center gap-2">
        <select
          value={planValue}
          onChange={(e) => setPlanValue(e.target.value)}
          aria-label="플랜 선택"
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200"
        >
          <option value="free">free</option>
          <option value="basic">basic</option>
          <option value="pro">pro</option>
          <option value="business">business</option>
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => send({ action: "setPlan", plan: planValue })}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
        >
          플랜 저장
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {status === "blocked" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ action: "unblock" })}
            className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100"
          >
            차단 해제
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              send({ action: "block" }, "이 회원을 차단할까요? 로그인·세션이 모두 막힙니다.")
            }
            className="rounded bg-amber-600 px-3 py-1 text-sm text-white"
          >
            차단
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            send({ action: "forceLogout" }, "이 회원의 모든 세션을 강제 로그아웃할까요?")
          }
          className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100"
        >
          강제 로그아웃
        </button>
        {status === "deleted" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ action: "restore" })}
            className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100"
          >
            복구
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ action: "softDelete" }, "이 회원을 삭제할까요? (복구 가능)")}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
