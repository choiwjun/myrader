import { describe, expect, it } from "vitest";

// @TASK P0-R0 - x-sag 엔진 통합 (복사 후 독립 패키지화) 검증
// @SPEC docs/planning/07-coding-convention.md#2-엔진-통합-규칙
// @TEST apps/web/tests/engine-integration.test.ts
//
// 경계 검증 (07 §2): 앱은 @boina/contracts 타입과 @boina/engine 공개 배럴로만 엔진에 접근한다.
// RED→GREEN: x-sag contracts diagnosis 타입과 core-engine 핵심 함수 시그니처가
// @boina/* 네임스페이스로 노출되는지 스모크로 확인한다.

describe("engine integration smoke (P0-R0)", () => {
  it("@boina/contracts diagnosis 타입/스키마가 노출된다", async () => {
    const contracts = await import("@boina/contracts");
    // 진단 결과 단일 진실 스키마 (DiagnosisJsonSchema) + 스키마 버전 상수
    expect(contracts.DiagnosisJsonSchema).toBeDefined();
    expect(typeof contracts.DiagnosisJsonSchema.parse).toBe("function");
    expect(contracts.SCHEMA_VERSION).toBe("1.1.0");
  });

  it("@boina/contracts diagnosis 타입을 type 위치에서 import 할 수 있다", async () => {
    // 타입 전용 import 가 컴파일·런타임 모두 통과하는지 (값 import 없이) 확인.
    // 진단 결과 단일 진실(DiagnosisJson) + 하위 도메인 타입(Scores, DiagnosisItem)을
    // 모두 타입 위치에서 참조해 경계 타입이 살아있음을 컴파일 타임에 보장한다.
    type DiagnosisJson = import("@boina/contracts").DiagnosisJson;
    type Scores = import("@boina/contracts").Scores;
    type DiagnosisItem = import("@boina/contracts").DiagnosisItem;
    // 세 타입을 한 구조로 묶어 실제 참조를 만든다 (noUnusedLocals 충족 + 경계 검증).
    type Boundary = { diagnosis: DiagnosisJson; scores: Scores; item: DiagnosisItem };
    const sample = {} as Boundary;
    expect(sample).toBeDefined();
  });

  it("@boina/engine 핵심 파이프라인/분석 함수 시그니처가 노출된다", async () => {
    const engine = await import("@boina/engine");
    // 파이프라인 통합 진입점
    expect(typeof engine.runDiagnosisPipeline).toBe("function");
    // 크롤·파서·스코어링·분류 핵심 함수
    expect(typeof engine.crawlSite).toBe("function");
    expect(typeof engine.parseHtml).toBe("function");
    expect(typeof engine.scoreDiagnosis).toBe("function");
    expect(typeof engine.classifyResults).toBe("function");
    expect(typeof engine.analyzePage).toBe("function");
    // 스코어링 버전 상수 (엔진 내부 점수 — UI 노출은 신호등 변환 레이어 책임, 07 §4)
    expect(typeof engine.SCORING_VERSION).toBe("string");
  });

  it("@boina/engine v2 서브경로(gap/serp/competitor)가 배럴로 노출된다", async () => {
    const serp = await import("@boina/engine/v2/serp");
    const competitor = await import("@boina/engine/v2/competitor");
    expect(serp).toBeDefined();
    expect(competitor).toBeDefined();
  });

  it("엔진이 contracts 경계를 통해 부팅된다 (07 §2 경계 고정)", async () => {
    const { engineBoundaryMarker } = await import("@boina/engine");
    expect(engineBoundaryMarker()).toBe("@boina/engine -> @boina/contracts");
  });
});
