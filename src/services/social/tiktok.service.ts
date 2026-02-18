import type { OAuthTokens, PlatformAccountInfo, PostResult } from "./types";

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";

export const TikTokService = {
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_key: CLIENT_KEY,
      response_type: "code",
      scope: "user.info.basic,video.upload,video.publish",
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize?${params}`;
  },

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const data = await res.json() as any;
    if (data.error) throw new Error(`TikTok OAuth error: ${data.error_description}`);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scopes: data.scope,
    };
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json() as any;
    if (data.error) throw new Error(`TikTok refresh error: ${data.error_description}`);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async getUserInfo(accessToken: string): Promise<PlatformAccountInfo> {
    const res = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json() as any;
    const user = data.data?.user;
    return {
      platformAccountId: user.open_id,
      accountName: user.display_name,
      avatarUrl: user.avatar_url,
    };
  },

  async postVideo(
    accessToken: string,
    videoUrl: string,
    caption: string,
    hashtags: string[]
  ): Promise<PostResult> {
    const fullCaption = hashtags.length
      ? `${caption} ${hashtags.map((h) => `#${h}`).join(" ")}`
      : caption;

    // Step 1: Init upload
    const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: { title: fullCaption, privacy_level: "PUBLIC_TO_EVERYONE" },
        source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
      }),
    });
    const initData = await initRes.json() as any;
    if (initData.error?.code !== "ok") {
      throw new Error(`TikTok init upload error: ${JSON.stringify(initData.error)}`);
    }
    const publishId = initData.data.publish_id;

    // Step 2: Poll status
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ publish_id: publishId }),
      });
      const statusData = await statusRes.json() as any;
      const status = statusData.data?.status;
      if (status === "PUBLISH_COMPLETE") {
        return { platformPostId: publishId };
      }
      if (status === "FAILED") {
        throw new Error(`TikTok publish failed: ${JSON.stringify(statusData.data)}`);
      }
    }
    throw new Error("TikTok publish timed out");
  },
};
