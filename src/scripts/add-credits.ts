import { config } from "dotenv";
import { resolve } from "path";

// Load .env from the scalereach-tmkoc directory
config({ path: resolve(__dirname, "../../.env") });

import { db } from "../db";
import { workspace, workspaceCredits, creditTransaction } from "../db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

async function addCredits() {
  // Get all workspaces
  const workspaces = await db.select().from(workspace);
  console.log("Found workspaces:", workspaces.map(w => ({ id: w.id, name: w.name, slug: w.slug })));

  if (workspaces.length === 0) {
    console.log("No workspaces found!");
    return;
  }

  // Add 1000 credits to each workspace
  for (const ws of workspaces) {
    // Check if workspace has credits record
    const existingCredits = await db
      .select()
      .from(workspaceCredits)
      .where(eq(workspaceCredits.workspaceId, ws.id));

    if (existingCredits.length === 0) {
      // Create new credits record
      await db.insert(workspaceCredits).values({
        id: nanoid(),
        workspaceId: ws.id,
        balance: 1000,
        lifetimeCredits: 1000,
      });
      console.log(`Created credits for workspace ${ws.name}: 1000 credits`);
    } else {
      // Update existing credits
      const newBalance = existingCredits[0].balance + 1000;
      const newLifetime = existingCredits[0].lifetimeCredits + 1000;
      await db
        .update(workspaceCredits)
        .set({ balance: newBalance, lifetimeCredits: newLifetime })
        .where(eq(workspaceCredits.workspaceId, ws.id));
      console.log(`Updated credits for workspace ${ws.name}: ${newBalance} credits (added 1000)`);
    }

    // Add transaction record
    const currentCredits = await db
      .select()
      .from(workspaceCredits)
      .where(eq(workspaceCredits.workspaceId, ws.id));

    await db.insert(creditTransaction).values({
      id: nanoid(),
      workspaceId: ws.id,
      type: "bonus",
      amount: 1000,
      balanceAfter: currentCredits[0].balance,
      description: "Development bonus credits",
    });
    console.log(`Added transaction record for workspace ${ws.name}`);
  }

  console.log("Done!");
  process.exit(0);
}

addCredits().catch(console.error);
