/**
 * @TASK P0-T2 - Database Schema Tests (TDD)
 * @SPEC docs/planning/04-database-design.md
 *
 * RED → GREEN → REFACTOR cycle:
 * This test will FAIL until migrations are applied to the database.
 */

import { createDb } from "@boina/db";
import { beforeAll, describe, expect, it } from "vitest";

describe("Database Schema (TDD - RED phase)", () => {
  let db: ReturnType<typeof createDb>;

  beforeAll(() => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL not set");
    }
    db = createDb(databaseUrl);
  });

  it("should have accounts table", async () => {
    // RED: This query will fail until migrations are applied
    const result = await db.query.accounts.findMany({ limit: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should have businesses table", async () => {
    const result = await db.query.businesses.findMany({ limit: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should have diagnoses table", async () => {
    const result = await db.query.diagnoses.findMany({ limit: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should have engine_results table", async () => {
    const result = await db.query.engineResults.findMany({ limit: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should have competitors table", async () => {
    const result = await db.query.competitors.findMany({ limit: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should have gap_rows table", async () => {
    const result = await db.query.gapRows.findMany({ limit: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should have generated_assets table", async () => {
    const result = await db.query.generatedAssets.findMany({ limit: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should have actions table", async () => {
    const result = await db.query.actions.findMany({ limit: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});
