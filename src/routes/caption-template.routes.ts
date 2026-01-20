/**
 * Caption Template Routes
 *
 * API routes for caption style templates.
 * These endpoints are public and do not require authentication.
 *
 * Validates: Requirement 11.7
 */

import { Hono } from "hono";
import {
  listCaptionTemplates,
  getCaptionTemplate,
  getSupportedFonts,
} from "../controllers/caption-template.controller";

const captionTemplateRouter = new Hono();

/**
 * GET /api/caption-templates
 *
 * List all available caption style templates.
 * Optionally filter by platform using query parameter.
 *
 * Query Parameters:
 * - platform (optional): Filter templates by platform
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     templates: CaptionTemplate[],
 *     total: number
 *   }
 * }
 */
captionTemplateRouter.get("/", listCaptionTemplates);

/**
 * GET /api/caption-templates/fonts
 *
 * Get list of supported font families for caption styling.
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     fonts: string[],
 *     total: number
 *   }
 * }
 */
captionTemplateRouter.get("/fonts", getSupportedFonts);

/**
 * GET /api/caption-templates/:id
 *
 * Get details of a specific caption style template.
 *
 * Path Parameters:
 * - id: Template ID (tiktok, reels, shorts, minimal, bold)
 *
 * Response:
 * {
 *   success: true,
 *   data: CaptionTemplate
 * }
 *
 * Error Response (404):
 * {
 *   success: false,
 *   error: {
 *     code: "NOT_FOUND",
 *     message: "Caption template with ID 'xxx' not found"
 *   }
 * }
 */
captionTemplateRouter.get("/:id", getCaptionTemplate);

export default captionTemplateRouter;
