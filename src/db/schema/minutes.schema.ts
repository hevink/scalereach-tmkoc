import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { workspace } from "./workspace.schema";
import { user } from "./user.schema";
import { video } from "./project.schema";

// Workspace minutes balance
export const workspaceMinutes = pgTable(
  "workspace_minutes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" })
      .unique(),
    minutesTotal: integer("minutes_total").notNull().default(0),
    minutesUsed: integer("minutes_used").notNull().default(0),
    minutesRemaining: integer("minutes_remaining").notNull().default(0),
    minutesResetDate: timestamp("minutes_reset_date"),
    expiresAt: timestamp("expires_at"), // Free plan credits expire after 60 days
    editingOperationsUsed: integer("editing_operations_used").notNull().default(0),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("idx_workspace_minutes_workspace_id").on(table.workspaceId),
  })
);

// Minute transactions history
export const minuteTransaction = pgTable(
  "minute_transaction",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    videoId: text("video_id").references(() => video.id, { onDelete: "set null" }),
    type: text("type").notNull(), // 'upload' | 'regenerate' | 'refund' | 'allocation' | 'reset' | 'adjustment'
    minutesAmount: integer("minutes_amount").notNull(), // positive for additions, negative for deductions
    minutesBefore: integer("minutes_before").notNull(),
    minutesAfter: integer("minutes_after").notNull(),
    description: text("description"),
    metadata: text("metadata"), // JSON string for additional data
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("idx_minute_transaction_workspace_id").on(table.workspaceId),
    userIdIdx: index("idx_minute_transaction_user_id").on(table.userId),
    videoIdIdx: index("idx_minute_transaction_video_id").on(table.videoId),
    typeIdx: index("idx_minute_transaction_type").on(table.type),
    createdAtIdx: index("idx_minute_transaction_created_at").on(table.createdAt),
  })
);

// Relations
export const workspaceMinutesRelations = relations(workspaceMinutes, ({ one }) => ({
  workspace: one(workspace, {
    fields: [workspaceMinutes.workspaceId],
    references: [workspace.id],
  }),
}));

export const minuteTransactionRelations = relations(minuteTransaction, ({ one }) => ({
  workspace: one(workspace, {
    fields: [minuteTransaction.workspaceId],
    references: [workspace.id],
  }),
  user: one(user, {
    fields: [minuteTransaction.userId],
    references: [user.id],
  }),
  video: one(video, {
    fields: [minuteTransaction.videoId],
    references: [video.id],
  }),
}));
