import { Context } from "hono";
import { CreditModel } from "../models/credit.model";
import { WorkspaceModel } from "../models/workspace.model";
import { PolarService } from "../services/polar.service";

export class CreditController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    const user = c.get("user");
    console.log(`[CREDIT CONTROLLER] ${operation} - ${method} ${url}`, details ? JSON.stringify(details) : "");
    if (user) {
      console.log(`[CREDIT CONTROLLER] Authenticated user: ${user.id}`);
    }
  }

  // Get workspace credits balance
  static async getBalance(c: Context) {
    const workspaceId = c.req.param("workspaceId");
    CreditController.logRequest(c, "GET_BALANCE", { workspaceId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Check if user has access to workspace
      const members = await WorkspaceModel.getMembers(workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      const balance = await CreditModel.getBalance(workspaceId);
      console.log(`[CREDIT CONTROLLER] GET_BALANCE success - balance: ${balance.balance}`);
      return c.json(balance);
    } catch (error) {
      console.error(`[CREDIT CONTROLLER] GET_BALANCE error:`, error);
      return c.json({ error: "Failed to get balance" }, 500);
    }
  }

  // Get transaction history
  static async getTransactions(c: Context) {
    const workspaceId = c.req.param("workspaceId");
    CreditController.logRequest(c, "GET_TRANSACTIONS", { workspaceId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Check if user has access to workspace
      const members = await WorkspaceModel.getMembers(workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      const limit = parseInt(c.req.query("limit") || "50");
      const offset = parseInt(c.req.query("offset") || "0");
      const type = c.req.query("type");

      const transactions = await CreditModel.getTransactions({
        workspaceId,
        limit,
        offset,
        type: type || undefined,
      });

      console.log(`[CREDIT CONTROLLER] GET_TRANSACTIONS success - found ${transactions.length}`);
      return c.json(transactions);
    } catch (error) {
      console.error(`[CREDIT CONTROLLER] GET_TRANSACTIONS error:`, error);
      return c.json({ error: "Failed to get transactions" }, 500);
    }
  }

  // Get available credit packages
  static async getPackages(c: Context) {
    CreditController.logRequest(c, "GET_PACKAGES");

    try {
      const packages = await CreditModel.getActivePackages();
      console.log(`[CREDIT CONTROLLER] GET_PACKAGES success - found ${packages.length}`);
      return c.json(packages);
    } catch (error) {
      console.error(`[CREDIT CONTROLLER] GET_PACKAGES error:`, error);
      return c.json({ error: "Failed to get packages" }, 500);
    }
  }

  // Create checkout session for credit purchase
  static async createCheckout(c: Context) {
    const workspaceId = c.req.param("workspaceId");
    CreditController.logRequest(c, "CREATE_CHECKOUT", { workspaceId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Check if user is owner or admin
      const members = await WorkspaceModel.getMembers(workspaceId);
      const currentMember = members.find((m) => m.userId === user.id);
      if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
        return c.json({ error: "Only owners and admins can purchase credits" }, 403);
      }

      if (!PolarService.isConfigured()) {
        return c.json({ error: "Payment system not configured" }, 503);
      }

      const body = await c.req.json();
      const { packageId, successUrl } = body;

      if (!packageId) {
        return c.json({ error: "Package ID is required" }, 400);
      }

      // Get package details - packageId can be either our internal ID or Polar product ID
      const packages = await CreditModel.getActivePackages();
      let pkg = packages.find((p) => p.id === packageId);
      
      // If not found by internal ID, try by Polar product ID
      if (!pkg) {
        pkg = packages.find((p) => p.polarProductId === packageId);
      }

      // If still not found, use the packageId directly as Polar product ID (for direct plan selection)
      const polarProductId = pkg?.polarProductId || packageId;
      const credits = pkg?.credits || 0;
      const planName = pkg?.name || "Plan";

      // Create Polar checkout session
      const checkout = await PolarService.createCheckoutSession({
        productId: polarProductId,
        successUrl: successUrl || `${process.env.FRONTEND_URL}/${workspaceId}?checkout=success`,
        customerEmail: user.email,
        metadata: {
          workspaceId,
          userId: user.id,
          packageId: pkg?.id || packageId,
          credits: credits.toString(),
          planName,
        },
      });

      console.log(`[CREDIT CONTROLLER] CREATE_CHECKOUT success - checkout: ${checkout.id}`);
      return c.json({
        checkoutId: checkout.id,
        checkoutUrl: checkout.url,
      });
    } catch (error: any) {
      console.error(`[CREDIT CONTROLLER] CREATE_CHECKOUT error:`, error);
      return c.json({ error: error.message || "Failed to create checkout" }, 500);
    }
  }

  // Webhook handler for Polar events
  static async handleWebhook(c: Context) {
    CreditController.logRequest(c, "HANDLE_WEBHOOK");

    try {
      const webhookId = c.req.header("webhook-id");
      const webhookTimestamp = c.req.header("webhook-timestamp");
      const webhookSignature = c.req.header("webhook-signature");
      const body = await c.req.text();

      // Verify webhook signature if secret is configured
      const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
      if (webhookSecret) {
        if (!webhookId || !webhookTimestamp || !webhookSignature) {
          console.error("[CREDIT CONTROLLER] Missing webhook headers");
          return c.json({ error: "Missing webhook headers" }, 400);
        }

        // Verify signature using HMAC-SHA256
        const crypto = await import("crypto");
        const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;
        const expectedSignature = crypto
          .createHmac("sha256", webhookSecret)
          .update(signedContent)
          .digest("base64");

        // Polar sends multiple signatures, check if any match
        const signatures = webhookSignature.split(" ");
        const isValid = signatures.some((sig) => {
          const [version, signature] = sig.split(",");
          return version === "v1" && signature === expectedSignature;
        });

        if (!isValid) {
          console.error("[CREDIT CONTROLLER] Invalid webhook signature");
          return c.json({ error: "Invalid signature" }, 401);
        }
      }

      const payload = JSON.parse(body);
      console.log(`[CREDIT CONTROLLER] Webhook event: ${payload.type}`, JSON.stringify(payload.data?.id || {}));

      // Handle different Polar webhook events
      switch (payload.type) {
        case "checkout.created":
          console.log(`[CREDIT CONTROLLER] Checkout created: ${payload.data?.id}`);
          break;

        case "checkout.updated":
          console.log(`[CREDIT CONTROLLER] Checkout updated: ${payload.data?.id}, status: ${payload.data?.status}`);
          break;

        case "order.created":
        case "order.paid":
          await CreditController.handleOrderPaid(payload.data);
          break;

        case "subscription.created":
        case "subscription.updated":
        case "subscription.active":
          await CreditController.handleSubscriptionActive(payload.data);
          break;

        case "subscription.canceled":
        case "subscription.revoked":
          await CreditController.handleSubscriptionCanceled(payload.data);
          break;

        default:
          console.log(`[CREDIT CONTROLLER] Unhandled webhook event: ${payload.type}`);
      }

      return c.json({ received: true });
    } catch (error) {
      console.error(`[CREDIT CONTROLLER] HANDLE_WEBHOOK error:`, error);
      return c.json({ error: "Webhook processing failed" }, 500);
    }
  }

  // Handle order paid event (one-time purchase or subscription payment)
  private static async handleOrderPaid(data: any) {
    const metadata = data?.metadata || {};
    const { workspaceId, userId, packageId, credits, planName } = metadata;

    console.log(`[CREDIT CONTROLLER] Order paid - workspace: ${workspaceId}, credits: ${credits}, plan: ${planName}`);

    if (workspaceId && credits) {
      const creditAmount = parseInt(credits);

      await CreditModel.addCredits({
        workspaceId,
        userId,
        amount: creditAmount,
        type: "purchase",
        description: planName ? `${planName} plan - ${creditAmount} credits` : `Purchased ${creditAmount} credits`,
        metadata: {
          orderId: data?.id,
          packageId,
          productId: data?.product_id,
          polarEvent: "order.paid",
        },
      });

      console.log(`[CREDIT CONTROLLER] Credits added - workspace: ${workspaceId}, amount: ${creditAmount}`);
    }
  }

  // Handle subscription active event
  private static async handleSubscriptionActive(data: any) {
    const metadata = data?.metadata || {};
    const { workspaceId, userId, planName, monthlyCredits } = metadata;

    console.log(`[CREDIT CONTROLLER] Subscription active - workspace: ${workspaceId}, plan: ${planName}`);

    // You can store subscription info in the database here
    // For now, just log it - credits are added via order.paid event
    if (workspaceId && monthlyCredits) {
      console.log(`[CREDIT CONTROLLER] Subscription ${planName} active for workspace ${workspaceId}`);
    }
  }

  // Handle subscription canceled event
  private static async handleSubscriptionCanceled(data: any) {
    const metadata = data?.metadata || {};
    const { workspaceId, planName } = metadata;

    console.log(`[CREDIT CONTROLLER] Subscription canceled - workspace: ${workspaceId}, plan: ${planName}`);

    // You can update subscription status in the database here
    if (workspaceId) {
      console.log(`[CREDIT CONTROLLER] Subscription ${planName} canceled for workspace ${workspaceId}`);
    }
  }

  // Admin: Add bonus credits
  static async addBonusCredits(c: Context) {
    const workspaceId = c.req.param("workspaceId");
    CreditController.logRequest(c, "ADD_BONUS_CREDITS", { workspaceId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Check if user is owner
      const members = await WorkspaceModel.getMembers(workspaceId);
      const currentMember = members.find((m) => m.userId === user.id);
      if (!currentMember || currentMember.role !== "owner") {
        return c.json({ error: "Only owners can add bonus credits" }, 403);
      }

      const body = await c.req.json();
      const { amount, description } = body;

      if (!amount || amount <= 0) {
        return c.json({ error: "Valid amount is required" }, 400);
      }

      const result = await CreditModel.addCredits({
        workspaceId,
        userId: user.id,
        amount,
        type: "bonus",
        description: description || `Bonus credits added`,
      });

      console.log(`[CREDIT CONTROLLER] ADD_BONUS_CREDITS success - new balance: ${result.balance}`);
      return c.json(result);
    } catch (error) {
      console.error(`[CREDIT CONTROLLER] ADD_BONUS_CREDITS error:`, error);
      return c.json({ error: "Failed to add bonus credits" }, 500);
    }
  }
}
