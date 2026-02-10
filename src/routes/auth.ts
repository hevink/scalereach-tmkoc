import { Hono } from "hono";
import { auth } from "../lib/auth";
import type { AuthContext } from "../lib/auth";
import { ALLOWED_ORIGINS } from "../lib/constants";
import { RateLimitPresets } from "../middleware/rate-limit";

const authRouter = new Hono<{
  Variables: AuthContext;
}>();

// Rate limit auth endpoints to prevent brute-force attacks
authRouter.use("/*", RateLimitPresets.auth());

// Mount all Better Auth endpoints - Better Auth handles /sign-up/email, /sign-in/email, etc.
authRouter.all("/*", async (c) => {
  // Better Auth expects the full URL path, so we pass the raw request directly
  // The basePath in auth config should match the mount point
  console.log(`[AUTH ROUTER] Handling request: ${c.req.method} ${c.req.url}`);
  
  // Debug: Log cookies for OAuth callback debugging
  const cookies = c.req.header("cookie");
  if (c.req.url.includes("/callback/")) {
    console.log(`[AUTH ROUTER] Cookies received:`, cookies || "NONE");
  }
  
  const response = await auth.handler(c.req.raw);

  console.log(`[AUTH ROUTER] Response status: ${response.status}`);

  // Add CORS headers to the response since auth.handler bypasses Hono middleware
  const origin = c.req.header("origin");

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", origin);
    newHeaders.set("Access-Control-Allow-Credentials", "true");
    newHeaders.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    );
    newHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  return response;
});

export default authRouter;
