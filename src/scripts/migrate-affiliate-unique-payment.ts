import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function migrate() {
  console.log("🚀 Adding unique index on payment_id (fix #3)...\n");

  const sql = `
    -- Fix #3: Unique partial index on payment_id (only for non-null values)
    -- This prevents race condition duplicate commissions for the same payment
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_commission_payment_unique"
      ON "affiliate_commission" ("payment_id")
      WHERE "payment_id" IS NOT NULL;
  `;

  try {
    await pool.query(sql);
    console.log("✅ Unique index on payment_id created");
    console.log("\n🎉 Migration complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
