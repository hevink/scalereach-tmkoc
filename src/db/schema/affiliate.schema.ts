import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./user.schema";
import { workspace } from "./workspace.schema";

// Tracks referral relationships: who referred whom
export const referral = pgTable(
  "referral",
  {
    id: text("id").primaryKey(),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referredUserId: text("referred_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
      .unique(), // A user can only be referred once
    referredWorkspaceId: text("referred_workspace_id")
      .references(() => workspace.id, { onDelete: "set null" }),
    status: text("status").notNull().default("signed_up"), // 'signed_up' | 'converted' (paid)
    createdAt: timestamp("created_at").defaultNow().notNull(),
    convertedAt: timestamp("converted_at"),
  },
  (table) => ({
    referrerIdx: index("idx_referral_referrer").on(table.referrerUserId),
    referredIdx: index("idx_referral_referred").on(table.referredUserId),
    statusIdx: index("idx_referral_status").on(table.status),
  })
);

// Tracks commission earned per payment
export const affiliateCommission = pgTable(
  "affiliate_commission",
  {
    id: text("id").primaryKey(),
    referralId: text("referral_id")
      .notNull()
      .references(() => referral.id, { onDelete: "cascade" }),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    paymentAmountCents: integer("payment_amount_cents").notNull(),
    commissionAmountCents: integer("commission_amount_cents").notNull(), // 25% of payment
    commissionRate: integer("commission_rate").notNull().default(25), // percentage
    status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'paid' | 'rejected'
    paymentId: text("payment_id"), // Dodo payment ID for idempotency
    subscriptionId: text("subscription_id"),
    planName: text("plan_name"),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    referralIdx: index("idx_commission_referral").on(table.referralId),
    referrerIdx: index("idx_commission_referrer").on(table.referrerUserId),
    statusIdx: index("idx_commission_status").on(table.status),
    paymentIdx: index("idx_commission_payment").on(table.paymentId),
    // Fix #3: Unique index on payment_id to prevent duplicate commissions from race conditions
    paymentIdUnique: uniqueIndex("idx_commission_payment_unique").on(table.paymentId),
  })
);

// Relations
export const referralRelations = relations(referral, ({ one, many }) => ({
  referrer: one(user, {
    fields: [referral.referrerUserId],
    references: [user.id],
    relationName: "referrer",
  }),
  referred: one(user, {
    fields: [referral.referredUserId],
    references: [user.id],
    relationName: "referred",
  }),
  workspace: one(workspace, {
    fields: [referral.referredWorkspaceId],
    references: [workspace.id],
  }),
  commissions: many(affiliateCommission),
}));

export const affiliateCommissionRelations = relations(affiliateCommission, ({ one }) => ({
  referral: one(referral, {
    fields: [affiliateCommission.referralId],
    references: [referral.id],
  }),
  referrer: one(user, {
    fields: [affiliateCommission.referrerUserId],
    references: [user.id],
  }),
}));
