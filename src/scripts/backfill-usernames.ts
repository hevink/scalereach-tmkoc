import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function backfill() {
  console.log("🚀 Backfilling usernames for users without one...\n");

  const { rows: users } = await pool.query(
    `SELECT id, email FROM "user" WHERE username IS NULL OR username = ''`
  );

  console.log(`Found ${users.length} users without usernames\n`);

  for (const user of users) {
    const base = user.email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g, "")
      .slice(0, 25);

    let candidate = base || "user";
    let attempts = 0;

    while (attempts < 10) {
      const { rows } = await pool.query(
        `SELECT id FROM "user" WHERE username = $1 LIMIT 1`,
        [candidate]
      );
      if (rows.length === 0) break;
      attempts++;
      candidate = `${base}${Math.floor(Math.random() * 9000) + 1000}`;
    }

    await pool.query(`UPDATE "user" SET username = $1 WHERE id = $2`, [candidate, user.id]);
    console.log(`  ✅ ${user.email} → ${candidate}`);
  }

  console.log("\n🎉 Backfill complete!");
  await pool.end();
}

backfill().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
