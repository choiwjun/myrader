import { describe, expect, it } from "vitest";

// @TASK P0-T1 - 워크스페이스 스모크 테스트 (RED→GREEN)
// @SPEC docs/planning/06-tasks.md#P0-T1
// @TEST tests/smoke.workspace.test.ts
//
// 빈 패키지 import 가 통과하고 엔진→contracts 경계가 살아있는지 확인한다.

describe("workspace package wiring (P0-T1)", () => {
  it("@boina/contracts 배럴이 import 된다", async () => {
    const contracts = await import("@boina/contracts");
    expect(contracts.CONTRACTS_PACKAGE).toBe("@boina/contracts");
  });

  it("@boina/engine 배럴이 import 된다", async () => {
    const engine = await import("@boina/engine");
    expect(engine.ENGINE_PACKAGE).toBe("@boina/engine");
  });

  it("engine 이 contracts 경계를 통해 부팅된다 (07 §2 경계 고정)", async () => {
    const { engineBoundaryMarker } = await import("@boina/engine");
    expect(engineBoundaryMarker()).toBe("@boina/engine -> @boina/contracts");
  });
});
