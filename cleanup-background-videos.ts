import { db } from "./src/db";
import { backgroundVideo, backgroundCategory } from "./src/db/schema/background-video.schema";
import { eq, and, not, inArray } from "drizzle-orm";

async function cleanupBackgroundVideos() {
  console.log("🧹 Cleaning up background videos...\n");

  try {
    // Get the Subway Surfer category
    const subwaySurferCategory = await db
      .select()
      .from(backgroundCategory)
      .where(eq(backgroundCategory.slug, "subway-surfer"))
      .limit(1);

    if (subwaySurferCategory.length === 0) {
      console.log("❌ Subway Surfer category not found");
      return;
    }

    const categoryId = subwaySurferCategory[0].id;
    console.log(`✅ Found Subway Surfer category: ${categoryId}\n`);

    // Get all Subway Surfer videos
    const subwaySurferVideos = await db
      .select()
      .from(backgroundVideo)
      .where(eq(backgroundVideo.categoryId, categoryId))
      .orderBy(backgroundVideo.createdAt);

    console.log(`📹 Found ${subwaySurferVideos.length} Subway Surfer videos:`);
    subwaySurferVideos.forEach((v, i) => {
      console.log(`   ${i + 1}. ${v.displayName} (${v.id})`);
    });

    // Keep only the last 2
    const videosToKeep = subwaySurferVideos.slice(-2);
    const videosToDelete = subwaySurferVideos.slice(0, -2);

    console.log(`\n✅ Keeping last 2 videos:`);
    videosToKeep.forEach((v) => {
      console.log(`   - ${v.displayName} (${v.id})`);
    });

    if (videosToDelete.length > 0) {
      console.log(`\n🗑️  Deleting ${videosToDelete.length} videos:`);
      videosToDelete.forEach((v) => {
        console.log(`   - ${v.displayName} (${v.id})`);
      });

      const idsToDelete = videosToDelete.map((v) => v.id);
      await db
        .delete(backgroundVideo)
        .where(inArray(backgroundVideo.id, idsToDelete));

      console.log(`\n✅ Deleted ${videosToDelete.length} videos`);
    } else {
      console.log(`\n✅ No videos to delete (already have 2 or fewer)`);
    }

    // Delete all videos from other categories
    console.log(`\n🗑️  Deleting all videos from other categories...`);
    const otherCategoryVideos = await db
      .select()
      .from(backgroundVideo)
      .where(not(eq(backgroundVideo.categoryId, categoryId)));

    if (otherCategoryVideos.length > 0) {
      console.log(`   Found ${otherCategoryVideos.length} videos in other categories`);
      await db
        .delete(backgroundVideo)
        .where(not(eq(backgroundVideo.categoryId, categoryId)));
      console.log(`   ✅ Deleted ${otherCategoryVideos.length} videos`);
    } else {
      console.log(`   ✅ No videos in other categories`);
    }

    // Delete all categories except Subway Surfer
    console.log(`\n🗑️  Deleting all categories except Subway Surfer...`);
    const otherCategories = await db
      .select()
      .from(backgroundCategory)
      .where(not(eq(backgroundCategory.slug, "subway-surfer")));

    if (otherCategories.length > 0) {
      console.log(`   Found ${otherCategories.length} other categories`);
      await db
        .delete(backgroundCategory)
        .where(not(eq(backgroundCategory.slug, "subway-surfer")));
      console.log(`   ✅ Deleted ${otherCategories.length} categories`);
    } else {
      console.log(`   ✅ No other categories to delete`);
    }

    console.log("\n\n✅ Cleanup complete!");
    console.log("\n📊 Final state:");
    console.log("   - 1 category: Subway Surfer");
    console.log("   - 2 videos: Last 2 Subway Surfer videos");

  } catch (error) {
    console.error("\n❌ Error during cleanup:", error);
    throw error;
  }
}

cleanupBackgroundVideos();
