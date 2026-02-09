import { db } from "../src/db";
import { workspace, workspaceMinutes } from "../src/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

async function fixBillingCycle() {
  console.log("Starting billing cycle fix...");

  try {
    // Get all workspaces with a plan but no billing cycle
    const workspacesWithoutBillingCycle = await db
      .select()
      .from(workspace)
      .where(
        and(
          isNull(workspace.billingCycle),
          sql`${workspace.plan} != 'free'`
        )
      );

    console.log(`Found ${workspacesWithoutBillingCycle.length} workspaces without billing cycle`);

    for (const ws of workspacesWithoutBillingCycle) {
      // Query minutes balance to determine billing cycle
      const minutesData = await db
        .select()
        .from(workspaceMinutes)
        .where(eq(workspaceMinutes.workspaceId, ws.id));

      const minutesTotal = minutesData[0]?.minutesTotal;

      if (!minutesTotal) {
        console.log(`⚠️  Workspace ${ws.id} (${ws.name}) has no minutes data, skipping`);
        continue;
      }

      let billingCycle: "monthly" | "annual" | null = null;

      // Determine billing cycle based on plan and minutes
      if (ws.plan === "starter") {
        if (minutesTotal === 200) {
          billingCycle = "monthly";
        } else if (minutesTotal === 1800) {
          billingCycle = "annual";
        }
      } else if (ws.plan === "pro") {
        if (minutesTotal === 300) {
          billingCycle = "monthly";
        } else if (minutesTotal === 3600) {
          billingCycle = "annual";
        }
      }

      if (billingCycle) {
        await db
          .update(workspace)
          .set({ billingCycle })
          .where(eq(workspace.id, ws.id));

        console.log(`✅ Updated workspace ${ws.id} (${ws.name}) - Plan: ${ws.plan}, Billing: ${billingCycle}, Minutes: ${minutesTotal}`);
      } else {
        console.log(`⚠️  Could not determine billing cycle for workspace ${ws.id} (${ws.name}) - Plan: ${ws.plan}, Minutes: ${minutesTotal}`);
      }
    }

    // Verify results
    console.log("\n=== Verification ===");
    const allPaidWorkspaces = await db
      .select()
      .from(workspace)
      .where(sql`${workspace.plan} != 'free'`);

    for (const ws of allPaidWorkspaces) {
      const minutesData = await db
        .select()
        .from(workspaceMinutes)
        .where(eq(workspaceMinutes.workspaceId, ws.id));
      
      const minutesTotal = minutesData[0]?.minutesTotal;

      console.log(`Workspace: ${ws.name} | Plan: ${ws.plan} | Billing: ${ws.billingCycle || "NULL"} | Minutes: ${minutesTotal || "N/A"}`);
    }

    console.log("\n✅ Billing cycle fix completed!");
  } catch (error) {
    console.error("❌ Error fixing billing cycles:", error);
    throw error;
  }
}

// Run the script
fixBillingCycle()
  .then(() => {
    console.log("Script finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
