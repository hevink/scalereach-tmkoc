import { Hono } from "hono";
import { CreditController } from "../controllers/credit.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const creditRouter = new Hono();

// Public routes (no auth required)
creditRouter.get("/packages", CreditController.getPackages);
creditRouter.post("/webhook", CreditController.handleWebhook);

// Protected routes - create a sub-router with auth
const protectedRoutes = new Hono();
protectedRoutes.use("*", authMiddleware);

// Workspace credit routes (protected)
protectedRoutes.get("/workspaces/:workspaceId/balance", CreditController.getBalance);
protectedRoutes.get("/workspaces/:workspaceId/transactions", CreditController.getTransactions);
protectedRoutes.post("/workspaces/:workspaceId/checkout", CreditController.createCheckout);
protectedRoutes.get("/workspaces/:workspaceId/portal", CreditController.getCustomerPortal);
protectedRoutes.post("/workspaces/:workspaceId/bonus", CreditController.addBonusCredits);
protectedRoutes.delete("/workspaces/:workspaceId/subscriptions/:subscriptionId", CreditController.cancelSubscription);

// Mount protected routes
creditRouter.route("/", protectedRoutes);

export default creditRouter;
