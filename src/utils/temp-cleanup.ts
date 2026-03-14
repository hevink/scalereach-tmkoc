/**
 * Orphaned Temp File Cleanup
 *
 * Scans the OS temp directory for files matching the clip pipeline naming
 * patterns that are older than a configurable age threshold. These files
 * are left behind when a Node.js process crashes (OOM, SIGKILL) before
 * the `finally` cleanup block can run.
 *
 * Called once on worker startup — not a recurring cron.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** File prefixes used by the clip pipeline temp files */
const ORPHAN_PATTERNS = [
  "src-",          // raw source segment (clip-generator)
  "cap-",          // captioned output (clip-generator)
  "raw-",          // raw output (clip-generator)
  "subs-",         // ASS subtitle file (clip-generator)
  "bg-",           // split-screen background (compositor)
  "reframed-",     // smart crop reframed output
  "shared-src-",   // shared source segment (video worker)
  "sc-cmds-",      // smart crop sendcmd file
  "emoji-overlay-", // emoji PNG overlay
];

const ORPHAN_EXTENSIONS = new Set([".mp4", ".ass", ".txt", ".png", ".wav"]);

/** Default: delete files older than 1 hour */
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Delete orphaned temp files from previous crashed runs.
 * Safe to call on startup — only touches files matching known patterns
 * that are older than `maxAgeMs`.
 */
export async function cleanupOrphanedTempFiles(
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): Promise<void> {
  const tmpDir = os.tmpdir();
  const now = Date.now();
  let deletedCount = 0;
  let deletedBytes = 0;

  try {
    const entries = await fs.promises.readdir(tmpDir);

    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (!ORPHAN_EXTENSIONS.has(ext)) continue;

      const isOrphan = ORPHAN_PATTERNS.some((prefix) => entry.startsWith(prefix));
      if (!isOrphan) continue;

      const fullPath = path.join(tmpDir, entry);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (!stat.isFile()) continue;

        const ageMs = now - stat.mtimeMs;
        if (ageMs < maxAgeMs) continue;

        await fs.promises.unlink(fullPath);
        deletedCount++;
        deletedBytes += stat.size;
      } catch {
        // File may have been deleted between readdir and stat — ignore
      }
    }

    if (deletedCount > 0) {
      console.log(
        `[TEMP CLEANUP] Deleted ${deletedCount} orphaned temp file(s), ` +
        `freed ${(deletedBytes / 1024 / 1024).toFixed(1)} MB`
      );
    } else {
      console.log(`[TEMP CLEANUP] No orphaned temp files found`);
    }
  } catch (err) {
    console.warn(`[TEMP CLEANUP] Failed to scan temp directory:`, err);
  }
}
