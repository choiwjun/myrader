import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { radarScanStatusEnum, radarScanTriggerEnum } from "../enums.js";
import { businesses } from "./business.js";
import { radarSubscriptions } from "./radar-subscription.js";

export const radarScans = pgTable(
  "radar_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => radarSubscriptions.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    trigger: radarScanTriggerEnum("trigger").notNull().default("auto"),
    status: radarScanStatusEnum("status").notNull().default("queued"),
    stageDetail: text("stage_detail"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("radar_scans_subscription_id_idx").on(t.subscriptionId),
    index("radar_scans_business_id_idx").on(t.businessId),
    index("radar_scans_status_idx").on(t.status),
    index("radar_scans_created_at_idx").on(t.createdAt),
  ],
);

export type RadarScan = typeof radarScans.$inferSelect;
export type NewRadarScan = typeof radarScans.$inferInsert;
