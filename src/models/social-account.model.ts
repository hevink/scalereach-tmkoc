import { db } from "../db";
import { socialAccount } from "../db/schema/social.schema";
import { eq, and } from "drizzle-orm";
import { performance } from "perf_hooks";
import { encryptToken, decryptToken } from "../lib/token-encryption";

export class SocialAccountModel {
  private static logOperation(operation: string, details?: any) {
    console.log(`[SOCIAL ACCOUNT MODEL] ${operation}`, details ? JSON.stringify(details) : "");
  }

  private static generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  static async getByWorkspace(workspaceId: string) {
    this.logOperation("GET_BY_WORKSPACE", { workspaceId });
    const start = performance.now();
    try {
      const result = await db
        .select({
          id: socialAccount.id,
          workspaceId: socialAccount.workspaceId,
          platform: socialAccount.platform,
          platformAccountId: socialAccount.platformAccountId,
          accountName: socialAccount.accountName,
          accountHandle: socialAccount.accountHandle,
          avatarUrl: socialAccount.avatarUrl,
          tokenExpiresAt: socialAccount.tokenExpiresAt,
          scopes: socialAccount.scopes,
          isActive: socialAccount.isActive,
          createdAt: socialAccount.createdAt,
          updatedAt: socialAccount.updatedAt,
        })
        .from(socialAccount)
        .where(and(eq(socialAccount.workspaceId, workspaceId), eq(socialAccount.isActive, true)));
      console.log(`[SOCIAL ACCOUNT MODEL] GET_BY_WORKSPACE done in ${(performance.now() - start).toFixed(2)}ms`);
      return result;
    } catch (error) {
      console.error(`[SOCIAL ACCOUNT MODEL] GET_BY_WORKSPACE failed:`, error);
      throw error;
    }
  }

  static async getById(id: string) {
    this.logOperation("GET_BY_ID", { id });
    const result = await db.select().from(socialAccount).where(eq(socialAccount.id, id));
    return result[0] || null;
  }

  static async getWithDecryptedTokens(id: string) {
    this.logOperation("GET_WITH_DECRYPTED_TOKENS", { id });
    const account = await this.getById(id);
    if (!account) return null;
    return {
      ...account,
      accessToken: decryptToken(account.accessToken),
      refreshToken: account.refreshToken ? decryptToken(account.refreshToken) : null,
    };
  }

  static async upsert(params: {
    workspaceId: string;
    platform: string;
    platformAccountId: string;
    accountName: string;
    accountHandle?: string;
    avatarUrl?: string;
    accessToken: string; // plain
    refreshToken?: string; // plain
    tokenExpiresAt?: Date;
    scopes?: string;
  }) {
    this.logOperation("UPSERT", { workspaceId: params.workspaceId, platform: params.platform });
    const start = performance.now();

    const encryptedAccess = encryptToken(params.accessToken);
    const encryptedRefresh = params.refreshToken ? encryptToken(params.refreshToken) : null;

    // Check for existing account for this workspace+platform+platformAccountId
    const existing = await db
      .select({ id: socialAccount.id })
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.workspaceId, params.workspaceId),
          eq(socialAccount.platform, params.platform),
          eq(socialAccount.platformAccountId, params.platformAccountId)
        )
      );

    let result;
    if (existing[0]) {
      result = await db
        .update(socialAccount)
        .set({
          accountName: params.accountName,
          accountHandle: params.accountHandle,
          avatarUrl: params.avatarUrl,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: params.tokenExpiresAt,
          scopes: params.scopes,
          isActive: true,
        })
        .where(eq(socialAccount.id, existing[0].id))
        .returning();
    } else {
      result = await db
        .insert(socialAccount)
        .values({
          id: this.generateId(),
          workspaceId: params.workspaceId,
          platform: params.platform,
          platformAccountId: params.platformAccountId,
          accountName: params.accountName,
          accountHandle: params.accountHandle,
          avatarUrl: params.avatarUrl,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: params.tokenExpiresAt,
          scopes: params.scopes,
        })
        .returning();
    }

    console.log(`[SOCIAL ACCOUNT MODEL] UPSERT done in ${(performance.now() - start).toFixed(2)}ms`);
    return result[0];
  }

  static async updateTokens(id: string, tokens: {
    accessToken: string; // encrypted
    refreshToken?: string; // encrypted
    tokenExpiresAt?: Date;
  }) {
    this.logOperation("UPDATE_TOKENS", { id });
    await db
      .update(socialAccount)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
      })
      .where(eq(socialAccount.id, id));
  }

  static async delete(id: string) {
    this.logOperation("DELETE", { id });
    await db.delete(socialAccount).where(eq(socialAccount.id, id));
  }
}
