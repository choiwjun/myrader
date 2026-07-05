// @TASK trust-set - 홈 랜딩 + 신뢰 전환 풀세트 계약 테스트
// @SPEC docs/planning/05-design-system.md §2 (모바일·큰 버튼·응원 톤·전문용어 0)
// @SPEC docs/planning/05-design-system.md §5 (정직성: 가짜 숫자·후기 0)
// @SPEC docs/planning/DECISION_LOG.md OQ-1 해소: 제품명 = 보이나
//
// Round-B 기존 계약 유지 + trust-set 신규 검증:
//   B-1: 홈(/) 랜딩 — /find 진입 동선 + 정적(DB 접근 0)
//   B-2: 제품명 "보이나" 반영 (AppHeader) + [제품명] 잔여 0
//   B-3: 접근성 — viewport userScalable 허용
//   B-4: getCurrentUser 에러 가시화 분기 (빌드타임 조용 / 런타임 console.error)
//   T-1: 홈 강화 — 4스텝·안심·CTA·베타문구·가짜숫자 부재
//   T-2: SiteFooter — 약관/개인정보 링크 존재, 빈 필드 시 "오픈 전 등록 예정" 표시
//   T-3: /terms, /privacy — 초안 고지박스·핵심 섹션 존재

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = resolve(__dirname, "../..");
const PAGE_TSX = resolve(WEB_ROOT, "app/page.tsx");
const HEADER_TSX = resolve(WEB_ROOT, "app/components/shared/AppHeader.tsx");
// 루트 레이아웃(viewport/폰트) vs 인앱 라우트그룹 레이아웃(AppHeader/SiteFooter/getCurrentUser)
const ROOT_LAYOUT_TSX = resolve(WEB_ROOT, "app/layout.tsx");
const APP_LAYOUT_TSX = resolve(WEB_ROOT, "app/(app)/layout.tsx");
const FOOTER_TSX = resolve(WEB_ROOT, "app/components/shared/SiteFooter.tsx");
const SITE_META_TS = resolve(WEB_ROOT, "lib/shared/site-meta.ts");
const TERMS_TSX = resolve(WEB_ROOT, "app/(app)/terms/page.tsx");
const PRIVACY_TSX = resolve(WEB_ROOT, "app/(app)/privacy/page.tsx");

/** 인라인 CSS(style={{}} · <style>)를 제거해 가시 카피만 남긴다 — CSS % 값 오탐 방지. */
function stripCss(src: string): string {
  return src.replace(/style=\{\{[\s\S]*?\}\}/g, "").replace(/<style>[\s\S]*?<\/style>/g, "");
}

// ── B-1: 홈 랜딩 컴포넌트 ──────────────────────────────────────────────────────

