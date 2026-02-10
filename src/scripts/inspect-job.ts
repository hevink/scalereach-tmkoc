#!/usr/bin/env bun
/**
 * Inspect a BullMQ job's details
 * Usage: bun run src/scripts/inspect-job.ts <jobId>
 */

import { clipGenerationQueue, videoProcessingQueue } from "../jobs/queue";

async function inspectJob(jobId: string) {
  console.log(`🔍 Inspecting job: ${jobId}\n`);

  try {
    // Try clip generation queue
    let job = await clipGenerationQueue.getJob(jobId);
    let queueName = "clip-generation";

    if (!job) {
      // Try video processing queue
      job = await videoProcessingQueue.getJob(jobId);
      queueName = "video-processing";
    }

    if (!job) {
      console.log("❌ Job not found in any queue");
      process.exit(1);
    }

    console.log(`Queue: ${queueName}`);
    console.log(`Job ID: ${job.id}`);
    console.log(`Name: ${job.name}`);
    console.log(`State: ${await job.getState()}`);
    console.log(`\nTimestamps:`);
    console.log(`  Created: ${job.timestamp ? new Date(job.timestamp).toISOString() : 'N/A'}`);
    console.log(`  Processed: ${job.processedOn ? new Date(job.processedOn).toISOString() : 'N/A'}`);
    console.log(`  Finished: ${job.finishedOn ? new Date(job.finishedOn).toISOString() : 'N/A'}`);
    
    if (job.timestamp) {
      const ageMs = Date.now() - job.timestamp;
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
      console.log(`  Age: ${ageHours}h ${ageMinutes}m`);
    }

    console.log(`\nAttempts: ${job.attemptsMade}/${job.opts.attempts || 1}`);
    
    if (job.failedReason) {
      console.log(`\nFailed Reason: ${job.failedReason}`);
    }

    if (job.returnvalue) {
      console.log(`\nReturn Value:`);
      console.log(JSON.stringify(job.returnvalue, null, 2));
    }

    console.log(`\nData:`);
    console.log(JSON.stringify(job.data, null, 2));

    console.log(`\n✅ Inspection complete`);
  } catch (error) {
    console.error("❌ Error inspecting job:", error);
    process.exit(1);
  } finally {
    await clipGenerationQueue.close();
    await videoProcessingQueue.close();
    process.exit(0);
  }
}

const jobId = process.argv[2];

if (!jobId) {
  console.error("❌ Please provide a job ID");
  console.log("Usage: bun run src/scripts/inspect-job.ts <jobId>");
  process.exit(1);
}

inspectJob(jobId);
