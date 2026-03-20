import { db } from "./src/db";
import { backgroundCategory } from "./src/db/schema/background-video.schema";
import { inArray } from "drizzle-orm";

const SLUGS_TO_REMOVE = ["subway-surfer", "fortnite", "trackmania"];

async function run() {
  console.log(`Removing categories: ${SLUGS_TO_REMOVE.join(", ")}`);
  const result = await db
    .delete(backgroundCategory)
    .where(inArray(backgroundCategory.slug, SLUGS_TO_REMOVE))
    .returning();
  console.log(`Deleted ${result.length} categories:`, result.map(c => c.displayName));
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
