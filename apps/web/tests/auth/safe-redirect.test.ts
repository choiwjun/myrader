// @TASK login-screen - 복귀 경로 안전 검증 단위 테스트 (오픈 리다이렉트 방지)
// @SPEC apps/web/lib/auth/safe-redirect.ts

import { describe, expect, it } from "vitest";
import { DEFAULT_REDIRECT, safeRedirectPath } from "../../lib/auth/safe-redirect";

describe("safeRedirectPath — 내부 경로 허용", () => {
  it("일반 내부 경로는 그대로 통과", () => {
    expect(safeRedirectPath("/settings")).toBe("/settings");
    expect(safeRedirectPath("/settings?returnTo=/x")).toBe("/settings?returnTo=/x");
    expect(safeRedirectPath("/assets?diagnosisId=abc")).toBe("/assets?diagnosisId=abc");
  });
});

describe("safeRedirectPath — 위험 입력 차단(기본값 폴백)", () => {
  it("빈 값/누락 → 기본 복귀", () => {
    expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("   ")).toBe(DEFAULT_REDIRECT);
  });

  it("프로토콜 상대 URL(//host) 차단", () => {
    expect(safeRedirectPath("//evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("//evil.com/path")).toBe(DEFAULT_REDIRECT);
  });

  it("절대 URL(스킴 포함) 차단", () => {
    expect(safeRedirectPath("https://evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("http://evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("javascript:alert(1)")).toBe(DEFAULT_REDIRECT);
  });

  it("역슬래시 트릭(/\\evil) 차단", () => {
    expect(safeRedirectPath("/\\evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("\\\\evil.com")).toBe(DEFAULT_REDIRECT);
  });

  it("경로 내 스킴 변형(/https://evil) 차단", () => {
    expect(safeRedirectPath("/https://evil.com")).toBe(DEFAULT_REDIRECT);
  });

  it("슬래시로 시작하지 않으면 차단", () => {
    expect(safeRedirectPath("settings")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("evil.com")).toBe(DEFAULT_REDIRECT);
  });

  it("커스텀 폴백을 존중한다", () => {
    expect(safeRedirectPath(null, "/")).toBe("/");
    expect(safeRedirectPath("//evil.com", "/")).toBe("/");
  });
});
