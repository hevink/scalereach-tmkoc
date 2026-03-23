/**
 * Test all caption templates on a single clip — LOCAL ONLY, no R2.
 * Downloads source once, generates ASS subtitles per template, burns via FFmpeg.
 * Output: scalereach-tmkoc/caption-templates/<template-id>.mp4
 *
 * Run: bun run src/scripts/test-all-caption-templates.ts
 */

import { db } from "../db";
import { viralClip, video } from "../db/schema";
import { eq } from "drizzle-orm";
import { ClipCaptionModel } from "../models/clip-caption.model";
import { CAPTION_TEMPLATES } from "../data/caption-templates";
import { R2Service } from "../services/r2.service";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

// ── CONFIG ──
const CLIP_ID = "9u0xmkEfTYB0uvzBG8DzW";
const OUTPUT_DIR = path.join(process.cwd(), "caption-templates");

// ── ASS helpers ──
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

function generateASS(
  words: Array<{ word: string; start: number; end: number }>,
  style: any,
  width: number,
  height: number,
): string {
  const fontFamily = style?.fontFamily || "Arial";
  const DESIGN_HEIGHT = 700;
  const scaleFactor = height / DESIGN_HEIGHT;
  const fontSize = Math.round((style?.fontSize || 32) * scaleFactor);

  const textColor = hexToASSColor(style?.textColor || "#FFFFFF");
  const outlineColor = hexToASSColor(style?.outlineColor || "#000000");
  const highlightColor = hexToASSColor(style?.highlightColor || "#FFFF00");
  const highlightScale = style?.highlightScale ?? 110;
  const maxWordsPerLine = style?.wordsPerLine ?? 5;

  let rawOutline = 0;
  if (style?.outline) rawOutline = style?.outlineWidth ?? 3;
  else if (style?.shadow) rawOutline = 2;
  const outline = Math.round(rawOutline * Math.sqrt(scaleFactor));

  const xPct = style?.x ?? 50;
  const yPct = style?.y ?? 85;
  const textAlign = style?.alignment || "center";
  const hAlign = textAlign === "left" ? 1 : textAlign === "right" ? 3 : 2;

  let alignment: number;
  let marginV: number;
  let marginL = Math.round(0.05 * width);
  let marginR = marginL;

  if (yPct >= 66) {
    alignment = hAlign;
    marginV = Math.round(((100 - yPct) / 100) * height);
  } else if (yPct <= 33) {
    alignment = 6 + hAlign;
    marginV = Math.round((yPct / 100) * height);
  } else {
    alignment = 3 + hAlign;
    marginV = 0;
  }

  const bgOpacity = style?.backgroundOpacity ?? 0;
  const bgColor = (style?.backgroundColor || "#000000").replace("#", "");
  const assAlpha = Math.round(((100 - bgOpacity) / 100) * 255).toString(16).toUpperCase().padStart(2, "0");
  const bgR = bgColor.substring(0, 2);
  const bgG = bgColor.substring(2, 4);
  const bgB = bgColor.substring(4, 6);
  const backColour = `&H${assAlpha}${bgB}${bgG}${bgR}`;
  const borderStyle = bgOpacity > 0 ? 3 : 1;

  const transformWord = (word: string) => style?.textTransform === "uppercase" ? word.toUpperCase() : word;

  let ass = `\uFEFF[Script Info]
Title: Caption Template Test
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${textColor},${textColor},${outlineColor},${backColour},1,0,0,0,100,100,0,0,${borderStyle},${outline},0,${alignment},${marginL},${marginR},${marginV},0
Style: Highlight,${fontFamily},${fontSize},${highlightColor},${highlightColor},${outlineColor},${backColour},1,0,0,0,${highlightScale},${highlightScale},0,0,${borderStyle},${outline},0,${alignment},${marginL},${marginR},${marginV},0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Group words into lines
  const lines: Array<{ words: typeof words; start: number; end: number }> = [];
  let currentLine: typeof words = [];
  for (const word of words) {
    currentLine.push(word);
    if (currentLine.length >= maxWordsPerLine || /[.!?]$/.test(word.word)) {
      lines.push({ words: currentLine, start: currentLine[0].start, end: currentLine[currentLine.length - 1].end });
      currentLine = [];
    }
  }
  if (currentLine.length > 0) {
    lines.push({ words: currentLine, start: currentLine[0].start, end: currentLine[currentLine.length - 1].end });
  }

  const highlightOpen = `{\\fscx${highlightScale}\\fscy${highlightScale}\\c${highlightColor}}`;
  const highlightClose = `{\\fscx100\\fscy100\\c${textColor}}`;
  const animation = style?.animation || "none";

  if (animation === "bounce") {
    for (const line of lines) {
      for (let i = 0; i < line.words.length; i++) {
        const word = line.words[i];
        const ws = formatASSTime(word.start);
        const we = formatASSTime(word.end);
        let text = "";
        for (let j = 0; j <= i; j++) {
          const w = line.words[j];
          const tw = transformWord(w.word);
          if (j === i) {
            const bc = style?.highlightEnabled ? highlightColor : textColor;
            const bs = Math.round(highlightScale * 0.92);
            text += `{\\fscx100\\fscy100\\t(0,80,\\fscx${bs}\\fscy${bs})\\t(80,160,\\fscx100\\fscy100)\\c${bc}}${tw}{\\c${textColor}} `;
          } else {
            text += `${tw} `;
          }
        }
        ass += `Dialogue: 0,${ws},${we},Default,,0,0,0,,${text.trim()}\n`;
      }
    }
  } else if (style?.highlightEnabled) {
    for (const line of lines) {
      for (let i = 0; i < line.words.length; i++) {
        const word = line.words[i];
        const ws = formatASSTime(word.start);
        const we = formatASSTime(word.end);
        let text = "";
        for (let j = 0; j < line.words.length; j++) {
          const tw = transformWord(line.words[j].word);
          text += j === i ? `${highlightOpen}${tw}${highlightClose} ` : `${tw} `;
        }
        ass += `Dialogue: 0,${ws},${we},Default,,0,0,0,,${text.trim()}\n`;
      }
    }
  } else {
    for (const line of lines) {
      ass += `Dialogue: 0,${formatASSTime(line.start)},${formatASSTime(line.end)},Default,,0,0,0,,${line.words.map(w => transformWord(w.word)).join(" ")}\n`;
    }
  }

  return ass;
}

function runFFmpeg(inputPath: string, assPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const escapedAss = assPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
    const args = [
      "-i", inputPath,
      "-filter_complex",
      `[0:v]scale=max(608\\,iw*1080/ih):max(1080\\,ih*608/iw),crop=608:1080,subtitles=filename='${escapedAss}'[v]`,
      "-map", "[v]", "-map", "0:a?",
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", "-y", outputPath,
    ];
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(-200)}`));
      else resolve();
    });
  });
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

