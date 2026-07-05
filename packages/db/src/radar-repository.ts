import { and, desc, eq, inArray, lte } from "drizzle-orm";
import type { DbClient } from "./client.js";
import {
  type NewRadarFeedback,
  type NewRadarKeyword,
  type NewRadarScan,
  type NewRadarSubscription,
  businesses,
  radarFeedback,
  radarKeywords,
  radarScans,
  radarSubscriptions,
} from "./schema/index.js";

export interface DueRadarSubscription {
  readonly id: string;
  readonly businessId: string;
  readonly accountId: string | null;
  readonly nextScanAt: Date | null;
}

export interface DueRadarScanTarget {
  readonly subscriptionId: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly region: string | null;
  readonly category: string | null;
  readonly homepageUrl: string | null;
  readonly naverPlaceId: string | null;
}

export function createRadarRepository(db: DbClient) {
  return {
    async upsertSubscription(input: NewRadarSubscription) {
      const [subscription] = await db
        .insert(radarSubscriptions)
        .values(input)
        .onConflictDoUpdate({
          target: radarSubscriptions.businessId,
          set: {
            accountId: input.accountId,
            status: input.status ?? "inactive",
            nextScanAt: input.nextScanAt,
            lastScanAt: input.lastScanAt,
            canceledAt: input.canceledAt,
            updatedAt: new Date(),
          },
        })
        .returning();

      return subscription;
    },

    async findDueSubscriptions(now: Date): Promise<readonly DueRadarSubscription[]> {
      const rows = await db
        .select({
          id: radarSubscriptions.id,
          businessId: radarSubscriptions.businessId,
          accountId: radarSubscriptions.accountId,
          nextScanAt: radarSubscriptions.nextScanAt,
        })
        .from(radarSubscriptions)
        .where(
          and(
            inArray(radarSubscriptions.status, ["active", "trialing"]),
            lte(radarSubscriptions.nextScanAt, now),
          ),
        )
        .orderBy(radarSubscriptions.nextScanAt);

      return rows;
    },

    async findDueScanTargets(now: Date): Promise<readonly DueRadarScanTarget[]> {
      return db
        .select({
          subscriptionId: radarSubscriptions.id,
          businessId: radarSubscriptions.businessId,
          businessName: businesses.name,
          region: businesses.region,
          category: businesses.category,
          homepageUrl: businesses.homepageUrl,
          naverPlaceId: businesses.naverPlaceId,
        })
        .from(radarSubscriptions)
        .innerJoin(businesses, eq(radarSubscriptions.businessId, businesses.id))
        .where(
          and(
            inArray(radarSubscriptions.status, ["active", "trialing"]),
            lte(radarSubscriptions.nextScanAt, now),
          ),
        )
        .orderBy(radarSubscriptions.nextScanAt);
    },

    async findSubscriptionByBusinessId(businessId: string) {
      const [subscription] = await db
        .select()
        .from(radarSubscriptions)
        .where(eq(radarSubscriptions.businessId, businessId))
        .limit(1);

      return subscription ?? null;
    },

    async createScan(input: NewRadarScan) {
      const [scan] = await db.insert(radarScans).values(input).returning();
      return scan;
    },

    async updateScanStatus(
      scanId: string,
      patch: Pick<
        NewRadarScan,
        "status" | "stageDetail" | "errorMessage" | "startedAt" | "finishedAt"
      >,
    ) {
      const [scan] = await db
        .update(radarScans)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(radarScans.id, scanId))
        .returning();

      return scan;
    },

    async latestScanForSubscription(subscriptionId: string) {
      const [scan] = await db
        .select()
        .from(radarScans)
        .where(eq(radarScans.subscriptionId, subscriptionId))
        .orderBy(desc(radarScans.createdAt))
        .limit(1);

      return scan ?? null;
    },

    async insertKeywords(input: readonly NewRadarKeyword[]) {
      if (input.length === 0) {
        return [];
      }
      return db
        .insert(radarKeywords)
        .values([...input])
        .returning();
    },

    async latestKeywordsForSubscription(subscriptionId: string, limit = 5) {
      const [scan] = await db
        .select()
        .from(radarScans)
        .where(eq(radarScans.subscriptionId, subscriptionId))
        .orderBy(desc(radarScans.createdAt))
        .limit(1);

      if (!scan) {
        return [];
      }

      return db
        .select()
        .from(radarKeywords)
        .where(eq(radarKeywords.scanId, scan.id))
        .orderBy(desc(radarKeywords.naverScore), radarKeywords.createdAt)
        .limit(limit);
    },

    async recordFeedback(input: NewRadarFeedback) {
      const [feedback] = await db.insert(radarFeedback).values(input).returning();
      return feedback;
    },
  };
}

export type RadarRepository = ReturnType<typeof createRadarRepository>;
