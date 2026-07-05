/**
 * @boina/db — Main entry point
 *
 * Public API:
 * - createDb(databaseUrl) — database client factory
 * - All schema types and tables (via schema export)
 *
 * Usage:
 *   import { createDb } from "@boina/db";
 *   import { accounts, diagnoses } from "@boina/db/schema";
 *   const db = createDb(process.env.DATABASE_URL!);
 *   const users = await db.query.accounts.findMany();
 */

export { createDb, type DbClient } from "./client.js";
export { createRadarRepository, type RadarRepository } from "./radar-repository.js";
export * from "./schema/index.js";
