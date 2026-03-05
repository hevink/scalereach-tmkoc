import type { OAuthTokens, PlatformAccountInfo, PostResult } from "./types";

const THREADS_API = "https://graph.threads.net";

export const ThreadsService = {
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const appId = process.env.THREADS_APP_ID || "";
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: "threads_basic,threads_content_publish",
      response_type: "code",
      state,
    });
    console.log("[THREADS] Auth URL params:", { client_id: appId, redirect_uri: redirectUri });
    return `https://threads.net/oauth/authorize?${params}`;
  },

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const appId = process.env.THREADS_APP_ID || "";
    const appSecret = process.env.THREADS_APP_SECRET || "";
    console.log("[THREADS] Exchanging code for token", { redirectUri, appId });

    // Step 1: Exchange code for short-lived token (FormData like Instagram)
    const formData = new FormData();
    formData.append("client_id", appId);
    formData.append("client_secret", appSecret);
    formData.append("grant_type", "authorization_code");
    formData.append("redirect_uri", redirectUri);
    formData.append("code", code);

    const res = await fetch(`${THREADS_API}/oauth/access_token`, {
      method: "POST",
      body: formData,
    });
    const data = (await res.json()) as any;
    console.log("[THREADS] Short-lived token response:", JSON.stringify(data));
    if (data.error_type || data.error) {
      throw new Error(`Threads OAuth error: ${data.error_message || data.error}`);
    }

    // Step 2: Exchange short-lived for long-lived token
    const llRes = await fetch(
      `${THREADS_API}/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${data.access_token}`
    );
    const llData = (await llRes.json()) as any;
    console.log("[THREADS] Long-lived token response:", JSON.stringify(llData));
    if (llData.error) throw new Error(`Threads long-lived token error: ${llData.error.message}`);

    return {
      accessToken: llData.access_token || data.access_token,
      expiresAt: llData.expires_in ? new Date(Date.now() + llData.expires_in * 1000) : undefined,
    };
  },

  async refreshAccessToken(token: string): Promise<OAuthTokens> {
    const res = await fetch(
      `${THREADS_API}/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`
    );
    const data = (await res.json()) as any;
    if (data.error) throw new Error(`Threads refresh error: ${data.error.message}`);
    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async getUserInfo(accessToken: string): Promise<PlatformAccountInfo> {
    const res = await fetch(
      `${THREADS_API}/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${accessToken}`
    );
    const data = (await res.json()) as any;
    if (data.error) throw new Error(`Threads user info error: ${data.error.message}`);
    return {
      platformAccountId: data.id,
      accountName: data.username,
      accountHandle: `@${data.username}`,
      avatarUrl: data.threads_profile_picture_url,
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

    // Get Threads user ID
    const meRes = await fetch(`${THREADS_API}/v1.0/me?access_token=${accessToken}`);
    const meData = (await meRes.json()) as any;
    const userId = meData.id;

    // Step 1: Create media container
    const containerRes = await fetch(`${THREADS_API}/v1.0/${userId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type: "VIDEO",
        video_url: videoUrl,
        text: fullCaption,
        access_token: accessToken,
      }),
    });
    const containerData = (await containerRes.json()) as any;
    console.log("[THREADS] Container response:", JSON.stringify(containerData));
    if (containerData.error) throw new Error(`Threads container error: ${containerData.error.message}`);
    const containerId = containerData.id;

    // Step 2: Poll until FINISHED (recommended 30s wait, poll up to 30 times)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await fetch(
        `${THREADS_API}/v1.0/${containerId}?fields=status&access_token=${accessToken}`
      );
      const statusData = (await statusRes.json()) as any;
      console.log(`[THREADS] Container status (attempt ${i + 1}):`, statusData.status);
      if (statusData.status === "FINISHED") break;
      if (statusData.status === "ERROR") {
        throw new Error("Threads media processing failed");
      }
    }

    // Step 3: Publish
    const publishRes = await fetch(`${THREADS_API}/v1.0/${userId}/threads_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      }),
    });
    const publishData = (await publishRes.json()) as any;
    if (publishData.error) throw new Error(`Threads publish error: ${publishData.error.message}`);

    // Fetch permalink
    let postUrl = `https://www.threads.net`;
    try {
      const mediaRes = await fetch(
        `${THREADS_API}/v1.0/${publishData.id}?fields=permalink&access_token=${accessToken}`
      );
      const mediaData = (await mediaRes.json()) as any;
      if (mediaData.permalink) postUrl = mediaData.permalink;
    } catch {
      // Fall back to generic URL
    }

    return {
      platformPostId: publishData.id,
      platformPostUrl: postUrl,
    };
  },
};
