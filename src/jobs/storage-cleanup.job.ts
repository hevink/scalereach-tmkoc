/**
 * Storage Cleanup Job
 * Runs daily - finds videos past their expiresAt date, deletes R2 files + clip records,
 * then marks the video as 'expired' (keeps the video row for user visibility).
 */

import { db } from "../db";
import { video, viralClip, videoExport, voiceDubbing, dubbedClipAudio } from "../db/schema";
import { lte, eq, inArray } from "drizzle-orm";
import { R2Service } from "../services/r2.service";

const BATCH_SIZE = 20; // Process N videos per run to avoid memory spikes

async function deleteExpiredVideos(): Promise<void> {
  const now = new Date();
  console.log(`[STORAGE CLEANUP] Starting run at ${now.toISOString()}`);

  // Fetch a batch of expired videos that haven't been cleaned up yet
  const expiredVideos = await db
    .select({
      id: video.id,
      storageKey: video.storageKey,
      audioStorageKey: video.audioStorageKey,
      thumbnailKey: video.thumbnailKey,
    })
    .from(video)
    .where(lte(video.expiresAt, now))
    .limit(BATCH_SIZE);

  // Filter out already-expired ones (status = 'expired' means already cleaned up)
  const videosToClean = [];
  for (const v of expiredVideos) {
    const full = await db.select({ status: video.status }).from(video).where(eq(video.id, v.id));
    if (full[0]?.status !== "expired") videosToClean.push(v);
  }

  if (videosToClean.length === 0) {
    console.log(`[STORAGE CLEANUP] No expired videos to clean up.`);
    return;
  }

  console.log(`[STORAGE CLEANUP] Found ${videosToClean.length} expired video(s) to clean up.`);

  for (const v of videosToClean) {
    try {
      // Gather all R2 keys for this video
      const clips = await db
        .select({
          storageKey: viralClip.storageKey,
          rawStorageKey: viralClip.rawStorageKey,
          thumbnailKey: viralClip.thumbnailKey,
          id: viralClip.id,
        })
        .from(viralClip)
        .where(eq(viralClip.videoId, v.id));

      const clipIds = clips.map(c => c.id);

      const exportRows = clipIds.length > 0
        ? await db.select({ storageKey: videoExport.storageKey }).from(videoExport).where(inArray(videoExport.clipId, clipIds))
        : [];

      const dubbingRows = await db
        .select({ dubbedAudioKey: voiceDubbing.dubbedAudioKey, mixedAudioKey: voiceDubbing.mixedAudioKey, id: voiceDubbing.id })
        .from(voiceDubbing)
        .where(eq(voiceDubbing.videoId, v.id));

      const dubbingIds = dubbingRows.map(d => d.id);
      const clipAudioRows = dubbingIds.length > 0
        ? await db.select({ audioKey: dubbedClipAudio.audioKey }).from(dubbedClipAudio).where(inArray(dubbedClipAudio.dubbingId, dubbingIds))
        : [];

      const r2Keys: string[] = [
        ...[v.storageKey, v.audioStorageKey, v.thumbnailKey].filter(Boolean) as string[],
        ...clips.flatMap(c => [c.storageKey, c.rawStorageKey, c.thumbnailKey].filter(Boolean) as string[]),
        ...exportRows.map(e => e.storageKey).filter(Boolean) as string[],
        ...dubbingRows.flatMap(d => [d.dubbedAudioKey, d.mixedAudioKey].filter(Boolean) as string[]),
        ...clipAudioRows.map(a => a.audioKey).filter(Boolean) as string[],
      ];

      // Delete R2 files (best-effort - don't fail if some are already gone)
      await Promise.allSettled(r2Keys.map(key => R2Service.deleteFile(key)));

      // Delete clip-related DB records (cascade from viralClip handles exports, caption styles, etc.)
      if (clipIds.length > 0) {
        await db.delete(viralClip).where(inArray(viralClip.id, clipIds));
      }

      // Delete dubbing records
      if (dubbingIds.length > 0) {
        await db.delete(voiceDubbing).where(inArray(voiceDubbing.id, dubbingIds));
      }

      // Mark video as expired (keep the row so user can see it was expired)
      await db.update(video).set({
        status: "expired",
        storageKey: null,
        storageUrl: null,
        audioStorageKey: null,
        audioStorageUrl: null,
        thumbnailKey: null,
        thumbnailUrl: null,
      }).where(eq(video.id, v.id));

      console.log(`[STORAGE CLEANUP] Expired video ${v.id} (${r2Keys.length} R2 files removed, ${clipIds.length} clips deleted)`);
    } catch (err) {
      console.error(`[STORAGE CLEANUP] Failed to clean up video ${v.id}:`, err);
      // Continue with next video - don't abort the whole batch
    }
  }

  console.log(`[STORAGE CLEANUP] Run complete.`);
}

/**
 * Start the daily storage cleanup interval.
 * Runs once immediately on startup, then every 24 hours.
 */
export function startStorageCleanupJob(): void {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Run once at startup (with a small delay to let DB connections settle)
  setTimeout(() => {
    deleteExpiredVideos().catch(err =>
      console.error("[STORAGE CLEANUP] Startup run failed:", err)
    );
  }, 30 * 1000); // 30s delay on startup

  // Then every 24 hours
  setInterval(() => {
    deleteExpiredVideos().catch(err =>
      console.error("[STORAGE CLEANUP] Scheduled run failed:", err)
    );
  }, INTERVAL_MS);

  console.log("[STORAGE CLEANUP] Job scheduled - runs every 24h.");
}
