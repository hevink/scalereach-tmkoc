import { Context, Next } from "hono";
import { auth } from "../lib/auth";

/**
 * Admin middleware - checks if user has admin role
 * Must be used after authMiddleware
 */
export async function adminMiddleware(c: Context, next: Next) {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Check if user has admin role
    const user = session.user as { role?: string };
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }

    c.set("user", session.user);
    c.set("session", session.session);

    await next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    return c.json({ error: "Unauthorized" }, 401);
  }
}
