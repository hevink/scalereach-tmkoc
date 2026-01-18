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
import creditRouter from "./routes/credit.routes";
import swaggerApp from "./docs/swagger-ui";
import { openApiDocument } from "./docs/openapi";
import type { AuthContext } from "./lib/auth";

// Define the main app with AuthContext
const app = new Hono<{ Variables: AuthContext }>();

// Add middleware
app.use(logger());
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",
      "http://localhost:5174",
    ], // Common ports for Next.js and Vite dev servers
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Mount routes
app.route("/api/auth", authRouter);
app.route("/api/users", userRouter);
app.route("/api/workspaces", workspaceRouter);
app.route("/api/invitations", invitationRouter);
app.route("/api/email", emailRouter);
app.route("/api/projects", projectRouter);
app.route("/api/videos", videoRouter);
app.route("/api/credits", creditRouter);
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
      credits: "/api/credits",
      docs: "/api-docs",
    },
  });
});

// Export for Bun
const port = process.env.PORT || 3001;
console.log(`🚀 Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
