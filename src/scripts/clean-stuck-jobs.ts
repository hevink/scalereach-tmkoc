#!/usr/bin/env bun
/**
 * Clean up stuck or stale BullMQ jobs
 * Usage: bun run src/scripts/clean-stuck-jobs.ts [jobId]
 */

import { clipGenerationQueue, videoProcessingQueue } from "../jobs/queue";

async function cleanStuckJobs(specificJobId?: string) {
  console.log("🧹 Cleaning stuck BullMQ jobs...\n");

  try {
    if (specificJobId) {
      // Clean specific job
      console.log(`Looking for job: ${specificJobId}`);
      
      // Try clip generation queue
      const clipJob = await clipGenerationQueue.getJob(specificJobId);
      if (clipJob) {
        const state = await clipJob.getState();
        console.log(`Found in clip generation queue - State: ${state}`);
        await clipJob.remove();
        console.log("✅ Removed job from clip generation queue");
        return;
      }

      // Try video processing queue
      const videoJob = await videoProcessingQueue.getJob(specificJobId);
      if (videoJob) {
        const state = await videoJob.getState();
        console.log(`Found in video processing queue - State: ${state}`);
        await videoJob.remove();
        console.log("✅ Removed job from video processing queue");
        return;
      }

      console.log("❌ Job not found in any queue");
      return;
    }

    // Clean all stale jobs
    console.log("Cleaning clip generation queue...");
    const clipStats = {
      completed: await clipGenerationQueue.clean(24 * 60 * 60 * 1000, 100, 'completed'),
      failed: await clipGenerationQueue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed'),
      waiting: await clipGenerationQueue.clean(60 * 60 * 1000, 10, 'wait'),
      active: await clipGenerationQueue.clean(30 * 60 * 1000, 10, 'active'),
      delayed: await clipGenerationQueue.clean(60 * 60 * 1000, 10, 'delayed'),
    };
    console.log("Clip generation queue cleaned:", clipStats);

    console.log("\nCleaning video processing queue...");
    const videoStats = {
      completed: await videoProcessingQueue.clean(24 * 60 * 60 * 1000, 100, 'completed'),
      failed: await videoProcessingQueue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed'),
      waiting: await videoProcessingQueue.clean(60 * 60 * 1000, 10, 'wait'),
      active: await videoProcessingQueue.clean(30 * 60 * 1000, 10, 'active'),
      delayed: await videoProcessingQueue.clean(60 * 60 * 1000, 10, 'delayed'),
    };
    console.log("Video processing queue cleaned:", videoStats);

    console.log("\n✅ Cleanup complete!");
  } catch (error) {
    console.error("❌ Error cleaning jobs:", error);
    process.exit(1);
  } finally {
    // Close connections
    await clipGenerationQueue.close();
    await videoProcessingQueue.close();
    process.exit(0);
  }
}

// Get job ID from command line args
const jobId = process.argv[2];

if (jobId) {
  console.log(`Cleaning specific job: ${jobId}\n`);
  cleanStuckJobs(jobId);
} else {
  console.log("Cleaning all stale jobs\n");
  cleanStuckJobs();
}
