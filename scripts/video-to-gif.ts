#!/usr/bin/env npx tsx
/**
 * Converts a video URL to a high-quality GIF and uploads it to R2.
 * Usage: npx tsx scripts/video-to-gif.ts <video_url> [output_key]
 */

import { execSync } from "node:child_process";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";

dotenv.config();

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

async function videoToGif(
  videoUrl: string,
  outputKey?: string,
  duration = 15,   // seconds to use (landing page GIF — keep it short)
  width = 480,     // output width (height auto, keeps aspect ratio)
  fps = 20         // frames per second
) {
  const tmpDir = "/tmp/gif-convert";
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const inputPath = path.join(tmpDir, "input.mp4");
  const palettePath = path.join(tmpDir, "palette.png");
  const gifPath = path.join(tmpDir, "output.gif");

  const key = outputKey ?? `landing/hero-${Date.now()}.gif`;

  try {
    // 1. Download video
    console.log("⬇️  Downloading video...");
    execSync(`curl -L -o "${inputPath}" "${videoUrl}"`, { stdio: "inherit" });

    const trimFlag = `-t ${duration}`;
    const scale = `scale=${width}:-1:flags=lanczos`;

    // 2. Generate palette (only from the trimmed segment)
    console.log(`🎨  Generating palette (first ${duration}s, ${width}px wide)...`);
    execSync(
      `ffmpeg -y ${trimFlag} -i "${inputPath}" -vf "fps=${fps},${scale},palettegen=stats_mode=diff" "${palettePath}"`,
      { stdio: "inherit" }
    );

    // 3. Convert to GIF using palette
    console.log("🎬  Converting to GIF...");
    execSync(
      `ffmpeg -y ${trimFlag} -i "${inputPath}" -i "${palettePath}" -lavfi "fps=${fps},${scale} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" "${gifPath}"`,
      { stdio: "inherit" }
    );

    // 4. Upload to R2
    console.log("☁️  Uploading to R2...");
    const gifBuffer = readFileSync(gifPath);
    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: gifBuffer,
        ContentType: "image/gif",
        CacheControl: "public, max-age=31536000",
      })
    );

    const publicLink = `https://cdn.scalereach.ai/${key}`;
    console.log("\n✅  Done!");
    console.log(`🔗  Public URL: ${publicLink}`);
    return publicLink;
  } finally {
    // Cleanup
    for (const f of [inputPath, palettePath, gifPath]) {
      if (existsSync(f)) unlinkSync(f);
    }
  }
}

const [, , videoUrl, outputKey, durationArg, widthArg, fpsArg] = process.argv;
if (!videoUrl) {
  console.error("Usage: npx tsx scripts/video-to-gif.ts <video_url> [r2_key] [duration=15] [width=480] [fps=20]");
  process.exit(1);
}

videoToGif(
  videoUrl,
  outputKey,
  durationArg ? Number(durationArg) : 15,
  widthArg ? Number(widthArg) : 480,
  fpsArg ? Number(fpsArg) : 20
).catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
