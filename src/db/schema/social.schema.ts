import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { workspace } from "./workspace.schema";
import { user } from "./user.schema";
import { viralClip } from "./project.schema";

export const socialAccount = pgTable(
  "social_account",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // tiktok | instagram | youtube | twitter
    platformAccountId: text("platform_account_id").notNull(),
    accountName: text("account_name").notNull(),
    accountHandle: text("account_handle"),
    avatarUrl: text("avatar_url"),
    accessToken: text("access_token").notNull(), // AES-256-GCM encrypted
    refreshToken: text("refresh_token"), // encrypted
    tokenExpiresAt: timestamp("token_expires_at"),
    scopes: text("scopes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("idx_social_account_workspace_id").on(table.workspaceId),
    platformIdx: index("idx_social_account_platform").on(table.platform),
    workspacePlatformIdx: index("idx_social_account_workspace_platform").on(
      table.workspaceId,
      table.platform
    ),
  })
);

export const scheduledPost = pgTable(
  "scheduled_post",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    clipId: text("clip_id")
      .notNull()
      .references(() => viralClip.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // denormalized
    postType: text("post_type").notNull(), // immediate | scheduled | drip
    status: text("status").notNull().default("pending"), // pending | posting | posted | failed | cancelled
    caption: text("caption"),
    hashtags: jsonb("hashtags").$type<string[]>().default([]),
    scheduledAt: timestamp("scheduled_at"), // null = immediate
    dripGroupId: text("drip_group_id"),
    dripOrder: integer("drip_order"),
    platformPostId: text("platform_post_id"),
    platformPostUrl: text("platform_post_url"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    postedAt: timestamp("posted_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("idx_scheduled_post_workspace_id").on(table.workspaceId),
    clipIdIdx: index("idx_scheduled_post_clip_id").on(table.clipId),
    statusIdx: index("idx_scheduled_post_status").on(table.status),
    dripGroupIdx: index("idx_scheduled_post_drip_group").on(table.dripGroupId),
    scheduledAtIdx: index("idx_scheduled_post_scheduled_at").on(table.scheduledAt),
  })
);

export const socialAccountRelations = relations(socialAccount, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [socialAccount.workspaceId],
    references: [workspace.id],
  }),
  posts: many(scheduledPost),
}));

export const scheduledPostRelations = relations(scheduledPost, ({ one }) => ({
  workspace: one(workspace, {
    fields: [scheduledPost.workspaceId],
    references: [workspace.id],
  }),
  clip: one(viralClip, {
    fields: [scheduledPost.clipId],
    references: [viralClip.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [scheduledPost.socialAccountId],
    references: [socialAccount.id],
  }),
  createdByUser: one(user, {
    fields: [scheduledPost.createdBy],
    references: [user.id],
  }),
}));
