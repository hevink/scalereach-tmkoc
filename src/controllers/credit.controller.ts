import { Context } from "hono";
import { CreditModel } from "../models/credit.model";
import { MinutesModel } from "../models/minutes.model";
import { WorkspaceModel } from "../models/workspace.model";
import { DodoService, DodoWebhookPayload } from "../services/dodo.service";

const isLiveMode = process.env.DODO_ENVIRONMENT === "live_mode";

// Map product IDs to plan names — switches between test and live based on DODO_ENVIRONMENT
const PRODUCT_TO_PLAN: Record<string, string> = isLiveMode
  ? {
      // Live mode product IDs
      "pdt_0NZGBR6GtydxMB2lNeh09": "starter", // Starter Monthly
      "pdt_0NZGBRV0VGyAffgoPOiMx": "starter", // Starter Annual
      "pdt_0NZGBRrun07eXzoWlmzm2": "pro",     // Pro Monthly
      "pdt_0NZGBSH8bWPajakeSOO8B": "pro",     // Pro Annual
      "pdt_0NZGBScekA4L6yNm7r3BX": "agency",  // Agency Monthly
      "pdt_0NZGBSvywqWyfQBbnGecS": "agency",  // Agency Annual
    }
  : {
      // Test mode product IDs
      "pdt_0NY6k5d7b4MxSsVM7KzEV": "starter", // Starter Monthly
      "pdt_0NY6kJuPXxJUv7SFNbQOB": "starter", // Starter Annual
      "pdt_0NY6llF7a0oFiFsaeVOW7": "pro",     // Pro Monthly
      "pdt_0NY6lyuXXpnq6BWWOeDTy": "pro",     // Pro Annual
      "pdt_0NZFx5ffGwT1YxA1hGbe4": "agency",  // Agency Monthly
      "pdt_0NZFxhZt01qOI9OLNEaSd": "agency",  // Agency Annual
    };

const ANNUAL_PRODUCT_IDS = new Set(
  isLiveMode
    ? [
        "pdt_0NZGBRV0VGyAffgoPOiMx", // Starter Annual
        "pdt_0NZGBSH8bWPajakeSOO8B", // Pro Annual
        "pdt_0NZGBSvywqWyfQBbnGecS", // Agency Annual
      ]
    : [
        "pdt_0NY6kJuPXxJUv7SFNbQOB", // Starter Annual
        "pdt_0NY6lyuXXpnq6BWWOeDTy", // Pro Annual
        "pdt_0NZFxhZt01qOI9OLNEaSd", // Agency Annual
      ]
);

