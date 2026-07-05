/**
 * @boina/db — Database client factory
 *
 * Creates a Drizzle ORM client backed by postgres-js.
 * Call `createDb(databaseUrl)` once at application startup and reuse
 * the returned DbClient throughout the process lifetime.
 *
 * Usage:
 *   import { createDb } from "@boina/db/client";
 *   const db = createDb(process.env.DATABASE_URL!);
 *
 * The `schema` argument passed to `drizzle()` enables the Drizzle
 * relational query API: `db.query.accounts.findMany(...)`.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Create a new Drizzle DB client connected to the given PostgreSQL URL.
 *
 * @param databaseUrl - postgres:// connection string
 * @param options     - optional postgres-js connection options
 */
export function createDb(
  databaseUrl: string,
  options?: postgres.Options<Record<string, postgres.PostgresType>>,
): DbClient {
  const sql = postgres(databaseUrl, {
    max: options?.max ?? 10,
    idle_timeout: options?.idle_timeout ?? 20,
    connect_timeout: options?.connect_timeout ?? 10,
    ...options,
  });

  return drizzle(sql, { schema });
}
