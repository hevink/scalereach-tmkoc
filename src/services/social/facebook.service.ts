import type { OAuthTokens, PlatformAccountInfo, PostResult } from "./types";

const APP_ID = process.env.FACEBOOK_APP_ID || "";
const APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";

export const FacebookService = {
  getAuthorizationUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: APP_ID,
      redirect_uri: redirectUri,
      scope: "pages_show_list,pages_read_engagement,pages_manage_posts,publish_video",
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
    if (data.error) throw new Error(`Facebook OAuth error: ${data.error.message}`);

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

  async refreshAccessToken(token: string): Promise<OAuthTokens> {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${token}`
    );
    const data = await res.json() as any;
    if (data.error) throw new Error(`Facebook refresh error: ${data.error.message}`);
    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    };
  },

  async getUserInfo(accessToken: string): Promise<PlatformAccountInfo> {
    // Get user's pages and use the first one as the posting identity
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
    );
    const data = await res.json() as any;
    if (data.error) throw new Error(`Facebook user info error: ${data.error.message}`);

    // If user has pages, use the first page
    if (data.data && data.data.length > 0) {
      const page = data.data[0];
      return {
        platformAccountId: page.id,
        accountName: page.name,
        accountHandle: page.name,
        avatarUrl: `https://graph.facebook.com/${page.id}/picture?type=square`,
      };
    }

    // Fallback to user profile
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${accessToken}`
    );
    const me = await meRes.json() as any;
    return {
      platformAccountId: me.id,
      accountName: me.name,
      accountHandle: me.name,
      avatarUrl: `https://graph.facebook.com/${me.id}/picture?type=square`,
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

    // Get page access token — we need to post as the page
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
    );
    const pagesData = await pagesRes.json() as any;

    if (pagesData.error) {
      throw new Error(`Facebook pages fetch error: ${pagesData.error.message}`);
    }

    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error(
        "No Facebook Pages found for this account. Video publishing requires a Facebook Page — personal profiles cannot publish videos via the API. Please connect a Facebook Page."
      );
    }

    const pageId = pagesData.data[0].id;
    const pageToken = pagesData.data[0].access_token;

    if (!pageToken) {
      throw new Error(
        "Facebook Page access token is missing. The user may not have granted pages_manage_posts or publish_video permissions. Please re-authenticate."
      );
    }

    // Upload video to Facebook
    const uploadRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_url: videoUrl,
        description: fullCaption,
        access_token: pageToken,
      }),
    });
    const uploadData = await uploadRes.json() as any;
    if (uploadData.error) throw new Error(`Facebook video upload error: ${uploadData.error.message}`);

    return {
      platformPostId: uploadData.id,
      platformPostUrl: `https://www.facebook.com/${pageId}/videos/${uploadData.id}`,
    };
  },
};
