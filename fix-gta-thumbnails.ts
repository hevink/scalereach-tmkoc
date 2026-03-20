/**
 * Regenerate ASMR background video thumbnails in 9:16 vertical format
 *
 * Usage: bun run fix-gta-thumbnails.ts
 */

import { db } from "./src/db";
import {
  backgroundVideo,
  backgroundCategory,
} from "./src/db/schema/background-video.schema";
import { eq } from "drizzle-orm";
import { R2Service } from "./src/services/r2.service";
import { nanoid } from "nanoid";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

async function generateVerticalGifThumbnail(
  videoPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`      Generating 16:9 landscape GIF thumbnail...`);
    // Source is vertical (404x720). Scale width to 480, then center-crop height to 270 for 16:9
    const args = [
      "-ss", "2", "-t", "2", "-i", videoPath,
      "-vf", "scale=480:-1,crop=480:270,fps=15,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5",
      "-loop", "0", "-y", outputPath,
    ];
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) {
        const stats = fs.statSync(outputPath);
        console.log(`      ✅ GIF created: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
        resolve();
      } else {
        reject(new Error(`GIF generation failed (code ${code}): ${stderr.slice(-300)}`));
      }
    });
    proc.on("error", (err) => reject(new Error(`Failed to spawn FFmpeg: ${err.message}`)));
  });
}

async function fixThumbnails() {
  // 1. Find the GTA 5 category
  const [category] = await db
    .select()
    .from(backgroundCategory)
    .where(eq(backgroundCategory.slug, "gta5"))
    .limit(1);

  if (!category) {
    console.error("❌ GTA 5 category not found");
    process.exit(1);
  }

  console.log(`Found GTA 5 category: ${category.id}`);

  // 2. Get all GTA 5 videos
  const videos = await db
    .select()
    .from(backgroundVideo)
    .where(eq(backgroundVideo.categoryId, category.id));

  console.log(`Found ${videos.length} GTA 5 videos\n`);

  const tempDir = path.join(__dirname, "temp");
  fs.mkdirSync(tempDir, { recursive: true });

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    console.log(`[${i + 1}/${videos.length}] ${video.displayName}`);

    // Find matching local file: "GTA 5 - 1" -> "gta5-1.mp4"
    const num = video.displayName.match(/(\d+)$/)?.[1];
    if (!num) {
      console.log(`   ⏭️  Can't determine file number, skipping`);
      continue;
    }

    const localPath = path.join(__dirname, "seed-background-video", "gta5", `gta5-${num}.mp4`);
    if (!fs.existsSync(localPath)) {
      console.log(`   ⏭️  Local file not found: gta5-${num}.mp4, skipping`);
      continue;
    }

    try {
      // 3. Generate new vertical GIF
      const gifPath = path.join(tempDir, `${nanoid()}.gif`);
      await generateVerticalGifThumbnail(localPath, gifPath);

      // 4. Upload new GIF to R2
      const gifBuffer = fs.readFileSync(gifPath);
      const newGifKey = `backgrounds/thumbnails/${nanoid()}.gif`;
      console.log(`   ☁️  Uploading new thumbnail: ${newGifKey}`);
      await R2Service.uploadFile(newGifKey, gifBuffer, "image/gif");

      // 5. Delete old GIF from R2
      if (video.thumbnailKey) {
        console.log(`   🗑️  Deleting old thumbnail: ${video.thumbnailKey}`);
        await R2Service.deleteFile(video.thumbnailKey);
      }

      // 6. Update DB
      await db
        .update(backgroundVideo)
        .set({ thumbnailKey: newGifKey })
        .where(eq(backgroundVideo.id, video.id));

      console.log(`   ✅ Updated\n`);
      fs.unlinkSync(gifPath);
    } catch (err) {
      console.error(`   ❌ Error:`, err);
    }
  }

  console.log("✅ All ASMR thumbnails regenerated in 9:16 format!");
  process.exit(0);
}

fixThumbnails();
