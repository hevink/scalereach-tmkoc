/**
 * Credit Expiry Job
 * Runs daily — finds free-plan workspaces with expired credits and zeroes them out.
 * Expiry is also handled lazily in MinutesModel.getBalance(), but this job
 * ensures expired credits are cleaned up even for inactive workspaces.
 */

import { db } from "../db";
import { workspaceMinutes, minuteTransaction } from "../db/schema/minutes.schema";
import { lte, gt, isNotNull } from "drizzle-orm";

const BATCH_SIZE = 50;

async function expireStaleCredits(): Promise<void> {
  const now = new Date();
  console.log(`[CREDIT EXPIRY] Starting run at ${now.toISOString()}`);

  const expired = await db
    .select({
      id: workspaceMinutes.id,
      workspaceId: workspaceMinutes.workspaceId,
      minutesRemaining: workspaceMinutes.minutesRemaining,
      minutesTotal: workspaceMinutes.minutesTotal,
    })
    .from(workspaceMinutes)
    .where(
      // expiresAt is set and in the past, and there are still remaining minutes
      // @ts-ignore — drizzle lte works on nullable timestamp columns
      lte(workspaceMinutes.expiresAt, now) &&
      gt(workspaceMinutes.minutesRemaining, 0) &&
      isNotNull(workspaceMinutes.expiresAt)
    )
    .limit(BATCH_SIZE);

  if (expired.length === 0) {
    console.log(`[CREDIT EXPIRY] No expired credits found.`);
    return;
  }

  console.log(`[CREDIT EXPIRY] Found ${expired.length} workspace(s) with expired credits.`);

  for (const row of expired) {
    try {
      await db
        .update(workspaceMinutes)
        .set({ minutesRemaining: 0, minutesUsed: row.minutesTotal })
        .where(lte(workspaceMinutes.id, row.id));

      await db.insert(minuteTransaction).values({
        id: Math.random().toString(36).substring(2) + Date.now().toString(36),
        workspaceId: row.workspaceId,
        type: "adjustment",
        minutesAmount: -row.minutesRemaining,
        minutesBefore: row.minutesRemaining,
        minutesAfter: 0,
        description: "Free plan credits expired after 60 days",
      });

      console.log(`[CREDIT EXPIRY] Expired ${row.minutesRemaining} credits for workspace ${row.workspaceId}`);
    } catch (err) {
      console.error(`[CREDIT EXPIRY] Failed for workspace ${row.workspaceId}:`, err);
    }
  }

  console.log(`[CREDIT EXPIRY] Run complete.`);
}

export function startCreditExpiryJob(): void {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  setTimeout(() => {
    expireStaleCredits().catch(err =>
      console.error("[CREDIT EXPIRY] Startup run failed:", err)
    );
  }, 60 * 1000); // 60s delay on startup

  setInterval(() => {
    expireStaleCredits().catch(err =>
      console.error("[CREDIT EXPIRY] Scheduled run failed:", err)
    );
  }, INTERVAL_MS);

  console.log("[CREDIT EXPIRY] Job scheduled — runs every 24h.");
}