function getBillingCycle(productId: string): "annual" | "monthly" {
  return ANNUAL_PRODUCT_IDS.has(productId) ? "annual" : "monthly";
}

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

      if (!DodoService.isConfigured()) {
        return c.json({ error: "Payment system not configured" }, 503);
      }

      const body = await c.req.json();
      const { productId, successUrl, cancelUrl, isSubscription } = body;

      if (!productId) {
        return c.json({ error: "Product ID is required" }, 400);
      }

      // Get package details
      const packages = await CreditModel.getActivePackages();
      let pkg = packages.find((p) => p.id === productId);

      // If not found by internal ID, try by Dodo product ID
      if (!pkg) {
        pkg = packages.find((p) => p.dodoProductId === productId);
      }

      const dodoProductId = pkg?.dodoProductId || productId;
      const credits = pkg?.credits || 0;
      const planName = pkg?.name || "Plan";

      const metadata = {
        workspaceId,
        userId: user.id,
        packageId: pkg?.id || productId,
        credits: credits.toString(),
        planName,
      };

      const returnUrl = successUrl || `${process.env.FRONTEND_URL}/checkout/success?workspace=${workspaceId}`;
      const failUrl = cancelUrl || `${process.env.FRONTEND_URL}/checkout/cancel?workspace=${workspaceId}`;

      let result;
      if (isSubscription) {
        // Create subscription for recurring billing
        result = await DodoService.createSubscription({
          productId: dodoProductId,
          successUrl: returnUrl,
          cancelUrl: failUrl,
          customerEmail: user.email,
          metadata,
        });

        console.log(`[CREDIT CONTROLLER] CREATE_CHECKOUT (subscription) success - id: ${result.subscription_id}`);

        // Use payment_link from response
        const checkoutUrl = result.payment_link;
        if (!checkoutUrl) {
          throw new Error("No checkout URL returned from payment provider");
        }

        return c.json({
          checkoutId: result.subscription_id,
          checkoutUrl,
          type: "subscription",
        });
      } else {
        // Create one-time payment
        result = await DodoService.createPaymentLink({
          productId: dodoProductId,
          successUrl: returnUrl,
          customerEmail: user.email,
          metadata,
        });

        console.log(`[CREDIT CONTROLLER] CREATE_CHECKOUT (payment) success - id: ${result.payment_id}`);

        // Construct checkout URL from payment_id
        const paymentBaseUrl = process.env.DODO_ENVIRONMENT === "live_mode"
          ? "https://checkout.dodopayments.com"
          : "https://test.checkout.dodopayments.com";
        const paymentCheckoutUrl = result.payment_link || `${paymentBaseUrl}/buy/${result.payment_id}`;

        return c.json({
          checkoutId: result.payment_id,
          checkoutUrl: paymentCheckoutUrl,
          type: "payment",
        });
      }
    } catch (error: any) {
      console.error(`[CREDIT CONTROLLER] CREATE_CHECKOUT error:`, error);
      return c.json({ error: error.message || "Failed to create checkout" }, 500);
    }
  }

  // Webhook handler for Dodo Payments events
  static async handleWebhook(c: Context) {
    CreditController.logRequest(c, "HANDLE_WEBHOOK");

    try {
      const body = await c.req.text();

      // Log headers for debugging
      const headers = Object.fromEntries(c.req.raw.headers.entries());
      console.log(`[CREDIT CONTROLLER] Webhook headers:`, JSON.stringify(headers, null, 2));

      // Verify webhook signature if secret is configured
      const webhookSecret = process.env.DODO_WEBHOOK_SECRET;
      const webhookId = c.req.header("webhook-id") || "";
      const webhookTimestamp = c.req.header("webhook-timestamp") || "";
      const signature = c.req.header("webhook-signature") || "";

      if (webhookSecret) {
        if (!webhookId || !webhookTimestamp || !signature) {
          console.warn("[CREDIT CONTROLLER] Missing required webhook headers (webhook-id, webhook-timestamp, webhook-signature)");
          return c.json({ error: "Missing signature headers" }, 401);
        }

        const isValid = DodoService.verifyWebhookSignature(body, webhookId, webhookTimestamp, signature, webhookSecret);
        if (!isValid) {
          console.warn("[CREDIT CONTROLLER] Webhook signature verification failed");
          return c.json({ error: "Invalid signature" }, 401);
        }
      }

      const payload: DodoWebhookPayload = JSON.parse(body);
      console.log(`[CREDIT CONTROLLER] Webhook event: ${payload.type}`, JSON.stringify(payload.data || {}, null, 2));

      // Handle different Dodo webhook events
      switch (payload.type) {
        case "payment.succeeded":
          await CreditController.handlePaymentSucceeded(payload.data);
          break;

        case "payment.failed":
          console.log(`[CREDIT CONTROLLER] Payment failed: ${payload.data?.payment_id}`);
          break;

        case "payment.processing":
          console.log(`[CREDIT CONTROLLER] Payment processing: ${payload.data?.payment_id}`);
          break;

        case "payment.cancelled":
          console.log(`[CREDIT CONTROLLER] Payment cancelled: ${payload.data?.payment_id}`);
          break;

        case "subscription.active":
          await CreditController.handleSubscriptionActive(payload.data);
          break;

        case "subscription.renewed":
          await CreditController.handleSubscriptionRenewed(payload.data);
          break;

        case "subscription.cancelled":
        case "subscription.expired":
          await CreditController.handleSubscriptionCanceled(payload.data);
          break;

        case "subscription.on_hold":
        case "subscription.paused":
          console.log(`[CREDIT CONTROLLER] Subscription paused/on_hold: ${payload.data?.subscription_id}`);
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

  // Handle successful payment
  private static async handlePaymentSucceeded(data: any) {
    const metadata = data?.metadata || {};
    const { workspaceId, userId, packageId, credits, planName } = metadata;
    const paymentId = data?.payment_id;

    console.log(`[CREDIT CONTROLLER] Payment succeeded - workspace: ${workspaceId}, credits: ${credits}, plan: ${planName}, paymentId: ${paymentId}`);

    // Check for duplicate webhook (idempotency)
    if (paymentId && workspaceId) {
      const existingTransactions = await CreditModel.getTransactions({
        workspaceId,
        limit: 10,
      });

      const isDuplicate = existingTransactions.some((tx) => {
        if (!tx.metadata) return false;
        try {
          const meta = JSON.parse(tx.metadata);
          return meta.paymentId === paymentId;
        } catch {
          return false;
        }
      });

      if (isDuplicate) {
        console.log(`[CREDIT CONTROLLER] Duplicate webhook detected for paymentId: ${paymentId}, skipping`);
        return;
      }
    }

    if (workspaceId && credits) {
      const creditAmount = parseInt(credits);

      await CreditModel.addCredits({
        workspaceId,
        userId,
        amount: creditAmount,
        type: "purchase",
        description: planName ? `${planName} - ${creditAmount} credits` : `Purchased ${creditAmount} credits`,
        metadata: {
          paymentId: paymentId,
          packageId,
          dodoEvent: "payment.succeeded",
          amount: data?.total_amount,
          currency: data?.currency,
        },
      });

      // Update workspace plan based on product
      const productId = packageId || data?.product_cart?.[0]?.product_id;
      const plan = PRODUCT_TO_PLAN[productId];
      if (plan && workspaceId) {
        // Determine billing cycle from product ID
        const billingCycle = getBillingCycle(productId);
        
        await WorkspaceModel.update(workspaceId, { 
          plan,
          billingCycle 
        });
        
        // Only allocate minutes if this is NOT a subscription (one-time purchase)
        // For subscriptions, minutes will be allocated in subscription.active webhook
        const isSubscription = data?.is_subscription || metadata?.isSubscription;
        if (!isSubscription) {
          await MinutesModel.updatePlanAllocation(workspaceId, plan, billingCycle);
          console.log(`[CREDIT CONTROLLER] Workspace plan updated to: ${plan} (${billingCycle}), minutes allocated`);
        } else {
          console.log(`[CREDIT CONTROLLER] Workspace plan updated to: ${plan} (${billingCycle}), minutes will be allocated by subscription.active webhook`);
        }
      }

      console.log(`[CREDIT CONTROLLER] Credits added - workspace: ${workspaceId}, amount: ${creditAmount}`);
    }
  }

  // Handle subscription active event
  private static async handleSubscriptionActive(data: any) {
    const metadata = data?.metadata || {};
    const { workspaceId, userId, planName, credits } = metadata;
    const subscriptionId = data?.subscription_id;

    console.log(`[CREDIT CONTROLLER] Subscription active - workspace: ${workspaceId}, plan: ${planName}, subscriptionId: ${subscriptionId}`);

    // Check for duplicate webhook (idempotency)
    if (subscriptionId && workspaceId) {
      const existingTransactions = await CreditModel.getTransactions({
        workspaceId,
        limit: 10,
      });

      const isDuplicate = existingTransactions.some((tx) => {
        if (!tx.metadata) return false;
        try {
          const meta = JSON.parse(tx.metadata);
          return meta.subscriptionId === subscriptionId && meta.dodoEvent === "subscription.active";
        } catch {
          return false;
        }
      });

      if (isDuplicate) {
        console.log(`[CREDIT CONTROLLER] Duplicate webhook detected for subscriptionId: ${subscriptionId}, skipping`);
        return;
      }
    }

    // Add initial credits for new subscription
    if (workspaceId && credits) {
      const creditAmount = parseInt(credits);

      await CreditModel.addCredits({
        workspaceId,
        userId,
        amount: creditAmount,
        type: "purchase",
        description: `${planName} subscription - ${creditAmount} credits`,
        metadata: {
          subscriptionId: subscriptionId,
          dodoEvent: "subscription.active",
        },
      });

      // Update workspace plan and subscription tracking
      const productId = metadata?.packageId || data?.product_id;
      const plan = PRODUCT_TO_PLAN[productId];
      if (plan) {
        // Determine billing cycle from product ID
        const billingCycle = getBillingCycle(productId);
        
        await WorkspaceModel.update(workspaceId, {
          plan,
          billingCycle,
          subscriptionId: subscriptionId,
          subscriptionStatus: "active",
          subscriptionCancelledAt: undefined,
        });
        // Initialize minutes allocation for the new plan
        await MinutesModel.updatePlanAllocation(workspaceId, plan, billingCycle);
        console.log(`[CREDIT CONTROLLER] Workspace plan updated to: ${plan} (${billingCycle}), subscription tracked: ${subscriptionId}, minutes allocated`);
      }

      console.log(`[CREDIT CONTROLLER] Subscription credits added - workspace: ${workspaceId}, amount: ${creditAmount}`);
    }
  }

  // Handle subscription renewal
  private static async handleSubscriptionRenewed(data: any) {
    const metadata = data?.metadata || {};
    const { workspaceId, userId, planName, credits } = metadata;
    const subscriptionId = data?.subscription_id;
    const renewalDate = data?.created_at || new Date().toISOString();

    console.log(`[CREDIT CONTROLLER] Subscription renewed - workspace: ${workspaceId}, plan: ${planName}, subscriptionId: ${subscriptionId}`);

    // Check for duplicate webhook (idempotency) - check for same subscription renewed on same date
    if (subscriptionId && workspaceId) {
      const existingTransactions = await CreditModel.getTransactions({
        workspaceId,
        limit: 20,
      });

      const isDuplicate = existingTransactions.some((tx) => {
        if (!tx.metadata) return false;
        try {
          const meta = JSON.parse(tx.metadata);
          return meta.subscriptionId === subscriptionId &&
                 meta.dodoEvent === "subscription.renewed" &&
                 meta.renewalDate === renewalDate;
        } catch {
          return false;
        }
      });

      if (isDuplicate) {
        console.log(`[CREDIT CONTROLLER] Duplicate renewal webhook detected for subscriptionId: ${subscriptionId}, skipping`);
        return;
      }
    }

    // Add credits for renewal
    if (workspaceId && credits) {
      const creditAmount = parseInt(credits);

      await CreditModel.addCredits({
        workspaceId,
        userId,
        amount: creditAmount,
        type: "purchase",
        description: `${planName} renewal - ${creditAmount} credits`,
        metadata: {
          subscriptionId: subscriptionId,
          dodoEvent: "subscription.renewed",
          renewalDate: renewalDate,
        },
      });

      // Reset monthly minutes on renewal
      const productId = metadata?.packageId || data?.product_id;
      const plan = PRODUCT_TO_PLAN[productId];
      if (plan) {
        await MinutesModel.resetMonthlyMinutes(workspaceId, plan);
        console.log(`[CREDIT CONTROLLER] Monthly minutes reset for workspace: ${workspaceId}, plan: ${plan}`);
      }

      console.log(`[CREDIT CONTROLLER] Renewal credits added - workspace: ${workspaceId}, amount: ${creditAmount}`);
    }
  }

  // Handle subscription canceled event
  private static async handleSubscriptionCanceled(data: any) {
    const metadata = data?.metadata || {};
    const { workspaceId, planName } = metadata;
    const subscriptionId = data?.subscription_id;

    console.log(`[CREDIT CONTROLLER] Subscription canceled - workspace: ${workspaceId}, plan: ${planName}, subscriptionId: ${subscriptionId}`);

    // Update workspace subscription status
    if (workspaceId) {
      await WorkspaceModel.update(workspaceId, {
        subscriptionStatus: "cancelled",
        subscriptionCancelledAt: new Date(),
      });
      console.log(`[CREDIT CONTROLLER] Workspace subscription marked as cancelled: ${workspaceId}`);
    }
    // Credits remain until they're used - no credit action needed
  }

  // Get customer portal URL
  static async getCustomerPortal(c: Context) {
    const workspaceId = c.req.param("workspaceId");
    CreditController.logRequest(c, "GET_CUSTOMER_PORTAL", { workspaceId });

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

      if (!DodoService.isConfigured()) {
        return c.json({ error: "Payment system not configured" }, 503);
      }

      // Find customer ID by email
      const customerId = await DodoService.getCustomerByEmail(user.email);
      if (!customerId) {
        return c.json({
          error: "No billing account found",
          message: "You need to make a purchase first to access the billing portal."
        }, 404);
      }

      // Create customer portal session
      const portalUrl = await DodoService.createCustomerPortalSession(customerId);

      console.log(`[CREDIT CONTROLLER] GET_CUSTOMER_PORTAL success`);
      return c.json({ portalUrl });
    } catch (error: any) {
      console.error(`[CREDIT CONTROLLER] GET_CUSTOMER_PORTAL error:`, error);
      return c.json({ error: error.message || "Failed to get customer portal" }, 500);
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

  // Cancel subscription
  static async cancelSubscription(c: Context) {
    const workspaceId = c.req.param("workspaceId");
    const subscriptionId = c.req.param("subscriptionId");
    CreditController.logRequest(c, "CANCEL_SUBSCRIPTION", { workspaceId, subscriptionId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Check if user is owner or admin
      const members = await WorkspaceModel.getMembers(workspaceId);
      const currentMember = members.find((m) => m.userId === user.id);
      if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
        return c.json({ error: "Only owners and admins can cancel subscriptions" }, 403);
      }

      if (!DodoService.isConfigured()) {
        return c.json({ error: "Payment system not configured" }, 503);
      }

      await DodoService.cancelSubscription(subscriptionId);

      console.log(`[CREDIT CONTROLLER] CANCEL_SUBSCRIPTION success`);
      return c.json({ success: true, message: "Subscription cancelled" });
    } catch (error: any) {
      console.error(`[CREDIT CONTROLLER] CANCEL_SUBSCRIPTION error:`, error);
      return c.json({ error: error.message || "Failed to cancel subscription" }, 500);
    }
  }
}
