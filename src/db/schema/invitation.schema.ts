import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspace } from "./workspace.schema";
import { user } from "./user.schema";

export const workspaceInvitation = pgTable(
  "workspace_invitation",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"), // 'admin' | 'member'
    token: text("token").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // 'pending' | 'accepted' | 'declined' | 'expired'
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at"),
  },
  (table) => ({
    workspaceIdIdx: index("idx_invitation_workspaceId").on(table.workspaceId),
    emailIdx: index("idx_invitation_email").on(table.email),
    tokenIdx: uniqueIndex("idx_invitation_token").on(table.token),
    statusIdx: index("idx_invitation_status").on(table.status),
    workspaceEmailIdx: uniqueIndex("idx_invitation_workspace_email").on(
      table.workspaceId,
      table.email
    ),
  })
);

// Relations
export const workspaceInvitationRelations = relations(workspaceInvitation, ({ one }) => ({
  workspace: one(workspace, {
    fields: [workspaceInvitation.workspaceId],
    references: [workspace.id],
  }),
  inviter: one(user, {
    fields: [workspaceInvitation.invitedBy],
    references: [user.id],
  }),
}));
