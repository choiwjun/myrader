import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { radarSubscriptionStatusEnum } from "../enums.js";
import { accounts } from "./account.js";
import { businesses } from "./business.js";

export const radarSubscriptions = pgTable(
  "radar_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    status: radarSubscriptionStatusEnum("status").notNull().default("inactive"),
    nextScanAt: timestamp("next_scan_at", { withTimezone: true }),
    lastScanAt: timestamp("last_scan_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("radar_subscriptions_business_id_uniq").on(t.businessId),
    index("radar_subscriptions_account_id_idx").on(t.accountId),
    index("radar_subscriptions_status_idx").on(t.status),
    index("radar_subscriptions_next_scan_at_idx").on(t.nextScanAt),
  ],
);

export type RadarSubscription = typeof radarSubscriptions.$inferSelect;
export type NewRadarSubscription = typeof radarSubscriptions.$inferInsert;
