// @TASK P1-S0 - big_copy_button 공통 컴포넌트
// @SPEC specs/shared/components.yaml#big_copy_button
// @SPEC docs/planning/05-design-system.md §4 (생성물 카드 — 큰 복사 버튼)
//
// 클립보드 복사 + "복사됐어요" 토스트.
// 비IT 사장님 대상 — 버튼 크고 동작은 하나.
// 접근성: aria-live="polite" 토스트, 버튼 최소 52px.

"use client";

import { useState } from "react";

export interface BigCopyButtonProps {
  /** 복사할 텍스트 */
  content: string;
  /** 버튼 라벨 (기본: "복사하기") */
  label?: string;
}

/**
 * 큰 복사 버튼.
 * 클립보드 복사 성공 시 "복사됐어요" 피드백 2초 표시.
 */
export function BigCopyButton({ content, label = "복사하기" }: BigCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 API 불가 환경 폴백 (구형 iOS 등)
      const el = document.createElement("textarea");
      el.value = content;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "복사됐어요" : label}
        className={`w-full min-h-[56px] rounded-2xl text-white text-lg font-bold px-6 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2 ${
          copied ? "bg-[#10B981]" : "bg-[#4F46E5] hover:bg-[#4338CA]"
        }`}
      >
        {copied ? (
          <>
            <span aria-hidden="true">✅</span>
            복사됐어요
          </>
        ) : (
          <>
            <span aria-hidden="true">📋</span>
            {label}
          </>
        )}
      </button>

      {/* 스크린 리더용 토스트 알림 — output 요소가 role="status" + aria-live 내재 */}
      <output aria-live="polite" aria-atomic="true" className="sr-only">
        {copied ? "클립보드에 복사됐어요." : ""}
      </output>
    </div>
  );
}
