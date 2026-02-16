import { db } from "./src/db";
import { backgroundVideo } from "./src/db/schema/background-video.schema";
import { eq, inArray } from "drizzle-orm";
import { R2Service } from "./src/services/r2.service";

/**
 * Delete specific background videos by display name
 */
async function deleteBackgroundVideos() {
  console.log("🗑️  Deleting background videos...\n");

  // Videos to delete (based on display names from screenshot)
  const videosToDelete = [
    "Minecraft 1",
    "GTA 5 - 1",
    "ASMR 1",
    "Subway Run 2",
    "Subway Run 1",
  ];

  console.log(`Looking for ${videosToDelete.length} videos to delete:\n`);
  videosToDelete.forEach((name, i) => {
    console.log(`  ${i + 1}. ${name}`);
  });
  console.log("");

  // Find videos in database
  const videos = await db
    .select()
    .from(backgroundVideo)
    .where(inArray(backgroundVideo.displayName, videosToDelete));

  if (videos.length === 0) {
    console.log("❌ No videos found with those names");
    return;
  }

  console.log(`Found ${videos.length} video(s) in database:\n`);

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    console.log(`\n[${i + 1}/${videos.length}] Deleting: ${video.displayName}`);
    console.log(`   Video ID: ${video.id}`);
    console.log(`   Storage Key: ${video.storageKey}`);
    console.log(`   Thumbnail Key: ${video.thumbnailKey}`);

    try {
      // 1. Delete from R2 (optional - comment out if you want to keep files)
      if (video.storageKey) {
        console.log(`   🗑️  Deleting video from R2...`);
        try {
          await R2Service.deleteFile(video.storageKey);
          console.log(`      ✅ Video deleted from R2`);
        } catch (err) {
          console.log(`      ⚠️  Could not delete video from R2: ${err}`);
        }
      }

      if (video.thumbnailKey) {
        console.log(`   🗑️  Deleting thumbnail from R2...`);
        try {
          await R2Service.deleteFile(video.thumbnailKey);
          console.log(`      ✅ Thumbnail deleted from R2`);
        } catch (err) {
          console.log(`      ⚠️  Could not delete thumbnail from R2: ${err}`);
        }
      }

      // 2. Delete from database
      console.log(`   💾 Deleting from database...`);
      await db
        .delete(backgroundVideo)
        .where(eq(backgroundVideo.id, video.id));
      console.log(`      ✅ Deleted from database`);

      console.log(`   🎉 Successfully deleted: ${video.displayName}`);

    } catch (error) {
      console.error(`   ❌ Error deleting ${video.displayName}:`, error);
      console.log(`   ⏭️  Continuing with next video...\n`);
    }
  }

  console.log("\n\n✅ Deletion complete!");
  console.log(`Deleted ${videos.length} video(s)`);
  console.log("🔄 Refresh your browser to see the changes");
}

// Run the script
deleteBackgroundVideos()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
