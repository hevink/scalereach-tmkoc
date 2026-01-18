import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins/two-factor";
import { username } from "better-auth/plugins/username";
import { passkey } from "@better-auth/passkey";
import { db } from "../db";
import * as schema from "../db/schema";

export const auth = betterAuth({
  basePath: "/api/auth",
  database: drizzleAdapter(db, {
    provider: "pg", // Using PostgreSQL with Neon
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
  },
  plugins: [
    username(),
    passkey({
      rpID: "localhost",
      rpName: "Scalereach",
      origin: "http://localhost:3000",
    }),
    twoFactor({
      issuer: "Scalereach",
    }),
  ],
  socialProviders: {
    // Uncomment and configure these when you have the credentials
    /*
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }
    */
  },
  user: {
    additionalFields: {
      isOnboarded: {
        type: "boolean",
        defaultValue: false,
        required: false,
      },
      preferences: {
        type: "string", // Store as JSON string
        defaultValue: "{}",
        required: false,
      },
    },
  },
  trustedOrigins: ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173", "http://localhost:5174"],
  secret: process.env.BETTER_AUTH_SECRET || "default_secret_for_development",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",
  advanced: {
    cookiePrefix: "better-auth",
    crossSubDomainCookies: {
      enabled: false,
    },
  },
});

// Export types for use in Hono app
export type AuthContext = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};
