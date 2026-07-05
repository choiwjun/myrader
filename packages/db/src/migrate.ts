import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });

function hashMigration(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function splitStatements(contents: string): string[] {
  return contents
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureLedger(): Promise<void> {
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      "id" serial PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" bigint
    )
  `);
}

async function hasPublicTable(tableName: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS "exists"
  `;
  return rows[0]?.exists ?? false;
}

async function appliedHashes(): Promise<Set<string>> {
  const rows = await sql<{ hash: string }[]>`
    SELECT "hash"
    FROM "drizzle"."__drizzle_migrations"
  `;
  return new Set(rows.map((row) => row.hash));
}

async function recordMigration(hash: string): Promise<void> {
  await sql`
    INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
    VALUES (${hash}, ${Date.now()})
  `;
}

async function applyMigration(file: string, contents: string, hash: string): Promise<void> {
  const statements = splitStatements(contents);
  await sql.begin(async (tx) => {
    for (const statement of statements) {
      await tx.unsafe(statement);
    }
    await tx`
      INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
      VALUES (${hash}, ${Date.now()})
    `;
  });
  console.log(`applied ${file}`);
}

async function main(): Promise<void> {
  await ensureLedger();

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  const applied = await appliedHashes();
  const existingSchema = await hasPublicTable("accounts");

  for (const file of files) {
    const path = join(migrationsDir, file);
    const contents = await readFile(path, "utf8");
    const hash = hashMigration(contents);

    if (applied.has(hash)) {
      console.log(`skipped ${file}`);
      continue;
    }

    if (file.startsWith("0000_") && existingSchema) {
      await recordMigration(hash);
      applied.add(hash);
      console.log(`baselined ${file}`);
      continue;
    }

    await applyMigration(file, contents, hash);
    applied.add(hash);
  }
}

try {
  await main();
} finally {
  await sql.end();
}

console.log(`migrations complete (${basename(migrationsDir)})`);
