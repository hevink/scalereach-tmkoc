/**
 * Upload new split-screen background clips to R2
 * Categories: ASMR (additional), Fortnite, Trackmania
 *
 * Usage:
 *   1. Download clips into seed-background-video/<category>/
 *   2. Run: bun run add-split-screen-clips.ts
 *
 * Same pattern as add-background-videos.ts
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

interface VideoToAdd {
  categorySlug: string;
  categoryDisplayName: string;
  localPath: string; // Relative to seed-background-video/
  displayName: string;
  sortOrder: number; // Category sort order
}

async function generateGifThumbnail(
  videoPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`      Generating HD GIF thumbnail...`);
    const args = [
      "-ss", "2", "-t", "2", "-i", videoPath,
      "-vf", "fps=15,scale=-1:480:force_original_aspect_ratio=decrease,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5",
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

async function getVideoMetadata(videoPath: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height,duration",
      "-show_entries", "format=duration", "-of", "json", videoPath,
    ];
    const proc = spawn("ffprobe", args);
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) {
        try {
          const data = JSON.parse(stdout);
          const stream = data.streams?.[0] || {};
          const format = data.format || {};
          resolve({
            duration: parseFloat(stream.duration || format.duration || "0"),
            width: parseInt(stream.width || "0"),
            height: parseInt(stream.height || "0"),
          });
        } catch (err) {
          reject(new Error(`Failed to parse FFprobe output: ${err}`));
        }
      } else {
        reject(new Error(`FFprobe failed (code ${code}): ${stderr}`));
      }
    });
    proc.on("error", (err) => reject(new Error(`Failed to spawn FFprobe: ${err.message}`)));
  });
}

async function addVideos(videos: VideoToAdd[]) {
  console.log(`🎬 Adding ${videos.length} split-screen background clip(s)...\n`);

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    console.log(`\n[${i + 1}/${videos.length}] Processing: ${video.displayName}`);
    console.log(`   Category: ${video.categoryDisplayName} (${video.categorySlug})`);

    try {
      // 1. Ensure category exists
      let category = await db
        .select()
        .from(backgroundCategory)
        .where(eq(backgroundCategory.slug, video.categorySlug))
        .limit(1);

      let categoryId: string;

      if (category.length === 0) {
        console.log(`   📁 Creating category "${video.categoryDisplayName}"...`);
        const newCategory = await db
          .insert(backgroundCategory)
          .values({
            id: nanoid(),
            slug: video.categorySlug,
            displayName: video.categoryDisplayName,
            thumbnailUrl: null,
            sortOrder: video.sortOrder,
          })
          .returning();
        categoryId = newCategory[0].id;
        console.log(`      ✅ Created: ${categoryId}`);
      } else {
        categoryId = category[0].id;
        console.log(`   ✅ Category exists: ${categoryId}`);
      }

      // 2. Check if video file exists
      const fullPath = path.join(__dirname, "seed-background-video", video.localPath);
      if (!fs.existsSync(fullPath)) {
        console.error(`   ❌ Video file not found: ${fullPath}`);
        console.log(`   ⏭️  Skipping...`);
        continue;
      }

      const stats = fs.statSync(fullPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`   📹 Video size: ${fileSizeMB} MB`);

      // 3. Get video metadata
      console.log(`   🔍 Extracting metadata...`);
      const metadata = await getVideoMetadata(fullPath);
      console.log(`      Duration: ${metadata.duration.toFixed(1)}s`);
      console.log(`      Resolution: ${metadata.width}x${metadata.height}`);

      // 4. Generate GIF thumbnail
      const gifPath = path.join(__dirname, "temp", `${nanoid()}.gif`);
      fs.mkdirSync(path.dirname(gifPath), { recursive: true });
      await generateGifThumbnail(fullPath, gifPath);

      // 5. Upload video to R2
      const videoBuffer = fs.readFileSync(fullPath);
      const videoKey = `backgrounds/${video.categorySlug}/${nanoid()}.mp4`;
      console.log(`   ☁️  Uploading video to R2: ${videoKey}...`);
      await R2Service.uploadFile(videoKey, videoBuffer, "video/mp4");
      console.log(`      ✅ Video uploaded`);

      // 6. Upload GIF thumbnail to R2
      const gifBuffer = fs.readFileSync(gifPath);
      const gifKey = `backgrounds/thumbnails/${nanoid()}.gif`;
      console.log(`   ☁️  Uploading GIF thumbnail to R2: ${gifKey}...`);
      await R2Service.uploadFile(gifKey, gifBuffer, "image/gif");
      console.log(`      ✅ GIF uploaded`);
      fs.unlinkSync(gifPath);

      // 7. Create database entry
      const videoId = nanoid();
      console.log(`   💾 Creating database entry...`);
      await db.insert(backgroundVideo).values({
        id: videoId,
        categoryId,
        displayName: video.displayName,
        storageKey: videoKey,
        thumbnailKey: gifKey,
        duration: Math.round(metadata.duration),
        width: metadata.width,
        height: metadata.height,
        fileSize: stats.size,
      });

      console.log(`      ✅ DB entry: ${videoId}`);
      console.log(`   🎉 Done: ${video.displayName}`);
    } catch (error) {
      console.error(`   ❌ Error adding ${video.displayName}:`, error);
      console.log(`   ⏭️  Continuing...\n`);
    }
  }

  console.log("\n\n✅ All clips processed!");
}

// ============================================
// CLIPS TO ADD
// ============================================

const videosToAdd: VideoToAdd[] = [
  // --- ASMR (additional clips) ---
  {
    categorySlug: "asmr",
    categoryDisplayName: "ASMR",
    localPath: "asmr/asmr-2.mp4",
    displayName: "ASMR 2",
    sortOrder: 3,
  },
  {
    categorySlug: "asmr",
    categoryDisplayName: "ASMR",
    localPath: "asmr/asmr-3.mp4",
    displayName: "ASMR 3",
    sortOrder: 3,
  },
  {
    categorySlug: "asmr",
    categoryDisplayName: "ASMR",
    localPath: "asmr/asmr-4.mp4",
    displayName: "ASMR 4",
    sortOrder: 3,
  },
  {
    categorySlug: "asmr",
    categoryDisplayName: "ASMR",
    localPath: "asmr/asmr-5.mp4",
    displayName: "ASMR 5",
    sortOrder: 3,
  },

  // --- Fortnite (new category) ---
  {
    categorySlug: "fortnite",
    categoryDisplayName: "Fortnite",
    localPath: "fortnite/fortnite-1.mp4",
    displayName: "Fortnite 1",
    sortOrder: 9,
  },
  {
    categorySlug: "fortnite",
    categoryDisplayName: "Fortnite",
    localPath: "fortnite/fortnite-2.mp4",
    displayName: "Fortnite 2",
    sortOrder: 9,
  },
  {
    categorySlug: "fortnite",
    categoryDisplayName: "Fortnite",
    localPath: "fortnite/fortnite-3.mp4",
    displayName: "Fortnite 3",
    sortOrder: 9,
  },
  {
    categorySlug: "fortnite",
    categoryDisplayName: "Fortnite",
    localPath: "fortnite/fortnite-4.mp4",
    displayName: "Fortnite 4",
    sortOrder: 9,
  },
  {
    categorySlug: "fortnite",
    categoryDisplayName: "Fortnite",
    localPath: "fortnite/fortnite-5.mp4",
    displayName: "Fortnite 5",
    sortOrder: 9,
  },

  // --- Trackmania (new category) ---
  {
    categorySlug: "trackmania",
    categoryDisplayName: "Trackmania",
    localPath: "trackmania/trackmania-1.mp4",
    displayName: "Trackmania 1",
    sortOrder: 10,
  },
  {
    categorySlug: "trackmania",
    categoryDisplayName: "Trackmania",
    localPath: "trackmania/trackmania-2.mp4",
    displayName: "Trackmania 2",
    sortOrder: 10,
  },
  {
    categorySlug: "trackmania",
    categoryDisplayName: "Trackmania",
    localPath: "trackmania/trackmania-3.mp4",
    displayName: "Trackmania 3",
    sortOrder: 10,
  },
  {
    categorySlug: "trackmania",
    categoryDisplayName: "Trackmania",
    localPath: "trackmania/trackmania-4.mp4",
    displayName: "Trackmania 4",
    sortOrder: 10,
  },
  {
    categorySlug: "trackmania",
    categoryDisplayName: "Trackmania",
    localPath: "trackmania/trackmania-5.mp4",
    displayName: "Trackmania 5",
    sortOrder: 10,
  },
];

// Run
addVideos(videosToAdd);
