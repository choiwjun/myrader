// @TASK P1-S0 - big_copy_button 공통 컴포넌트
// @SPEC specs/shared/components.yaml#big_copy_button
// @SPEC docs/planning/05-design-system.md §4 (생성물 카드 — 큰 복사 버튼)
//
// 클립보드 복사 + "복사됐어요" 토스트.
// 비IT 사장님 대상 — 버튼 크고 동작은 하나.
// 접근성: aria-live="polite" 토스트, 버튼 최소 52px.

"use client";

import { useRef, useState } from "react";

export interface BigCopyButtonProps {
  /** 복사할 텍스트 */
  content: string;
  /** 버튼 라벨 (기본: "복사하기") */
  label?: string;
}

export async function copyTextWithFallback(content: string): Promise<boolean> {
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) {
      throw new Error("navigator.clipboard.writeText unavailable");
    }
    await clipboard.writeText(content);
    return true;
  } catch {
    if (typeof document === "undefined" || typeof document.execCommand !== "function") {
      return false;
    }

    const el = document.createElement("textarea");
    el.value = content;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.focus();
    el.select();

    try {
      return document.execCommand("copy") === true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(el);
    }
  }
}

/**
 * 큰 복사 버튼.
 * 클립보드 복사 성공 시 "복사됐어요" 피드백 2초 표시.
 */
export function BigCopyButton({ content, label = "복사하기" }: BigCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function markCopied() {
    setCopied(true);
    setCopyError(null);
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopy() {
    setCopyError(null);
    const didCopy = await copyTextWithFallback(content);
    if (didCopy) {
      markCopied();
      return;
    }

    setCopied(false);
    setCopyError("복사에 실패했어요. 다시 시도하거나 직접 복사해 주세요.");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "복사됐어요" : label}
        className={`w-full min-h-[56px] rounded-2xl text-white text-lg font-bold px-6 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2 ${
          copied ? "bg-[#10B981]" : "bg-[var(--boina-brand)] hover:bg-[var(--boina-brand-deep)]"
        }`}
      >
        {copied ? (
          <>
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
              check_circle
            </span>
            복사됐어요
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
              content_copy
            </span>
            {label}
          </>
        )}
      </button>

      {/* 스크린 리더용 토스트 알림 — output 요소가 role="status" + aria-live 내재 */}
      <output aria-live="polite" aria-atomic="true" className="sr-only">
        {copied ? "클립보드에 복사됐어요." : copyError ? copyError : ""}
      </output>
      {copyError && (
        <p className="mt-2 text-center text-sm font-semibold text-[#B45309]">{copyError}</p>
      )}
    </div>
  );
}
