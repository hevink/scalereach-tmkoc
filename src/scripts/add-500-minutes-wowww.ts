// bun run src/scripts/add-500-minutes-wowww.ts

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../../.env.production") });

import { Pool } from "@neondatabase/serverless";
import { nanoid } from "nanoid";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: workspaces } = await pool.query(
    `SELECT id, name FROM workspace WHERE slug = $1`, ["wowww"]
  );
  if (workspaces.length === 0) { console.log("Workspace 'wowww' not found!"); process.exit(1); }
  const ws = workspaces[0];
  console.log(`Found workspace: ${ws.name} (${ws.id})`);

  const { rows: mins } = await pool.query(
    `SELECT id, minutes_total, minutes_used, minutes_remaining FROM workspace_minutes WHERE workspace_id = $1`, [ws.id]
  );

  let minutesBefore: number;

  if (mins.length === 0) {
    await pool.query(
      `INSERT INTO workspace_minutes (id, workspace_id, minutes_total, minutes_used, minutes_remaining) VALUES ($1, $2, 500, 0, 500)`,
      [nanoid(), ws.id]
    );
    minutesBefore = 0;
    console.log("Created minutes record: 500 total, 500 remaining");
  } else {
    minutesBefore = mins[0].minutes_remaining;
    const newTotal = mins[0].minutes_total + 500;
    const newRemaining = mins[0].minutes_remaining + 500;
    await pool.query(
      `UPDATE workspace_minutes SET minutes_total = $1, minutes_remaining = $2 WHERE workspace_id = $3`,
      [newTotal, newRemaining, ws.id]
    );
    console.log(`Updated minutes: remaining ${mins[0].minutes_remaining} → ${newRemaining}, total ${mins[0].minutes_total} → ${newTotal}`);
  }

  const { rows: current } = await pool.query(
    `SELECT minutes_remaining FROM workspace_minutes WHERE workspace_id = $1`, [ws.id]
  );

  await pool.query(
    `INSERT INTO minute_transaction (id, workspace_id, type, minutes_amount, minutes_before, minutes_after, description) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [nanoid(), ws.id, "allocation", 500, minutesBefore, current[0].minutes_remaining, "Manual bonus: 500 minutes for wowww workspace"]
  );
  console.log("Transaction recorded. Done!");

  await pool.end();
  process.exit(0);
}

main().catch(console.error);
