import { db } from "../src/db";
import { workspace, workspaceMinutes, minuteTransaction } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function resetWorkspace(workspaceSlug: string) {
  console.log(`Starting workspace reset for: ${workspaceSlug}`);

  try {
    // Get workspace by slug
    const workspaceResult = await db
      .select()
      .from(workspace)
      .where(eq(workspace.slug, workspaceSlug));

    if (!workspaceResult[0]) {
      console.error(`❌ Workspace not found: ${workspaceSlug}`);
      process.exit(1);
    }

    const ws = workspaceResult[0];
    console.log(`Found workspace: ${ws.name} (${ws.id})`);

    // 1. Reset workspace plan and billing
    console.log("\n1. Resetting workspace plan...");
    await db
      .update(workspace)
      .set({
        plan: "free",
        billingCycle: null,
        subscriptionId: null,
        subscriptionStatus: null,
        subscriptionRenewalDate: null,
        subscriptionCancelledAt: null,
      })
      .where(eq(workspace.id, ws.id));
    console.log("✅ Workspace plan reset to free");

    // 2. Reset minutes balance
    console.log("\n2. Resetting minutes balance...");
    await db
      .update(workspaceMinutes)
      .set({
        minutesTotal: 50, // Free plan default
        minutesUsed: 0,
        minutesRemaining: 50,
        minutesResetDate: null,
        editingOperationsUsed: 0,
      })
      .where(eq(workspaceMinutes.workspaceId, ws.id));
    console.log("✅ Minutes balance reset to free plan (50 minutes)");

    // 3. Clear minute transaction history (optional - for clean slate)
    console.log("\n3. Clearing minute transaction history...");
    const deletedTransactions = await db
      .delete(minuteTransaction)
      .where(eq(minuteTransaction.workspaceId, ws.id))
      .returning();
    console.log(`✅ Deleted ${deletedTransactions.length} minute transactions`);

    // 4. Verify final state
    console.log("\n=== Final State ===");
    const finalWorkspace = await db
      .select()
      .from(workspace)
      .where(eq(workspace.id, ws.id));

    const finalMinutes = await db
      .select()
      .from(workspaceMinutes)
      .where(eq(workspaceMinutes.workspaceId, ws.id));

    console.log("Workspace:", {
      name: finalWorkspace[0].name,
      plan: finalWorkspace[0].plan,
      billingCycle: finalWorkspace[0].billingCycle,
      subscriptionId: finalWorkspace[0].subscriptionId,
      subscriptionStatus: finalWorkspace[0].subscriptionStatus,
    });

    console.log("Minutes:", {
      total: finalMinutes[0]?.minutesTotal,
      used: finalMinutes[0]?.minutesUsed,
      remaining: finalMinutes[0]?.minutesRemaining,
      resetDate: finalMinutes[0]?.minutesResetDate,
      editingOps: finalMinutes[0]?.editingOperationsUsed,
    });

    console.log("\n✅ Workspace reset completed successfully!");
  } catch (error) {
    console.error("❌ Error resetting workspace:", error);
    throw error;
  }
}

// Get workspace slug from command line or use default
const workspaceSlug = process.argv[2] || "my-space2";

// Run the script
resetWorkspace(workspaceSlug)
  .then(() => {
    console.log("\nScript finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript failed:", error);
    process.exit(1);
  });
