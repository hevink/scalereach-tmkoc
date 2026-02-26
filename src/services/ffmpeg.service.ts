/**
 * FFmpeg Service
 * Handles video/audio processing using FFmpeg
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import { PassThrough } from "stream";
import { R2Service } from "./r2.service";

export interface AudioExtractionResult {
  audioStorageKey: string;
  audioStorageUrl: string;
  mimeType: string;
  duration?: number;
}

export interface VideoMetadata {
  duration: number;
  width?: number;
  height?: number;
  codec?: string;
  bitrate?: number;
}

export class FFmpegService {
  /**
   * Extracts audio from a video file and streams it to R2 storage
   * @param videoStorageKey The R2 storage key of the source video
   * @param outputStorageKey The R2 storage key for the extracted audio
   * @returns AudioExtractionResult with storage details
   */
  static async extractAudioToR2(
    videoStorageKey: string,
    outputStorageKey: string
  ): Promise<AudioExtractionResult> {
    console.log(`[FFMPEG SERVICE] Extracting audio from: ${videoStorageKey}`);

    // Get signed URL for the source video
    const videoUrl = await R2Service.getSignedDownloadUrl(videoStorageKey, 3600);

    return new Promise((resolve, reject) => {
      // FFmpeg arguments for audio extraction
      // -i: input file (from URL)
      // -vn: no video
      // -acodec: audio codec (aac for m4a)
      // -f: output format
      // -: output to stdout
      const args = [
        "-i", videoUrl,
        "-vn",                    // No video
        "-acodec", "aac",         // AAC codec for m4a
        "-b:a", "128k",           // Audio bitrate
        "-f", "adts",             // ADTS format for streaming AAC
        "-",                      // Output to stdout
      ];

      console.log(`[FFMPEG SERVICE] Running FFmpeg with args: ${args.join(" ")}`);

      const ffmpegProcess = spawn("ffmpeg", args);

      if (!ffmpegProcess.stdout) {
        reject(new Error("Failed to create FFmpeg stdout stream"));
        return;
      }

      // Create a pass-through stream to pipe FFmpeg output
      const audioStream = new PassThrough();
      ffmpegProcess.stdout.pipe(audioStream);

      let stderr = "";

      ffmpegProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
        // Log progress (FFmpeg outputs progress to stderr)
        const progressMatch = data.toString().match(/time=(\d{2}:\d{2}:\d{2})/);
        if (progressMatch) {
          console.log(`[FFMPEG SERVICE] Progress: ${progressMatch[1]}`);
        }
      });

      ffmpegProcess.on("error", (err) => {
        console.error(`[FFMPEG SERVICE] Process error: ${err.message}`);
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}. Make sure FFmpeg is installed.`));
      });

      // Start uploading to R2 immediately
      R2Service.uploadFromStream(outputStorageKey, audioStream, "audio/aac")
        .then(({ key, url }) => {
          console.log(`[FFMPEG SERVICE] Audio uploaded to R2: ${key}`);
          resolve({
            audioStorageKey: key,
            audioStorageUrl: url,
            mimeType: "audio/aac",
          });
        })
        .catch((uploadError) => {
          console.error(`[FFMPEG SERVICE] Upload error: ${uploadError.message}`);
          ffmpegProcess.kill();
          reject(uploadError);
        });

      ffmpegProcess.on("close", (code) => {
        if (code !== 0 && code !== null) {
          console.error(`[FFMPEG SERVICE] FFmpeg exited with code ${code}`);
          console.error(`[FFMPEG SERVICE] stderr: ${stderr}`);
          // Note: We don't reject here because the upload might have already completed
          // The upload promise will handle success/failure
        } else {
          console.log(`[FFMPEG SERVICE] FFmpeg completed successfully`);
        }
      });
    });
  }

  /**
   * Extracts audio from a video URL and streams it to R2 storage
   * @param videoUrl The URL of the source video
   * @param outputStorageKey The R2 storage key for the extracted audio
   * @returns AudioExtractionResult with storage details
   */
  static async extractAudioFromUrlToR2(
    videoUrl: string,
    outputStorageKey: string
  ): Promise<AudioExtractionResult> {
    console.log(`[FFMPEG SERVICE] Extracting audio from URL to: ${outputStorageKey}`);

    return new Promise((resolve, reject) => {
      const args = [
        "-i", videoUrl,
        "-vn",
        "-acodec", "aac",
        "-b:a", "128k",
        "-f", "adts",
        "-",
      ];

      const ffmpegProcess = spawn("ffmpeg", args);

      if (!ffmpegProcess.stdout) {
        reject(new Error("Failed to create FFmpeg stdout stream"));
        return;
      }

      const audioStream = new PassThrough();
      ffmpegProcess.stdout.pipe(audioStream);

      let stderr = "";

      ffmpegProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpegProcess.on("error", (err) => {
        console.error(`[FFMPEG SERVICE] Process error: ${err.message}`);
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });

      R2Service.uploadFromStream(outputStorageKey, audioStream, "audio/aac")
        .then(({ key, url }) => {
          console.log(`[FFMPEG SERVICE] Audio uploaded to R2: ${key}`);
          resolve({
            audioStorageKey: key,
            audioStorageUrl: url,
            mimeType: "audio/aac",
          });
        })
        .catch((uploadError) => {
          console.error(`[FFMPEG SERVICE] Upload error: ${uploadError.message}`);
          ffmpegProcess.kill();
          reject(uploadError);
        });

      ffmpegProcess.on("close", (code) => {
        if (code !== 0 && code !== null) {
          console.error(`[FFMPEG SERVICE] FFmpeg exited with code ${code}: ${stderr}`);
        }
      });
    });
  }

  /**
   * Gets video metadata using FFprobe
   * @param videoUrl URL or path to the video
   * @returns VideoMetadata with duration and other info
   */
  static async getVideoMetadata(videoUrl: string): Promise<VideoMetadata> {
    console.log(`[FFMPEG SERVICE] Getting metadata for: ${videoUrl}`);

    return new Promise((resolve, reject) => {
      const args = [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        videoUrl,
      ];

      const ffprobeProcess = spawn("ffprobe", args);

      let stdout = "";
      let stderr = "";

      ffprobeProcess.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      ffprobeProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      ffprobeProcess.on("error", (err) => {
        reject(new Error(`Failed to spawn FFprobe: ${err.message}. Make sure FFmpeg is installed.`));
      });

      ffprobeProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          const info = JSON.parse(stdout);
          const videoStream = info.streams?.find((s: any) => s.codec_type === "video");
          const format = info.format;

          resolve({
            duration: parseFloat(format?.duration || "0"),
            width: videoStream?.width,
            height: videoStream?.height,
            codec: videoStream?.codec_name,
            bitrate: parseInt(format?.bit_rate || "0", 10),
          });
        } catch (e) {
          reject(new Error(`Failed to parse FFprobe output: ${e}`));
        }
      });
    });
  }

  /**
   * Generates an audio storage key from a video storage key
   * @param videoStorageKey The video storage key
   * @returns Audio storage key with .aac extension
   */
  static generateAudioStorageKey(videoStorageKey: string): string {
    // Replace video extension with .aac
    const basePath = videoStorageKey.replace(/\.[^/.]+$/, "");
    return `${basePath}-audio.aac`;
  }

  /**
   * Generate a thumbnail from a video at a specific timestamp
   * Extracts a single frame and uploads it to R2
   */
  static async generateThumbnail(
    videoUrl: string,
    thumbnailStorageKey: string,
    timestampSeconds: number = 1
  ): Promise<{ thumbnailKey: string; thumbnailUrl: string }> {
    console.log(`[FFMPEG SERVICE] Generating thumbnail at ${timestampSeconds}s for: ${thumbnailStorageKey}`);

    return new Promise((resolve, reject) => {
      const args = [
        "-ss", timestampSeconds.toString(),
        "-i", videoUrl,
        "-vframes", "1",
        "-q:v", "2",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "-",
      ];

      const ffmpegProcess = spawn("ffmpeg", args);
      const chunks: Buffer[] = [];
      let stderr = "";

      ffmpegProcess.stdout?.on("data", (data) => {
        chunks.push(data);
      });

      ffmpegProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpegProcess.on("error", (err) => {
        reject(new Error(`FFmpeg thumbnail failed: ${err.message}`));
      });

      ffmpegProcess.on("close", async (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg thumbnail failed with code ${code}: ${stderr.slice(-500)}`));
          return;
        }

        const buffer = Buffer.concat(chunks);
        if (buffer.length < 1000) {
          reject(new Error(`Thumbnail too small (${buffer.length} bytes), likely no frames extracted`));
          return;
        }

        try {
          const { url } = await R2Service.uploadFile(thumbnailStorageKey, buffer, "image/jpeg");
          console.log(`[FFMPEG SERVICE] Thumbnail uploaded: ${thumbnailStorageKey} (${buffer.length} bytes)`);
          resolve({ thumbnailKey: thumbnailStorageKey, thumbnailUrl: url });
        } catch (uploadErr) {
          reject(new Error(`Failed to upload thumbnail: ${uploadErr}`));
        }
      });
    });
  }

  /**
   * Apply smart crop coordinates to produce a vertical 9:16 video
   * Streams output directly to R2 (same pattern as other methods)
   */
  static async applySmartCrop(
    videoUrl: string,
    cropCoords: Array<{ t: number; x: number; y: number; w: number; h: number }>,
    outputStorageKey: string,
    tmpDir: string = "/tmp"
  ): Promise<{ storageKey: string; storageUrl: string }> {
    console.log(`[FFMPEG SERVICE] Applying smart crop → ${outputStorageKey}`);

    const cmdFile = `${tmpDir}/smart-crop-cmds-${Date.now()}.txt`;
    const cmdLines = cropCoords.flatMap(({ t, x, y, w, h }) => [
      `${t} crop x ${x};`,
      `${t} crop y ${y};`,
      `${t} crop w ${w};`,
      `${t} crop h ${h};`,
    ]);
    await fs.writeFile(cmdFile, cmdLines.join("\n"));

    const first = cropCoords[0];

    return new Promise((resolve, reject) => {
      const args = [
        "-i", videoUrl,
        "-vf", `sendcmd=f=${cmdFile},crop=${first.w}:${first.h}`,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-f", "mp4",
        "-movflags", "frag_keyframe+empty_moov",
        "-",
      ];

      const ffmpegProcess = spawn("ffmpeg", args);

      if (!ffmpegProcess.stdout) {
        reject(new Error("Failed to create FFmpeg stdout stream"));
        return;
      }

      const videoStream = new PassThrough();
      ffmpegProcess.stdout.pipe(videoStream);

      let stderr = "";
      ffmpegProcess.stderr?.on("data", (data) => { stderr += data.toString(); });
      ffmpegProcess.on("error", (err) => reject(new Error(`FFmpeg spawn failed: ${err.message}`)));

      R2Service.uploadFromStream(outputStorageKey, videoStream, "video/mp4")
        .then(({ key, url }) => {
          fs.unlink(cmdFile).catch(() => {});
          console.log(`[FFMPEG SERVICE] Smart crop uploaded: ${key}`);
          resolve({ storageKey: key, storageUrl: url });
        })
        .catch((err) => {
          ffmpegProcess.kill();
          reject(err);
        });

      ffmpegProcess.on("close", (code) => {
        if (code !== 0 && code !== null) {
          console.error(`[FFMPEG SERVICE] Smart crop exited ${code}: ${stderr.slice(-500)}`);
        }
      });
    });
  }

  /**
   * Apply split screen layout for screen recording + PiP face cam videos
   * Top = screen content, Bottom = face cam
   */
  static async applySplitScreen(
    videoUrl: string,
    splitResult: {
      screen: { x: number; y: number; w: number; h: number };
      pip: { x: number; y: number; w: number; h: number };
      split_ratio: number;
    },
    outputStorageKey: string,
    tmpDir: string = "/tmp"
  ): Promise<{ storageKey: string; storageUrl: string }> {
    console.log(`[FFMPEG SERVICE] Applying split screen → ${outputStorageKey}`);

    const { screen, pip, split_ratio } = splitResult;
    const outW    = 607;
    const outH    = 1080;
    const screenH = Math.round(outH * split_ratio / 100);
    const faceH   = outH - screenH;

    return new Promise((resolve, reject) => {
      const args = [
        "-i", videoUrl,
        "-filter_complex",
        `[0:v]crop=${screen.w}:${screen.h}:${screen.x}:${screen.y},scale=${outW}:${screenH}[top];` +
        `[0:v]crop=${pip.w}:${pip.h}:${pip.x}:${pip.y},scale=${outW}:${faceH}[bottom];` +
        `[top][bottom]vstack=inputs=2[out]`,
        "-map", "[out]", "-map", "0:a",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-f", "mp4", "-movflags", "frag_keyframe+empty_moov",
        "-",
      ];

      const ffmpegProcess = spawn("ffmpeg", args);
      if (!ffmpegProcess.stdout) { reject(new Error("No stdout")); return; }

      const videoStream = new PassThrough();
      ffmpegProcess.stdout.pipe(videoStream);

      let stderr = "";
      ffmpegProcess.stderr?.on("data", (d) => { stderr += d.toString(); });
      ffmpegProcess.on("error", (err) => reject(new Error(`FFmpeg spawn failed: ${err.message}`)));

      R2Service.uploadFromStream(outputStorageKey, videoStream, "video/mp4")
        .then(({ key, url }) => {
          console.log(`[FFMPEG SERVICE] Split screen uploaded: ${key}`);
          resolve({ storageKey: key, storageUrl: url });
        })
        .catch((err) => { ffmpegProcess.kill(); reject(err); });

      ffmpegProcess.on("close", (code) => {
        if (code !== 0 && code !== null) {
          console.error(`[FFMPEG SERVICE] Split screen exited ${code}: ${stderr.slice(-500)}`);
        }
      });
    });
  }

  /**
   * Apply mixed crop: face sections → 9:16 crop, no-face sections → letterbox
   * Uses FFmpeg segment concat approach
   */
  static async applyMixedCrop(
    videoUrl: string,
    segments: Array<{
      type: "face" | "letterbox";
      start: number;
      end: number;
      coords: Array<{ t: number; x: number; y: number; w: number; h: number }>;
    }>,
    cropW: number,
    cropH: number,
    outputStorageKey: string,
    tmpDir: string = "/tmp"
  ): Promise<{ storageKey: string; storageUrl: string }> {
    console.log(`[FFMPEG SERVICE] Applying mixed crop → ${outputStorageKey} (${segments.length} segments)`);

    const id = Date.now();
    const segFiles: string[] = [];
    const concatFile = `${tmpDir}/mixed-concat-${id}.txt`;

    // Process each segment into a temp file
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segOut = `${tmpDir}/mixed-seg-${id}-${i}.mp4`;
      segFiles.push(segOut);
      const duration = seg.end - seg.start;

      if (seg.type === "face") {
        // Crop to 9:16 using sendcmd
        const cmdFile = `${tmpDir}/mixed-cmd-${id}-${i}.txt`;
        const cmdLines = seg.coords.flatMap(({ t, x, y, w, h }) => [
          `${t} crop x ${x};`,
          `${t} crop y ${y};`,
          `${t} crop w ${w};`,
          `${t} crop h ${h};`,
        ]);
        await fs.writeFile(cmdFile, cmdLines.join("\n"));
        const first = seg.coords[0];

        await new Promise<void>((resolve, reject) => {
          const args = [
            "-ss", seg.start.toString(), "-t", duration.toString(),
            "-i", videoUrl,
            "-vf", `sendcmd=f=${cmdFile},crop=${first.w}:${first.h}`,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-y", segOut,
          ];
          const proc = spawn("ffmpeg", args);
          let stderr = "";
          proc.stderr?.on("data", (d) => { stderr += d.toString(); });
          proc.on("error", reject);
          proc.on("close", (code) => {
            fs.unlink(cmdFile).catch(() => {});
            code === 0 ? resolve() : reject(new Error(`FFmpeg seg ${i} failed: ${stderr.slice(-300)}`));
          });
        });
      } else {
        // Letterbox: scale 16:9 to fit inside 9:16 with black bars
        await new Promise<void>((resolve, reject) => {
          const args = [
            "-ss", seg.start.toString(), "-t", duration.toString(),
            "-i", videoUrl,
            "-vf", `scale=${cropW}:-2,pad=${cropW}:${cropH}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-y", segOut,
          ];
          const proc = spawn("ffmpeg", args);
          let stderr = "";
          proc.stderr?.on("data", (d) => { stderr += d.toString(); });
          proc.on("error", reject);
          proc.on("close", (code) => {
            code === 0 ? resolve() : reject(new Error(`FFmpeg letterbox seg ${i} failed: ${stderr.slice(-300)}`));
          });
        });
      }
    }

    // Write concat list
    const concatLines = segFiles.map((f) => `file '${f}'`).join("\n");
    await fs.writeFile(concatFile, concatLines);

    // Concat all segments → stream to R2
    return new Promise((resolve, reject) => {
      const args = [
        "-f", "concat", "-safe", "0", "-i", concatFile,
        "-c", "copy",
        "-f", "mp4", "-movflags", "frag_keyframe+empty_moov",
        "-",
      ];

      const ffmpegProcess = spawn("ffmpeg", args);
      if (!ffmpegProcess.stdout) { reject(new Error("No stdout")); return; }

      const videoStream = new PassThrough();
      ffmpegProcess.stdout.pipe(videoStream);

      let stderr = "";
      ffmpegProcess.stderr?.on("data", (d) => { stderr += d.toString(); });
      ffmpegProcess.on("error", (err) => reject(new Error(`FFmpeg concat failed: ${err.message}`)));

      R2Service.uploadFromStream(outputStorageKey, videoStream, "video/mp4")
        .then(({ key, url }) => {
          // Cleanup temp files
          for (const f of [...segFiles, concatFile]) fs.unlink(f).catch(() => {});
          console.log(`[FFMPEG SERVICE] Mixed crop uploaded: ${key}`);
          resolve({ storageKey: key, storageUrl: url });
        })
        .catch((err) => { ffmpegProcess.kill(); reject(err); });

      ffmpegProcess.on("close", (code) => {
        if (code !== 0 && code !== null) {
          console.error(`[FFMPEG SERVICE] Mixed crop concat exited ${code}: ${stderr.slice(-500)}`);
        }
      });
    });
  }
}
