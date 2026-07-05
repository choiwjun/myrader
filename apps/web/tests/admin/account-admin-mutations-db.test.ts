import { createDb } from "@boina/db/client";
import { accounts } from "@boina/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbAccountRepository } from "../../lib/auth/account-repository";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

function firstOrThrow<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (!row) throw new Error(`expected at least one ${label} row`);
  return row;
}

describeDb("account admin mutations ↔ DB", () => {
  let db: ReturnType<typeof createDb>;
  let repo: ReturnType<typeof createDbAccountRepository>;
  let id: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    repo = createDbAccountRepository(db);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const row = firstOrThrow(
      await db
        .insert(accounts)
        .values({ email: `adm-mut-${suffix}@example.com`, passwordHash: "x" })
        .returning({ id: accounts.id }),
      "account",
    );
    id = row.id;
  });

  afterAll(async () => {
    await db.delete(accounts).where(eq(accounts.id, id));
  });

  it("setPlan 이 plan 을 바꾼다", async () => {
    expect(await repo.setPlan(id, "basic")).toBe(true);
    const [r] = await db.select({ plan: accounts.plan }).from(accounts).where(eq(accounts.id, id));
    expect(r?.plan).toBe("basic");
  });

  it("setBlocked(true/false) 가 blockedAt 을 토글한다", async () => {
    await repo.setBlocked(id, true);
    let [r] = await db.select({ b: accounts.blockedAt }).from(accounts).where(eq(accounts.id, id));
    expect(r?.b).not.toBeNull();
    await repo.setBlocked(id, false);
    [r] = await db.select({ b: accounts.blockedAt }).from(accounts).where(eq(accounts.id, id));
    expect(r?.b).toBeNull();
  });

  it("revokeSessions 가 sessionsRevokedAt 을 설정한다", async () => {
    expect(await repo.revokeSessions(id)).toBe(true);
    const [r] = await db
      .select({ s: accounts.sessionsRevokedAt })
      .from(accounts)
      .where(eq(accounts.id, id));
    expect(r?.s).not.toBeNull();
  });

  it("setDeleted(true/false) 가 deletedAt 을 토글한다", async () => {
    await repo.setDeleted(id, true);
    let [r] = await db.select({ d: accounts.deletedAt }).from(accounts).where(eq(accounts.id, id));
    expect(r?.d).not.toBeNull();
    await repo.setDeleted(id, false);
    [r] = await db.select({ d: accounts.deletedAt }).from(accounts).where(eq(accounts.id, id));
    expect(r?.d).toBeNull();
  });

  it("없는 id 는 false", async () => {
    expect(await repo.setPlan("00000000-0000-4000-8000-000000000000", "pro")).toBe(false);
  });
});
