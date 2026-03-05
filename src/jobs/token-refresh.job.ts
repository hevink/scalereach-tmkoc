import { db } from "../db";
import { socialAccount } from "../db/schema/social.schema";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import { decryptToken, encryptToken } from "../lib/token-encryption";
import { SocialAccountModel } from "../models/social-account.model";
import { TikTokService } from "../services/social/tiktok.service";
import { InstagramService } from "../services/social/instagram.service";
import { YouTubeShortsService } from "../services/social/youtube-shorts.service";
import { TwitterService } from "../services/social/twitter.service";
import { LinkedInService } from "../services/social/linkedin.service";
import { FacebookService } from "../services/social/facebook.service";
import { ThreadsService } from "../services/social/threads.service";
import type { OAuthTokens } from "../services/social/types";

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

async function refreshToken(platform: string, token: string): Promise<OAuthTokens | null> {
  switch (platform) {
    case "tiktok":
      return TikTokService.refreshAccessToken(token);
    case "instagram":
      return InstagramService.refreshAccessToken(token);
    case "youtube":
      return YouTubeShortsService.refreshAccessToken(token);
    case "twitter":
      return TwitterService.refreshAccessToken(token);
    case "linkedin":
      return LinkedInService.refreshAccessToken(token);
    case "facebook":
      return FacebookService.refreshAccessToken(token);
    case "threads":
      return ThreadsService.refreshAccessToken(token);
    default:
      return null;
  }
}

/**
 * Proactively refresh tokens expiring within the next 10 days.
 * Runs every 24 hours on the worker.
 */
async function refreshExpiringTokens() {
  const cutoff = new Date(Date.now() + TEN_DAYS_MS);
  console.log(`[TOKEN REFRESH CRON] Checking for tokens expiring before ${cutoff.toISOString()}`);

  try {
    const accounts = await db
      .select()
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.isActive, true),
          isNotNull(socialAccount.tokenExpiresAt),
          lt(socialAccount.tokenExpiresAt, cutoff)
        )
      );

    if (accounts.length === 0) {
      console.log("[TOKEN REFRESH CRON] No tokens expiring soon");
      return;
    }

    console.log(`[TOKEN REFRESH CRON] Found ${accounts.length} account(s) with expiring tokens`);

    for (const account of accounts) {
      try {
        // For platforms with refresh tokens, use the refresh token; otherwise use access token
        const tokenToUse = account.refreshToken
          ? decryptToken(account.refreshToken)
          : decryptToken(account.accessToken);

        const refreshed = await refreshToken(account.platform, tokenToUse);
        if (!refreshed) continue;

        await SocialAccountModel.updateTokens(account.id, {
          accessToken: encryptToken(refreshed.accessToken),
          refreshToken: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : undefined,
          tokenExpiresAt: refreshed.expiresAt,
        });

        console.log(`[TOKEN REFRESH CRON] Refreshed ${account.platform} token for ${account.accountName} (${account.id})`);
      } catch (err) {
        console.error(`[TOKEN REFRESH CRON] Failed to refresh ${account.platform} for ${account.accountName} (${account.id}):`, err);
      }
    }
  } catch (err) {
    console.error("[TOKEN REFRESH CRON] Error:", err);
  }
}

export function startTokenRefreshJob() {
  // Run once on startup after 30s delay
  setTimeout(refreshExpiringTokens, 30_000);
  // Then every 24 hours
  setInterval(refreshExpiringTokens, TWENTY_FOUR_HOURS_MS);
  console.log("[TOKEN REFRESH CRON] Scheduled every 24h (refreshes tokens expiring within 10 days)");
}
