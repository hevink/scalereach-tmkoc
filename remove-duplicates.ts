import { db } from "./src/db";
import { backgroundVideo } from "./src/db/schema/background-video.schema";
import { eq, sql } from "drizzle-orm";
import { R2Service } from "./src/services/r2.service";

/**
 * Find and remove duplicate background videos
 * Keeps the oldest entry (first created) for each display name
 */
async function removeDuplicates() {
  console.log("🔍 Finding duplicate background videos...\n");

  // Get all videos
  const allVideos = await db
    .select()
    .from(backgroundVideo)
    .orderBy(backgroundVideo.displayName, backgroundVideo.createdAt);

  // Group by display name to find duplicates
  const videosByName = new Map<string, typeof allVideos>();
  
  for (const video of allVideos) {
    if (!videosByName.has(video.displayName)) {
      videosByName.set(video.displayName, []);
    }
    videosByName.get(video.displayName)!.push(video);
  }

  // Find duplicates (names with more than 1 entry)
  const duplicates = Array.from(videosByName.entries())
    .filter(([_, videos]) => videos.length > 1);

  if (duplicates.length === 0) {
    console.log("✅ No duplicates found!");
    return;
  }

  console.log(`Found ${duplicates.length} video name(s) with duplicates:\n`);

  let totalDeleted = 0;

  for (const [displayName, videos] of duplicates) {
    console.log(`\n📹 "${displayName}" - ${videos.length} copies found`);
    
    // Sort by creation date (oldest first)
    videos.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Keep the first one (oldest), delete the rest
    const [keep, ...toDelete] = videos;
    
    console.log(`   ✅ Keeping: ${keep.id} (created: ${keep.createdAt})`);
    console.log(`   🗑️  Deleting ${toDelete.length} duplicate(s):`);

    for (let i = 0; i < toDelete.length; i++) {
      const video = toDelete[i];
      console.log(`\n   [${i + 1}/${toDelete.length}] Deleting duplicate:`);
      console.log(`      ID: ${video.id}`);
      console.log(`      Created: ${video.createdAt}`);
      console.log(`      Storage: ${video.storageKey}`);
      console.log(`      Thumbnail: ${video.thumbnailKey}`);

      try {
        // Delete from R2
        if (video.storageKey) {
          try {
            await R2Service.deleteFile(video.storageKey);
            console.log(`      ✅ Video deleted from R2`);
          } catch (err) {
            console.log(`      ⚠️  Could not delete video from R2: ${err}`);
          }
        }

        if (video.thumbnailKey) {
          try {
            await R2Service.deleteFile(video.thumbnailKey);
            console.log(`      ✅ Thumbnail deleted from R2`);
          } catch (err) {
            console.log(`      ⚠️  Could not delete thumbnail from R2: ${err}`);
          }
        }

        // Delete from database
        await db
          .delete(backgroundVideo)
          .where(eq(backgroundVideo.id, video.id));
        console.log(`      ✅ Deleted from database`);
        
        totalDeleted++;

      } catch (error) {
        console.error(`      ❌ Error deleting:`, error);
      }
    }
  }

  console.log("\n\n✅ Duplicate removal complete!");
  console.log(`Deleted ${totalDeleted} duplicate video(s)`);
  console.log("🔄 Refresh your browser to see the changes");
}

// Run the script
removeDuplicates()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
