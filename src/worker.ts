import { startVideoWorker } from "./jobs/video.worker";

console.log("[WORKER] Starting video processing worker...");

const worker = startVideoWorker(2);

process.on("SIGTERM", async () => {
  console.log("[WORKER] Received SIGTERM, shutting down gracefully...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[WORKER] Received SIGINT, shutting down gracefully...");
  await worker.close();
  process.exit(0);
});

console.log("[WORKER] Worker is running and waiting for jobs...");
