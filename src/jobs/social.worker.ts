import { Job } from "bullmq";
import { createWorker, SocialPostingJobData } from "./queue";
import { ScheduledPostModel } from "../models/scheduled-post.model";
import { SocialAccountModel } from "../models/social-account.model";
import { maybeRefreshToken } from "../services/social/token-refresh";
import { TikTokService } from "../services/social/tiktok.service";
import { InstagramService } from "../services/social/instagram.service";
import { YouTubeShortsService } from "../services/social/youtube-shorts.service";
import { TwitterService } from "../services/social/twitter.service";
import { db } from "../db";
import { viralClip } from "../db/schema/project.schema";
import { eq } from "drizzle-orm";

async function processPost(job: Job<SocialPostingJobData>) {
  const { postId, clipId, socialAccountId, platform, caption, hashtags } = job.data;
  console.log(`[SOCIAL WORKER] Processing post ${postId} for platform ${platform}`);

  // Mark as posting
  await ScheduledPostModel.updateStatus(postId, "posting");

  // Get clip storage URL
  const clips = await db
    .select({ storageUrl: viralClip.storageUrl })
    .from(viralClip)
    .where(eq(viralClip.id, clipId));

  const storageUrl = clips[0]?.storageUrl;
  if (!storageUrl) throw new Error(`Clip ${clipId} has no storageUrl`);

  // Get account with encrypted tokens
  const account = await SocialAccountModel.getById(socialAccountId);
  if (!account) throw new Error(`Social account ${socialAccountId} not found`);

  // Refresh token if needed
  const { accessToken, updatedTokens } = await maybeRefreshToken(account);

  if (updatedTokens) {
    await SocialAccountModel.updateTokens(socialAccountId, updatedTokens);
  }

  const cap = caption || "";
  const tags = hashtags || [];

  let result;
  switch (platform) {
    case "tiktok":
      result = await TikTokService.postVideo(accessToken, storageUrl, cap, tags);
      break;
    case "instagram":
      result = await InstagramService.postVideo(accessToken, storageUrl, cap, tags);
      break;
    case "youtube":
      result = await YouTubeShortsService.postVideo(accessToken, storageUrl, cap, tags);
      break;
    case "twitter":
      result = await TwitterService.postVideo(accessToken, storageUrl, cap, tags);
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  await ScheduledPostModel.updateStatus(postId, "posted", {
    platformPostId: result.platformPostId,
    platformPostUrl: result.platformPostUrl,
    postedAt: new Date(),
  });

  console.log(`[SOCIAL WORKER] Post ${postId} published: ${result.platformPostUrl}`);
}

export function startSocialWorker(concurrency = 2) {
  const worker = createWorker<SocialPostingJobData>(
    "social-posting",
    async (job) => {
      const { postId } = job.data;
      const maxAttempts = job.opts.attempts || 3;

      try {
        await processPost(job);
      } catch (error) {
        const retryCount = job.attemptsMade;
        const isLastAttempt = retryCount >= maxAttempts - 1;

        await ScheduledPostModel.updateStatus(postId, isLastAttempt ? "failed" : "pending", {
          errorMessage: error instanceof Error ? error.message : String(error),
          retryCount,
        });

        throw error; // Re-throw so BullMQ handles retry
      }
    },
    concurrency
  );

  return worker;
}
