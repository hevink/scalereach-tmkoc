import type { OAuthTokens, PlatformAccountInfo, PostResult } from "./types";

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || "";
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || "";

export const LinkedInService = {
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      scope: "openid profile email w_member_social",
      state,
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  },

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    const data = await res.json() as any;
    if (data.error) throw new Error(`LinkedIn OAuth error: ${data.error_description}`);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scopes: data.scope,
    };
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    const data = await res.json() as any;
    if (data.error) throw new Error(`LinkedIn refresh error: ${data.error_description}`);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async getUserInfo(accessToken: string): Promise<PlatformAccountInfo> {
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as any;
    return {
      platformAccountId: data.sub,
      accountName: data.name,
      accountHandle: data.email,
      avatarUrl: data.picture,
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

    // Step 1: Get member URN
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json() as any;
    const authorUrn = `urn:li:person:${profile.sub}`;

    // Step 2: Register upload
    const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
          owner: authorUrn,
          serviceRelationships: [
            { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
          ],
        },
      }),
    });
    const registerData = await registerRes.json() as any;
    const uploadUrl = registerData.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
    const asset = registerData.value?.asset;
    if (!uploadUrl || !asset) throw new Error("LinkedIn: failed to register upload");

    // Step 3: Download and upload video
    const videoRes = await fetch(videoUrl);
    const videoBuffer = await videoRes.arrayBuffer();
    await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: videoBuffer,
    });

    // Step 4: Create post
    const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: authorUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: fullCaption },
            shareMediaCategory: "VIDEO",
            media: [
              {
                status: "READY",
                media: asset,
              },
            ],
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    const postData = await postRes.json() as any;
    if (postData.status >= 400) throw new Error(`LinkedIn post error: ${JSON.stringify(postData)}`);

    const postId = postData.id;
    return {
      platformPostId: postId,
      platformPostUrl: `https://www.linkedin.com/feed/update/${postId}`,
    };
  },
};
