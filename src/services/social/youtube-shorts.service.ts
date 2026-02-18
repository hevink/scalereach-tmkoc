import type { OAuthTokens, PlatformAccountInfo, PostResult } from "./types";

const CLIENT_ID = process.env.YOUTUBE_OAUTH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET || "";

export const YouTubeShortsService = {
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code,
      }),
    });
    const data = await res.json() as any;
    if (data.error) throw new Error(`YouTube OAuth error: ${data.error_description}`);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scopes: data.scope,
    };
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json() as any;
    if (data.error) throw new Error(`YouTube refresh error: ${data.error_description}`);
    return {
      accessToken: data.access_token,
      refreshToken: refreshToken, // YouTube doesn't rotate refresh tokens
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async getUserInfo(accessToken: string): Promise<PlatformAccountInfo> {
    const res = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json() as any;
    const channel = data.items?.[0];
    return {
      platformAccountId: channel.id,
      accountName: channel.snippet.title,
      accountHandle: channel.snippet.customUrl,
      avatarUrl: channel.snippet.thumbnails?.default?.url,
    };
  },

  async postVideo(
    accessToken: string,
    videoUrl: string,
    caption: string,
    hashtags: string[]
  ): Promise<PostResult> {
    // Download video to buffer for upload
    const videoRes = await fetch(videoUrl);
    const videoBuffer = await videoRes.arrayBuffer();
    const contentLength = videoBuffer.byteLength;

    const title = caption.slice(0, 100) + " #shorts";
    const description = hashtags.length
      ? `${caption}\n\n${hashtags.map((h) => `#${h}`).join(" ")}`
      : caption;

    // Step 1: Initiate resumable upload
    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/*",
          "X-Upload-Content-Length": String(contentLength),
        },
        body: JSON.stringify({
          snippet: { title, description, categoryId: "22" },
          status: { privacyStatus: "public" },
        }),
      }
    );
    const uploadUrl = initRes.headers.get("Location");
    if (!uploadUrl) throw new Error("YouTube: no upload URL returned");

    // Step 2: Upload video
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/*",
        "Content-Length": String(contentLength),
      },
      body: videoBuffer,
    });
    const uploadData = await uploadRes.json() as any;
    if (!uploadData.id) throw new Error(`YouTube upload error: ${JSON.stringify(uploadData)}`);

    return {
      platformPostId: uploadData.id,
      platformPostUrl: `https://www.youtube.com/shorts/${uploadData.id}`,
    };
  },
};
