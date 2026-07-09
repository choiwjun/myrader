"use client";

import type { CreatorWeeklyReport } from "@/lib/creator/types";

export function WeeklyReportImageButton({ report }: { readonly report: CreatorWeeklyReport }) {
  function saveImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0a0e1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#4dd8ff";
    ctx.font = "700 44px sans-serif";
    ctx.fillText(`SearchRadar ${report.week}`, 72, 120);
    ctx.fillStyle = "#f6f8ff";
    ctx.font = "800 64px sans-serif";
    ctx.fillText("이번 주 글감 TOP 5", 72, 210);
    report.topKeywords.slice(0, 5).forEach((keyword, index) => {
      const y = 330 + index * 150;
      ctx.fillStyle = index === 0 ? "#ffb020" : "#f6f8ff";
      ctx.font = "700 38px sans-serif";
      ctx.fillText(`${index + 1}. ${keyword.text}`, 72, y);
      ctx.fillStyle = "#9aa6ba";
      ctx.font = "500 24px sans-serif";
      ctx.fillText(`N ${keyword.naverScore} / AI ${keyword.aiScore ?? "대기"}`, 72, y + 44);
      ctx.fillText(keyword.angle.slice(0, 46), 72, y + 84);
    });
    const link = document.createElement("a");
    link.download = `searchradar-${report.week}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.append(link);
    link.click();
    link.remove();
  }

  return (
    <button
      type="button"
      onClick={saveImage}
      className="min-h-11 rounded-xl bg-[var(--creator-signal-ai)] px-4 font-bold text-[#06101c]"
    >
      이미지 저장
    </button>
  );
}
