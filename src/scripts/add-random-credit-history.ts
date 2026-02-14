import { config } from "dotenv";
import { resolve } from "path";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// Load .env from the scalereach-tmkoc directory BEFORE anything else
const envPath = resolve(__dirname, "../../.env");
config({ path: envPath });

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not found in environment!");
  process.exit(1);
}

// Import schema after env is loaded
import * as schema from "../db/schema";

// Create db connection
const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

const { workspace, workspaceCredits, creditTransaction, user } = schema;

// Configuration
const TARGET_EMAIL = "hevinkalathiya123@gmail.com";
const TARGET_WORKSPACE_SLUG = "my-space2";
const NUM_TRANSACTIONS = 20; // Number of random transactions to generate

// Transaction types and their probabilities
const TRANSACTION_TYPES = [
  { type: "purchase", weight: 3, amountRange: [100, 1000] },
  { type: "usage", weight: 5, amountRange: [5, 50] },
  { type: "bonus", weight: 1, amountRange: [50, 200] },
  { type: "refund", weight: 1, amountRange: [10, 100] },
] as const;

const DESCRIPTIONS = {
  purchase: [
    "Credit package purchase",
    "Monthly subscription credits",
    "One-time credit purchase",
    "Starter pack purchase",
    "Pro pack purchase",
  ],
  usage: [
    "Video transcription",
    "Clip generation",
    "AI caption generation",
    "Video processing",
    "Viral analysis",
    "Export to YouTube",
    "Batch clip export",
    "Premium template usage",
  ],
  bonus: [
    "Welcome bonus",
    "Referral bonus",
    "Promotional credits",
    "Beta tester reward",
    "Community contribution bonus",
  ],
  refund: [
    "Failed processing refund",
    "Duplicate charge refund",
    "Service credit",
    "Partial refund",
  ],
};

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomAmount(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomTransactionType() {
  const totalWeight = TRANSACTION_TYPES.reduce((sum, t) => sum + t.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const txType of TRANSACTION_TYPES) {
    random -= txType.weight;
    if (random <= 0) {
      return txType;
    }
  }
  
  return TRANSACTION_TYPES[0];
}

function getRandomDate(daysAgo: number): Date {
  const now = new Date();
  const randomDays = Math.random() * daysAgo;
  const date = new Date(now.getTime() - randomDays * 24 * 60 * 60 * 1000);
  return date;
}

async function addRandomCreditHistory() {
  console.log("🔍 Finding user and workspace...");
  
  // Find user by email
  const users = await db
    .select()
    .from(user)
    .where(eq(user.email, TARGET_EMAIL));
  
  if (users.length === 0) {
    console.error(`❌ User with email ${TARGET_EMAIL} not found!`);
    process.exit(1);
  }
  
  const targetUser = users[0];
  console.log(`✅ Found user: ${targetUser.name} (${targetUser.email})`);
  
  // Find workspace by slug
  const workspaces = await db
    .select()
    .from(workspace)
    .where(eq(workspace.slug, TARGET_WORKSPACE_SLUG));
  
  if (workspaces.length === 0) {
    console.error(`❌ Workspace with slug ${TARGET_WORKSPACE_SLUG} not found!`);
    process.exit(1);
  }
  
  const targetWorkspace = workspaces[0];
  console.log(`✅ Found workspace: ${targetWorkspace.name} (${targetWorkspace.slug})`);
  
  // Check if workspace has credits record
  let existingCredits = await db
    .select()
    .from(workspaceCredits)
    .where(eq(workspaceCredits.workspaceId, targetWorkspace.id));
  
  let currentBalance = 0;
  let lifetimeCredits = 0;
  
  if (existingCredits.length === 0) {
    console.log("📝 Creating initial credits record...");
    await db.insert(workspaceCredits).values({
      id: nanoid(),
      workspaceId: targetWorkspace.id,
      balance: 0,
      lifetimeCredits: 0,
    });
  } else {
    currentBalance = existingCredits[0].balance;
    lifetimeCredits = existingCredits[0].lifetimeCredits;
    console.log(`📊 Current balance: ${currentBalance}, Lifetime: ${lifetimeCredits}`);
  }
  
  // Generate random transactions
  console.log(`\n🎲 Generating ${NUM_TRANSACTIONS} random transactions...\n`);
  
  const transactions = [];
  
  for (let i = 0; i < NUM_TRANSACTIONS; i++) {
    const txType = getRandomTransactionType();
    const amount = getRandomAmount(txType.amountRange[0], txType.amountRange[1]);
    const description = getRandomElement(DESCRIPTIONS[txType.type]);
    const createdAt = getRandomDate(90); // Random date within last 90 days
    
    // Calculate balance change
    let balanceChange = amount;
    if (txType.type === "usage") {
      balanceChange = -amount;
    }
    
    currentBalance += balanceChange;
    
    // Update lifetime credits for purchases and bonuses
    if (txType.type === "purchase" || txType.type === "bonus") {
      lifetimeCredits += amount;
    }
    
    // Ensure balance doesn't go negative
    if (currentBalance < 0) {
      currentBalance = 0;
    }
    
    transactions.push({
      id: nanoid(),
      workspaceId: targetWorkspace.id,
      userId: targetUser.id,
      type: txType.type,
      amount: balanceChange,
      balanceAfter: currentBalance,
      description,
      metadata: JSON.stringify({
        generated: true,
        timestamp: createdAt.toISOString(),
      }),
      createdAt,
    });
    
    console.log(
      `${i + 1}. ${txType.type.toUpperCase().padEnd(10)} | ${balanceChange > 0 ? "+" : ""}${balanceChange.toString().padStart(5)} credits | Balance: ${currentBalance.toString().padStart(5)} | ${description}`
    );
  }
  
  // Sort transactions by date (oldest first)
  transactions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  
  // Recalculate balances in chronological order
  let runningBalance = existingCredits[0]?.balance || 0;
  let runningLifetime = existingCredits[0]?.lifetimeCredits || 0;
  
  for (const tx of transactions) {
    runningBalance += tx.amount;
    if (tx.type === "purchase" || tx.type === "bonus") {
      runningLifetime += Math.abs(tx.amount);
    }
    tx.balanceAfter = runningBalance;
  }
  
  // Insert all transactions
  console.log("\n💾 Inserting transactions into database...");
  await db.insert(creditTransaction).values(transactions);
  
  // Update workspace credits
  console.log("📊 Updating workspace credits balance...");
  await db
    .update(workspaceCredits)
    .set({
      balance: runningBalance,
      lifetimeCredits: runningLifetime,
    })
    .where(eq(workspaceCredits.workspaceId, targetWorkspace.id));
  
  console.log("\n✅ Done!");
  console.log(`📈 Final balance: ${runningBalance} credits`);
  console.log(`📊 Lifetime credits: ${runningLifetime} credits`);
  console.log(`📝 Total transactions added: ${NUM_TRANSACTIONS}`);
  
  process.exit(0);
}

addRandomCreditHistory().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
