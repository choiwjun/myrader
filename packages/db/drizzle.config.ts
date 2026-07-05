/**
 * Drizzle Kit configuration for @boina/db.
 *
 * The project currently uses hand-written SQL migrations in ./migrations.
 * Apply them with `bun run db:migrate`, which runs src/migrate.ts.
 *
 * `bun run db:generate` is intentionally disabled in package.json to avoid
 * mixing Drizzle-generated metadata with the SQL migration ledger.
 */

import type { Config } from "drizzle-kit";

// Fail fast without using a non-null assertion, so invalid CLI usage reports
// a clear environment problem instead of leaking undefined into Drizzle Kit.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run Drizzle Kit commands.");
}

export default {
  schema: "./src/schema/*.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
} satisfies Config;
