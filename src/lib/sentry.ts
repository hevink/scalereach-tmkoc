import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
    debug: false,
    environment: process.env.NODE_ENV || "development",
    ignoreErrors: ["ECONNRESET", "ECONNREFUSED"],
  });
  console.log("[SENTRY] Initialized for error tracking");
} else {
  console.log("[SENTRY] DSN not configured, error tracking disabled");
}

export function captureException(error: Error, context?: Record<string, any>) {
  if (dsn) {
    Sentry.captureException(error, { extra: context });
  }
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info") {
  if (dsn) {
    Sentry.captureMessage(message, level);
  }
}

export { Sentry };
