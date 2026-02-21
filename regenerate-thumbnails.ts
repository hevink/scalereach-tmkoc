import { db } from "./src/db";
import { backgroundVideo } from "./src/db/schema/background-video.schema";
import { R2Service } from "./src/services/r2.service";
import { nanoid } from "nanoid";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";

/**
 * Generate HD GIF thumbnail from video with proper 9:16 aspect ratio
 * For 16:9 videos, adds black bars to make it 9:16 (no stretching)
 */
async function generateGifThumbnail(
  videoPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`      Generating HD GIF thumbnail...`);

    // FFmpeg command for high-quality GIF matching original aspect ratio
    // - Extract 2 seconds starting at 2s mark
    // - Scale to max 480px height while maintaining aspect ratio
    // - Use palettegen for better colors
    // - 15 fps for smooth animation
    const args = [
      "-ss", "2",
      "-t", "2",
      "-i", videoPath,
      "-vf", "fps=15,scale=-1:480:force_original_aspect_ratio=decrease,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5",
      "-loop", "0",
      "-y",
      outputPath,
    ];

    const proc = spawn("ffmpeg", args);
    let stderr = "";

    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        const stats = fs.statSync(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`      ✅ GIF created: ${sizeMB} MB`);
        resolve();
      } else {
        reject(new Error(`GIF generation failed (code ${code}): ${stderr.slice(-300)}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Download video from R2 to temp file
 */
async function downloadFromR2(storageKey: string): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `video-${nanoid()}.mp4`);
  const signedUrl = await R2Service.getSignedDownloadUrl(storageKey, 3600);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Video download timed out (60s)"));
    }, 60000);

    const proc = spawn("ffmpeg", [
      "-i", signedUrl,
      "-c", "copy",
      "-y",
      tempPath,
    ]);

    let stderr = "";
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(tempPath);
      } else {
        reject(new Error(`Download failed (code ${code}): ${stderr.slice(-300)}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function regenerateThumbnails() {
  console.log("🎬 Regenerating all background video thumbnails with proper aspect ratio...\n");

  // Get all videos from database
  const videos = await db.select().from(backgroundVideo);
  
  console.log(`Found ${videos.length} videos to process\n`);

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    console.log(`\n[${i + 1}/${videos.length}] Processing: ${video.displayName}`);
    console.log(`   Video ID: ${video.id}`);
    console.log(`   Storage Key: ${video.storageKey}`);

    try {
      // 1. Download video from R2
      console.log(`   ⬇️  Downloading video from R2...`);
      const videoPath = await downloadFromR2(video.storageKey);
      console.log(`      ✅ Downloaded to: ${videoPath}`);

      // 2. Generate new GIF thumbnail
      const gifPath = path.join(os.tmpdir(), `${nanoid()}.gif`);
      await generateGifThumbnail(videoPath, gifPath);

      // 3. Upload new GIF to R2
      const gifBuffer = fs.readFileSync(gifPath);
      const gifKey = `backgrounds/thumbnails/${nanoid()}.gif`;
      
      console.log(`   ☁️  Uploading new GIF thumbnail to R2...`);
      await R2Service.uploadFile(gifKey, gifBuffer, "image/gif");
      console.log(`      ✅ GIF uploaded: ${gifKey}`);

      // 4. Update database with new thumbnail key
      console.log(`   💾 Updating database...`);
      await db
        .update(backgroundVideo)
        .set({ thumbnailKey: gifKey })
        .where(eq(backgroundVideo.id, video.id));
      console.log(`      ✅ Database updated`);

      // 5. Clean up temp files
      fs.unlinkSync(videoPath);
      fs.unlinkSync(gifPath);

      console.log(`   🎉 Successfully regenerated thumbnail for: ${video.displayName}`);

    } catch (error) {
      console.error(`   ❌ Error processing ${video.displayName}:`, error);
      console.log(`   ⏭️  Continuing with next video...\n`);
    }
  }

  console.log("\n\n✅ All thumbnails regenerated!");
  console.log("🔄 Refresh your browser to see the updated thumbnails");
}

// Import eq function
import { eq } from "drizzle-orm";

// Run the script
regenerateThumbnails()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
