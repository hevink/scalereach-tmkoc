import type { OAuthTokens, PlatformAccountInfo, PostResult } from "./types";

export const InstagramService = {
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const appId = process.env.INSTAGRAM_APP_ID || "";
    const params = new URLSearchParams({
      force_reauth: "true",
      client_id: appId,
      redirect_uri: redirectUri,
      scope: "instagram_business_basic,instagram_business_content_publish",
      response_type: "code",
      state,
    });
    console.log("[INSTAGRAM] Auth URL params:", { client_id: appId, redirect_uri: redirectUri });
    return `https://www.instagram.com/oauth/authorize?${params}`;
  },

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const appId = process.env.INSTAGRAM_APP_ID || "";
    const appSecret = process.env.INSTAGRAM_APP_SECRET || "";
    console.log("[INSTAGRAM] Exchanging code for token", { redirectUri, appId });
    // Step 1: Get short-lived token from Instagram (using FormData like botyo)
    const formData = new FormData();
    formData.append("client_id", appId);
    formData.append("client_secret", appSecret);
    formData.append("grant_type", "authorization_code");
    formData.append("redirect_uri", redirectUri);
    formData.append("code", code);

    const res = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: formData,
    });
    const data = await res.json() as any;
    console.log("[INSTAGRAM] Short-lived token response:", JSON.stringify(data));
    if (data.error_type || data.error) {
      throw new Error(`Instagram OAuth error: ${data.error_message || data.error}`);
    }

    // Step 2: Exchange short-lived for long-lived token
    const llRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${data.access_token}`
    );
    const llData = await llRes.json() as any;
    console.log("[INSTAGRAM] Long-lived token response:", JSON.stringify(llData));
    if (llData.error) throw new Error(`Instagram long-lived token error: ${llData.error.message}`);

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
