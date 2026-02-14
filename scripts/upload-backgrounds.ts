/**
 * Upload background videos to R2 and auto-generate GIF thumbnails
 *
 * Usage:
 *   1. Create folder: backgrounds-local/subway-surfer/
 *   2. Put video files there: video-1.mp4, video-2.mp4
 *   3. Run: bun run scripts/upload-backgrounds.ts
 *
 * It will:
 *   - Generate GIF thumbnails from each video (3s clip, 320px wide)
 *   - Upload both videos and GIFs to R2
 */

import { R2Service } from "../src/services/r2.service";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { execSync } from "child_process";

const LOCAL_DIR = join(import.meta.dir, "../backgrounds-local");

function generateGif(videoPath: string, gifPath: string) {
  // Extract 3 seconds starting at 1s, scale to 320px wide, 15fps
  execSync(
    `ffmpeg -y -ss 1 -t 3 -i "${videoPath}" -vf "fps=15,scale=320:-1:flags=lanczos" -loop 0 "${gifPath}"`,
    { stdio: "pipe" }
  );
}

async function uploadAll() {
  console.log(`Scanning ${LOCAL_DIR}...\n`);

  let dirs: string[];
  try {
    dirs = await readdir(LOCAL_DIR);
  } catch {
    console.error(`Folder not found: ${LOCAL_DIR}`);
    console.error(`Create it and add your video files. Example:`);
    console.error(`  backgrounds-local/subway-surfer/video-1.mp4`);
    process.exit(1);
  }

  let uploaded = 0;

  for (const category of dirs) {
    const catPath = join(LOCAL_DIR, category);
    const catStat = await stat(catPath);
    if (!catStat.isDirectory()) continue;

    const files = await readdir(catPath);
    const videoFiles = files.filter((f) => f.endsWith(".mp4"));
    console.log(`${category}/ (${videoFiles.length} videos)`);

    for (const videoFile of videoFiles) {
      const videoPath = join(catPath, videoFile);
      const videoNum = videoFile.replace("video-", "").replace(".mp4", "");
      const gifFile = `thumb-${videoNum}.gif`;
      const gifPath = join(catPath, gifFile);

      // Generate GIF thumbnail from video
      try {
        console.log(`  ⏳ Generating ${gifFile} from ${videoFile}...`);
        generateGif(videoPath, gifPath);
        console.log(`  ✓ Generated ${gifFile}`);
      } catch (err: any) {
        console.error(`  ✗ Failed to generate GIF: ${err.message}`);
        continue;
      }

      // Upload video
      try {
        const videoKey = `backgrounds/${category}/${videoFile}`;
        const videoBuffer = await readFile(videoPath);
        const videoSize = (await stat(videoPath)).size;
        await R2Service.uploadFile(videoKey, Buffer.from(videoBuffer), "video/mp4");
        console.log(`  ✓ Uploaded ${videoFile} → ${videoKey} (${(videoSize / 1024 / 1024).toFixed(1)}MB)`);
        uploaded++;
      } catch (err: any) {
        console.error(`  ✗ Failed to upload ${videoFile}: ${err.message}`);
      }

      // Upload GIF
      try {
        const gifKey = `backgrounds/${category}/${gifFile}`;
        const gifBuffer = await readFile(gifPath);
        const gifSize = (await stat(gifPath)).size;
        await R2Service.uploadFile(gifKey, Buffer.from(gifBuffer), "image/gif");
        console.log(`  ✓ Uploaded ${gifFile} → ${gifKey} (${(gifSize / 1024 / 1024).toFixed(1)}MB)`);
        uploaded++;
      } catch (err: any) {
        console.error(`  ✗ Failed to upload ${gifFile}: ${err.message}`);
      }
    }
    console.log();
  }

  console.log(`Done! Uploaded ${uploaded} files.`);
  process.exit(0);
}

uploadAll().catch((err) => {
  console.error("Upload failed:", err);
  process.exit(1);
});
