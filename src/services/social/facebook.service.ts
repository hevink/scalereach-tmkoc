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

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens & { pages?: Array<{ pageId: string; pageName: string; pageToken: string; avatarUrl: string }> }> {
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

    // Exchange short-lived for long-lived user token
    const llRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${data.access_token}`
    );
    const llData = await llRes.json() as any;
    const longLivedUserToken = llData.access_token || data.access_token;

    // Get ALL page access tokens from the long-lived user token
    // Page tokens derived from long-lived user tokens do not expire
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&limit=100&access_token=${longLivedUserToken}`
    );
    const pagesData = await pagesRes.json() as any;

    // Also check granular_scopes for pages that /me/accounts might miss (dev mode limitation)
    let allPages = pagesData.data || [];

    if (allPages.length < 5) {
      // /me/accounts may not return all pages in dev mode
      // Use debug_token to find all page IDs from granular_scopes, then fetch each page's token
      const debugRes = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${longLivedUserToken}&access_token=${APP_ID}|${APP_SECRET}`
      );
      const debugData = await debugRes.json() as any;
      const granularScopes = debugData.data?.granular_scopes || [];

      // Collect all unique page IDs from pages_manage_posts scope
      const managedPageIds = new Set<string>();
      for (const scope of granularScopes) {
        if (scope.scope === "pages_manage_posts" && scope.target_ids) {
          for (const id of scope.target_ids) managedPageIds.add(id);
        }
      }

      // For pages not already in /me/accounts, try fetching their token directly
      const existingIds = new Set(allPages.map((p: any) => p.id));
      for (const pageId of managedPageIds) {
        if (existingIds.has(pageId)) continue;
        try {
          const pageRes = await fetch(
            `https://graph.facebook.com/v19.0/${pageId}?fields=id,name,access_token&access_token=${longLivedUserToken}`
          );
          const pageData = await pageRes.json() as any;
          if (pageData.id && pageData.access_token) {
            allPages.push(pageData);
          }
        } catch (e) {
          console.warn(`[FACEBOOK] Could not fetch page ${pageId}:`, e);
        }
      }
    }

    if (allPages.length > 0) {
      const pages = allPages.map((page: any) => ({
        pageId: page.id,
        pageName: page.name,
        pageToken: page.access_token,
        avatarUrl: `https://graph.facebook.com/${page.id}/picture?type=square`,
      }));
      console.log(`[FACEBOOK] Found ${pages.length} pages during OAuth: ${pages.map((p: any) => p.pageName).join(", ")}`);

      // Return first page token as the primary accessToken (for backward compat)
      // but include all pages so the callback can upsert each one
      return {
        accessToken: pages[0].pageToken,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        pages,
      };
    }

    // No pages found - store user token but warn
    console.warn(`[FACEBOOK] No pages found during OAuth. Storing user token - video posting will fail without a page.`);
    return {
      accessToken: longLivedUserToken,
      expiresAt: llData.expires_in ? new Date(Date.now() + llData.expires_in * 1000) : undefined,
    };
  },

  async refreshAccessToken(token: string): Promise<OAuthTokens> {
    // Check if this is a page token (page tokens from long-lived user tokens don't expire)
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,category&access_token=${token}`
    );
    const me = await meRes.json() as any;

    if (me.category) {
      // It's a page token - these don't expire, just return as-is
      return {
        accessToken: token,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      };
    }

    // It's a user token - exchange for new long-lived token
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
    // First try: the token might be a page token (new flow) - check /me which returns page identity
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name,category&access_token=${accessToken}`
    );
    const me = await meRes.json() as any;
    if (me.error) throw new Error(`Facebook user info error: ${me.error.message}`);

    // If /me returns a category, it's a page token
    if (me.category) {
      return {
        platformAccountId: me.id,
        accountName: me.name,
        accountHandle: me.name,
        avatarUrl: `https://graph.facebook.com/${me.id}/picture?type=square`,
      };
    }

    // It's a user token - try to get pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
    );
    const pagesData = await pagesRes.json() as any;

    if (pagesData.data && pagesData.data.length > 0) {
      const page = pagesData.data[0];
      return {
        platformAccountId: page.id,
        accountName: page.name,
        accountHandle: page.name,
        avatarUrl: `https://graph.facebook.com/${page.id}/picture?type=square`,
      };
    }

    // Fallback to user profile
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

    // Determine if this is a page token or user token
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name,category&access_token=${accessToken}`
    );
    const me = await meRes.json() as any;
    if (me.error) throw new Error(`Facebook API error: ${me.error.message}`);

    let pageId: string;
    let pageToken: string;

    if (me.category) {
      // It's a page token - use directly
      pageId = me.id;
      pageToken = accessToken;
    } else {
      // It's a user token (legacy accounts) - fetch page token
      const pagesRes = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
      );
      const pagesData = await pagesRes.json() as any;

      if (pagesData.error) {
        throw new Error(`Facebook pages fetch error: ${pagesData.error.message}`);
      }

      if (!pagesData.data || pagesData.data.length === 0) {
        throw new Error(
          "No Facebook Pages found for this account. Video publishing requires a Facebook Page. Please disconnect and reconnect your Facebook account."
        );
      }

      pageId = pagesData.data[0].id;
      pageToken = pagesData.data[0].access_token;

      if (!pageToken) {
        throw new Error(
          "Facebook Page access token is missing. Please re-authenticate with all permissions."
        );
      }
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
