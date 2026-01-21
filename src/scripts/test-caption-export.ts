/**
 * Manual test script for clip export with captions
 * Run with: bun run src/scripts/test-caption-export.ts
 */

import { db } from "../db";
import { video, viralClip, captionStyle } from "../db/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { nanoid } from "nanoid";

// Configuration - change these as needed
const CLIP_ID = "ilx6EHRNsXIqMHPjdfiho"; // The clip to export
const OUTPUT_DIR = path.join(os.homedir(), "Desktop"); // Save to Desktop

async function main() {
  console.log("🎬 Starting manual caption export test...\n");

  // 1. Get clip data
  console.log("📋 Fetching clip data...");
  const clips = await db.select().from(viralClip).where(eq(viralClip.id, CLIP_ID));
  const clip = clips[0];
  
  if (!clip) {
    console.error(`❌ Clip not found: ${CLIP_ID}`);
    process.exit(1);
  }
  
  console.log(`   Clip: ${clip.title || clip.id}`);
  console.log(`   Time: ${clip.startTime}s - ${clip.endTime}s`);
  console.log(`   Video ID: ${clip.videoId}`);

  // 2. Get video data with transcript
  console.log("\n📹 Fetching video data...");
  const videos = await db.select().from(video).where(eq(video.id, clip.videoId));
  const videoData = videos[0];
  
  if (!videoData) {
    console.error(`❌ Video not found: ${clip.videoId}`);
    process.exit(1);
  }
  
  console.log(`   Title: ${videoData.title}`);
  console.log(`   Source: ${videoData.sourceType} - ${videoData.sourceUrl}`);
  console.log(`   Transcript words: ${(videoData.transcriptWords as any[])?.length || 0}`);

  // 3. Get caption style
  console.log("\n🎨 Fetching caption style...");
  const styles = await db.select().from(captionStyle).where(eq(captionStyle.clipId, CLIP_ID));
  const style = styles[0]?.config;
  console.log(`   Style found: ${style ? 'yes' : 'no (using defaults)'}`);

  // 4. Extract words for clip time range
  console.log("\n📝 Extracting caption words...");
  const transcriptWords = videoData.transcriptWords as any[] || [];
  const clipWords = transcriptWords
    .filter((w: any) => w.start >= clip.startTime && w.end <= clip.endTime)
    .map((w: any) => ({
      word: w.punctuated_word || w.word,
      start: w.start - clip.startTime, // Normalize to clip start
      end: w.end - clip.startTime,
    }));
  
  console.log(`   Found ${clipWords.length} words for clip`);
  if (clipWords.length > 0) {
    console.log(`   First word: "${clipWords[0].word}" at ${clipWords[0].start.toFixed(2)}s`);
    console.log(`   Last word: "${clipWords[clipWords.length - 1].word}" at ${clipWords[clipWords.length - 1].end.toFixed(2)}s`);
  }

  // 5. Generate ASS subtitle file
  console.log("\n📄 Generating ASS subtitles...");
  const assContent = generateASS(clipWords, style, 608, 1080);
  const tempDir = os.tmpdir();
  const assPath = path.join(tempDir, `test-captions-${nanoid()}.ass`);
  await fs.promises.writeFile(assPath, assContent);
  console.log(`   Saved to: ${assPath}`);

  // 6. Download YouTube segment
  console.log("\n⬇️  Downloading YouTube segment...");
  const tempVideoPath = path.join(tempDir, `test-video-${nanoid()}.mp4`);
  await downloadYouTubeSegment(
    videoData.sourceUrl!,
    clip.startTime,
    clip.endTime,
    tempVideoPath
  );
  console.log(`   Downloaded to: ${tempVideoPath}`);

  // 7. Apply FFmpeg with captions
  console.log("\n🔧 Applying FFmpeg with captions...");
  const outputPath = path.join(OUTPUT_DIR, `clip-with-captions-${CLIP_ID}.mp4`);
  await applyFFmpeg(tempVideoPath, assPath, outputPath);
  console.log(`   ✅ Output saved to: ${outputPath}`);

  // Cleanup
  await fs.promises.unlink(tempVideoPath).catch(() => {});
  await fs.promises.unlink(assPath).catch(() => {});

  console.log("\n🎉 Done! Check your Desktop for the output file.");
}

