import { db } from "./src/db";
import { backgroundVideo, backgroundCategory } from "./src/db/schema/background-video.schema";
import { eq } from "drizzle-orm";
import { R2Service } from "./src/services/r2.service";
import { FFmpegService } from "./src/services/ffmpeg.service";
import { nanoid } from "nanoid";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

interface VideoToAdd {
  categorySlug: string;
  categoryDisplayName: string;
  localPath: string; // Relative to seed-background-video/
  displayName: string;
}

/**
 * Generate HD GIF thumbnail from video
 * Creates a 2-second looping GIF at high quality in 9:16 format
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
 * Get video metadata using FFprobe
 */
async function getVideoMetadata(videoPath: string): Promise<{
  duration: number;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,duration",
      "-show_entries", "format=duration",
      "-of", "json",
      videoPath,
    ];

    const proc = spawn("ffprobe", args);
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
    });

    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        try {
          const data = JSON.parse(stdout);
          const stream = data.streams?.[0] || {};
          const format = data.format || {};
          
          const duration = parseFloat(stream.duration || format.duration || "0");
          const width = parseInt(stream.width || "0");
          const height = parseInt(stream.height || "0");

          resolve({ duration, width, height });
        } catch (err) {
          reject(new Error(`Failed to parse FFprobe output: ${err}`));
        }
      } else {
        reject(new Error(`FFprobe failed (code ${code}): ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn FFprobe: ${err.message}`));
    });
  });
}

async function addBackgroundVideos(videos: VideoToAdd[]) {
  console.log(`🎬 Adding ${videos.length} background video(s)...\n`);

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    console.log(`\n[${ i + 1}/${videos.length}] Processing: ${video.displayName}`);
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
        console.log(`   📁 Creating category...`);
        const newCategory = await db
          .insert(backgroundCategory)
          .values({
            id: nanoid(),
            slug: video.categorySlug,
            displayName: video.categoryDisplayName,
            thumbnailUrl: null,
            sortOrder: i,
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
      
      console.log(`   ☁️  Uploading video to R2...`);
      const videoResult = await R2Service.uploadFile(videoKey, videoBuffer, "video/mp4");
      console.log(`      ✅ Video uploaded: ${videoKey}`);

      // 6. Upload GIF thumbnail to R2
      const gifBuffer = fs.readFileSync(gifPath);
      const gifKey = `backgrounds/thumbnails/${nanoid()}.gif`;
      
      console.log(`   ☁️  Uploading GIF thumbnail to R2...`);
      const gifResult = await R2Service.uploadFile(gifKey, gifBuffer, "image/gif");
      console.log(`      ✅ GIF uploaded: ${gifKey}`);

      // Clean up temp GIF
      fs.unlinkSync(gifPath);

      // 7. Create database entry
      const videoId = nanoid();
      console.log(`   💾 Creating database entry...`);
      
      await db.insert(backgroundVideo).values({
        id: videoId,
        categoryId: categoryId,
        displayName: video.displayName,
        storageKey: videoKey,
        thumbnailKey: gifKey,
        duration: Math.round(metadata.duration),
        width: metadata.width,
        height: metadata.height,
        fileSize: stats.size,
      });

      console.log(`      ✅ Database entry created: ${videoId}`);
      console.log(`   🎉 Successfully added: ${video.displayName}`);

    } catch (error) {
      console.error(`   ❌ Error adding ${video.displayName}:`, error);
      console.log(`   ⏭️  Continuing with next video...\n`);
    }
  }

  console.log("\n\n✅ All videos processed!");
}

// ============================================
// CONFIGURATION: Add your videos here
// ============================================

const videosToAdd: VideoToAdd[] = [
  // Minecraft videos (8 total)
  {
    categorySlug: "minecraft",
    categoryDisplayName: "Minecraft",
    localPath: "minecraft/minecraft-1.mp4",
    displayName: "Minecraft 1",
  },
  {
    categorySlug: "minecraft",
    categoryDisplayName: "Minecraft",
    localPath: "minecraft/minecraft-2.mp4",
    displayName: "Minecraft 2",
  },
  {
    categorySlug: "minecraft",
    categoryDisplayName: "Minecraft",
    localPath: "minecraft/minecraft-3.mp4",
    displayName: "Minecraft 3",
  },
  {
    categorySlug: "minecraft",
    categoryDisplayName: "Minecraft",
    localPath: "minecraft/minecraft-4.mp4",
    displayName: "Minecraft 4",
  },
  {
    categorySlug: "minecraft",
    categoryDisplayName: "Minecraft",
    localPath: "minecraft/minecraft-5.mp4",
    displayName: "Minecraft 5",
  },
  {
    categorySlug: "minecraft",
    categoryDisplayName: "Minecraft",
    localPath: "minecraft/minecraft-6.mp4",
    displayName: "Minecraft 6",
  },
  {
    categorySlug: "minecraft",
    categoryDisplayName: "Minecraft",
    localPath: "minecraft/minecraft-7.mp4",
    displayName: "Minecraft 7",
  },
  {
    categorySlug: "minecraft",
    categoryDisplayName: "Minecraft",
    localPath: "minecraft/minecraft-8.mp4",
    displayName: "Minecraft 8",
  },
  // GTA 5 videos (13 total)
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-1.mp4",
    displayName: "GTA 5 - 1",
  },
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-2.mp4",
    displayName: "GTA 5 - 2",
  },
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-3.mp4",
    displayName: "GTA 5 - 3",
  },
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-4.mp4",
    displayName: "GTA 5 - 4",
  },
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-5.mp4",
    displayName: "GTA 5 - 5",
  },
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-6.mp4",
    displayName: "GTA 5 - 6",
  },
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-7.mp4",
    displayName: "GTA 5 - 7",
  },
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-8.mp4",
    displayName: "GTA 5 - 8",
  },
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-9.mp4",
    displayName: "GTA 5 - 9",
  },
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-10.mp4",
    displayName: "GTA 5 - 10",
  },
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-11.mp4",
    displayName: "GTA 5 - 11",
  },
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-12.mp4",
    displayName: "GTA 5 - 12",
  },
  {
    categorySlug: "gta5",
    categoryDisplayName: "GTA 5",
    localPath: "gta5/gta5-13.mp4",
    displayName: "GTA 5 - 13",
  },
];

// Run the script
addBackgroundVideos(videosToAdd);
