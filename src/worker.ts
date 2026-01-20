import { startVideoWorker } from "./jobs/video.worker";
import { startClipWorker } from "./jobs/clip.worker";

console.log("[WORKER] Starting video processing worker...");
const videoWorker = startVideoWorker(1);

console.log("[WORKER] Starting clip generation worker...");
const clipWorker = startClipWorker(1);

process.on("SIGTERM", async () => {
  console.log("[WORKER] Received SIGTERM, shutting down gracefully...");
  await Promise.all([videoWorker.close(), clipWorker.close()]);
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[WORKER] Received SIGINT, shutting down gracefully...");
  await Promise.all([videoWorker.close(), clipWorker.close()]);
  process.exit(0);
});

console.log("[WORKER] Workers are running and waiting for jobs...");
