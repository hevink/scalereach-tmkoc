/**
 * Regenerate clips for a video
 * 
 * Usage: bun run regenerate-video-clips.ts <videoId>
 * 
 * This script:
 * 1. Validates the video exists and has proper config
 * 2. Deletes existing clips (optional)
 * 3. Resets video status to trigger clip detection and generation
 */

import { VideoModel } from "./src/models/video.model";
import { VideoConfigModel } from "./src/models/video-config.model";
import { ClipModel } from "./src/models/clip.model";
import { BackgroundVideoModel } from "./src/models/background-video.model";
import { addVideoProcessingJob } from "./src/jobs/queue";

async function regenerateClips(videoId: string, deleteExisting: boolean = true) {
  console.log(`=== Regenerating Clips for Video ${videoId} ===\n`);

  try {
    // 1. Get video
    const video = await VideoModel.getById(videoId);
    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    console.log("Video:", {
      id: video.id,
      title: video.title,
      status: video.status,
      sourceType: video.sourceType,
      sourceUrl: video.sourceUrl,
    });

    // 2. Get config
    const config = await VideoConfigModel.getByVideoId(videoId);
    if (!config) {
      throw new Error(`Video config for ${videoId} not found`);
    }

    console.log("\nConfig:", {
      enableSplitScreen: config.enableSplitScreen,
      splitScreenBgVideoId: config.splitScreenBgVideoId,
      splitRatio: config.splitRatio,
      enableCaptions: config.enableCaptions,
      aspectRatio: config.aspectRatio,
    });

    // 3. Validate background video if split screen is enabled
    if (config.enableSplitScreen && config.splitScreenBgVideoId) {
      const bgVideo = await BackgroundVideoModel.getById(config.splitScreenBgVideoId);
      
      if (!bgVideo) {
        console.log("\n⚠️  Background video not found! Updating to a valid one...");
        
        // Get first available background video
        const allVideos = await BackgroundVideoModel.listAll();
        if (allVideos.length === 0) {
          throw new Error("No background videos found in database");
        }

        const newBgVideo = allVideos[0];
        console.log(`Using background video: ${newBgVideo.storageKey}`);

        await VideoConfigModel.update(config.id, {
          splitScreenBgVideoId: newBgVideo.id,
        });
        
        console.log("✅ Updated background video ID");
      } else {
        console.log("\n✅ Background video exists:", bgVideo.storageKey);
      }
    }

    // 4. Delete existing clips if requested
    if (deleteExisting) {
      const clips = await ClipModel.getByVideoId(videoId);
      console.log(`\nDeleting ${clips.length} existing clips...`);
      
      for (const clip of clips) {
        await ClipModel.delete(clip.id);
        console.log(`  Deleted clip ${clip.id} (${clip.status})`);
      }
    }

    // 5. Reset video status and trigger reprocessing
    console.log("\nResetting video status to 'transcribing'...");
    await VideoModel.update(videoId, { status: "transcribing" });

    console.log("Adding video processing job...");
    await addVideoProcessingJob({
      videoId: video.id,
      projectId: video.projectId || null,
      userId: video.userId,
      sourceType: video.sourceType as "youtube" | "upload",
      sourceUrl: video.sourceUrl || undefined,
      storageKey: video.storageKey || undefined,
    });

    console.log("\n✅ Video processing job added!");
    console.log("\nThe worker will now:");
    console.log("1. Skip transcription (already done)");
    console.log("2. Detect viral clips using AI");
    console.log("3. Generate clips with split screen enabled");
    console.log("\nCheck the worker logs to monitor progress.");

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

// Get video ID from command line
const videoId = process.argv[2];
if (!videoId) {
  console.error("Usage: bun run regenerate-video-clips.ts <videoId>");
  process.exit(1);
}

regenerateClips(videoId);
