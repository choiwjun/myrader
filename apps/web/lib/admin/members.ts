// @SPEC docs/superpowers/specs/2026-06-17-admin-member-management-design.md §5,§6
// 관리자 회원 목록/상세 조회. 순수, DbClient 주입. 읽기 전용.

import type { DbClient } from "@boina/db/client";
import { accounts, businesses, diagnoses } from "@boina/db/schema";
import { and, count, desc, eq, ilike, isNotNull, isNull } from "drizzle-orm";

export type MemberStatus = "active" | "blocked" | "deleted";
type Plan = "free" | "basic" | "pro" | "business";

export interface MemberRow {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  status: MemberStatus;
  createdAt: Date;
}

export interface ListMembersInput {
  q?: string;
  plan?: string;
  status?: MemberStatus;
  limit: number;
  offset: number;
}

const PLANS: readonly Plan[] = ["free", "basic", "pro", "business"];
function statusOf(row: { blockedAt: Date | null; deletedAt: Date | null }): MemberStatus {
  if (row.deletedAt) return "deleted";
  if (row.blockedAt) return "blocked";
  return "active";
}

export async function listMembers(
  db: DbClient,
  input: ListMembersInput,
): Promise<{ rows: MemberRow[]; total: number }> {
  const conds = [];
  if (input.q?.trim()) conds.push(ilike(accounts.email, `%${input.q.trim()}%`));
  if (input.plan && (PLANS as readonly string[]).includes(input.plan)) {
    conds.push(eq(accounts.plan, input.plan as Plan));
  }
  if (input.status === "deleted") conds.push(isNotNull(accounts.deletedAt));
  if (input.status === "blocked")
    conds.push(and(isNull(accounts.deletedAt), isNotNull(accounts.blockedAt)));
  if (input.status === "active")
    conds.push(and(isNull(accounts.deletedAt), isNull(accounts.blockedAt)));
  const where = conds.length ? and(...conds) : undefined;

  const limit = Math.min(Math.max(input.limit, 1), 100);
  const base = db
    .select({
      id: accounts.id,
      email: accounts.email,
      name: accounts.name,
      plan: accounts.plan,
      blockedAt: accounts.blockedAt,
      deletedAt: accounts.deletedAt,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .orderBy(desc(accounts.createdAt))
    .limit(limit)
    .offset(Math.max(input.offset, 0));
  const rowsRaw = where ? await base.where(where) : await base;

  const baseCount = db.select({ c: count() }).from(accounts);
  const countRows = where ? await baseCount.where(where) : await baseCount;
  const total = Number(countRows[0]?.c ?? 0);

  return {
    rows: rowsRaw.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      plan: r.plan,
      status: statusOf(r),
      createdAt: r.createdAt,
    })),
    total,
  };
}

export interface MemberBusiness {
  id: string;
  name: string;
  latestStatus: string | null;
  latestAt: Date | null;
}

export interface MemberDetail {
  account: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    plan: string;
    status: MemberStatus;
    createdAt: Date;
  };
  businesses: MemberBusiness[];
}

export async function getMemberDetail(db: DbClient, id: string): Promise<MemberDetail | null> {
  const [acc] = await db
    .select({
      id: accounts.id,
      email: accounts.email,
      name: accounts.name,
      phone: accounts.phone,
      plan: accounts.plan,
      blockedAt: accounts.blockedAt,
      deletedAt: accounts.deletedAt,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  if (!acc) return null;

  const bizRows = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      latestStatus: diagnoses.status,
      latestAt: diagnoses.createdAt,
    })
    .from(businesses)
    .leftJoin(diagnoses, eq(diagnoses.businessId, businesses.id))
    .where(eq(businesses.accountId, id))
    .orderBy(desc(diagnoses.createdAt));

  const seen = new Set<string>();
  const bizs: MemberBusiness[] = [];
  for (const r of bizRows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    bizs.push({
      id: r.id,
      name: r.name,
      latestStatus: r.latestStatus ?? null,
      latestAt: r.latestAt ?? null,
    });
  }

  return {
    account: {
      id: acc.id,
      email: acc.email,
      name: acc.name,
      phone: acc.phone,
      plan: acc.plan,
      status: statusOf(acc),
      createdAt: acc.createdAt,
    },
    businesses: bizs,
  };
}
