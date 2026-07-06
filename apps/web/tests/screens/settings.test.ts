// @TASK P2-S7 - 설정 (/settings) 화면 TDD
// @SPEC specs/screens/settings.yaml (S7: REQ-001/007)
// @SPEC .claude/constitutions/nextjs/auth.md (requireAuth — 미인증 차단)

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsPageSource = readFileSync(
  new URL("../../app/(app)/settings/page.tsx", import.meta.url),
  "utf8",
);
const settingsClientSource = readFileSync(
  new URL("../../app/(app)/settings/SettingsClient.tsx", import.meta.url),
  "utf8",
);

function sourceBlock(source: string, marker: string, terminator = "/>") {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(terminator, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("P2-S7: 설정 — auth gate", () => {
  it("server page는 requireAuth를 호출하고 인증 이메일만 클라이언트에 넘긴다", () => {
    expect(settingsPageSource).toContain('import { requireAuth } from "@/lib/auth"');
    expect(settingsPageSource).toContain("const user = await requireAuth();");
    expect(settingsPageSource).toContain("<SettingsClient email={user.email} />");
    expect(settingsPageSource).not.toContain("getCurrentUser()");
  });
});

describe("P2-S7: 설정 — business_info_form", () => {
  it("초기 로드는 settings API의 businessSettings를 폼 상태에 반영한다", () => {
    expect(settingsClientSource).toContain('fetch("/api/settings")');
    expect(settingsClientSource).toContain("json.data.businessSettings");
    expect(settingsClientSource).toContain('setName(biz.name ?? "")');
    expect(settingsClientSource).toContain('setCategory(biz.category ?? "")');
    expect(settingsClientSource).toContain('setRegion(biz.region ?? "")');
    expect(settingsClientSource).toContain('setWebsiteUrl(biz.websiteUrl ?? "")');
  });

  it("초기 로드 실패는 빈 폼으로 숨기지 않고 오류/재시도 패널을 렌더한다", () => {
    expect(settingsClientSource).toContain("loadError");
    expect(settingsClientSource).toContain("setLoadError");
    expect(settingsClientSource).toContain("가게 정보를 불러오지 못했어요");
    expect(settingsClientSource).toContain("다시 불러오기");
    expect(settingsClientSource).toContain("onClick={loadSettings}");
    expect(settingsClientSource).toContain(") : loadError ? (");
  });

  it("저장은 PUT /api/settings와 businessId를 사용하고 businessId 없이는 오류를 노출한다", () => {
    expect(settingsClientSource).toContain('method: "PUT"');
    expect(settingsClientSource).toContain('fetch("/api/settings"');
    expect(settingsClientSource).toContain("businessId: business.businessId");
    expect(settingsClientSource).toContain("가게 정보를 먼저 불러온 뒤 저장해 주세요.");
    expect(settingsClientSource).toContain("disabled={saving || !business?.businessId}");
    expect(settingsClientSource).not.toContain("if (!business?.businessId) return;");
  });

  it("visible form labels are owner-facing Korean, not API field names", () => {
    for (const label of ["가게 이름", "업종", "지역", "네이버 플레이스 연결", "홈페이지"]) {
      expect(settingsClientSource).toContain(label);
    }
    for (const technical of ["homepageUrl", "naverPlaceId"]) {
      expect(sourceBlock(settingsClientSource, "<form", "</form>")).not.toContain(technical);
    }
    expect(settingsClientSource).not.toContain('aria-label="placeUrl');
  });
});

describe("P2-S7: 설정 — account, rediagnose, change-store", () => {
  it("계정 영역은 이메일만 보여주고 민감정보 필드를 렌더하지 않는다", () => {
    expect(settingsClientSource).toContain("현재 로그인 계정");
    expect(settingsClientSource).toContain("{email}");
    expect(settingsClientSource).not.toContain("password");
    expect(settingsClientSource).not.toContain("sessionToken");
  });

  it("다시 살펴보기는 v1 placeholder 안내만 보여준다", () => {
    expect(settingsClientSource).toContain("setShowRediagnosePlaceholder(true)");
    expect(settingsClientSource).toContain("곧 제공돼요");
    expect(settingsClientSource).toContain("다시 살펴보기 기능은 곧 추가될 예정이에요");
    expect(settingsClientSource).not.toContain("/api/diagnosis/retry");
  });

  it("다른 가게 보기 버튼은 /find로 이동하고 diagnosisId를 carry하지 않는다", () => {
    expect(settingsClientSource).toContain('router.push("/find")');
    expect(settingsClientSource).toContain("다른 가게 보기");
    const changeStoreBlock = sourceBlock(settingsClientSource, "다른 가게 보기", "</button>");
    expect(changeStoreBlock).not.toContain("diagnosisId");
  });
});

describe("P2-S7: 설정 — honesty copy", () => {
  it("주요 visible copy는 SettingsClient 실제 소스에 존재하며 순위/매출 보장과 기술 용어를 쓰지 않는다", () => {
    const expectedVisibleCopies = [
      "내 가게 관리",
      "가게의 소중한 정보를 안전하게 관리하세요.",
      "정확한 정보일수록 더 잘 살펴봐 드려요.",
      "저장하기",
      "다른 가게 보기",
      "곧 제공돼요",
    ];

    for (const expectedCopy of expectedVisibleCopies) {
      const sourceIndex = settingsClientSource.indexOf(expectedCopy);
      expect(sourceIndex).toBeGreaterThanOrEqual(0);
      const actualCopy = settingsClientSource.slice(sourceIndex, sourceIndex + expectedCopy.length);
      expect(actualCopy).toBe(expectedCopy);
      expect(actualCopy).not.toMatch(/SEO|AEO|GEO|SERP|snippet|algorithm|businessId|placeUrl/i);
      expect(actualCopy).not.toMatch(/1위|1등|매출|반드시|확실히|보장|무조건/);
    }
  });

  it("모바일 버튼은 52px 이상 터치 타겟을 유지한다", () => {
    expect(settingsClientSource).toContain("h-12 w-full");
    expect(settingsClientSource).toContain("min-h-[52px]");
  });
});
