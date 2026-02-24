import { Hono } from "hono";
import { AdminController } from "../controllers/admin.controller";
import { adminMiddleware } from "../middleware/admin.middleware";

const adminRouter = new Hono();

// Apply admin middleware to all routes
adminRouter.use("/*", adminMiddleware);

// Dashboard stats
adminRouter.get("/stats", AdminController.getDashboardStats);

// Analytics endpoints
adminRouter.get("/analytics/user-growth", AdminController.getUserGrowthData);
adminRouter.get("/analytics/video-processing", AdminController.getVideoProcessingStats);
adminRouter.get("/analytics/workspace-plans", AdminController.getWorkspacePlanDistribution);
adminRouter.get("/analytics/top-workspaces", AdminController.getTopWorkspaces);
adminRouter.get("/analytics/daily-activity", AdminController.getDailyActivityData);
adminRouter.get("/analytics/credits", AdminController.getCreditAnalytics);

// System health
adminRouter.get("/system-health", AdminController.getSystemHealth);

// Credit transactions
adminRouter.get("/transactions", AdminController.getCreditTransactions);

// Activity feed
adminRouter.get("/activity", AdminController.getRecentActivity);

// User management
adminRouter.get("/users", AdminController.getAllUsers);
adminRouter.put("/users/:id/role", AdminController.updateUserRole);
adminRouter.delete("/users/:id", AdminController.deleteUser);
adminRouter.get("/users/:id/videos", AdminController.getUserVideos);
adminRouter.get("/users/:id/clips", AdminController.getUserClips);

// Workspace management
adminRouter.get("/workspaces", AdminController.getAllWorkspaces);

// Video management
adminRouter.get("/videos/analytics", AdminController.getVideoAnalytics);
adminRouter.get("/videos/:id", AdminController.getVideoDetail);
adminRouter.get("/videos", AdminController.getAllVideos);
adminRouter.post("/videos/:id/retry", AdminController.retryVideo);

// System health
adminRouter.get("/system-health", AdminController.getSystemHealth);

// Credit analytics
adminRouter.get("/analytics/credits", AdminController.getCreditAnalytics);

export default adminRouter;
