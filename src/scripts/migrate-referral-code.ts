import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function migrate() {
  console.log("🚀 Adding referral_code column + backfilling...\n");

  // 1. Add column
  await pool.query(`
    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "referral_code" text;
  `);
  console.log("✅ Column added\n");

  // 2. Create unique index
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_referral_code"
      ON "user" ("referral_code")
      WHERE "referral_code" IS NOT NULL;
  `);
  console.log("✅ Unique index created\n");

  // 3. Backfill from email prefix
  const { rows: users } = await pool.query(
    `SELECT id, email FROM "user" WHERE referral_code IS NULL`
  );

  console.log(`Found ${users.length} users to backfill\n`);

  for (const u of users) {
    const base = u.email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g, "")
      .slice(0, 25);

    let candidate = base || "user";
    let suffix = 0;

    while (true) {
      const { rows } = await pool.query(
        `SELECT id FROM "user" WHERE referral_code = $1 LIMIT 1`,
        [candidate]
      );
      if (rows.length === 0) break;
      suffix++;
      candidate = `${base}${suffix}`;
    }

    await pool.query(`UPDATE "user" SET referral_code = $1 WHERE id = $2`, [candidate, u.id]);
    console.log(`  ✅ ${u.email} → /r/${candidate}`);
  }

  console.log("\n🎉 Migration complete!");
  await pool.end();
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
