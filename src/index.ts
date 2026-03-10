// Initialize Sentry first (must be at the very top)
import "./lib/sentry";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import authRouter from "./routes/auth";
import userRouter from "./routes/user.routes";
import workspaceRouter from "./routes/workspace.routes";
import invitationRouter from "./routes/invitation.routes";
import emailRouter from "./routes/email.routes";
import projectRouter from "./routes/project.routes";
import videoRouter from "./routes/video.routes";
import clipRouter from "./routes/clip.routes";
import creditRouter from "./routes/credit.routes";
import minutesRouter from "./routes/minutes.routes";
import uploadRouter from "./routes/upload.routes";
import uppyUploadRouter from "./routes/uppy-upload.routes";
import captionTemplateRouter from "./routes/caption-template.routes";
import exportRouter from "./routes/export.routes";
import subtitleRouter from "./routes/subtitle.routes";
import healthRouter from "./routes/health.routes";
import adminRouter from "./routes/admin.routes";
import translationRouter from "./routes/translation.routes";
import dubbingRouter from "./routes/dubbing.routes";
import shareRouter from "./routes/share.routes";
import backgroundVideoRouter from "./routes/background-video.routes";
import socialRouter from "./routes/social.routes";
import swaggerApp from "./docs/swagger-ui";
import { openApiDocument } from "./docs/openapi";
import type { AuthContext } from "./lib/auth";
import { auth } from "./lib/auth";
import {
  sentryMiddleware,
  sentryRequestMiddleware,
} from "./middleware/sentry.middleware";

// ============================================================================
// Environment Variable Validation
// ============================================================================
const requiredEnvVars = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "ANTHROPIC_API_KEY",
];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

// Warn about optional but recommended env vars in production
if (process.env.NODE_ENV === "production") {
  const recommendedEnvVars = ["FRONTEND_URL", "SENTRY_DSN"];
  const missingRecommended = recommendedEnvVars.filter((envVar) => !process.env[envVar]);
  if (missingRecommended.length > 0) {
    console.warn(`⚠️ Missing recommended environment variables for production: ${missingRecommended.join(", ")}`);
  }
}

// Define the main app with AuthContext
const app = new Hono<{ Variables: AuthContext }>();

// Add middleware
app.use(logger());

// Normalize trailing slashes - redirect /path/ to /path
app.use(async (c, next) => {
  const url = new URL(c.req.url);
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
    return c.redirect(url.toString(), 301);
  }
  return next();
});

// Add Sentry middleware for error tracking
app.use(sentryRequestMiddleware);
app.use(sentryMiddleware);

import { ALLOWED_ORIGINS } from "./lib/constants";
import { RateLimitPresets } from "./middleware/rate-limit";

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Global API rate limit
app.use("/api/*", RateLimitPresets.api());

// Mount routes
app.route("/api/auth", authRouter);
app.route("/api/users", userRouter);
app.route("/api/workspaces", workspaceRouter);
app.route("/api/invitations", invitationRouter);
app.route("/api/email", emailRouter);
app.route("/api/projects", projectRouter);
app.route("/api/videos", videoRouter);
app.route("/api/clips", clipRouter);
app.route("/api/credits", creditRouter);
app.route("/api/minutes", minutesRouter);
app.route("/api/upload", uploadRouter);
app.route("/api/uppy", uppyUploadRouter);
app.route("/api/caption-templates", captionTemplateRouter);
app.route("/api/exports", exportRouter);
app.route("/api", subtitleRouter); // Subtitle download routes
app.route("/api/admin", adminRouter);

// Magic login - public endpoint to consume admin-generated magic links
// Redirects to frontend which exchanges the token for a proper better-auth session
app.get("/api/magic-login", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Token required" }, 400);

  const { eq, and, gt } = await import("drizzle-orm");
  const { session: sessionTable } = await import("./db/schema");
  const { db } = await import("./db");

  const [sess] = await db
    .select()
    .from(sessionTable)
    .where(and(eq(sessionTable.token, token), gt(sessionTable.expiresAt, new Date())))
    .limit(1);

  if (!sess) return c.json({ error: "Invalid or expired token" }, 401);

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  return c.redirect(`${frontendUrl}/magic-login?token=${token}`);
});

// Token exchange endpoint - frontend calls this to set the session cookie via better-auth's cookie mechanism
app.post("/api/magic-login/exchange", async (c) => {
  const { token } = await c.req.json();
  if (!token) return c.json({ error: "Token required" }, 400);

  const { eq, and, gt } = await import("drizzle-orm");
  const { session: sessionTable, user: userTable } = await import("./db/schema");
  const { db } = await import("./db");

  const [sess] = await db
    .select()
    .from(sessionTable)
    .where(and(eq(sessionTable.token, token), gt(sessionTable.expiresAt, new Date())))
    .limit(1);

  if (!sess) return c.json({ error: "Invalid or expired token" }, 401);

  const [user] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, sess.userId))
    .limit(1);

  if (!user) return c.json({ error: "User not found" }, 404);

  // Sign the cookie value the same way better-auth does (HMAC-SHA256)
  const { getCookies } = await import("better-auth/cookies");
  const cookies = getCookies(auth.options);
  const { name, attributes } = cookies.sessionToken;
  const secret = process.env.BETTER_AUTH_SECRET || "default_secret_for_development";

  // Replicate better-call's signCookieValue: value.signature (base64 HMAC-SHA256)
  const crypto = await import("crypto");
  const signature = crypto.createHmac("sha256", secret).update(token).digest("base64");
  const signedValue = encodeURIComponent(`${token}.${signature}`);

  const cookieParts = [`${name}=${signedValue}`, `Path=${attributes.path || "/"}`];
  if (attributes.httpOnly) cookieParts.push("HttpOnly");
  if (attributes.secure) cookieParts.push("Secure");
  if (attributes.sameSite) cookieParts.push(`SameSite=${attributes.sameSite}`);
  cookieParts.push(`Max-Age=3600`);

  c.header("Set-Cookie", cookieParts.join("; "));
  return c.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
});
app.route("/api/translations", translationRouter);
app.route("/api/dubbing", dubbingRouter);
app.route("/api/backgrounds", backgroundVideoRouter);
app.route("/api/social", socialRouter);
app.route("/api", shareRouter); // Share routes (includes /api/videos/:videoId/share and /api/share/:token/analytics)
app.route("/health", healthRouter); // Enhanced health checks
app.route("/api-docs", swaggerApp); // Swagger UI at api-docs path

// Serve the OpenAPI JSON specification directly at /api-docs.json too
app.get("/api-docs.json", (c) => {
  return c.json(openApiDocument);
});

// Root route
app.get("/", (c) => {
  return c.json({
    message: "Hello Hono! MVC Architecture is now implemented.",
    endpoints: {
      users: "/api/users",
      auth: "/api/auth",
      workspaces: "/api/workspaces",
      invitations: "/api/invitations",
      email: "/api/email",
      projects: "/api/projects",
      videos: "/api/videos",
      clips: "/api/clips",
      credits: "/api/credits",
      upload: "/api/upload",
      exports: "/api/exports",
      captionTemplates: "/api/caption-templates",
      admin: "/api/admin",
      translations: "/api/translations",
      dubbing: "/api/dubbing",
      docs: "/api-docs",
      health: "/health",
    },
  });
});

// Export for Bun
const port = process.env.PORT || 3001;
console.log(`🚀 Server running on http://localhost:${port}`);
console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received, shutting down gracefully...");
  process.exit(0);
});

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 60, // 60 seconds to handle slow OAuth callbacks with email sending
};
