import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// @TASK P0-T1 - 워크스페이스 루트 Vitest 설정 (스모크 테스트 골격)
// @SPEC docs/planning/06-tasks.md#P0-T1
//
// 루트 레벨 테스트에서도 @boina/* workspace 패키지를 해석할 수 있도록 alias 를 건다
// (루트 package.json 은 workspace 패키지를 dependency 로 갖지 않음).
// JSX 는 automatic 런타임으로 트랜스폼해 page.tsx 스모크가 React import 없이 렌더되게 한다.
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// P2-flaky(DB 격리): 실 docker PostgreSQL(5435)에 접속하는 통합·E2E 테스트 목록.
// 이들은 병렬 실행 시 같은 PG 에 동시 접속해 커넥션·상태 경합("expected +0 to be 1" 류)으로
// 간헐 실패했다(단독 실행은 항상 통과). 아래 파일만 별도 project 로 묶어 단일 fork 직렬 실행한다.
// 일부 route 테스트는 mock repo 라 DB 미접속이지만, 직렬 포함은 안전(약간 느릴 뿐) — 누락이 위험.
const DB_INTEGRATION_TESTS = [
  "tests/db/schema.test.ts",
  "apps/web/tests/admin/metrics-db-integration.test.ts",
  "apps/web/tests/diagnosis-enqueue.test.ts",
  "apps/web/tests/business/business-db-integration.test.ts",
  "apps/web/tests/diagnosis/action-route.test.ts",
  "apps/web/tests/diagnosis/channel-status-route.test.ts",
  "apps/web/tests/diagnosis/competitor-route.test.ts",
  "apps/web/tests/diagnosis/diagnosis-db-integration.test.ts",
  "apps/web/tests/diagnosis/diagnosis-job-execution-e2e.test.ts",
  "apps/web/tests/diagnosis/diagnosis-persistence-integration.test.ts",
  "apps/web/tests/diagnosis/diagnosis-route-guards.test.ts",
  "apps/web/tests/diagnosis/gap-route.test.ts",
  "apps/web/tests/diagnosis/generated-asset-route.test.ts",
  "apps/web/tests/diagnosis/job-payload-resolver.test.ts",
  "apps/web/tests/diagnosis/jobs-process-route.test.ts",
  "apps/web/tests/integration/anonymous-diagnosis-flow.integration.test.ts",
  "apps/web/tests/integration/screen-navigation-flow.integration.test.ts",
  "apps/web/tests/admin/account-admin-mutations-db.test.ts",
  "apps/web/tests/admin/members-db.test.ts",
];

