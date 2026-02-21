import type { OAuthTokens, PlatformAccountInfo, PostResult } from "./types";
import { createHash, randomBytes } from "crypto";

const CLIENT_ID = process.env.TWITTER_CLIENT_ID || "";
const CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET || "";

// PKCE helpers
export function generatePKCE() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export const TwitterService = {
  getAuthorizationUrl(state: string, redirectUri: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      scope: "tweet.read tweet.write users.read offline.access media.write",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://twitter.com/i/oauth2/authorize?${params}`;
  },

  async exchangeCode(code: string, redirectUri: string, codeVerifier: string): Promise<OAuthTokens> {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    const data = await res.json() as any;
    if (data.error) throw new Error(`Twitter OAuth error: ${data.error_description}`);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scopes: data.scope,
    };
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json() as any;
    if (data.error) throw new Error(`Twitter refresh error: ${data.error_description}`);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async getUserInfo(accessToken: string): Promise<PlatformAccountInfo> {
    const res = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url,username", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as any;
    return {
      platformAccountId: data.data.id,
      accountName: data.data.name,
      accountHandle: `@${data.data.username}`,
      avatarUrl: data.data.profile_image_url,
    };
  },

  async postVideo(
    accessToken: string,
    videoUrl: string,
    caption: string,
    hashtags: string[]
  ): Promise<PostResult> {
    const tweetText = hashtags.length
      ? `${caption} ${hashtags.map((h) => `#${h}`).join(" ")}`
      : caption;

    // Step 1: Download video
    const videoRes = await fetch(videoUrl);
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const totalBytes = videoBuffer.byteLength;

    // Step 2: INIT
    const initRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        command: "INIT",
        total_bytes: String(totalBytes),
        media_type: "video/mp4",
        media_category: "tweet_video",
      }),
    });
    const initData = await initRes.json() as any;
    const mediaId = initData.media_id_string;

    // Step 3: APPEND in 5MB chunks
    const chunkSize = 5 * 1024 * 1024;
    let segmentIndex = 0;
    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
      const chunk = videoBuffer.slice(offset, offset + chunkSize);
      const form = new FormData();
      form.append("command", "APPEND");
      form.append("media_id", mediaId);
      form.append("segment_index", String(segmentIndex));
      form.append("media", new Blob([chunk]));
      await fetch("https://upload.twitter.com/1.1/media/upload.json", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      segmentIndex++;
    }

    // Step 4: FINALIZE
    await fetch("https://upload.twitter.com/1.1/media/upload.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ command: "FINALIZE", media_id: mediaId }),
    });

    // Step 5: Create tweet
    const tweetRes = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: tweetText, media: { media_ids: [mediaId] } }),
    });
    const tweetData = await tweetRes.json() as any;
    if (tweetData.errors) throw new Error(`Twitter post error: ${JSON.stringify(tweetData.errors)}`);

    return {
      platformPostId: tweetData.data.id,
      platformPostUrl: `https://twitter.com/i/web/status/${tweetData.data.id}`,
    };
  },
};