describe("Round-B: B-1 홈 랜딩 (/)", () => {
  it("홈 page 컴포넌트가 export 된다", async () => {
    const source = readFileSync(PAGE_TSX, "utf-8");
    expect(source).toMatch(/export\s+default\s+function\s+\w+/);
  });

  it("홈 page 컴포넌트가 정적이다 (DB 접근 없음 — async 서버 액션/fetch 없음)", () => {
    const source = readFileSync(PAGE_TSX, "utf-8");
    expect(source).not.toMatch(/export\s+default\s+async\s+function/);
    expect(source).not.toMatch(/prisma\.|db\.|getCurrentUser|fetch\(/);
  });

  it("홈 컴포넌트가 /find 로 이동하는 링크/버튼을 포함한다", () => {
    const source = readFileSync(PAGE_TSX, "utf-8");
    expect(source).toMatch(/\/find/);
  });

  it("홈 컴포넌트에 P0-T1 스켈레톤 문구가 없다 (출시 부적합 제거)", () => {
    const source = readFileSync(PAGE_TSX, "utf-8");
    expect(source).not.toContain("모노레포 골격이 부팅되었습니다");
    expect(source).not.toContain("P0-T1");
  });

  it("홈 컴포넌트에 전문용어(SEO/AEO/GEO/진단/분석)가 없다", () => {
    const source = readFileSync(PAGE_TSX, "utf-8");
    expect(source).not.toMatch(/SEO|AEO|GEO|SERP/);
    expect(source).not.toMatch(/"진단"|'진단'|>진단/);
    expect(source).not.toMatch(/"분석"|'분석'|>분석/);
  });

  it("홈 컴포넌트에 점수/인과 단정 문구가 없다", () => {
    const visible = stripCss(readFileSync(PAGE_TSX, "utf-8"));
    expect(visible).not.toMatch(/1위|매출 보장|반드시|확실/);
    expect(visible).not.toMatch(/\d+%|\d+점/);
  });

  it("홈 컴포넌트에 '보이나' 브랜드 또는 응원 카피가 포함된다", () => {
    const source = readFileSync(PAGE_TSX, "utf-8");
    const hasBrand = source.includes("보이나");
    const hasEncouragement =
      source.includes("가게") ||
      source.includes("살펴") ||
      source.includes("도움") ||
      source.includes("찾아");
    expect(hasBrand || hasEncouragement).toBe(true);
  });
});

// ── B-2: 제품명 "보이나" 반영 ────────────────────────────────────────────────

describe("Round-B: B-2 제품명 보이나 반영", () => {
  it("AppHeader 소스에 '[제품명]' 잔여가 없다 (OQ-1 해소)", () => {
    const source = readFileSync(HEADER_TSX, "utf-8");
    expect(source).not.toContain("[제품명]");
  });

  it("AppHeader 소스에 '보이나' 브랜드명이 있다", () => {
    const source = readFileSync(HEADER_TSX, "utf-8");
    expect(source).toContain("보이나");
  });

  it("AppHeader 소스에 [OPEN] OQ-1 주석이 해소 처리됐다", () => {
    const source = readFileSync(HEADER_TSX, "utf-8");
    expect(source).not.toContain("[OPEN] OQ-1");
  });
});

// ── B-3: 접근성 — viewport userScalable 허용 ────────────────────────────────

describe("Round-B: B-3 접근성 viewport", () => {
  it("layout.tsx 에 userScalable: false 가 없다", () => {
    const source = readFileSync(ROOT_LAYOUT_TSX, "utf-8");
    expect(source).not.toContain("userScalable: false");
    expect(source).not.toContain("user-scalable=no");
  });

  it("layout.tsx viewport에 maximumScale 1 제한이 없다", () => {
    const source = readFileSync(ROOT_LAYOUT_TSX, "utf-8");
    expect(source).not.toMatch(/maximumScale:\s*1[,\s\n]/);
  });
});

// ── B-4: getCurrentUser 에러 가시화 ─────────────────────────────────────────

describe("Round-B: B-4 getCurrentUser 에러 가시화", () => {
  it("(app) layout 에 런타임 에러를 console.error로 로깅하는 코드가 있다", () => {
    const source = readFileSync(APP_LAYOUT_TSX, "utf-8");
    expect(source).toContain("console.error");
  });

  it("(app) layout 에 DATABASE_URL 미설정(빌드타임) 판별 분기가 있다", () => {
    const source = readFileSync(APP_LAYOUT_TSX, "utf-8");
    expect(source).toMatch(/DATABASE_URL|buildTime|isBuildTime|build.?time/i);
  });

  it("catch 블록이 모든 에러를 조용히 삼키지 않는다", () => {
    const source = readFileSync(APP_LAYOUT_TSX, "utf-8");
    expect(source).toContain("console.error");
  });
});

// ── T-1: 홈 강화 — 신뢰 전환 풀세트 ─────────────────────────────────────────

describe("trust-set: T-1 홈 강화 랜딩", () => {
  it("히어로에 'AI 검색 시대' 문제의식 응원 카피가 있다", () => {
    const source = readFileSync(PAGE_TSX, "utf-8");
    // 손님이 검색·AI로 가게를 고른다는 문제 환기 + 부드러운 살펴보기 톤
    expect(source).toMatch(/AI한테 물어보고|어떻게 보일까요|살펴/);
  });

  it("4단계 스텝 미리보기가 모두 포함된다", () => {
    const source = readFileSync(PAGE_TSX, "utf-8");
    expect(source).toMatch(/가게 찾기/);
    expect(source).toMatch(/노출 현황 확인/);
    expect(source).toMatch(/이웃과 비교/);
    expect(source).toMatch(/오늘의 한 조치/);
  });

  it("안심 신뢰 배지 4가지가 있다", () => {
    const source = readFileSync(PAGE_TSX, "utf-8");
    expect(source).toMatch(/무료/);
    expect(source).toMatch(/카드 불필요/);
    expect(source).toMatch(/대행사 아님/);
    expect(source).toMatch(/1분/);
  });

  it("CTA 버튼이 /find 링크를 포함한다", () => {
    const source = readFileSync(PAGE_TSX, "utf-8");
    expect(source).toMatch(/href.*\/find/);
    expect(source).toMatch(/살펴보기|진단 시작/);
  });

  it("베타 정직 문구가 있다", () => {
    const source = readFileSync(PAGE_TSX, "utf-8");
    expect(source).toMatch(/베타|BETA/);
  });

  it("가짜 숫자(N개 가게 사용 중 등)가 없다", () => {
    const visible = stripCss(readFileSync(PAGE_TSX, "utf-8"));
    // N개 가게 / N명 등 숫자+단위 패턴 금지
    expect(visible).not.toMatch(/\d+[개명]+\s*(가게|사장님|사용자|회원)/);
    // 퍼센트·점수 표현 금지 (CSS 값은 stripCss 로 제거됨)
    expect(visible).not.toMatch(/\d+[%점]/);
    // 1위 등 순위 단정 금지
    expect(visible).not.toMatch(/1위|매출 보장|반드시 오른다/);
  });
});

// ── T-2: SiteFooter ──────────────────────────────────────────────────────────

describe("trust-set: T-2 SiteFooter", () => {
  it("SiteFooter 컴포넌트 파일이 존재한다", () => {
    const source = readFileSync(FOOTER_TSX, "utf-8");
    expect(source).toMatch(/export\s+function\s+SiteFooter/);
  });

  it("SiteFooter에 이용약관 /terms 링크가 있다", () => {
    const source = readFileSync(FOOTER_TSX, "utf-8");
    expect(source).toMatch(/href.*\/terms/);
    expect(source).toMatch(/이용약관/);
  });

  it("SiteFooter에 개인정보처리방침 /privacy 링크가 있다", () => {
    const source = readFileSync(FOOTER_TSX, "utf-8");
    expect(source).toMatch(/href.*\/privacy/);
    expect(source).toMatch(/개인정보처리방침/);
  });

  it("SiteFooter에 빈 필드 대신 '오픈 전 등록 예정' 표시 로직이 있다", () => {
    const source = readFileSync(FOOTER_TSX, "utf-8");
    expect(source).toMatch(/오픈 전 등록 예정/);
  });

  it("SiteFooter가 (app) layout에 추가되었다", () => {
    const source = readFileSync(APP_LAYOUT_TSX, "utf-8");
    expect(source).toMatch(/SiteFooter/);
  });

  it("SITE_META 파일이 존재하고 serviceName이 보이나이다", () => {
    const source = readFileSync(SITE_META_TS, "utf-8");
    expect(source).toMatch(/serviceName.*보이나/);
  });

  it("SITE_META에 TODO 주석이 있어 오픈 전 필수 항목을 명시한다", () => {
    const source = readFileSync(SITE_META_TS, "utf-8");
    expect(source).toMatch(/TODO.*오픈전 필수/);
  });

  it("SiteFooter가 가짜 회사명·대표명을 하드코딩하지 않는다", () => {
    const source = readFileSync(FOOTER_TSX, "utf-8");
    // SITE_META에서 읽어야 함 — 직접 하드코딩된 가짜 이름 금지
    expect(source).not.toMatch(/홍길동|김대표|주식회사 테스트/);
  });
});

// ── T-3: /terms, /privacy 라우트 ─────────────────────────────────────────────

describe("trust-set: T-3 /terms 이용약관 페이지", () => {
  it("이용약관 page.tsx 파일이 존재하고 default export가 있다", () => {
    const source = readFileSync(TERMS_TSX, "utf-8");
    expect(source).toMatch(/export\s+default\s+function/);
  });

  it("이용약관 페이지에 초안 고지 박스 문구가 있다", () => {
    const source = readFileSync(TERMS_TSX, "utf-8");
    expect(source).toMatch(/초안이며.*정식 오픈 전 최종 검토|초안.*검토 예정/);
  });

  it("이용약관 페이지에 '이용약관' 제목이 있다", () => {
    const source = readFileSync(TERMS_TSX, "utf-8");
    expect(source).toMatch(/이용약관/);
  });

  it("이용약관 페이지는 현재 결제 기능을 제공하지 않는다고 명시한다", () => {
    const source = readFileSync(TERMS_TSX, "utf-8");
    expect(source).toMatch(/현재 서비스는 결제 기능을 제공하지 않습니다/);
    expect(source).not.toMatch(/토스|토스페이먼츠/);
  });

  it("이용약관 페이지에 면책 조항이 있다", () => {
    const source = readFileSync(TERMS_TSX, "utf-8");
    expect(source).toMatch(/면책|보장하지 않/);
  });

  it("이용약관 페이지에 홈 또는 개인정보 링크가 있다", () => {
    const source = readFileSync(TERMS_TSX, "utf-8");
    expect(source).toMatch(/href.*\//);
  });

  it("이용약관 페이지가 SITE_META를 참조하고 빈 필드를 '오픈 전 등록 예정'으로 표시한다", () => {
    const source = readFileSync(TERMS_TSX, "utf-8");
    expect(source).toMatch(/SITE_META/);
    expect(source).toMatch(/오픈 전 등록 예정/);
  });

  it("이용약관 페이지는 정적이다 (DB 접근 없음)", () => {
    const source = readFileSync(TERMS_TSX, "utf-8");
    expect(source).not.toMatch(/prisma\.|db\.|getCurrentUser|fetch\(/);
  });
});

describe("trust-set: T-3 /privacy 개인정보처리방침 페이지", () => {
  it("개인정보처리방침 page.tsx 파일이 존재하고 default export가 있다", () => {
    const source = readFileSync(PRIVACY_TSX, "utf-8");
    expect(source).toMatch(/export\s+default\s+function/);
  });

  it("개인정보처리방침 페이지에 초안 고지 박스 문구가 있다", () => {
    const source = readFileSync(PRIVACY_TSX, "utf-8");
    expect(source).toMatch(/초안이며.*정식 오픈 전 최종 검토|초안.*검토 예정/);
  });

  it("개인정보처리방침 페이지에 수집 항목(가게명/이메일)이 있다", () => {
    const source = readFileSync(PRIVACY_TSX, "utf-8");
    expect(source).toMatch(/가게 이름|가게명/);
    expect(source).toMatch(/이메일/);
  });

  it("개인정보처리방침 페이지는 결제 정보와 결제대행 제3자 제공이 없다고 명시한다", () => {
    const source = readFileSync(PRIVACY_TSX, "utf-8");
    expect(source).toMatch(/결제 정보는 현재 수집하지 않습니다/);
    expect(source).toMatch(/결제 대행사나 외부 알림 사업자에게 개인정보를 제공하지 않습니다/);
    expect(source).not.toMatch(/토스|토스페이먼츠/);
  });

  it("개인정보처리방침 페이지에 이용자 권리 조항이 있다", () => {
    const source = readFileSync(PRIVACY_TSX, "utf-8");
    expect(source).toMatch(/권리|열람|삭제|정지/);
  });

  it("개인정보처리방침 페이지에 홈 또는 약관 링크가 있다", () => {
    const source = readFileSync(PRIVACY_TSX, "utf-8");
    expect(source).toMatch(/href.*\//);
  });

  it("개인정보처리방침 페이지가 SITE_META를 참조하고 빈 필드를 '오픈 전 등록 예정'으로 표시한다", () => {
    const source = readFileSync(PRIVACY_TSX, "utf-8");
    expect(source).toMatch(/SITE_META/);
    expect(source).toMatch(/오픈 전 등록 예정/);
  });

  it("개인정보처리방침 페이지는 정적이다 (DB 접근 없음)", () => {
    const source = readFileSync(PRIVACY_TSX, "utf-8");
    expect(source).not.toMatch(/prisma\.|db\.|getCurrentUser|fetch\(/);
  });
});
