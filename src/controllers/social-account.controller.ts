import { Context } from "hono";
import { SocialAccountModel } from "../models/social-account.model";
import { WorkspaceModel } from "../models/workspace.model";
import { redisConnection } from "../jobs/queue";
import { getPlanConfig } from "../config/plan-config";
import { TikTokService } from "../services/social/tiktok.service";
import { InstagramService } from "../services/social/instagram.service";
import { YouTubeShortsService } from "../services/social/youtube-shorts.service";
import { TwitterService, generatePKCE } from "../services/social/twitter.service";
import { LinkedInService } from "../services/social/linkedin.service";

const REDIRECT_BASE = process.env.SOCIAL_OAUTH_REDIRECT_BASE_URL || "";

function getRedirectUri(platform: string) {
  return `${REDIRECT_BASE}/api/social/accounts/${platform}/callback`;
}

export class SocialAccountController {
  private static logRequest(c: Context, operation: string, details?: any) {
    console.log(
      `[SOCIAL ACCOUNT CONTROLLER] ${operation} - ${c.req.method} ${c.req.url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  static async listAccounts(c: Context) {
    const workspaceId = c.req.query("workspaceId");
    SocialAccountController.logRequest(c, "LIST_ACCOUNTS", { workspaceId });

    try {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);

      const members = await WorkspaceModel.getMembers(workspaceId);
      if (!members.some((m) => m.userId === user.id)) {
        return c.json({ error: "Access denied" }, 403);
      }

      const accounts = await SocialAccountModel.getByWorkspace(workspaceId);
      return c.json(accounts);
    } catch (error) {
      console.error("[SOCIAL ACCOUNT CONTROLLER] LIST_ACCOUNTS error:", error);
      return c.json({ error: "Failed to list accounts" }, 500);
    }
  }

  static async initiateOAuth(c: Context) {
    const platform = c.req.param("platform");
    const workspaceId = c.req.query("workspaceId");
    SocialAccountController.logRequest(c, "INITIATE_OAUTH", { platform, workspaceId });

    try {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);

      const members = await WorkspaceModel.getMembers(workspaceId);
      if (!members.some((m) => m.userId === user.id)) {
        return c.json({ error: "Access denied" }, 403);
      }

      // Enforce social account limit based on workspace plan
      const ws = await WorkspaceModel.getById(workspaceId);
      const planConfig = getPlanConfig(ws?.plan || "free");
      const limit = planConfig.limits.socialAccounts;

      if (limit === 0) {
        return c.json({ error: "Social account integration is not available on the free plan. Please upgrade to connect social accounts." }, 403);
      }

      if (limit > 0) {
        const existing = await SocialAccountModel.getByWorkspace(workspaceId);
        if (existing.length >= limit) {
          return c.json({ error: `Your ${planConfig.plan} plan allows up to ${limit} connected social account${limit === 1 ? "" : "s"}. Please upgrade to connect more.` }, 403);
        }
      }

      const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
      const stateData: Record<string, string> = { workspaceId, userId: user.id };

      const redirectUri = getRedirectUri(platform);
      let authUrl: string;

      if (platform === "twitter") {
        const { verifier, challenge } = generatePKCE();
        stateData.codeVerifier = verifier;
        authUrl = TwitterService.getAuthorizationUrl(state, redirectUri, challenge);
      } else if (platform === "tiktok") {
        authUrl = TikTokService.getAuthorizationUrl(state, redirectUri);
      } else if (platform === "instagram") {
        authUrl = InstagramService.getAuthorizationUrl(state, redirectUri);
      } else if (platform === "youtube") {
        authUrl = YouTubeShortsService.getAuthorizationUrl(state, redirectUri);
      } else if (platform === "linkedin") {
        authUrl = LinkedInService.getAuthorizationUrl(state, redirectUri);
      } else {
        return c.json({ error: "Unsupported platform" }, 400);
      }

      // Store state in Redis with 10min TTL
      await redisConnection.set(`oauth:state:${state}`, JSON.stringify(stateData), "EX", 600);

      return c.json({ authUrl });
    } catch (error) {
      console.error("[SOCIAL ACCOUNT CONTROLLER] INITIATE_OAUTH error:", error);
      return c.json({ error: "Failed to initiate OAuth" }, 500);
    }
  }

  static async handleOAuthCallback(c: Context) {
    const platform = c.req.param("platform");
    const { code, state, error: oauthError } = c.req.query() as Record<string, string>;
    SocialAccountController.logRequest(c, "HANDLE_OAUTH_CALLBACK", { platform });

    try {
      if (oauthError) return c.json({ error: `OAuth denied: ${oauthError}` }, 400);
      if (!code || !state) return c.json({ error: "Missing code or state" }, 400);

      const stateRaw = await redisConnection.get(`oauth:state:${state}`);
      if (!stateRaw) return c.json({ error: "Invalid or expired state" }, 400);
      await redisConnection.del(`oauth:state:${state}`);

      const stateData = JSON.parse(stateRaw) as Record<string, string>;
      const { workspaceId, userId, codeVerifier } = stateData;
      const redirectUri = getRedirectUri(platform);

      let tokens;
      let userInfo;

      if (platform === "tiktok") {
        tokens = await TikTokService.exchangeCode(code, redirectUri);
        userInfo = await TikTokService.getUserInfo(tokens.accessToken);
      } else if (platform === "instagram") {
        tokens = await InstagramService.exchangeCode(code, redirectUri);
        userInfo = await InstagramService.getUserInfo(tokens.accessToken);
      } else if (platform === "youtube") {
        tokens = await YouTubeShortsService.exchangeCode(code, redirectUri);
        userInfo = await YouTubeShortsService.getUserInfo(tokens.accessToken);
      } else if (platform === "twitter") {
        if (!codeVerifier) return c.json({ error: "Missing PKCE verifier" }, 400);
        tokens = await TwitterService.exchangeCode(code, redirectUri, codeVerifier);
        userInfo = await TwitterService.getUserInfo(tokens.accessToken);
      } else if (platform === "linkedin") {
        tokens = await LinkedInService.exchangeCode(code, redirectUri);
        userInfo = await LinkedInService.getUserInfo(tokens.accessToken);
      } else {
        return c.json({ error: "Unsupported platform" }, 400);
      }

      const account = await SocialAccountModel.upsert({
        workspaceId,
        platform,
        platformAccountId: userInfo.platformAccountId,
        accountName: userInfo.accountName,
        accountHandle: userInfo.accountHandle,
        avatarUrl: userInfo.avatarUrl,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
      });

      // Redirect to the workspace social page
      const ws = await WorkspaceModel.getById(workspaceId);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const slug = ws?.slug || workspaceId;
      return c.redirect(`${frontendUrl}/${slug}/social?connected=${platform}`);
    } catch (error) {
      console.error("[SOCIAL ACCOUNT CONTROLLER] HANDLE_OAUTH_CALLBACK error:", error);
      return c.json({ error: "OAuth callback failed" }, 500);
    }
  }

  static async disconnectAccount(c: Context) {
    const id = c.req.param("id");
    SocialAccountController.logRequest(c, "DISCONNECT_ACCOUNT", { id });

    try {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const account = await SocialAccountModel.getById(id);
      if (!account) return c.json({ error: "Account not found" }, 404);

      const members = await WorkspaceModel.getMembers(account.workspaceId);
      if (!members.some((m) => m.userId === user.id)) {
        return c.json({ error: "Access denied" }, 403);
      }

      await SocialAccountModel.delete(id);
      return c.json({ success: true });
    } catch (error) {
      console.error("[SOCIAL ACCOUNT CONTROLLER] DISCONNECT_ACCOUNT error:", error);
      return c.json({ error: "Failed to disconnect account" }, 500);
    }
  }
}
