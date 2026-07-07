#!/usr/bin/env node
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const packageDirs = process.argv.slice(2);

if (packageDirs.length === 0) {
  console.error("Usage: node scripts/prepare-package-publish.mjs <package-dir> [...]");
  process.exit(1);
}

const repoRoot = process.cwd();
const packageVersionOverride = process.env.PACKAGE_VERSION?.trim();
const packageByName = new Map();

for (const packageDir of packageDirs) {
  const manifestPath = resolve(repoRoot, packageDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  packageByName.set(manifest.name, {
    version: packageVersionOverride || manifest.version,
  });
}

for (const packageDir of packageDirs) {
  preparePackage(resolve(repoRoot, packageDir));
}

function preparePackage(packageDir) {
  const manifestPath = join(packageDir, "package.json");
  const sourceManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const distDir = join(packageDir, "dist");

  if (!existsSync(distDir)) {
    throw new Error(`Missing dist directory for ${sourceManifest.name}: ${relative(repoRoot, distDir)}`);
  }

  const version = packageVersionOverride || sourceManifest.version;
  const publishManifest = {
    name: sourceManifest.name,
    version,
    type: sourceManifest.type ?? "module",
    description: sourceManifest.description,
    license: sourceManifest.license,
    repository: sourceManifest.repository ?? repositoryFor(packageDir),
    main: "./index.js",
    module: "./index.js",
    types: "./index.d.ts",
    exports: rewriteExports(sourceManifest.exports),
    dependencies: rewriteDependencies(sourceManifest.dependencies),
    peerDependencies: sourceManifest.peerDependencies,
    peerDependenciesMeta: sourceManifest.peerDependenciesMeta,
    publishConfig: sourceManifest.publishConfig ?? {
      registry: "https://npm.pkg.github.com",
    },
  };

  removeEmptyFields(publishManifest);
  writeFileSync(
    join(distDir, "package.json"),
    `${JSON.stringify(publishManifest, null, 2)}\n`,
  );

  const readmePath = join(packageDir, "README.md");
  if (existsSync(readmePath)) {
    copyFileSync(readmePath, join(distDir, "README.md"));
  }
}

function repositoryFor(packageDir) {
  const directory = relative(repoRoot, packageDir).replaceAll("\\", "/");
  return {
    type: "git",
    url: "git+https://github.com/choiwjun/myrader.git",
    directory,
  };
}

function rewriteDependencies(dependencies) {
  if (!dependencies) return undefined;

  const rewritten = {};
  for (const [name, range] of Object.entries(dependencies)) {
    if (typeof range === "string" && range.startsWith("workspace:")) {
      const local = packageByName.get(name);
      if (!local) {
        throw new Error(`Cannot rewrite workspace dependency ${name}; package was not prepared in this batch`);
      }
      rewritten[name] = local.version;
    } else {
      rewritten[name] = range;
    }
  }
  return rewritten;
}

function rewriteExports(exportsField) {
  if (!exportsField) return { ".": exportTarget("./src/index.ts") };
  if (typeof exportsField === "string") return exportTarget(exportsField);

  const rewritten = {};
  for (const [key, value] of Object.entries(exportsField)) {
    rewritten[key] = rewriteExportValue(value);
  }
  rewritten["./package.json"] = "./package.json";
  return rewritten;
}

function rewriteExportValue(value) {
  if (typeof value === "string") return exportTarget(value);
  if (!value || typeof value !== "object") return value;

  const rewritten = {};
  for (const [condition, conditionValue] of Object.entries(value)) {
    rewritten[condition] =
      typeof conditionValue === "string" ? toDistPath(conditionValue) : conditionValue;
  }
  if (!rewritten.types && typeof value.import === "string") {
    rewritten.types = toTypesPath(value.import);
  }
  return rewritten;
}

function exportTarget(sourcePath) {
  const importPath = toDistPath(sourcePath);
  return {
    types: toTypesPath(sourcePath),
    import: importPath,
    default: importPath,
  };
}

function toDistPath(sourcePath) {
  const normalized = stripSourcePrefix(sourcePath);
  return normalized.replace(/\.ts$/, ".js");
}

function toTypesPath(sourcePath) {
  const normalized = stripSourcePrefix(sourcePath);
  return normalized.replace(/\.ts$/, ".d.ts");
}

function stripSourcePrefix(sourcePath) {
  if (!sourcePath.startsWith("./src/")) return sourcePath;
  return `./${sourcePath.slice("./src/".length)}`;
}

function removeEmptyFields(object) {
  for (const key of Object.keys(object)) {
    const value = object[key];
    if (
      value === undefined ||
      value === null ||
      (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
    ) {
      delete object[key];
    }
  }
}
