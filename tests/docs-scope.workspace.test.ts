import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @TASK G005 - planning docs/package publishing scope regression
// @SPEC docs/planning/02-trd.md#OQ-6, docs/planning/06-tasks.md#scope, docs/planning/07-coding-convention.md#engine-integration
// @TEST tests/docs-scope.workspace.test.ts
//
// 문서와 실제 package manifest를 함께 읽어 현재 SME v1이 workspace-only 패키지 범위임을 고정한다.

const root = process.cwd();

const readText = (path: string) => readFile(join(root, path), "utf8");
const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readText(path)) as T;

type PackageManifest = {
  name: string;
  private?: boolean;
  workspaces?: string[];
  main?: string;
  module?: string;
  types?: string;
  exports?: string | Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const packageManifestPaths = [
  "package.json",
  "apps/web/package.json",
  "packages/contracts/package.json",
  "packages/db/package.json",
  "packages/engine/package.json",
  "packages/jobs/package.json",
  "packages/keyword-pipeline/package.json",
];

const planningDocPaths = [
  "docs/planning/02-trd.md",
  "docs/planning/06-tasks.md",
  "docs/planning/07-coding-convention.md",
];

const rootScopeDocPaths = [
  "README.md",
  "docs/00-overview.md",
  "docs/05-architecture.md",
  "docs/06-tasks.md",
  "docs/planning/HANDOFF-2026-07-06-product-gap-analysis.md",
];

const exportTargets = (manifest: PackageManifest): string[] => {
  const targets = [manifest.main, manifest.module, manifest.types].filter(Boolean) as string[];
  if (typeof manifest.exports === "string") {
    targets.push(manifest.exports);
  } else if (manifest.exports) {
    targets.push(...Object.values(manifest.exports));
  }
  return targets;
};

describe("G005 docs/package scope", () => {
  it("package manifests remain private workspace-only TS source packages", async () => {
    const manifests = await Promise.all(
      packageManifestPaths.map(async (path) => ({
        path,
        manifest: await readJson<PackageManifest>(path),
      })),
    );

    const rootManifest = manifests.find(({ path }) => path === "package.json")?.manifest;
    expect(rootManifest?.workspaces).toEqual(["apps/*", "packages/*"]);

    for (const { path, manifest } of manifests) {
      expect(manifest.private, `${path} must stay private`).toBe(true);

      const targets = exportTargets(manifest);
      expect(targets.every((target) => !target.includes("dist/"))).toBe(true);

      if (path.startsWith("packages/")) {
        expect(targets, `${path} should expose source, not dist artifacts`).toEqual(
          expect.arrayContaining([expect.stringContaining("./src/")]),
        );
      }

      const localDeps = Object.entries(manifest.dependencies ?? {}).filter(
        ([name]) => name.startsWith("@boina/") || name.startsWith("@radar/"),
      );
      for (const [name, version] of localDeps) {
        expect(version, `${path} dependency ${name} must use workspace protocol`).toBe(
          "workspace:*",
        );
      }
    }
  });

  it("planning docs defer publishing instead of requesting a release workflow", async () => {
    const planningDocs = (await Promise.all(planningDocPaths.map(readText))).join("\n");

    expect(planningDocs).toContain("workspace-only");
    expect(planningDocs).toContain("GitHub Packages");
    expect(planningDocs).toMatch(/발행은[\s\S]{0,80}(유예|별도 결정)/);
    expect(planningDocs).toContain("GitHub Actions/release workflow를 추가하지 않는다");
    expect(planningDocs).toContain(
      "release workflow나 GitHub Packages 발행을 현재 범위로 요구하지 않는다",
    );
    expect(planningDocs).not.toContain("unlock→결제→전체 노출");
    expect(planningDocs).not.toContain("버전 태그 시 자동 publish");
    expect(planningDocs).not.toContain("boina 발행 워크플로 추가");
    expect(planningDocs).not.toContain("paywall_gate");
    expect(planningDocs).not.toContain("paid_gap_lock");
    expect(planningDocs).not.toContain("paid_actions_lock");
    expect(planningDocs).not.toContain("paid_assets_lock");
    expect(planningDocs).not.toContain("[유료]");
    expect(planningDocs).not.toContain("나머지 잠금");
  });

  it("docs separate future Creator Radar scope from current SME apps/web scope", async () => {
    const docs = (await Promise.all(rootScopeDocPaths.map(readText))).join("\n");

    expect(docs).toContain("크리에이터판");
    expect(docs).toContain("미래 별도 새 레포");
    expect(docs).toContain("현재 `apps/web` 구현 범위가 아니다");
    expect(docs).toContain("소상공인용 v1");
  });

  it("docs distinguish unpaid Radar scan scheduling from paid billing subscriptions", async () => {
    const docs = (
      await Promise.all(
        [
          ...planningDocPaths,
          "docs/00-overview.md",
          "docs/05-architecture.md",
          "docs/06-tasks.md",
        ].map(readText),
      )
    ).join("\n");

    expect(docs).toContain("radar_subscriptions");
    expect(docs).toContain("무료 `trialing/active` 스캔 예약 리소스");
    expect(docs).toContain("유료 결제/구독 과금");
    expect(docs).toContain("Toss");
    expect(docs).toContain("Kakao/SMS");
    expect(docs).not.toContain("unlock→결제→전체 노출");
  });
});
