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

// Workspace credits balance
export const workspaceCredits = pgTable(
  "workspace_credits",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" })
      .unique(),
    balance: integer("balance").notNull().default(0),
    lifetimeCredits: integer("lifetime_credits").notNull().default(0),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("idx_workspace_credits_workspace_id").on(table.workspaceId),
  })
);

// Credit transactions history
export const creditTransaction = pgTable(
  "credit_transaction",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type").notNull(), // 'purchase' | 'usage' | 'refund' | 'bonus' | 'adjustment'
    amount: integer("amount").notNull(), // positive for credits added, negative for credits used
    balanceAfter: integer("balance_after").notNull(),
    description: text("description"),
    metadata: text("metadata"), // JSON string for additional data (order_id, product_id, etc.)
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("idx_credit_transaction_workspace_id").on(table.workspaceId),
    userIdIdx: index("idx_credit_transaction_user_id").on(table.userId),
    typeIdx: index("idx_credit_transaction_type").on(table.type),
    createdAtIdx: index("idx_credit_transaction_created_at").on(table.createdAt),
  })
);

// Credit packages/products configuration
export const creditPackage = pgTable(
  "credit_package",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    credits: integer("credits").notNull(),
    priceInCents: integer("price_in_cents").notNull(),
    dodoProductId: text("dodo_product_id").notNull().unique(),
    isSubscription: integer("is_subscription").notNull().default(0),
    billingPeriod: text("billing_period"), // 'monthly' | 'yearly' | null for one-time
    isActive: integer("is_active").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }
);

// Relations
export const workspaceCreditsRelations = relations(workspaceCredits, ({ one }) => ({
  workspace: one(workspace, {
    fields: [workspaceCredits.workspaceId],
    references: [workspace.id],
  }),
}));

export const creditTransactionRelations = relations(creditTransaction, ({ one }) => ({
  workspace: one(workspace, {
    fields: [creditTransaction.workspaceId],
    references: [workspace.id],
  }),
  user: one(user, {
    fields: [creditTransaction.userId],
    references: [user.id],
  }),
}));
