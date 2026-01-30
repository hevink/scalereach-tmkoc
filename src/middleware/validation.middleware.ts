/**
 * Zod Validation Middleware
 *
 * Provides consistent request validation across all API endpoints.
 * Supports validation of body, query params, and route params.
 */

import { Context, Next } from "hono";
import { z } from "zod";

/**
 * Validation target types
 */
export type ValidationTarget = "body" | "query" | "param";

/**
 * Validation schema configuration
 */
export interface ValidationConfig {
  body?: z.ZodType;
  query?: z.ZodType;
  param?: z.ZodType;
}

/**
 * Standardized validation error response
 */
export interface ValidationErrorResponse {
  error: string;
  code: "VALIDATION_ERROR";
  details: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

/**
 * Format Zod errors into a consistent response format
 * Compatible with Zod v4 which uses 'issues' instead of 'errors'
 */
function formatZodError(error: z.ZodError, target: ValidationTarget): ValidationErrorResponse {
  const details = error.issues.map((issue) => ({
    field: issue.path.join(".") || target,
    message: issue.message,
    code: issue.code,
  }));

  return {
    error: `Invalid ${target} parameters`,
    code: "VALIDATION_ERROR",
    details,
  };
}

/**
 * Validation middleware factory
 *
 * Creates a middleware that validates request body, query params, and/or route params
 * against provided Zod schemas.
 *
 * @example
 * // Validate request body
 * app.post("/users", validate({ body: createUserSchema }), handler);
 *
 * // Validate query params
 * app.get("/users", validate({ query: listUsersQuerySchema }), handler);
 *
 * // Validate multiple targets
 * app.put("/users/:id", validate({
 *   param: userIdParamSchema,
 *   body: updateUserSchema
 * }), handler);
 */
export function validate(config: ValidationConfig) {
  return async (c: Context, next: Next) => {
    try {
      // Validate route params
      if (config.param) {
        const params = c.req.param();
        const result = config.param.safeParse(params);
        if (!result.success) {
          return c.json(formatZodError(result.error, "param"), 400);
        }
        c.set("validatedParams", result.data);
      }

      // Validate query params
      if (config.query) {
        const query = c.req.query();
        const result = config.query.safeParse(query);
        if (!result.success) {
          return c.json(formatZodError(result.error, "query"), 400);
        }
        c.set("validatedQuery", result.data);
      }

      // Validate request body
      if (config.body) {
        let body: unknown;
        try {
          body = await c.req.json();
        } catch {
          return c.json({
            error: "Invalid JSON body",
            code: "VALIDATION_ERROR",
            details: [{ field: "body", message: "Request body must be valid JSON", code: "invalid_json" }],
          }, 400);
        }

        const result = config.body.safeParse(body);
        if (!result.success) {
          return c.json(formatZodError(result.error, "body"), 400);
        }
        c.set("validatedBody", result.data);
      }

      await next();
    } catch (error) {
      console.error("[VALIDATION MIDDLEWARE] Unexpected error:", error);
      return c.json({ error: "Validation failed" }, 500);
    }
  };
}

/**
 * Helper to get validated data from context with type safety
 */
export function getValidatedBody<T>(c: Context): T {
  return c.get("validatedBody") as T;
}

export function getValidatedQuery<T>(c: Context): T {
  return c.get("validatedQuery") as T;
}

export function getValidatedParams<T>(c: Context): T {
  return c.get("validatedParams") as T;
}

/**
 * Inline validation helper for use within controller methods
 *
 * @example
 * const result = await validateBody(c, createUserSchema);
 * if (!result.success) {
 *   return c.json(result.error, 400);
 * }
 * const data = result.data;
 */
export async function validateBody<T extends z.ZodType>(
  c: Context,
  schema: T
): Promise<{ success: true; data: z.infer<T> } | { success: false; error: ValidationErrorResponse }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return {
      success: false,
      error: {
        error: "Invalid JSON body",
        code: "VALIDATION_ERROR",
        details: [{ field: "body", message: "Request body must be valid JSON", code: "invalid_json" }],
      },
    };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      error: formatZodError(result.error, "body"),
    };
  }

  return { success: true, data: result.data };
}

export function validateQuery<T extends z.ZodType>(
  c: Context,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; error: ValidationErrorResponse } {
  const query = c.req.query();
  const result = schema.safeParse(query);

  if (!result.success) {
    return {
      success: false,
      error: formatZodError(result.error, "query"),
    };
  }

  return { success: true, data: result.data };
}

export function validateParams<T extends z.ZodType>(
  c: Context,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; error: ValidationErrorResponse } {
  const params = c.req.param();
  const result = schema.safeParse(params);

  if (!result.success) {
    return {
      success: false,
      error: formatZodError(result.error, "param"),
    };
  }

  return { success: true, data: result.data };
}
