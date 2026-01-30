// Sentry error handling middleware for Hono
// This middleware captures errors and reports them to Sentry

import type { Context, Next } from "hono";
import { Sentry } from "../lib/sentry";

/**
 * Sentry error handling middleware for Hono
 * This should be added as one of the first middleware in your app
 * to ensure all errors are captured
 */
export const sentryMiddleware = async (c: Context, next: Next) => {
  try {
    await next();
  } catch (error) {
    // Capture the error in Sentry
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        extra: {
          url: c.req.url,
          method: c.req.method,
          headers: Object.fromEntries(c.req.raw.headers.entries()),
        },
        tags: {
          path: c.req.path,
          method: c.req.method,
        },
      });
    }

    // Re-throw the error so Hono's error handler can process it
    throw error;
  }
};

/**
 * Sentry request handler middleware
 * Adds request context to Sentry for better error tracking
 */
export const sentryRequestMiddleware = async (c: Context, next: Next) => {
  if (process.env.SENTRY_DSN) {
    Sentry.setContext("request", {
      url: c.req.url,
      method: c.req.method,
      path: c.req.path,
    });
  }

  await next();
};

/**
 * Helper function to manually capture an error with additional context
 */
export const captureError = (
  error: Error,
  context?: Record<string, unknown>
) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, {
      extra: context,
    });
  }
};

/**
 * Helper function to capture a message/event
 */
export const captureMessage = (
  message: string,
  level: "fatal" | "error" | "warning" | "log" | "info" | "debug" = "info"
) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureMessage(message, level);
  }
};
