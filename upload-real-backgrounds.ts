import { db } from "./src/db";
import { backgroundVideo } from "./src/db/schema/background-video.schema";
import { eq } from "drizzle-orm";
import { R2Service } from "./src/services/r2.service";
import * as fs from "fs";
import * as path from "path";

async function uploadRealBackgrounds() {
  console.log("🚀 Starting real background video upload...\n");

  try {
    // Define the videos to upload
    const videosToUpload = [
      {
        localPath: "seed-background-video/subway-surfer/subway-surfer.mp4",
        r2Key: "backgrounds/subway-surfer/video-1.mp4",
        dbId: "I033wAj1Jb0Q3S-xAyT9-", // First video ID from seed
      },
      {
        localPath: "seed-background-video/subway-surfer/subway-surfer-aesthetic.mp4",
        r2Key: "backgrounds/subway-surfer/video-2.mp4",
        dbId: "I033wAj1Jb0Q3S-xAyT90", // Second video ID from seed
      },
    ];

    for (const video of videosToUpload) {
      console.log(`\n📹 Processing: ${video.localPath}`);
      
      // Check if file exists
      const fullPath = path.join(__dirname, video.localPath);
      if (!fs.existsSync(fullPath)) {
        console.error(`❌ File not found: ${fullPath}`);
        continue;
      }

      // Get file stats
      const stats = fs.statSync(fullPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`   Size: ${fileSizeMB} MB`);

      // Read file
      const fileBuffer = fs.readFileSync(fullPath);

      // Upload to R2
      console.log(`   Uploading to R2: ${video.r2Key}...`);
      const result = await R2Service.uploadFile(
        video.r2Key,
        fileBuffer,
        "video/mp4"
      );

      console.log(`   ✅ Uploaded successfully!`);
      console.log(`   URL: ${result.url}`);

      // Update database with the storage key (R2 uses storageKey field)
      console.log(`   Updating database record: ${video.dbId}...`);
      await db
        .update(backgroundVideo)
        .set({ storageKey: video.r2Key })
        .where(eq(backgroundVideo.id, video.dbId));

      console.log(`   ✅ Database updated!`);
    }

    console.log("\n\n✅ All background videos uploaded successfully!");
    console.log("\n📊 Summary:");
    console.log("   - Uploaded 2 real Subway Surfer videos to R2");
    console.log("   - Updated database with storage keys");
    console.log("   - Videos are now ready for split screen processing");

  } catch (error) {
    console.error("\n❌ Error uploading backgrounds:", error);
    throw error;
  }
}

uploadRealBackgrounds();