function generateASS(
  words: Array<{ word: string; start: number; end: number }>,
  style: any,
  width: number,
  height: number
): string {
  const fontFamily = style?.fontFamily || "Arial";
  const fontSize = style?.fontSize || 48;
  const textColor = hexToASSColor(style?.textColor || "#FFFFFF");
  const outlineColor = hexToASSColor(style?.outlineColor || "#000000");
  const shadow = style?.shadow ? 2 : 0;
  const outline = style?.outline ? 3 : 2;
  const alignment = style?.position === "top" ? 8 : style?.position === "center" ? 5 : 2;
  const marginV = style?.position === "center" ? 0 : 60;

  let ass = `[Script Info]
Title: Generated Captions
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${textColor},${textColor},${outlineColor},&H80000000,1,0,0,0,100,100,0,0,1,${outline},${shadow},${alignment},20,20,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Group words into lines
  const lines: Array<{ words: typeof words; start: number; end: number }> = [];
  let currentLine: typeof words = [];
  
  for (const word of words) {
    currentLine.push(word);
    if (currentLine.length >= 5 || word.word.endsWith('.') || word.word.endsWith('?') || word.word.endsWith('!')) {
      lines.push({
        words: currentLine,
        start: currentLine[0].start,
        end: currentLine[currentLine.length - 1].end,
      });
      currentLine = [];
    }
  }
  if (currentLine.length > 0) {
    lines.push({
      words: currentLine,
      start: currentLine[0].start,
      end: currentLine[currentLine.length - 1].end,
    });
  }

  for (const line of lines) {
    const startTime = formatASSTime(line.start);
    const endTime = formatASSTime(line.end);
    const text = line.words.map(w => w.word).join(" ");
    ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}\n`;
  }

  return ass;
}

function hexToASSColor(hex: string): string {
  const clean = hex.replace("#", "");
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toFixed(3).padStart(6, "0")}`;
}

async function downloadYouTubeSegment(
  url: string,
  startTime: number,
  endTime: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const downloadSection = `*${formatTimestamp(startTime)}-${formatTimestamp(endTime)}`;
    
    const args = [
      "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
      "--download-sections", downloadSection,
      "--force-keyframes-at-cuts",
      "-o", outputPath,
      "--no-playlist",
      url,
    ];

    console.log(`   Running: yt-dlp ${args.join(" ")}`);
    const proc = spawn("yt-dlp", args);
    
    proc.stdout?.on("data", (data) => process.stdout.write(data));
    proc.stderr?.on("data", (data) => process.stderr.write(data));
    
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

async function applyFFmpeg(
  inputPath: string,
  assPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // For the subtitles filter, we need to escape special characters in the path
    // The filename parameter needs to be properly escaped for FFmpeg
    // Escape colons, backslashes, and single quotes
    const escapedAssPath = assPath
      .replace(/\\/g, "/")
      .replace(/:/g, "\\:")
      .replace(/'/g, "\\'");
    
    // Build filter chain - use filter_complex for better control
    // The subtitles filter needs filename= parameter
    const args = [
      "-i", inputPath,
      "-filter_complex",
      `[0:v]scale=max(608\\,iw*1080/ih):max(1080\\,ih*608/iw),crop=608:1080,subtitles=filename='${escapedAssPath}'[v]`,
      "-map", "[v]",
      "-map", "0:a",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ];

    console.log(`   Running: ffmpeg ${args.slice(0, 4).join(" ")} ... ${args.slice(-1)}`);
    const proc = spawn("ffmpeg", args);
    
    let stderr = "";
    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
      // Show progress
      const match = data.toString().match(/time=(\d{2}:\d{2}:\d{2})/);
      if (match) {
        process.stdout.write(`\r   Progress: ${match[1]}`);
      }
    });
    
    proc.on("close", (code) => {
      console.log(""); // New line after progress
      if (code !== 0) {
        console.error(stderr);
        reject(new Error(`FFmpeg failed with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

main().catch(console.error);
