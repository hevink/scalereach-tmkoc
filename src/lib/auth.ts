import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins/two-factor";
import { username } from "better-auth/plugins/username";
import { passkey } from "@better-auth/passkey";
import { db } from "../db";
import * as schema from "../db/schema";
import { emailService } from "../services/email.service";
import { ALLOWED_ORIGINS } from "./constants";

export const auth = betterAuth({
  basePath: "/api/auth",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await emailService.sendPasswordResetEmailWithUrl({ to: user.email, resetUrl: url });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // Extract token from backend URL and create frontend verification URL
      const urlObj = new URL(url);
      const token = urlObj.searchParams.get("token");
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;
      await emailService.sendVerificationEmail({ to: user.email, verificationUrl });
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Send welcome email after user is created (fire-and-forget to not block auth flow)
          emailService.sendWelcomeEmail({
            to: user.email,
            userName: user.name || user.email.split("@")[0],
          }).catch((err) => {
            console.error("[AUTH] Failed to send welcome email:", err);
          });
        },
      },
    },
    account: {
      create: {
        after: async (account) => {
          // When a social account is linked, update user's image if they don't have one
          if (account.providerId === "google") {
            try {
              const { eq } = await import("drizzle-orm");
              const user = await db.query.user.findFirst({
                where: eq(schema.user.id, account.userId),
              });
              
              // If user has no image, fetch from Google and update
              if (user && !user.image && account.accessToken) {
                const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
                  headers: { Authorization: `Bearer ${account.accessToken}` },
                });
                if (response.ok) {
                  const googleUser = await response.json();
                  if (googleUser.picture) {
                    await db.update(schema.user)
                      .set({ image: googleUser.picture })
                      .where(eq(schema.user.id, account.userId));
                    console.log("[AUTH] Updated user image from Google");
                  }
                }
              }
            } catch (err) {
              console.error("[AUTH] Failed to update user image from Google:", err);
            }
          }
        },
      },
    },
  },
  plugins: [
    username(),
    passkey({
      rpID: process.env.NODE_ENV === "production" ? "scalereach.ai" : "localhost",
      rpName: "Scalereach",
      origin: process.env.NODE_ENV === "production" ? "https://app.scalereach.ai" : "http://localhost:3000",
    }),
    twoFactor({
      issuer: "Scalereach",
    }),
  ],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      prompt: "select_account",
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"], // Auto-link Google accounts with same email
    },
  },
  user: {
    additionalFields: {
      isOnboarded: {
        type: "boolean",
        defaultValue: false,
        required: false,
      },
      preferences: {
        type: "string",
        defaultValue: "{}",
        required: false,
      },
      role: {
        type: "string",
        defaultValue: "user",
        required: false,
      },
    },
  },
  trustedOrigins: ALLOWED_ORIGINS,
  secret: process.env.BETTER_AUTH_SECRET || "default_secret_for_development",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",
  advanced: {
    cookiePrefix: "better-auth",
    crossSubDomainCookies: {
      enabled: false,
    },
    defaultCookieAttributes: {
      // Use 'none' in development to allow cross-origin cookies, 'lax' in production
      sameSite: process.env.NODE_ENV === "production" ? "lax" : "none",
      // Must be secure when sameSite is 'none'
      secure: process.env.NODE_ENV === "production" || true,
      httpOnly: true,
      path: "/",
    },
    useSecureCookies: true,
  },
});

// Export types for use in Hono app
export type AuthContext = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};
