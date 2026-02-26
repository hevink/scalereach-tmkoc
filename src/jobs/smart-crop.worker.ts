import { Job } from "bullmq";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { ClipModel } from "../models/clip.model";
import { R2Service } from "../services/r2.service";
import { FFmpegService } from "../services/ffmpeg.service";
import { captureException } from "../lib/sentry";
import { createWorker, QUEUE_NAMES, SmartCropJobData } from "./queue";

const PYTHON_PATH = process.env.PYTHON_PATH || "python3";
const SMART_CROP_SCRIPT = path.join(__dirname, "../scripts/smart_crop.py");
const TMP_DIR = process.env.SMART_CROP_TMP_DIR || "/tmp";

function runPythonScript(videoUrl: string, clipId: string, tmpDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[SMART CROP WORKER] Spawning Python: ${PYTHON_PATH} ${SMART_CROP_SCRIPT}`);
    const proc = spawn(PYTHON_PATH, [SMART_CROP_SCRIPT, videoUrl, clipId, tmpDir]);

    proc.stdout?.on("data", (d) => process.stdout.write(`[SMART CROP PY] ${d}`));
    proc.stderr?.on("data", (d) => process.stderr.write(`[SMART CROP PY] ${d}`));

    proc.on("error", (err) => reject(new Error(`Python spawn failed: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Python script exited with code ${code}`));
    });
  });
}

async function processSmartCropJob(job: Job<SmartCropJobData>): Promise<void> {
  const { clipId, videoId, workspaceId, storageKey } = job.data;
  const jobStart = Date.now();
  console.log(`[SMART CROP WORKER] Processing: ${clipId}`);

  try {
    // Mark as processing
    await ClipModel.update(clipId, { smartCropStatus: "processing" });
    await job.updateProgress(10);

    // Get signed URL for the source clip
    const videoUrl = await R2Service.getSignedDownloadUrl(storageKey, 3600);
    await job.updateProgress(15);

    // Run Python sidecar — face detection + diarization → coords.json
    await runPythonScript(videoUrl, clipId, TMP_DIR);
    await job.updateProgress(60);

    // Read result from Python sidecar
    const coordsPath = `${TMP_DIR}/${clipId}_coords.json`;
    const coordsRaw = await fs.readFile(coordsPath, "utf-8");
    const result = JSON.parse(coordsRaw);
    await job.updateProgress(65);

    // Apply FFmpeg → stream to R2
    const outputKey = `${workspaceId}/${videoId}/${clipId}-vertical.mp4`;
    let outKey: string;
    let storageUrl: string;

    if (result.mode === "split") {
      ({ storageKey: outKey, storageUrl } = await FFmpegService.applySplitScreen(
        videoUrl, result, outputKey, TMP_DIR
      ));
    } else {
      ({ storageKey: outKey, storageUrl } = await FFmpegService.applySmartCrop(
        videoUrl, result.coords, outputKey, TMP_DIR
      ));
    }
    await job.updateProgress(95);

    // Update DB
    await ClipModel.update(clipId, {
      smartCropStatus: "done",
      smartCropStorageKey: outKey,
      smartCropStorageUrl: storageUrl,
    });
    await job.updateProgress(100);

    // Cleanup coords file
    await fs.unlink(coordsPath).catch(() => {});

    const totalMs = Date.now() - jobStart;
    console.log(`[SMART CROP WORKER] Done: ${clipId} in ${(totalMs / 1000).toFixed(1)}s → ${storageUrl}`);
  } catch (error) {
    console.error(`[SMART CROP WORKER] Failed: ${clipId}`, error);
    if (error instanceof Error) captureException(error, { clipId, videoId });

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;
    if (isLastAttempt) {
      await ClipModel.update(clipId, {
        smartCropStatus: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
    throw error;
  }
}

export function startSmartCropWorker(concurrency = 1) {
  console.log(`[SMART CROP WORKER] Starting with concurrency: ${concurrency}`);
  const worker = createWorker<SmartCropJobData>(
    QUEUE_NAMES.SMART_CROP,
    processSmartCropJob,
    concurrency
  );
  worker.on("failed", (job, err) => {
    console.log(`[SMART CROP WORKER] Job ${job?.id} failed: ${err.message}`);
  });
  return worker;
}
