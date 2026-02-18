import type { OAuthTokens, PlatformAccountInfo, PostResult } from "./types";

const APP_ID = process.env.INSTAGRAM_APP_ID || "";
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "";

export const InstagramService = {
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: APP_ID,
      redirect_uri: redirectUri,
      scope: "instagram_basic,instagram_content_publish,pages_show_list",
      response_type: "code",
      state,
    });
    return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
  },

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch("https://graph.facebook.com/v19.0/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        redirect_uri: redirectUri,
        code,
      }),
    });
    const data = await res.json() as any;
    if (data.error) throw new Error(`Instagram OAuth error: ${data.error.message}`);
    // Exchange short-lived for long-lived token
    const llRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${data.access_token}`
    );
    const llData = await llRes.json() as any;
    return {
      accessToken: llData.access_token || data.access_token,
      expiresAt: llData.expires_in ? new Date(Date.now() + llData.expires_in * 1000) : undefined,
    };
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    // Instagram long-lived tokens are refreshed by re-requesting with the existing token
    const res = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${refreshToken}`
    );
    const data = await res.json() as any;
    if (data.error) throw new Error(`Instagram refresh error: ${data.error.message}`);
    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async getUserInfo(accessToken: string): Promise<PlatformAccountInfo> {
    const res = await fetch(
      `https://graph.instagram.com/me?fields=id,name,username,profile_picture_url&access_token=${accessToken}`
    );
    const data = await res.json() as any;
    return {
      platformAccountId: data.id,
      accountName: data.name || data.username,
      accountHandle: data.username,
      avatarUrl: data.profile_picture_url,
    };
  },

  async postVideo(
    accessToken: string,
    videoUrl: string,
    caption: string,
    hashtags: string[]
  ): Promise<PostResult> {
    const fullCaption = hashtags.length
      ? `${caption}\n\n${hashtags.map((h) => `#${h}`).join(" ")}`
      : caption;

    // Get IG user ID
    const meRes = await fetch(`https://graph.instagram.com/me?access_token=${accessToken}`);
    const meData = await meRes.json() as any;
    const igUserId = meData.id;

    // Step 1: Create media container
    const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: videoUrl,
        caption: fullCaption,
        access_token: accessToken,
      }),
    });
    const containerData = await containerRes.json() as any;
    if (containerData.error) throw new Error(`Instagram container error: ${containerData.error.message}`);
    const containerId = containerData.id;

    // Step 2: Poll until FINISHED
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await fetch(
        `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`
      );
      const statusData = await statusRes.json() as any;
      if (statusData.status_code === "FINISHED") break;
      if (statusData.status_code === "ERROR") {
        throw new Error("Instagram media processing failed");
      }
    }

    // Step 3: Publish
    const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
    });
    const publishData = await publishRes.json() as any;
    if (publishData.error) throw new Error(`Instagram publish error: ${publishData.error.message}`);

    return {
      platformPostId: publishData.id,
      platformPostUrl: `https://www.instagram.com/p/${publishData.id}`,
    };
  },
};
