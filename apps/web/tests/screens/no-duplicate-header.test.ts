// @TASK BUGFIX - 내비 중복 제거 회귀 방지 테스트
// @SPEC apps/web/app/(app)/layout.tsx (공통 AppNav — 라우트그룹 layout 단일 렌더)
//
// 반응형 셸 전환: 모바일-430 AppHeader → 풀반응형 AppNav 로 교체. 공통 내비는
// (app)/layout 단일 렌더이며, 각 화면 페이지는 자체 내비/헤더를 렌더하지 않는다.
// 회귀 방지: 각 페이지 파일에 AppNav/AppHeader 렌더 코드가 없는지 정적으로 검증.
//
// RED→GREEN:
//   T1~T7: 각 화면 페이지에 <AppNav/<AppHeader 렌더 없음
//   T8: (app)/layout.tsx 는 공통 AppNav 렌더 (단일 내비 유지 확인)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 인앱 화면·공통 내비는 (app) 라우트 그룹에 있다 (랜딩은 그룹 밖 자체 헤더).
const appDir = join(__dirname, "../../app/(app)");

function readPage(relativePath: string): string {
  return readFileSync(join(appDir, relativePath), "utf-8");
}

// 공통 내비/헤더 JSX 렌더 패턴 — import 선언 제외, 실제 렌더(<AppNav / <AppHeader) 감지.
const RENDER_PATTERN = /<App(?:Nav|Header)[\s/>]/;

describe("내비 중복 렌더 금지 — (app) layout 공통 AppNav 단일 렌더", () => {
  it("T1: find/page.tsx — 공통 내비 렌더 없음 (layout 위임)", () => {
    const src = readPage("find/page.tsx");
    expect(src).not.toMatch(RENDER_PATTERN);
  });

  it("T2: status/page.tsx — 공통 내비 렌더 없음 (layout 위임)", () => {
    const src = readPage("status/page.tsx");
    expect(src).not.toMatch(RENDER_PATTERN);
  });

  it("T3: compare/page.tsx — 공통 내비 렌더 없음 (layout 위임)", () => {
    const src = readPage("compare/page.tsx");
    expect(src).not.toMatch(RENDER_PATTERN);
  });

  it("T4: gap/page.tsx — 공통 내비 렌더 없음 (layout 위임)", () => {
    const src = readPage("gap/page.tsx");
    expect(src).not.toMatch(RENDER_PATTERN);
  });

  it("T5: actions/page.tsx — 공통 내비 렌더 없음 (layout 위임)", () => {
    const src = readPage("actions/page.tsx");
    expect(src).not.toMatch(RENDER_PATTERN);
  });

  it("T6: assets/page.tsx — 공통 내비 렌더 없음 (layout 위임)", () => {
    const src = readPage("assets/page.tsx");
    expect(src).not.toMatch(RENDER_PATTERN);
  });

  it("T7: settings/SettingsClient.tsx — 공통 내비 렌더 없음 (layout 위임)", () => {
    const src = readPage("settings/SettingsClient.tsx");
    expect(src).not.toMatch(RENDER_PATTERN);
  });

  it("T8: (app)/layout.tsx — 공통 AppNav 렌더 있음 (단일 내비 유지 확인)", () => {
    const src = readPage("layout.tsx");
    expect(src).toMatch(/<AppNav[\s/>]/);
  });
});
