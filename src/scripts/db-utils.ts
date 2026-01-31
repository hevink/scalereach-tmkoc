#!/usr/bin/env npx tsx
/**
 * Database Utility Scripts
 * 
 * Usage:
 *   npx tsx src/scripts/db-utils.ts <command> [args]
 * 
 * Commands:
 *   list-users                    - List all users
 *   list-workspaces               - List all workspaces
 *   reset-onboarding <userId>     - Reset user onboarding (delete workspaces + set isOnboarded=false)
 *   delete-workspaces <userId>    - Delete all workspaces for a user
 *   set-onboarded <userId> <true|false> - Set user onboarding status
 *   user-info <userId>            - Get user details
 *   workspace-info <workspaceId>  - Get workspace details
 */

import "dotenv/config";
import { db } from "../db";
import { workspace, workspaceMember } from "../db/schema/workspace.schema";
import { user } from "../db/schema/user.schema";
import { eq } from "drizzle-orm";

const commands: Record<string, (args: string[]) => Promise<void>> = {
  "list-users": async () => {
    const users = await db.select({
      id: user.id,
      name: user.name,
      email: user.email,
      isOnboarded: user.isOnboarded,
      createdAt: user.createdAt,
    }).from(user);
    console.table(users);
  },

  "list-workspaces": async () => {
    const workspaces = await db.select({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      ownerId: workspace.ownerId,
      plan: workspace.plan,
      createdAt: workspace.createdAt,
    }).from(workspace);
    console.table(workspaces);
  },

  "reset-onboarding": async (args) => {
    const userId = args[0];
    if (!userId) {
      console.error("Error: userId is required");
      console.log("Usage: npx tsx src/scripts/db-utils.ts reset-onboarding <userId>");
      process.exit(1);
    }

    console.log(`Resetting onboarding for user: ${userId}`);

    // Delete workspace members
    const deletedMembers = await db
      .delete(workspaceMember)
      .where(eq(workspaceMember.userId, userId))
      .returning();
    console.log(`Deleted ${deletedMembers.length} workspace memberships`);

    // Delete workspaces
    const deletedWorkspaces = await db
      .delete(workspace)
      .where(eq(workspace.ownerId, userId))
      .returning();
    console.log(`Deleted ${deletedWorkspaces.length} workspaces`);

    // Set isOnboarded to false
    const updatedUser = await db
      .update(user)
      .set({ isOnboarded: false })
      .where(eq(user.id, userId))
      .returning({ id: user.id, isOnboarded: user.isOnboarded });
    
    if (updatedUser.length === 0) {
      console.error("User not found!");
    } else {
      console.log(`Set isOnboarded to false for user: ${updatedUser[0].id}`);
    }
  },

  "delete-workspaces": async (args) => {
    const userId = args[0];
    if (!userId) {
      console.error("Error: userId is required");
      process.exit(1);
    }

    const deletedMembers = await db
      .delete(workspaceMember)
      .where(eq(workspaceMember.userId, userId))
      .returning();
    console.log(`Deleted ${deletedMembers.length} workspace memberships`);

    const deletedWorkspaces = await db
      .delete(workspace)
      .where(eq(workspace.ownerId, userId))
      .returning();
    console.log(`Deleted ${deletedWorkspaces.length} workspaces`);
  },

  "set-onboarded": async (args) => {
    const [userId, value] = args;
    if (!userId || !value) {
      console.error("Error: userId and value (true/false) are required");
      console.log("Usage: npx tsx src/scripts/db-utils.ts set-onboarded <userId> <true|false>");
      process.exit(1);
    }

    const isOnboarded = value === "true";
    const updated = await db
      .update(user)
      .set({ isOnboarded })
      .where(eq(user.id, userId))
      .returning({ id: user.id, isOnboarded: user.isOnboarded });

    if (updated.length === 0) {
      console.error("User not found!");
    } else {
      console.log(`Updated user ${updated[0].id}: isOnboarded = ${updated[0].isOnboarded}`);
    }
  },

  "user-info": async (args) => {
    const userId = args[0];
    if (!userId) {
      console.error("Error: userId is required");
      process.exit(1);
    }

    const users = await db.select().from(user).where(eq(user.id, userId));
    if (users.length === 0) {
      console.error("User not found!");
    } else {
      console.log("\nUser Info:");
      console.table(users);

      const workspaces = await db
        .select()
        .from(workspace)
        .where(eq(workspace.ownerId, userId));
      console.log("\nOwned Workspaces:");
      console.table(workspaces);

      const memberships = await db
        .select()
        .from(workspaceMember)
        .where(eq(workspaceMember.userId, userId));
      console.log("\nWorkspace Memberships:");
      console.table(memberships);
    }
  },

  "workspace-info": async (args) => {
    const workspaceId = args[0];
    if (!workspaceId) {
      console.error("Error: workspaceId is required");
      process.exit(1);
    }

    const workspaces = await db
      .select()
      .from(workspace)
      .where(eq(workspace.id, workspaceId));
    
    if (workspaces.length === 0) {
      console.error("Workspace not found!");
    } else {
      console.log("\nWorkspace Info:");
      console.table(workspaces);

      const members = await db
        .select()
        .from(workspaceMember)
        .where(eq(workspaceMember.workspaceId, workspaceId));
      console.log("\nMembers:");
      console.table(members);
    }
  },
};

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  if (!command || !commands[command]) {
    console.log(`
Database Utility Scripts

Usage: npx tsx src/scripts/db-utils.ts <command> [args]

Commands:
  list-users                         List all users
  list-workspaces                    List all workspaces
  reset-onboarding <userId>          Reset user onboarding (delete workspaces + set isOnboarded=false)
  delete-workspaces <userId>         Delete all workspaces for a user
  set-onboarded <userId> <true|false> Set user onboarding status
  user-info <userId>                 Get user details with workspaces
  workspace-info <workspaceId>       Get workspace details with members
`);
    process.exit(1);
  }

  try {
    await commands[command](args);
  } catch (error: any) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