function downloadYouTubeSegment(url: string, startTime: number, endTime: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const section = `*${formatTimestamp(startTime)}-${formatTimestamp(endTime)}`;
    const args = [
      "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
      "--download-sections", section, "--force-keyframes-at-cuts",
      "-o", outputPath, "--no-playlist", url,
    ];
    const proc = spawn("yt-dlp", args);
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`yt-dlp exit ${code}`));
      else resolve();
    });
  });
}

async function main() {
  console.log(`\n🎬 Testing all ${CAPTION_TEMPLATES.length} caption templates — LOCAL ONLY (no R2)\n`);

  // 1. Fetch clip + video + caption data
  const [clipRow] = await db.select().from(viralClip).where(eq(viralClip.id, CLIP_ID));
  if (!clipRow) { console.error("❌ Clip not found"); process.exit(1); }

  const [videoRow] = await db.select().from(video).where(eq(video.id, clipRow.videoId));
  if (!videoRow) { console.error("❌ Video not found"); process.exit(1); }

  const captionData = await ClipCaptionModel.getByClipId(CLIP_ID);
  if (!captionData?.words || (captionData.words as any[]).length === 0) {
    console.error("❌ No caption words found"); process.exit(1);
  }

  const words = captionData.words as Array<{ word: string; start: number; end: number }>;
  console.log(`📋 Clip: "${clipRow.title}" (${clipRow.startTime}s - ${clipRow.endTime}s)`);
  console.log(`📝 Caption words: ${words.length}`);

  // 2. Create output dir + download source once
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const sourcePath = path.join(OUTPUT_DIR, "source-clip.mp4");

  if (fs.existsSync(sourcePath)) {
    console.log("⬇️  Source already downloaded, reusing.\n");
  } else if (clipRow.rawStorageKey) {
    console.log("⬇️  Downloading source from R2...");
    const cdnUrl = R2Service.getPublicUrl(clipRow.rawStorageKey);
    const response = await fetch(cdnUrl);
    if (!response.ok) throw new Error(`Failed to download source: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(sourcePath, buffer);
    console.log(`   Done (${(buffer.length / 1024 / 1024).toFixed(1)} MB).\n`);
  } else if (videoRow.sourceUrl) {
    console.log("⬇️  Downloading source from YouTube...");
    await downloadYouTubeSegment(videoRow.sourceUrl, clipRow.startTime, clipRow.endTime, sourcePath);
    console.log("   Done.\n");
  } else {
    console.error("❌ No source URL"); process.exit(1);
  }

  // 3. Generate each template
  const results: { id: string; font: string; size: number; status: string; time: number }[] = [];

  for (let i = 0; i < CAPTION_TEMPLATES.length; i++) {
    const t = CAPTION_TEMPLATES[i];
    const outFile = path.join(OUTPUT_DIR, `${t.id}.mp4`);

    if (fs.existsSync(outFile)) {
      console.log(`⏭️  [${i + 1}/${CAPTION_TEMPLATES.length}] ${t.name} — exists, skipping`);
      results.push({ id: t.id, font: t.style.fontFamily, size: t.style.fontSize, status: "skipped", time: 0 });
      continue;
    }

    console.log(`🎨 [${i + 1}/${CAPTION_TEMPLATES.length}] ${t.name} (${t.style.fontFamily}, ${t.style.fontSize}px)`);
    const start = Date.now();

    try {
      // Generate ASS file
      const assContent = generateASS(words, t.style, 608, 1080);
      const assPath = path.join(OUTPUT_DIR, `${t.id}.ass`);
      fs.writeFileSync(assPath, assContent);

      // Burn subtitles with FFmpeg
      await runFFmpeg(sourcePath, assPath, outFile);

      // Clean up ASS file
      fs.unlinkSync(assPath);

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const fileSize = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
      console.log(`   ✅ ${elapsed}s (${fileSize} MB)`);
      results.push({ id: t.id, font: t.style.fontFamily, size: t.style.fontSize, status: "ok", time: Number(elapsed) });
    } catch (err: any) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.error(`   ❌ ${elapsed}s: ${err.message}`);
      results.push({ id: t.id, font: t.style.fontFamily, size: t.style.fontSize, status: "error", time: Number(elapsed) });
    }
  }

  // 4. Summary
  console.log("\n" + "=".repeat(70));
  console.log(`${"Template".padEnd(22)} ${"Font".padEnd(20)} ${"Size".padEnd(6)} ${"Status".padEnd(8)} Time`);
  console.log("-".repeat(70));
  for (const r of results) {
    console.log(`${r.id.padEnd(22)} ${r.font.padEnd(20)} ${String(r.size).padEnd(6)} ${r.status.padEnd(8)} ${r.time}s`);
  }
  console.log("-".repeat(70));
  const ok = results.filter(r => r.status === "ok").length;
  const skip = results.filter(r => r.status === "skipped").length;
  const fail = results.filter(r => r.status === "error").length;
  console.log(`\n✅ ${ok} generated, ⏭️ ${skip} skipped, ❌ ${fail} failed`);
  console.log(`📂 ${OUTPUT_DIR}\n`);
  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
