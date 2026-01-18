import { Hono } from "hono";
import { CreditController } from "../controllers/credit.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const creditRouter = new Hono();

// Public routes
creditRouter.get("/packages", CreditController.getPackages);

// Webhook route (no auth, verified by signature)
creditRouter.post("/webhook", CreditController.handleWebhook);

// Protected routes
creditRouter.use("/*", authMiddleware);

// Workspace credit routes
creditRouter.get("/workspaces/:workspaceId/balance", CreditController.getBalance);
creditRouter.get("/workspaces/:workspaceId/transactions", CreditController.getTransactions);
creditRouter.post("/workspaces/:workspaceId/checkout", CreditController.createCheckout);
creditRouter.get("/workspaces/:workspaceId/portal", CreditController.getCustomerPortal);
creditRouter.post("/workspaces/:workspaceId/bonus", CreditController.addBonusCredits);

export default creditRouter;
