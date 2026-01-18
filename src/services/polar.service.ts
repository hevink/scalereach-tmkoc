import { Polar } from "@polar-sh/sdk";

const polarAccessToken = process.env.POLAR_ACCESS_TOKEN;
const polarEnvironment = process.env.POLAR_ENVIRONMENT || "sandbox";

if (!polarAccessToken) {
  console.warn("[POLAR SERVICE] POLAR_ACCESS_TOKEN not configured. Polar features disabled.");
}

export const polarClient = polarAccessToken
  ? new Polar({
      accessToken: polarAccessToken,
      server: polarEnvironment as "sandbox" | "production",
    })
  : null;

export class PolarService {
  static isConfigured(): boolean {
    return !!polarClient;
  }

  // Create a checkout session for credit purchase
  static async createCheckoutSession(params: {
    productId: string;
    successUrl: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  }) {
    if (!polarClient) {
      throw new Error("Polar is not configured");
    }

    const checkout = await polarClient.checkouts.create({
      productId: params.productId,
      successUrl: params.successUrl,
      customerEmail: params.customerEmail,
      metadata: params.metadata,
    });

    return checkout;
  }

  // Get checkout session details
  static async getCheckoutSession(checkoutId: string) {
    if (!polarClient) {
      throw new Error("Polar is not configured");
    }

    const checkout = await polarClient.checkouts.get({ id: checkoutId });
    return checkout;
  }

  // List products
  static async listProducts() {
    if (!polarClient) {
      throw new Error("Polar is not configured");
    }

    const products = await polarClient.products.list({});
    return products;
  }
}