// 두 project 가 공유하는 test 옵션(엔진 인라인·타임아웃·환경).
const sharedTest = {
  environment: "node" as const,
  // 무거운 @boina/engine 배럴을 Vite 변환 파이프라인으로 인라인(externalize 경쟁 제거).
  server: { deps: { inline: [/@boina\//] } },
  testTimeout: 30000,
  hookTimeout: 30000,
  exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
};

export default defineConfig({
  resolve: {
    // 정렬 주의: 서브경로 alias 가 bare 패키지 alias 보다 먼저 와야 한다
    // (Vitest 는 위에서부터 prefix 매칭하므로 더 구체적인 키를 앞에 둔다).
    // P0-R0: 엔진/contracts 의 package.json "exports" 서브경로를 테스트 런타임에서
    // 해석할 수 있도록 명시적으로 배선한다 (07 §2 경계는 배럴 export 로 유지).
    alias: [
      {
        find: "@boina/engine/snippets/index",
        replacement: r("./packages/engine/src/snippets/index.ts"),
      },
      {
        find: "@boina/engine/v2/serp",
        replacement: r("./packages/engine/src/v2/serp/index.ts"),
      },
      {
        find: "@boina/engine/v2/competitor",
        replacement: r("./packages/engine/src/v2/competitor/index.ts"),
      },
      {
        // P2-R4: GapAnalyzer 배선(FR-012) 검증용 — 엔진 gap 서브경로를 테스트 런타임에서
        // 해석한다(serp/competitor/perf 와 동형). package.json exports 선언은 [OPEN]
        // (오케스트레이터 — packages 변경). 테스트는 실 GapAnalyzer 호출만 검증.
        find: "@boina/engine/v2/gap",
        replacement: r("./packages/engine/src/v2/gap/index.ts"),
      },
      {
        find: "@boina/engine/v2/perf",
        replacement: r("./packages/engine/src/v2/perf/index.ts"),
      },
      {
        find: "@boina/engine",
        replacement: r("./packages/engine/src/index.ts"),
      },
      {
        find: "@boina/contracts/copy/types",
        replacement: r("./packages/contracts/src/copy/types.ts"),
      },
      {
        find: "@boina/contracts/copy/industry-vocab",
        replacement: r("./packages/contracts/src/copy/industry-vocab.ko.ts"),
      },
      {
        find: "@boina/contracts/copy/rule-copy-medium",
        replacement: r("./packages/contracts/src/copy/rule-copy-medium.ko.ts"),
      },
      {
        find: "@boina/contracts/copy/rule-copy",
        replacement: r("./packages/contracts/src/copy/rule-copy.ko.ts"),
      },
      {
        find: "@boina/contracts/copy/render",
        replacement: r("./packages/contracts/src/copy/render.ts"),
      },
      {
        find: "@boina/contracts/copy",
        replacement: r("./packages/contracts/src/copy/index.ts"),
      },
      {
        find: /^@boina\/contracts\/(.*)$/,
        replacement: r("./packages/contracts/src/$1.ts"),
      },
      {
        find: "@boina/contracts",
        replacement: r("./packages/contracts/src/index.ts"),
      },
      {
        find: "@boina/db/client",
        replacement: r("./packages/db/src/client.ts"),
      },
      {
        // P0-T3: @boina/db/schema 는 배럴(schema/index.ts) — 일반 서브경로 규칙보다 먼저.
        find: "@boina/db/schema",
        replacement: r("./packages/db/src/schema/index.ts"),
      },
      {
        find: /^@boina\/db\/(.*)$/,
        replacement: r("./packages/db/src/$1.ts"),
      },
      {
        find: "@boina/db",
        replacement: r("./packages/db/src/index.ts"),
      },
      // P0-T3: @boina/jobs (잡 큐 골격). 서브경로 alias 를 bare 보다 먼저 둔다.
      {
        find: "@boina/jobs/queue",
        replacement: r("./packages/jobs/src/queue/index.ts"),
      },
      {
        find: "@boina/jobs/gating",
        replacement: r("./packages/jobs/src/gating/index.ts"),
      },
      {
        find: "@boina/jobs",
        replacement: r("./packages/jobs/src/index.ts"),
      },
      {
        find: "@radar/keyword-pipeline",
        replacement: r("./packages/keyword-pipeline/src/index.ts"),
      },
      // P2-R1: @boina/web 의 "@/*" 경로 alias (apps/web tsconfig paths 와 일치).
      // Route Handler 단위 테스트가 @/lib/* import 를 해석할 수 있게 한다(앱 구조 불변).
      {
        find: /^@\/(.*)$/,
        replacement: r("./apps/web/$1"),
      },
    ],
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    // 단위(병렬) / DB 통합(직렬) 2개 project 로 분리. extends:true 로 위 resolve.alias·esbuild 상속.
    projects: [
      {
        // 단위·순수 로직 — 병렬 실행(빠름). DB 통합 파일은 제외.
        extends: true,
        test: {
          ...sharedTest,
          name: "unit",
          include: [
            "tests/**/*.{test,spec}.ts",
            "packages/**/*.{test,spec}.ts",
            "apps/**/*.{test,spec}.ts",
          ],
          exclude: [...sharedTest.exclude, ...DB_INTEGRATION_TESTS],
        },
      },
      {
        // DB 통합·E2E — 실 docker PG 접속. 단일 fork 직렬 실행으로 동시접속·상태 경합 제거.
        extends: true,
        test: {
          ...sharedTest,
          name: "db",
          include: DB_INTEGRATION_TESTS,
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
