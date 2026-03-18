import { Hono } from "hono";
import { AdminController } from "../controllers/admin.controller";
import { AffiliateController } from "../controllers/affiliate.controller";
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
adminRouter.get("/users/:id/workspaces", AdminController.getUserWorkspaces);
adminRouter.get("/users/:id", AdminController.getUserById);
adminRouter.post("/users/:id/magic-link", AdminController.generateMagicLink);

// Workspace management
adminRouter.get("/workspaces", AdminController.getAllWorkspaces);

// Video management
adminRouter.get("/videos/analytics", AdminController.getVideoAnalytics);
adminRouter.get("/videos/:id", AdminController.getVideoDetail);
adminRouter.get("/videos", AdminController.getAllVideos);
adminRouter.post("/videos/:id/retry", AdminController.retryVideo);

// Failed items
adminRouter.get("/failed", AdminController.getFailedItems);
adminRouter.post("/clips/:id/retry", AdminController.retryClip);

// System health
adminRouter.get("/system-health", AdminController.getSystemHealth);

// YouTube health (proxied from worker)
adminRouter.get("/youtube-health", AdminController.getYouTubeHealth);
adminRouter.post("/youtube-health", AdminController.getYouTubeHealth);

// Worker dashboard & logs (proxied from worker)
adminRouter.get("/worker-status", AdminController.getWorkerStatus);
adminRouter.get("/worker-logs/stream", AdminController.getWorkerLogStream);

// EC2 instance management
adminRouter.get("/ec2/status", AdminController.getEC2Status);
adminRouter.post("/ec2/control", AdminController.controlEC2Instance);
adminRouter.get("/burst-status", AdminController.getBurstWorkerStatus);
adminRouter.get("/scaler-state", AdminController.getScalerState);
adminRouter.post("/scaler-check", AdminController.forceScalerCheck);
adminRouter.get("/burst-logs", AdminController.getBurstLogs);
adminRouter.post("/burst-logs/sync", AdminController.syncBurstLogs);
adminRouter.get("/burst-logs/content", AdminController.getBurstLogContent);
adminRouter.get("/burst-logs/live", AdminController.getBurstLogsLive);

// Credit analytics
adminRouter.get("/analytics/credits", AdminController.getCreditAnalytics);

// Affiliate management
adminRouter.get("/affiliate/overview", AffiliateController.adminGetAffiliates);
adminRouter.get("/affiliate/referrals/:userId", AffiliateController.adminGetReferrals);
adminRouter.get("/affiliate/commissions", AffiliateController.adminGetCommissions);
adminRouter.post("/affiliate/commissions/:id/pay", AffiliateController.adminMarkPaid);
adminRouter.post("/affiliate/commissions/bulk-pay", AffiliateController.adminBulkMarkPaid);

export default adminRouter;
