/**
 * Script to make a user an admin
 * Usage: bun run src/scripts/make-admin.ts <email>
 */

import { db } from "../db";
import { user } from "../db/schema";
import { eq } from "drizzle-orm";

async function makeAdmin(email: string) {
  if (!email) {
    console.error("Usage: bun run src/scripts/make-admin.ts <email>");
    process.exit(1);
  }

  console.log(`Looking for user with email: ${email}`);

  const existingUser = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existingUser.length === 0) {
    console.error(`User with email "${email}" not found`);
    process.exit(1);
  }

  const targetUser = existingUser[0];
  console.log(`Found user: ${targetUser.name} (${targetUser.email})`);
  console.log(`Current role: ${targetUser.role || "user"}`);

  if (targetUser.role === "admin") {
    console.log("User is already an admin!");
    process.exit(0);
  }

  const result = await db
    .update(user)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(user.id, targetUser.id))
    .returning();

  console.log(`✅ User "${result[0].name}" is now an admin!`);
  process.exit(0);
}

const email = process.argv[2];
makeAdmin(email);
