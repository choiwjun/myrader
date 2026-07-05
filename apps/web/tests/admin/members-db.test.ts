import { createDb } from "@boina/db/client";
import { accounts, businesses } from "@boina/db/schema";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMemberDetail, listMembers } from "../../lib/admin/members";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

function firstOrThrow<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (!row) throw new Error(`expected at least one ${label} row`);
  return row;
}

describeDb("admin members 조회 ↔ DB", () => {
  let db: ReturnType<typeof createDb>;
  const accIds: string[] = [];
  let email: string;

  beforeAll(async () => {
    db = createDb(DATABASE_URL as string);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    email = `members-${suffix}@example.com`;
    const a = firstOrThrow(
      await db
        .insert(accounts)
        .values({ email, passwordHash: "x", plan: "pro" })
        .returning({ id: accounts.id }),
      "account",
    );
    accIds.push(a.id);
    await db.insert(businesses).values({ name: `mem-biz-${suffix}`, accountId: a.id });
  });
  afterAll(async () => {
    if (accIds.length) await db.delete(accounts).where(inArray(accounts.id, accIds));
  });

  it("listMembers: 이메일 검색으로 시드 계정을 찾고 total>=1", async () => {
    const res = await listMembers(db, { q: email, limit: 20, offset: 0 });
    expect(res.total).toBeGreaterThanOrEqual(1);
    expect(res.rows.some((r) => r.email === email)).toBe(true);
    const me = res.rows.find((r) => r.email === email);
    expect(me?.status).toBe("active");
    expect(me?.plan).toBe("pro");
  });

  it("getMemberDetail: 계정 + 가게 목록 반환", async () => {
    const detail = await getMemberDetail(db, firstOrThrow(accIds, "accId"));
    expect(detail?.account.email).toBe(email);
    expect(detail?.businesses.length).toBeGreaterThanOrEqual(1);
  });

  it("getMemberDetail: 없는 id 는 null", async () => {
    expect(await getMemberDetail(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
