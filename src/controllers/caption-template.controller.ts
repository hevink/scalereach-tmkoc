/**
 * Caption Template Controller
 *
 * Handles API requests for caption style templates.
 * Provides endpoints to list all templates and get template details.
 *
 * Validates: Requirement 11.7
 */

import type { Context } from "hono";
import {
  getAllTemplates,
  getTemplateById,
  getTemplatesByPlatform,
  SUPPORTED_FONTS,
  type CaptionTemplate,
} from "../data/caption-templates";

/**
 * Response type for template list
 */
interface TemplateListResponse {
  success: boolean;
  data: {
    templates: CaptionTemplate[];
    total: number;
  };
}

/**
 * Response type for single template
 */
interface TemplateDetailResponse {
  success: boolean;
  data: CaptionTemplate;
}

/**
 * Error response type
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/**
 * GET /api/caption-templates
 *
 * List all available caption style templates.
 * Optionally filter by platform using query parameter.
 *
 * Query Parameters:
 * - platform (optional): Filter templates by platform (e.g., "TikTok", "Instagram Reels")
 *
 * @param c - Hono context
 * @returns JSON response with array of templates
 *
 * Validates: Requirement 11.7
 */
export async function listCaptionTemplates(
  c: Context
): Promise<Response> {
  try {
    const platform = c.req.query("platform");

    let templates: CaptionTemplate[];

    if (platform) {
      templates = getTemplatesByPlatform(platform);
    } else {
      templates = getAllTemplates();
    }

    const response: TemplateListResponse = {
      success: true,
      data: {
        templates,
        total: templates.length,
      },
    };

    return c.json(response, 200);
  } catch (error) {
    console.error("Error listing caption templates:", error);

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve caption templates",
      },
    };

    return c.json(errorResponse, 500);
  }
}

/**
 * GET /api/caption-templates/:id
 *
 * Get details of a specific caption style template.
 *
 * Path Parameters:
 * - id: Template ID (e.g., "tiktok", "reels", "shorts", "minimal", "bold")
 *
 * @param c - Hono context
 * @returns JSON response with template details or 404 if not found
 *
 * Validates: Requirement 11.7
 */
export async function getCaptionTemplate(
  c: Context
): Promise<Response> {
  try {
    const id = c.req.param("id");

    if (!id) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Template ID is required",
        },
      };
      return c.json(errorResponse, 400);
    }

    const template = getTemplateById(id);

    if (!template) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Caption template with ID '${id}' not found`,
        },
      };
      return c.json(errorResponse, 404);
    }

    const response: TemplateDetailResponse = {
      success: true,
      data: template,
    };

    return c.json(response, 200);
  } catch (error) {
    console.error("Error getting caption template:", error);

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve caption template",
      },
    };

    return c.json(errorResponse, 500);
  }
}

/**
 * GET /api/caption-templates/fonts
 *
 * Get list of supported font families for caption styling.
 *
 * @param c - Hono context
 * @returns JSON response with array of supported fonts
 */
export async function getSupportedFonts(
  c: Context
): Promise<Response> {
  try {
    return c.json(
      {
        success: true,
        data: {
          fonts: SUPPORTED_FONTS,
          total: SUPPORTED_FONTS.length,
        },
      },
      200
    );
  } catch (error) {
    console.error("Error getting supported fonts:", error);

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve supported fonts",
      },
    };

    return c.json(errorResponse, 500);
  }
}
