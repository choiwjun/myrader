import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @TASK P0-T1 - 앱 부팅 스모크 테스트 (RED→GREEN)
// @SPEC docs/planning/06-tasks.md#P0-T1
// @TEST apps/web/tests/smoke.app.test.ts
//
// 최소 부팅 가능한 Next.js 앱: 루트 페이지 컴포넌트가 존재하고 import 가능한지 확인한다.
// 랜딩은 router/state 훅을 쓰는 클라이언트 컴포넌트이므로 node 에서 직접 호출(Page())하면
// React 디스패처가 없어 훅 호출이 throw 한다 → "use client" 선언 + export 형태로 부팅 계약을 고정.
// 또한 앱이 엔진/contracts workspace 패키지를 import 할 수 있는지 확인한다.

const PAGE_TSX = resolve(__dirname, "../app/page.tsx");

describe("app boot smoke (P0-T1)", () => {
  it("루트 page 컴포넌트가 export 된다", async () => {
    const mod = await import("../app/page");
    expect(typeof mod.default).toBe("function");
  });

  it("루트 page 가 클라이언트 컴포넌트로 선언된다 (router/state 훅 사용)", () => {
    const source = readFileSync(PAGE_TSX, "utf-8");
    expect(source).toMatch(/^["']use client["']/m);
  });

  it("앱이 엔진 workspace 패키지를 import 할 수 있다", async () => {
    const engine = await import("@boina/engine");
    expect(engine.ENGINE_PACKAGE).toBe("@boina/engine");
  });
});
