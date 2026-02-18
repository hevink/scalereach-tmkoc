import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";

const POT_SERVER_PORT = parseInt(process.env.BGUTIL_POT_PORT || "4416", 10);
const POT_SERVER_PATH = process.env.BGUTIL_SERVER_PATH || "/tmp/bgutil-ytdlp-pot-provider/server/build/main.js";

let potProcess: ChildProcess | null = null;

/**
 * Start the bgutil POT server as a child process.
 * Sets YT_DLP_GET_POT_BGUTIL_BASE_URL so all yt-dlp spawns pick it up automatically.
 * No-ops if BGUTIL_SERVER_PATH doesn't exist.
 */
export function startPotServer(): void {
  if (!existsSync(POT_SERVER_PATH)) {
    console.log(`[POT] bgutil server not found at ${POT_SERVER_PATH}, skipping POT setup`);
    return;
  }

  console.log(`[POT] Starting bgutil POT server on port ${POT_SERVER_PORT}...`);

  potProcess = spawn("node", [POT_SERVER_PATH, "--port", String(POT_SERVER_PORT)], {
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  potProcess.stdout?.on("data", (data: Buffer) => {
    console.log(`[POT] ${data.toString().trim()}`);
  });

  potProcess.stderr?.on("data", (data: Buffer) => {
    console.error(`[POT] ${data.toString().trim()}`);
  });

  potProcess.on("exit", (code) => {
    console.warn(`[POT] bgutil server exited with code ${code}`);
    potProcess = null;
  });

  // Let yt-dlp spawns inherit this env var
  process.env.YT_DLP_GET_POT_BGUTIL_BASE_URL = `http://localhost:${POT_SERVER_PORT}`;
  console.log(`[POT] YT_DLP_GET_POT_BGUTIL_BASE_URL set to http://localhost:${POT_SERVER_PORT}`);
}

export function stopPotServer(): void {
  if (potProcess) {
    console.log("[POT] Stopping bgutil POT server...");
    potProcess.kill("SIGTERM");
    potProcess = null;
  }
}
