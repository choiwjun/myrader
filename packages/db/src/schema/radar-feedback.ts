import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { radarFeedbackTypeEnum } from "../enums.js";
import { businesses } from "./business.js";
import { radarKeywords } from "./radar-keyword.js";
import { radarScans } from "./radar-scan.js";
import { radarSubscriptions } from "./radar-subscription.js";

export const radarFeedback = pgTable(
  "radar_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => radarSubscriptions.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id").references(() => radarScans.id, { onDelete: "set null" }),
    keywordId: uuid("keyword_id").references(() => radarKeywords.id, { onDelete: "set null" }),
    feedbackType: radarFeedbackTypeEnum("feedback_type").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("radar_feedback_subscription_id_idx").on(t.subscriptionId),
    index("radar_feedback_business_id_idx").on(t.businessId),
    index("radar_feedback_scan_id_idx").on(t.scanId),
    index("radar_feedback_keyword_id_idx").on(t.keywordId),
    index("radar_feedback_type_idx").on(t.feedbackType),
  ],
);

export type RadarFeedback = typeof radarFeedback.$inferSelect;
export type NewRadarFeedback = typeof radarFeedback.$inferInsert;
