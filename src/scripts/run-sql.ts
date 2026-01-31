#!/usr/bin/env npx tsx
/**
 * Generic SQL Runner Script
 * 
 * Usage:
 *   npx tsx src/scripts/run-sql.ts "SELECT * FROM \"user\" LIMIT 5"
 *   npx tsx src/scripts/run-sql.ts "UPDATE \"user\" SET \"isOnboarded\" = false WHERE id = 'xxx'"
 *   npx tsx src/scripts/run-sql.ts "DELETE FROM workspace WHERE \"ownerId\" = 'xxx'"
 * 
 * Note: Use double quotes for table/column names in PostgreSQL
 */

import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

async function runSQL() {
  const query = process.argv[2];

  if (!query) {
    console.log(`
Usage: npx tsx src/scripts/run-sql.ts "<SQL_QUERY>"

Examples:
  # List all users
  npx tsx src/scripts/run-sql.ts "SELECT id, name, email, \\"isOnboarded\\" FROM \\"user\\""

  # Reset user onboarding
  npx tsx src/scripts/run-sql.ts "UPDATE \\"user\\" SET \\"isOnboarded\\" = false WHERE id = 'USER_ID'"

  # Delete workspaces for a user
  npx tsx src/scripts/run-sql.ts "DELETE FROM workspace WHERE \\"ownerId\\" = 'USER_ID'"

  # List workspaces
  npx tsx src/scripts/run-sql.ts "SELECT id, name, slug, \\"ownerId\\" FROM workspace"

  # Count records
  npx tsx src/scripts/run-sql.ts "SELECT COUNT(*) FROM \\"user\\""
`);
    process.exit(1);
  }

  console.log(`\nExecuting SQL:\n${query}\n`);
  console.log("─".repeat(50));

  try {
    const result = await db.execute(sql.raw(query));
    
    if (Array.isArray(result) && result.length > 0) {
      console.table(result);
      console.log(`\nRows returned: ${result.length}`);
    } else if (result && typeof result === "object" && "rowCount" in result) {
      console.log(`Rows affected: ${result.rowCount}`);
    } else {
      console.log("Query executed successfully");
      console.log("Result:", result);
    }
  } catch (error: any) {
    console.error("SQL Error:", error.message);
    process.exit(1);
  }

  process.exit(0);
}

runSQL();
