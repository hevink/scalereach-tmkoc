import { Hono } from "hono";
import { AffiliateController } from "../controllers/affiliate.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const affiliateRouter = new Hono();

// Public routes (resolve is read-only, low risk)
// TODO: Add rate limiting middleware to these endpoints to prevent enumeration/spam
affiliateRouter.get("/resolve/:username", AffiliateController.resolveReferrer);

// Protected routes
const protectedRoutes = new Hono();
protectedRoutes.use("*", authMiddleware);
protectedRoutes.post("/track", AffiliateController.trackReferral); // Fix #1: now requires auth
protectedRoutes.get("/stats", AffiliateController.getStats);

affiliateRouter.route("/", protectedRoutes);

export default affiliateRouter;
