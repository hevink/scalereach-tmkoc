#!/usr/bin/env bun
/**
 * Test smart crop from a YouTube URL
 * Usage: bun run src/scripts/test-smart-crop-url.ts <youtube-url>
 * Output: ~/Downloads/{videoId}_vertical.mp4
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const youtubeUrl = process.argv[2];
if (!youtubeUrl) {
  console.error("Usage: bun run src/scripts/test-smart-crop-url.ts <youtube-url>");
  process.exit(1);
}

const TMP_DIR = os.tmpdir();
const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads");
const PYTHON_PATH = process.env.PYTHON_PATH || `${os.homedir()}/smart_crop_env/bin/python3`;
const SMART_CROP_SCRIPT = path.join(__dirname, "smart_crop.py");

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[RUN] ${cmd} ${args.join(" ")}`);
    const proc = spawn(cmd, args, { stdio: "inherit" });
    proc.on("error", (err) => reject(new Error(`${cmd} failed: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function main() {
  const clipId = `yt_${Date.now()}`;
  const localVideo = path.join(TMP_DIR, `${clipId}.mp4`);
  const outputVideo = path.join(DOWNLOADS_DIR, `${clipId}_vertical.mp4`);
  const coordsPath = path.join(TMP_DIR, `${clipId}_coords.json`);

  console.log(`\n[SMART CROP] YouTube URL: ${youtubeUrl}`);
  console.log(`[SMART CROP] Output: ${outputVideo}\n`);

  // Step 1: Download YouTube video
  console.log("[1/4] Downloading video...");
  await run("yt-dlp", [
    "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
    "-o", localVideo,
    youtubeUrl,
  ]);

  // Step 1b: Trim to first 60 seconds
  const trimmedVideo = path.join(TMP_DIR, `${clipId}_trimmed.mp4`);
  console.log("[1b/4] Trimming to first 60 seconds...");
  await run("ffmpeg", ["-y", "-i", localVideo, "-t", "60", "-c", "copy", trimmedVideo]);
  await fs.unlink(localVideo).catch(() => {});

  // Step 2: Run Python smart crop
  console.log("\n[2/4] Running face detection...");
  await run(PYTHON_PATH, [SMART_CROP_SCRIPT, trimmedVideo, clipId, TMP_DIR]);

  // Step 3: Apply FFmpeg crop
  console.log("\n[3/4] Applying smart crop with FFmpeg...");
  const coordsRaw = await fs.readFile(coordsPath, "utf-8");
  const result = JSON.parse(coordsRaw);

  if (result.mode === "skip") {
    console.log("[SKIP] No face detected — keeping original 16:9, no reframe");
    await fs.copyFile(trimmedVideo, outputVideo);
  } else if (result.mode === "split") {
    // Screen recording + PiP → split screen
    const { screen, pip, split_ratio } = result;
    const outH = 1080;
    const outW = Math.round(outH * 9 / 16); // 607
    const screenH = Math.round(outH * split_ratio / 100);
    const faceH   = outH - screenH;

    console.log(`[SPLIT SCREEN] screen=${screen.w}x${screen.h} pip=${pip.w}x${pip.h} ratio=${split_ratio}/${100 - split_ratio}`);

    await run("ffmpeg", [
      "-y", "-i", trimmedVideo,
      "-filter_complex",
      // Crop screen region → scale to outW x screenH
      `[0:v]crop=${screen.w}:${screen.h}:${screen.x}:${screen.y},scale=${outW}:${screenH},setsar=1[top];` +
      // Crop PiP region → scale to outW x faceH
      `[0:v]crop=${pip.w}:${pip.h}:${pip.x}:${pip.y},scale=${outW}:${faceH},setsar=1[bottom];` +
      // Stack vertically
      `[top][bottom]vstack=inputs=2[out]`,
      "-map", "[out]", "-map", "0:a",
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      outputVideo,
    ]);
  } else if (result.mode === "mixed") {
    // Mixed: face sections → 9:16 crop, no-face sections → letterbox, then concat
    const { segments, crop_w, crop_h } = result;
    const segFiles: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segOut = path.join(TMP_DIR, `${clipId}_seg${i}.mp4`);
      segFiles.push(segOut);
      const duration = seg.end - seg.start;

      if (seg.type === "face") {
        const cmdFile = path.join(TMP_DIR, `${clipId}_seg${i}_cmds.txt`);
        const cmdLines = seg.coords.flatMap(({ t, x, y, w, h }: any) => [
          `${t} crop x ${x};`, `${t} crop y ${y};`, `${t} crop w ${w};`, `${t} crop h ${h};`,
        ]);
        await fs.writeFile(cmdFile, cmdLines.join("\n"));
        const first = seg.coords[0];
        await run("ffmpeg", [
          "-y", "-ss", seg.start.toString(), "-t", duration.toString(), "-i", trimmedVideo,
          "-vf", `sendcmd=f=${cmdFile},crop=${first.w}:${first.h}`,
          "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", segOut,
        ]);
        await fs.unlink(cmdFile).catch(() => {});
      } else {
        await run("ffmpeg", [
          "-y", "-ss", seg.start.toString(), "-t", duration.toString(), "-i", trimmedVideo,
          "-vf", `scale=${crop_w}:-2,pad=${crop_w}:${crop_h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
          "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", segOut,
        ]);
      }
    }

    const concatFile = path.join(TMP_DIR, `${clipId}_concat.txt`);
    await fs.writeFile(concatFile, segFiles.map(f => `file '${f}'`).join("\n"));
    await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", outputVideo]);
    await fs.unlink(concatFile).catch(() => {});
    for (const f of segFiles) await fs.unlink(f).catch(() => {});
  } else {
    // Podcast / face tracking → dynamic crop
    const coords: Array<{ t: number; x: number; y: number; w: number; h: number }> = result.coords;
    const cmdFile = path.join(TMP_DIR, `${clipId}_cmds.txt`);
    const cmdLines = coords.flatMap(({ t, x, y, w, h }) => [
      `${t} crop x ${x};`,
      `${t} crop y ${y};`,
      `${t} crop w ${w};`,
      `${t} crop h ${h};`,
    ]);
    await fs.writeFile(cmdFile, cmdLines.join("\n"));
    const first = coords[0];

    await run("ffmpeg", [
      "-y", "-i", trimmedVideo,
      "-vf", `sendcmd=f=${cmdFile},crop=${first.w}:${first.h}`,
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      outputVideo,
    ]);
    await fs.unlink(cmdFile).catch(() => {});
  }

  // Cleanup
  await fs.unlink(trimmedVideo).catch(() => {});
  await fs.unlink(coordsPath).catch(() => {});

  console.log(`\n✓ Done! Output: ${outputVideo}`);
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
