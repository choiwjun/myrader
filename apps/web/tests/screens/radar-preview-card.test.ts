import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = resolve(__dirname, "../..");
const CARD_TSX = resolve(WEB_ROOT, "app/components/shared/RadarPreviewCard.tsx");
const PREVIEW_TS = resolve(WEB_ROOT, "lib/radar/radar-preview.ts");
const HOME_TSX = resolve(WEB_ROOT, "app/(app)/home/page.tsx");
const STATUS_TSX = resolve(WEB_ROOT, "app/(app)/status/page.tsx");

describe("A3-1 radar unsubscribed home card", () => {
  it("renders the M-05 radar preview card copy and states", () => {
    const source = readFileSync(CARD_TSX, "utf-8");
    const previewSource = readFileSync(PREVIEW_TS, "utf-8");

    expect(source).toContain("이번 주 손님이 검색한 말");
    expect(source).toContain("글감 만들기");
    expect(source).toContain("매주 검색어 받아보기");
    expect(source).toContain("결제 없이 홈에서 먼저 받아볼 수 있어요");
    expect(source).toContain("/api/radar/subscription");
    expect(source).toContain("/api/radar/feedback");
    expect(source).toContain("썼어요");
    expect(source).toContain("아직요");
    expect(source).toContain("저장됨");
    expect(source).toContain("저장 실패");
    expect(source).toContain("문안 만들기");
    expect(source).toContain("다음 주에도 지켜볼게요");
    expect(source).toContain("다시 시도");
    expect(source).toContain("첫 결과 준비 중");
    expect(source).toContain("/write");
    expect(source).not.toMatch(/Toss|카카오|문자|SMS/i);
    expect(previewSource).toContain("예시 미리보기");
    expect(source).toContain("blur");
    expect(source).toContain('data-testid="radar-preview-card"');
    expect(source).not.toContain("/checkout");
  });

  it("keeps the card free of forbidden jargon and false guarantees", () => {
    const source = readFileSync(CARD_TSX, "utf-8");

    expect(source).not.toMatch(/SEO|AEO|GEO|SERP|LLM|grounded/i);
    expect(source).not.toMatch(/1위|매출 보장|반드시|확실히|무조건/);
  });

  it("mounts radar card ④ on the home surface and removes it from status", () => {
    const homeSource = readFileSync(HOME_TSX, "utf-8");
    const statusSource = readFileSync(STATUS_TSX, "utf-8");

    expect(homeSource).toContain("RadarPreviewCard");
    expect(homeSource).toContain("/api/radar/preview");
    expect(homeSource).toContain("onPreviewChange={setRadarPreview}");
    expect(homeSource).toContain("onRetry={loadSummary}");
    expect(homeSource).toContain("이번 주 사람들이 찾는 말");
    expect(statusSource).not.toContain("<RadarPreviewCard");
  });
});
