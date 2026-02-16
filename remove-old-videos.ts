import { db } from "./src/db";
import { backgroundVideo } from "./src/db/schema/background-video.schema";
import { inArray } from "drizzle-orm";

async function removeOldVideos() {
  console.log("🗑️  Removing old video entries...\n");

  const idsToRemove = [
    "YOH2GxbwLqhvUu3CnPfhA", // Old ASMR 1 without thumbnail
    "I033wAj1Jb0Q3S-xAyT9-", // Old Subway Run 2
    "m6Tmr0-XKtslf93NPxkqT", // Old Subway Run 1
  ];

  try {
    console.log("📋 Videos to remove:");
    idsToRemove.forEach((id, i) => {
      console.log(`   ${i + 1}. ${id}`);
    });

    const result = await db
      .delete(backgroundVideo)
      .where(inArray(backgroundVideo.id, idsToRemove))
      .returning();

    console.log(`\n✅ Removed ${result.length} video entries`);
    
    result.forEach((video) => {
      console.log(`   - ${video.displayName} (${video.id})`);
    });

    console.log("\n🎉 Cleanup complete!");

  } catch (error) {
    console.error("\n❌ Error removing videos:", error);
    throw error;
  }
}

removeOldVideos();
