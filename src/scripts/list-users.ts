/**
 * Script to list all users
 * Usage: bun run src/scripts/list-users.ts
 */

import { db } from "../db";
import { user } from "../db/schema";
import { desc } from "drizzle-orm";

async function listUsers() {
  console.log("Fetching all users...\n");

  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(50);

  if (users.length === 0) {
    console.log("No users found in the database.");
    process.exit(0);
  }

  console.log(`Found ${users.length} users:\n`);
  console.log("ID\t\t\t\t\tName\t\t\tEmail\t\t\t\tRole");
  console.log("-".repeat(100));

  for (const u of users) {
    const role = u.role || "user";
    console.log(`${u.id}\t${u.name}\t\t${u.email}\t\t${role}`);
  }

  process.exit(0);
}

listUsers();
