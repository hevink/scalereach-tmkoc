/**
 * Migration script: Migrate existing workspaces from credits to minutes-based system
 *
 * Run with: bun run src/scripts/migrate-credits-to-minutes.ts
 */

import { db } from "../db";
import { workspace } from "../db/schema/workspace.schema";
import { video } from "../db/schema/project.schema";
import { workspaceMinutes } from "../db/schema/minutes.schema";
import { MinutesModel } from "../models/minutes.model";
import { eq, isNotNull } from "drizzle-orm";

async function migrateCreditsToMinutes() {
  console.log("[MIGRATION] Starting credits-to-minutes migration...");

  // Step 1: Get all workspaces
  const workspaces = await db
    .select({
      id: workspace.id,
      plan: workspace.plan,
      subscriptionRenewalDate: workspace.subscriptionRenewalDate,
    })
    .from(workspace);

  console.log(`[MIGRATION] Found ${workspaces.length} workspaces to migrate`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const ws of workspaces) {
    try {
      // Check if already migrated
      const existing = await db
        .select()
        .from(workspaceMinutes)
        .where(eq(workspaceMinutes.workspaceId, ws.id));

      if (existing.length > 0) {
        console.log(`[MIGRATION] Workspace ${ws.id} already migrated, skipping`);
        skipped++;
        continue;
      }

      // Initialize minutes based on plan
      await MinutesModel.initializeBalance(ws.id, ws.plan);

      // If paid plan with renewal date, update the reset date
      if (ws.subscriptionRenewalDate && (ws.plan === "starter" || ws.plan === "pro")) {
        await db
          .update(workspaceMinutes)
          .set({ minutesResetDate: ws.subscriptionRenewalDate })
          .where(eq(workspaceMinutes.workspaceId, ws.id));
      }

      migrated++;
      console.log(`[MIGRATION] Migrated workspace ${ws.id} (plan: ${ws.plan})`);
    } catch (error) {
      errors++;
      console.error(`[MIGRATION] Failed to migrate workspace ${ws.id}:`, error);
    }
  }

  // Step 2: Update video minutesConsumed for videos with known duration
  console.log("[MIGRATION] Updating video minutesConsumed...");

  const videos = await db
    .select({
      id: video.id,
      duration: video.duration,
    })
    .from(video)
    .where(isNotNull(video.duration));

  let videosUpdated = 0;
  for (const v of videos) {
    if (v.duration && v.duration > 0) {
      const minutesConsumed = Math.ceil(v.duration / 60);
      await db
        .update(video)
        .set({ minutesConsumed })
        .where(eq(video.id, v.id));
      videosUpdated++;
    }
  }

  console.log(`[MIGRATION] Updated ${videosUpdated} videos with minutesConsumed`);

  console.log("\n[MIGRATION] Migration complete!");
  console.log(`  Workspaces migrated: ${migrated}`);
  console.log(`  Workspaces skipped (already migrated): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Videos updated: ${videosUpdated}`);
}

// Run migration
migrateCreditsToMinutes()
  .then(() => {
    console.log("[MIGRATION] Done.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[MIGRATION] Fatal error:", error);
    process.exit(1);
  });
