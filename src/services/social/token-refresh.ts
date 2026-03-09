import { decryptToken, encryptToken } from "../../lib/token-encryption";
import { InstagramService } from "./instagram.service";
import { YouTubeShortsService } from "./youtube-shorts.service";
import { TwitterService } from "./twitter.service";
import { LinkedInService } from "./linkedin.service";
import { FacebookService } from "./facebook.service";
import { ThreadsService } from "./threads.service";
import type { OAuthTokens } from "./types";

interface AccountTokens {
  accessToken: string; // encrypted
  refreshToken?: string | null; // encrypted
  tokenExpiresAt?: Date | null;
  platform: string;
}

/**
 * Decrypts tokens, refreshes if expired, returns plain access token.
 * Returns updated encrypted tokens if refreshed (caller should persist).
 */
export async function maybeRefreshToken(account: AccountTokens): Promise<{
  accessToken: string;
  updatedTokens?: { accessToken: string; refreshToken?: string; tokenExpiresAt?: Date };
}> {
  const plainAccess = decryptToken(account.accessToken);

  // Not expired — return as-is
  if (!account.tokenExpiresAt || account.tokenExpiresAt > new Date(Date.now() + 60_000)) {
    return { accessToken: plainAccess };
  }

  if (!account.refreshToken) {
    return { accessToken: plainAccess };
  }

  const plainRefresh = decryptToken(account.refreshToken);
  let refreshed: OAuthTokens;

  switch (account.platform) {
    case "instagram":
      refreshed = await InstagramService.refreshAccessToken(plainRefresh);
      break;
    case "youtube":
      refreshed = await YouTubeShortsService.refreshAccessToken(plainRefresh);
      break;
    case "twitter":
      refreshed = await TwitterService.refreshAccessToken(plainRefresh);
      break;
    case "linkedin":
      refreshed = await LinkedInService.refreshAccessToken(plainRefresh);
      break;
    case "facebook":
      refreshed = await FacebookService.refreshAccessToken(plainRefresh);
      break;
    case "threads":
      refreshed = await ThreadsService.refreshAccessToken(plainRefresh);
      break;
    default:
      return { accessToken: plainAccess };
  }

  return {
    accessToken: refreshed.accessToken,
    updatedTokens: {
      accessToken: encryptToken(refreshed.accessToken),
      refreshToken: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : undefined,
      tokenExpiresAt: refreshed.expiresAt,
    },
  };
}
