/**
 * Seed script for background video categories
 * Run: bun run scripts/seed-background-categories.ts
 */

import { db } from "../src/db";
import { backgroundCategory } from "../src/db/schema/background-video.schema";
import { nanoid } from "nanoid";

const CATEGORIES = [
  { slug: "subway-surfer", displayName: "Subway Surfer", sortOrder: 1 },
  { slug: "minecraft", displayName: "Minecraft", sortOrder: 2 },
  { slug: "asmr", displayName: "ASMR", sortOrder: 3 },
  { slug: "satisfying", displayName: "Satisfying", sortOrder: 4 },
  { slug: "parkour", displayName: "Parkour", sortOrder: 5 },
  { slug: "soap-cutting", displayName: "Soap Cutting", sortOrder: 6 },
  { slug: "slime", displayName: "Slime", sortOrder: 7 },
  { slug: "cooking", displayName: "Cooking", sortOrder: 8 },
];

async function seed() {
  console.log("Seeding background categories...");

  for (const cat of CATEGORIES) {
    try {
      await db.insert(backgroundCategory).values({
        id: nanoid(),
        slug: cat.slug,
        displayName: cat.displayName,
        sortOrder: cat.sortOrder,
        thumbnailUrl: null,
      }).onConflictDoNothing();
      console.log(`  ✓ ${cat.displayName}`);
    } catch (err: any) {
      if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
        console.log(`  - ${cat.displayName} (already exists)`);
      } else {
        console.error(`  ✗ ${cat.displayName}: ${err.message}`);
      }
    }
  }

  console.log("Done!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
