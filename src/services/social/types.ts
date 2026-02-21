export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string;
}

export interface PlatformAccountInfo {
  platformAccountId: string;
  accountName: string;
  accountHandle?: string;
  avatarUrl?: string;
}

export interface PostResult {
  platformPostId: string;
  platformPostUrl?: string;
}
