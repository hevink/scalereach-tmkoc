import DodoPayments from "dodopayments";

const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY;
const dodoEnvironment = (process.env.DODO_ENVIRONMENT || "test_mode") as "test_mode" | "live_mode";

if (!dodoApiKey) {
  console.warn("[DODO SERVICE] DODO_PAYMENTS_API_KEY not configured. Payment features disabled.");
} else {
  console.log(`[DODO SERVICE] Initialized with environment: ${dodoEnvironment}`);
}

export const dodoClient = dodoApiKey
  ? new DodoPayments({
      bearerToken: dodoApiKey,
      environment: dodoEnvironment,
    })
  : null;

export interface CreatePaymentLinkParams {
  productId: string;
  quantity?: number;
  successUrl: string;
  customerEmail?: string;
  customerId?: string;
  metadata?: Record<string, string>;
}

export interface DodoWebhookPayload {
  type: string;
  data: {
    payment_id?: string;
    business_id?: string;
    customer?: {
      customer_id: string;
      email: string;
      name: string;
    };
    metadata?: Record<string, string>;
    total_amount?: number;
    currency?: string;
    status?: string;
    product_cart?: Array<{
      product_id: string;
      quantity: number;
    }>;
    created_at?: string;
    subscription_id?: string;
  };
}

export class DodoService {
  static isConfigured(): boolean {
    return !!dodoClient;
  }

  // Create a payment link for one-time purchase
  static async createPaymentLink(params: CreatePaymentLinkParams) {
    if (!dodoClient) {
      throw new Error("Dodo Payments is not configured");
    }

    try {
      const paymentLink = await dodoClient.payments.create({
        billing: {
          city: "",
          country: "US",
          state: "",
          street: "",
          zipcode: "",
        },
        customer: {
          email: params.customerEmail || "",
          name: "",
        },
        product_cart: [
          {
            product_id: params.productId,
            quantity: params.quantity || 1,
          },
        ],
        return_url: params.successUrl,
        metadata: params.metadata,
      });

      console.log(`[DODO SERVICE] Payment link created: ${paymentLink.payment_id}`);
      return paymentLink;
    } catch (error: any) {
      console.error(`[DODO SERVICE] Failed to create payment link:`, error);
      throw new Error(error.message || "Failed to create payment link");
    }
  }

  // Create a checkout session (works for both one-time and subscription products)
  static async createSubscription(params: {
    productId: string;
    successUrl: string;
    cancelUrl?: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  }) {
    if (!dodoClient) {
      throw new Error("Dodo Payments is not configured");
    }

    try {
      // Use checkout sessions API for hosted checkout URL
      const session = await dodoClient.checkoutSessions.create({
        product_cart: [
          {
            product_id: params.productId,
            quantity: 1,
          },
        ],
        return_url: params.successUrl,
        metadata: params.metadata,
      });

      console.log(`[DODO SERVICE] Checkout session created:`, JSON.stringify(session, null, 2));
      return {
        subscription_id: session.session_id,
        payment_id: session.session_id,
        payment_link: session.checkout_url,
      };
    } catch (error: any) {
      console.error(`[DODO SERVICE] Failed to create checkout session:`, error);
      throw new Error(error.message || "Failed to create checkout session");
    }
  }

  // Get payment details
  static async getPayment(paymentId: string) {
    if (!dodoClient) {
      throw new Error("Dodo Payments is not configured");
    }

    try {
      const payment = await dodoClient.payments.retrieve(paymentId);
      return payment;
    } catch (error: any) {
      console.error(`[DODO SERVICE] Failed to get payment:`, error);
      throw new Error(error.message || "Failed to get payment");
    }
  }

  // Get subscription details
  static async getSubscription(subscriptionId: string) {
    if (!dodoClient) {
      throw new Error("Dodo Payments is not configured");
    }

    try {
      const subscription = await dodoClient.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error: any) {
      console.error(`[DODO SERVICE] Failed to get subscription:`, error);
      throw new Error(error.message || "Failed to get subscription");
    }
  }

  // Cancel subscription
  static async cancelSubscription(subscriptionId: string) {
    if (!dodoClient) {
      throw new Error("Dodo Payments is not configured");
    }

    try {
      await dodoClient.subscriptions.update(subscriptionId, {
        status: "cancelled",
      });
      console.log(`[DODO SERVICE] Subscription cancelled: ${subscriptionId}`);
      return true;
    } catch (error: any) {
      console.error(`[DODO SERVICE] Failed to cancel subscription:`, error);
      throw new Error(error.message || "Failed to cancel subscription");
    }
  }

  // Verify webhook signature
  static verifyWebhookSignature(
    payload: string,
    signature: string,
    webhookSecret: string
  ): boolean {
    try {
      const crypto = require("crypto");
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(payload)
        .digest("hex");

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error(`[DODO SERVICE] Webhook signature verification failed:`, error);
      return false;
    }
  }

  // List products (for syncing with local database)
  static async listProducts() {
    if (!dodoClient) {
      throw new Error("Dodo Payments is not configured");
    }

    try {
      const products = await dodoClient.products.list();
      return products;
    } catch (error: any) {
      console.error(`[DODO SERVICE] Failed to list products:`, error);
      throw new Error(error.message || "Failed to list products");
    }
  }

  // Create customer portal session
  static async createCustomerPortalSession(customerId: string, sendEmail: boolean = false): Promise<string> {
    if (!dodoClient) {
      throw new Error("Dodo Payments is not configured");
    }

    try {
      const baseUrl = dodoEnvironment === "live_mode"
        ? "https://live.dodopayments.com"
        : "https://test.dodopayments.com";

      const response = await fetch(
        `${baseUrl}/customers/${customerId}/customer-portal/session${sendEmail ? '?send_email=true' : ''}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${dodoApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to create portal session: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[DODO SERVICE] Customer portal session created for customer: ${customerId}`);
      return data.link;
    } catch (error: any) {
      console.error(`[DODO SERVICE] Failed to create customer portal session:`, error);
      throw new Error(error.message || "Failed to create customer portal session");
    }
  }

  // Get customer by email (to find customer ID)
  static async getCustomerByEmail(email: string): Promise<string | null> {
    if (!dodoClient) {
      throw new Error("Dodo Payments is not configured");
    }

    try {
      const customers = await dodoClient.customers.list();
      const customer = customers.items?.find((c: any) => c.email === email);
      return customer?.customer_id || null;
    } catch (error: any) {
      console.error(`[DODO SERVICE] Failed to get customer by email:`, error);
      return null;
    }
  }

  // Get customer portal URL (deprecated - use createCustomerPortalSession instead)
  static getCustomerPortalUrl(): string {
    console.warn("[DODO SERVICE] getCustomerPortalUrl is deprecated. Use createCustomerPortalSession instead.");
    const baseUrl = dodoEnvironment === "live_mode"
      ? "https://app.dodopayments.com"
      : "https://test.dodopayments.com";
    return `${baseUrl}/customer-portal`;
  }
}
