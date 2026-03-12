import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../.env.local") });
config({ path: resolve(__dirname, "../../.env") });

import { db } from "../db";
import { workspace, workspaceMinutes, minuteTransaction } from "../db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const WORKSPACE_SLUG = "wowww";
const PRO_MINUTES = 300; // 300 minutes/month for pro plan

async function upgradeToPro() {
  // Find workspace by slug
  const [ws] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.slug, WORKSPACE_SLUG));

  if (!ws) {
    console.error(`Workspace with slug "${WORKSPACE_SLUG}" not found`);
    process.exit(1);
  }

  console.log(`Found workspace: ${ws.name} (${ws.id}) - current plan: ${ws.plan}`);

  // Update workspace plan to pro
  await db
    .update(workspace)
    .set({
      plan: "pro",
      billingCycle: "monthly",
      subscriptionStatus: "active",
      subscriptionRenewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    })
    .where(eq(workspace.id, ws.id));

  console.log(`✓ Updated plan to "pro"`);

  // Upsert workspace_minutes
  const [existing] = await db
    .select()
    .from(workspaceMinutes)
    .where(eq(workspaceMinutes.workspaceId, ws.id));

  if (!existing) {
    await db.insert(workspaceMinutes).values({
      id: nanoid(),
      workspaceId: ws.id,
      minutesTotal: PRO_MINUTES,
      minutesUsed: 0,
      minutesRemaining: PRO_MINUTES,
      minutesResetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    console.log(`✓ Created workspace_minutes with ${PRO_MINUTES} minutes`);
  } else {
    const added = PRO_MINUTES - existing.minutesRemaining;
    await db
      .update(workspaceMinutes)
      .set({
        minutesTotal: PRO_MINUTES,
        minutesRemaining: PRO_MINUTES,
        minutesResetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .where(eq(workspaceMinutes.workspaceId, ws.id));
    console.log(`✓ Updated workspace_minutes to ${PRO_MINUTES} minutes (was ${existing.minutesRemaining} remaining)`);
  }

  // Log a minute transaction for the allocation
  const [mins] = await db
    .select()
    .from(workspaceMinutes)
    .where(eq(workspaceMinutes.workspaceId, ws.id));

  await db.insert(minuteTransaction).values({
    id: nanoid(),
    workspaceId: ws.id,
    type: "allocation",
    minutesAmount: PRO_MINUTES,
    minutesBefore: existing?.minutesRemaining ?? 0,
    minutesAfter: mins.minutesRemaining,
    description: "Pro plan manual upgrade - admin script",
  });

  console.log(`✓ Logged minute transaction`);
  console.log(`\nDone! Workspace "${ws.name}" is now on the Pro plan.`);
  process.exit(0);
}

upgradeToPro().catch((err) => {
  console.error(err);
  process.exit(1);
});
