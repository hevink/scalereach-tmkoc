import { AsyncLocalStorage } from "async_hooks";

// Log levels in order of severity
export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Request context stored in AsyncLocalStorage
interface RequestContext {
  requestId: string;
  userId?: string;
  workspaceId?: string;
  path?: string;
  method?: string;
}

// Structured log entry format (CloudWatch compatible)
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string;
  workspaceId?: string;
  service: string;
  path?: string;
  method?: string;
  durationMs?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

// AsyncLocalStorage for request context tracking
const requestContext = new AsyncLocalStorage<RequestContext>();

// Configuration
const isProduction = process.env.NODE_ENV === "production";
const minLogLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (isProduction ? "info" : "debug");
const serviceName = process.env.SERVICE_NAME || "scalereach-tmkoc";

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get the current request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Run a function with request context
 */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return requestContext.run(context, fn);
}

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
  if (isProduction) {
    // JSON format for CloudWatch and log aggregators
    return JSON.stringify(entry);
  }

  // Human-readable format for development
  const timestamp = new Date(entry.timestamp).toLocaleTimeString();
  const level = entry.level.toUpperCase().padEnd(5);
  const reqId = entry.requestId ? `[${entry.requestId}]` : "";
  const service = `[${entry.service}]`;

  let output = `${timestamp} ${level} ${service}${reqId} ${entry.message}`;

  if (entry.durationMs !== undefined) {
    output += ` (${entry.durationMs.toFixed(2)}ms)`;
  }

  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    output += `\n  ${JSON.stringify(entry.metadata)}`;
  }

  if (entry.error) {
    output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
    if (entry.error.stack && !isProduction) {
      output += `\n  ${entry.error.stack}`;
    }
  }

  return output;
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLogLevel];
}

/**
 * Core logging function
 */
function log(
  level: LogLevel,
  service: string,
  message: string,
  metadata?: Record<string, unknown>,
  error?: Error
): void {
  if (!shouldLog(level)) return;

  const ctx = getRequestContext();

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service,
    requestId: ctx?.requestId,
    userId: ctx?.userId,
    workspaceId: ctx?.workspaceId,
    path: ctx?.path,
    method: ctx?.method,
  };

  if (metadata) {
    entry.metadata = metadata;
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  const formatted = formatLogEntry(entry);

  switch (level) {
    case "debug":
      console.debug(formatted);
      break;
    case "info":
      console.log(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "error":
      console.error(formatted);
      break;
  }
}

/**
 * Logger class for creating service-specific loggers
 */
export class Logger {
  private service: string;
  private defaultMetadata: Record<string, unknown>;

  constructor(service: string, defaultMetadata: Record<string, unknown> = {}) {
    this.service = service;
    this.defaultMetadata = defaultMetadata;
  }

  /**
   * Create a child logger with additional context
   */
  child(metadata: Record<string, unknown>): Logger {
    return new Logger(this.service, { ...this.defaultMetadata, ...metadata });
  }

  /**
   * Log a debug message
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    log("debug", this.service, message, { ...this.defaultMetadata, ...metadata });
  }

  /**
   * Log an info message
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    log("info", this.service, message, { ...this.defaultMetadata, ...metadata });
  }

  /**
   * Log a warning message
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    log("warn", this.service, message, { ...this.defaultMetadata, ...metadata });
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : error ? new Error(String(error)) : undefined;
    log("error", this.service, message, { ...this.defaultMetadata, ...metadata }, err);
  }

  /**
   * Log with timing information
   */
  timed<T>(message: string, fn: () => T, metadata?: Record<string, unknown>): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.info(message, { ...metadata, durationMs: duration });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(message, error, { ...metadata, durationMs: duration });
      throw error;
    }
  }

  /**
   * Log with timing information (async version)
   */
  async timedAsync<T>(message: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.info(message, { ...metadata, durationMs: duration });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(message, error, { ...metadata, durationMs: duration });
      throw error;
    }
  }
}

// Pre-configured loggers for common services
export const logger = new Logger(serviceName);
export const apiLogger = new Logger("API");
export const dbLogger = new Logger("DB");
export const workerLogger = new Logger("WORKER");
export const authLogger = new Logger("AUTH");

/**
 * Create a custom logger for a specific service
 */
export function createLogger(service: string, defaultMetadata?: Record<string, unknown>): Logger {
  return new Logger(service, defaultMetadata);
}

/**
 * Hono middleware for request logging and context tracking
 */
export function loggerMiddleware() {
  return async (c: any, next: () => Promise<void>) => {
    const requestId = c.req.header("x-request-id") || generateRequestId();
    const start = performance.now();

    // Set request ID in response header
    c.header("x-request-id", requestId);

    const context: RequestContext = {
      requestId,
      path: c.req.path,
      method: c.req.method,
    };

    // Try to get user info from context if available
    try {
      const user = c.get("user");
      if (user?.id) {
        context.userId = user.id;
      }
      const session = c.get("session");
      if (session?.activeOrganizationId) {
        context.workspaceId = session.activeOrganizationId;
      }
    } catch {
      // User context not available yet
    }

    await runWithRequestContext(context, async () => {
      apiLogger.debug(`--> ${c.req.method} ${c.req.path}`);

      try {
        await next();

        const duration = performance.now() - start;
        const status = c.res.status;

        const logFn = status >= 500 ? apiLogger.error.bind(apiLogger) :
                      status >= 400 ? apiLogger.warn.bind(apiLogger) :
                      apiLogger.info.bind(apiLogger);

        logFn(`<-- ${c.req.method} ${c.req.path} ${status}`, {
          durationMs: duration,
          status,
        });
      } catch (error) {
        const duration = performance.now() - start;
        apiLogger.error(`<-- ${c.req.method} ${c.req.path} ERROR`, error, {
          durationMs: duration,
        });
        throw error;
      }
    });
  };
}

export default logger;
