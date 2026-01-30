// Sentry initialization for Hono backend
// This file should be imported at the very top of your entry point (index.ts)
// Install @sentry/node to enable: bun add @sentry/node

let Sentry: any = null;
let initialized = false;

async function initSentry() {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.log("[SENTRY] DSN not configured, error tracking disabled");
    return;
  }

  try {
    // Dynamic import to avoid build errors when package is not installed
    const moduleName = "@sentry/node";
    const SentryModule = await import(/* @vite-ignore */ moduleName);
    Sentry = SentryModule;

    Sentry.init({
      dsn,
      tracesSampleRate: 1.0,
      debug: false,
      environment: process.env.NODE_ENV || "development",
      ignoreErrors: ["ECONNRESET", "ECONNREFUSED"],
    });

    console.log("[SENTRY] Initialized for error tracking");
  } catch {
    console.log("[SENTRY] @sentry/node not installed, error tracking disabled");
    console.log("[SENTRY] To enable, run: bun add @sentry/node");
  }
}

// Initialize on import
initSentry();

export function captureException(error: Error, context?: Record<string, any>) {
  if (Sentry) {
    Sentry.captureException(error, { extra: context });
  }
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info") {
  if (Sentry) {
    Sentry.captureMessage(message, level);
  }
}

export { Sentry };
