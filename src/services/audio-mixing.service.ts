import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, unlink, readFile } from "fs/promises";

/**
 * Audio Mixing Service
 * FFmpeg-based audio processing for dubbing: time-stretch, concatenate, mix, replace
 */
export class AudioMixingService {
  private static logOperation(operation: string, details?: any) {
    console.log(
      `[AUDIO MIXING] ${operation}`,
      details ? JSON.stringify(details) : ""
    );
  }

  private static getTmpPath(filename: string): string {
    return join(tmpdir(), `dubbing-${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`);
  }

  /**
   * Run an FFmpeg command and return stdout as a buffer
   */
  private static runFFmpeg(args: string[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", args);
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];

      proc.stdout.on("data", (chunk) => chunks.push(chunk));
      proc.stderr.on("data", (chunk) => errChunks.push(chunk));

      proc.on("close", (code) => {
        if (code !== 0) {
          const stderr = Buffer.concat(errChunks).toString();
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        } else {
          resolve(Buffer.concat(chunks));
        }
      });

      proc.on("error", reject);
    });
  }

  /**
   * Run FFmpeg with file output (for complex operations)
   */
  private static runFFmpegToFile(args: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", ["-y", ...args]);
      const errChunks: Buffer[] = [];

      proc.stderr.on("data", (chunk) => errChunks.push(chunk));

      proc.on("close", (code) => {
        if (code !== 0) {
          const stderr = Buffer.concat(errChunks).toString();
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        } else {
          resolve();
        }
      });

      proc.on("error", reject);
    });
  }

  /**
   * Time-stretch audio to match a target duration using atempo filter.
   * For ratios outside 0.5-2.0, chains multiple atempo filters.
   */
  static async timeStretch(
    audioBuffer: Buffer,
    currentDuration: number,
    targetDuration: number
  ): Promise<Buffer> {
    if (currentDuration <= 0 || targetDuration <= 0) {
      return audioBuffer;
    }

    const ratio = currentDuration / targetDuration;

    // If ratio is close to 1.0, skip stretching
    if (Math.abs(ratio - 1.0) < 0.05) {
      return audioBuffer;
    }

    this.logOperation("TIME_STRETCH", {
      currentDuration: currentDuration.toFixed(2),
      targetDuration: targetDuration.toFixed(2),
      ratio: ratio.toFixed(3),
    });

    const inputPath = this.getTmpPath("stretch-in.mp3");
    const outputPath = this.getTmpPath("stretch-out.mp3");

    try {
      await writeFile(inputPath, audioBuffer);

      // Build atempo filter chain for ratios outside 0.5-2.0
      const atempoFilters = this.buildAtempoChain(ratio);

      await this.runFFmpegToFile(
        ["-i", inputPath, "-filter:a", atempoFilters, "-f", "mp3", outputPath],
        outputPath
      );

      return await readFile(outputPath);
    } finally {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    }
  }

  /**
   * Build atempo filter chain. atempo only supports 0.5-100.0 range,
   * but for quality we chain values in 0.5-2.0 range.
   */
  private static buildAtempoChain(ratio: number): string {
    // Clamp to reasonable bounds
    const clamped = Math.max(0.25, Math.min(4.0, ratio));

    const filters: string[] = [];
    let remaining = clamped;

    while (remaining > 2.0) {
      filters.push("atempo=2.0");
      remaining /= 2.0;
    }
    while (remaining < 0.5) {
      filters.push("atempo=0.5");
      remaining /= 0.5;
    }
    filters.push(`atempo=${remaining.toFixed(4)}`);

    return filters.join(",");
  }

  /**
   * Concatenate multiple audio buffers with silence padding between segments.
   * Each segment is placed at its target start time.
   */
  static async concatenateWithTiming(
    segments: Array<{
      audio: Buffer;
      startTime: number;
      endTime: number;
    }>,
    totalDuration: number
  ): Promise<Buffer> {
    this.logOperation("CONCATENATE_WITH_TIMING", {
      segmentCount: segments.length,
      totalDuration: totalDuration.toFixed(2),
    });

    if (segments.length === 0) {
      throw new Error("No segments to concatenate");
    }

    const tmpFiles: string[] = [];

    try {
      // Write each segment to a temp file
      for (let i = 0; i < segments.length; i++) {
        const path = this.getTmpPath(`seg-${i}.mp3`);
        await writeFile(path, segments[i].audio);
        tmpFiles.push(path);
      }

      const outputPath = this.getTmpPath("concat-out.mp3");
      tmpFiles.push(outputPath);

      // Build complex filter: generate silence, overlay each segment at its start time
      // First, generate a silent base track
      const silencePath = this.getTmpPath("silence.mp3");
      tmpFiles.push(silencePath);

      await this.runFFmpegToFile(
        [
          "-f", "lavfi",
          "-i", `anullsrc=r=44100:cl=mono`,
          "-t", totalDuration.toFixed(3),
          "-c:a", "libmp3lame",
          "-b:a", "192k",
          silencePath,
        ],
        silencePath
      );

      // Overlay each segment at its start time using adelay + amix
      let currentInput = silencePath;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const delayMs = Math.round(seg.startTime * 1000);
        const stepOutput = this.getTmpPath(`step-${i}.mp3`);
        tmpFiles.push(stepOutput);

        await this.runFFmpegToFile(
          [
            "-i", currentInput,
            "-i", tmpFiles[i],
            "-filter_complex",
            `[1:a]adelay=${delayMs}|${delayMs}[delayed];[0:a][delayed]amix=inputs=2:duration=first:normalize=0[out]`,
            "-map", "[out]",
            "-c:a", "libmp3lame",
            "-b:a", "192k",
            stepOutput,
          ],
          stepOutput
        );

        currentInput = stepOutput;
      }

      return await readFile(currentInput);
    } finally {
      for (const f of tmpFiles) {
        await unlink(f).catch(() => {});
      }
    }
  }

  /**
   * Mix dubbed audio with original audio.
   * Mode "duck": reduce original volume and overlay TTS.
   * Mode "replace": use only TTS audio.
   */
  static async mixAudio(params: {
    originalAudio: Buffer;
    dubbedAudio: Buffer;
    mode: "duck" | "replace";
    duckVolume?: number;
  }): Promise<Buffer> {
    this.logOperation("MIX_AUDIO", {
      mode: params.mode,
      duckVolume: params.duckVolume,
    });

    if (params.mode === "replace") {
      return params.dubbedAudio;
    }

    const volume = params.duckVolume ?? 0.15;
    const originalPath = this.getTmpPath("orig.aac");
    const dubbedPath = this.getTmpPath("dubbed.mp3");
    const outputPath = this.getTmpPath("mixed.aac");

    try {
      await writeFile(originalPath, params.originalAudio);
      await writeFile(dubbedPath, params.dubbedAudio);

      await this.runFFmpegToFile(
        [
          "-i", originalPath,
          "-i", dubbedPath,
          "-filter_complex",
          `[0:a]volume=${volume}[orig];[1:a][orig]amix=inputs=2:duration=first:normalize=0[out]`,
          "-map", "[out]",
          "-c:a", "aac",
          "-b:a", "192k",
          outputPath,
        ],
        outputPath
      );

      return await readFile(outputPath);
    } finally {
      await unlink(originalPath).catch(() => {});
      await unlink(dubbedPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    }
  }

  /**
   * Slice audio to a specific time range (for clip extraction)
   */
  static async sliceAudio(
    audioBuffer: Buffer,
    startTime: number,
    endTime: number
  ): Promise<Buffer> {
    this.logOperation("SLICE_AUDIO", {
      startTime: startTime.toFixed(2),
      endTime: endTime.toFixed(2),
    });

    const inputPath = this.getTmpPath("slice-in.aac");
    const outputPath = this.getTmpPath("slice-out.aac");
    const duration = endTime - startTime;

    try {
      await writeFile(inputPath, audioBuffer);

      await this.runFFmpegToFile(
        [
          "-i", inputPath,
          "-ss", startTime.toFixed(3),
          "-t", duration.toFixed(3),
          "-c:a", "aac",
          "-b:a", "192k",
          outputPath,
        ],
        outputPath
      );

      return await readFile(outputPath);
    } finally {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    }
  }

  /**
   * Get audio duration using ffprobe
   */
  static async getAudioDuration(audioBuffer: Buffer): Promise<number> {
    const inputPath = this.getTmpPath("probe.mp3");

    try {
      await writeFile(inputPath, audioBuffer);

      return new Promise((resolve, reject) => {
        const proc = spawn("ffprobe", [
          "-v", "quiet",
          "-show_entries", "format=duration",
          "-of", "csv=p=0",
          inputPath,
        ]);

        const chunks: Buffer[] = [];
        proc.stdout.on("data", (chunk) => chunks.push(chunk));

        proc.on("close", (code) => {
          if (code !== 0) {
            reject(new Error(`ffprobe failed with code ${code}`));
          } else {
            const duration = parseFloat(Buffer.concat(chunks).toString().trim());
            resolve(isNaN(duration) ? 0 : duration);
          }
        });

        proc.on("error", reject);
      });
    } finally {
      await unlink(inputPath).catch(() => {});
    }
  }
}
