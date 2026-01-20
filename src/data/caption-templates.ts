/**
 * Caption Style Templates
 *
 * Pre-built caption style templates for different social media platforms.
 * Each template is optimized for specific platform aesthetics and engagement patterns.
 *
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import type { CaptionStyleConfig } from "../db/schema/project.schema";

/**
 * Caption Template interface extending CaptionStyleConfig with metadata
 */
export interface CaptionTemplate {
  id: string;
  name: string;
  description: string;
  platform: string;
  style: CaptionStyleConfig;
  preview: string; // Preview image URL or placeholder
  createdAt: Date;
  updatedAt: Date;
}

/**
 * TikTok Style Template
 *
 * Bold, centered text optimized for TikTok's vertical format.
 * Features high contrast colors and word-by-word animation for maximum engagement.
 *
 * Validates: Requirement 11.2
 */
export const TIKTOK_TEMPLATE: CaptionTemplate = {
  id: "tiktok",
  name: "TikTok",
  description:
    "Bold, centered text with high contrast. Perfect for TikTok's fast-paced, attention-grabbing style.",
  platform: "TikTok",
  style: {
    fontFamily: "Montserrat",
    fontSize: 48,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 70,
    position: "bottom",
    alignment: "center",
    animation: "word-by-word",
    highlightColor: "#FF0050",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/tiktok-preview.png",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

/**
 * Instagram Reels Style Template
 *
 * Gradient background with smooth fade animation.
 * Designed for Instagram's polished, aesthetic-focused audience.
 *
 * Validates: Requirement 11.3
 */
export const REELS_TEMPLATE: CaptionTemplate = {
  id: "reels",
  name: "Reels",
  description:
    "Gradient background with smooth animations. Ideal for Instagram Reels' polished aesthetic.",
  platform: "Instagram Reels",
  style: {
    fontFamily: "Poppins",
    fontSize: 42,
    textColor: "#FFFFFF",
    backgroundColor: "#833AB4", // Instagram gradient purple
    backgroundOpacity: 80,
    position: "bottom",
    alignment: "center",
    animation: "fade",
    highlightColor: "#FD1D1D", // Instagram gradient red
    highlightEnabled: true,
    shadow: true,
    outline: false,
    outlineColor: undefined,
  },
  preview: "/templates/reels-preview.png",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

/**
 * YouTube Shorts Style Template
 *
 * Word highlighting with karaoke-style animation.
 * Optimized for YouTube's algorithm-friendly engagement patterns.
 *
 * Validates: Requirement 11.4
 */
export const SHORTS_TEMPLATE: CaptionTemplate = {
  id: "shorts",
  name: "Shorts",
  description:
    "Karaoke-style word highlighting. Optimized for YouTube Shorts' engagement patterns.",
  platform: "YouTube Shorts",
  style: {
    fontFamily: "Roboto",
    fontSize: 44,
    textColor: "#FFFFFF",
    backgroundColor: "#282828",
    backgroundOpacity: 85,
    position: "bottom",
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#FF0000", // YouTube red
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/shorts-preview.png",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

/**
 * Minimal Style Template
 *
 * Clean, simple text with no background.
 * Perfect for professional content or when the video itself should be the focus.
 *
 * Validates: Requirement 11.5
 */
export const MINIMAL_TEMPLATE: CaptionTemplate = {
  id: "minimal",
  name: "Minimal",
  description:
    "Clean, simple text with subtle styling. Perfect for professional or documentary-style content.",
  platform: "Universal",
  style: {
    fontFamily: "Inter",
    fontSize: 36,
    textColor: "#FFFFFF",
    backgroundColor: undefined,
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "none",
    highlightColor: undefined,
    highlightEnabled: false,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/minimal-preview.png",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

/**
 * Bold Style Template
 *
 * Large, impactful text with bounce animation.
 * Designed for maximum visual impact and attention-grabbing content.
 *
 * Validates: Requirement 11.6
 */
export const BOLD_TEMPLATE: CaptionTemplate = {
  id: "bold",
  name: "Bold",
  description:
    "Large, impactful text with bounce animation. Maximum visual impact for attention-grabbing content.",
  platform: "Universal",
  style: {
    fontFamily: "Oswald",
    fontSize: 56,
    textColor: "#FFFF00", // Bright yellow
    backgroundColor: "#000000",
    backgroundOpacity: 90,
    position: "center",
    alignment: "center",
    animation: "bounce",
    highlightColor: "#FF6B00", // Orange highlight
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/bold-preview.png",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

/**
 * All built-in caption templates
 * Validates: Requirement 11.1 (at least 5 pre-built templates)
 */
export const CAPTION_TEMPLATES: CaptionTemplate[] = [
  TIKTOK_TEMPLATE,
  REELS_TEMPLATE,
  SHORTS_TEMPLATE,
  MINIMAL_TEMPLATE,
  BOLD_TEMPLATE,
];

/**
 * Get a caption template by ID
 * @param id - Template ID
 * @returns CaptionTemplate or undefined if not found
 */
export function getTemplateById(id: string): CaptionTemplate | undefined {
  return CAPTION_TEMPLATES.find((template) => template.id === id);
}

/**
 * Get all caption templates
 * @returns Array of all caption templates
 */
export function getAllTemplates(): CaptionTemplate[] {
  return CAPTION_TEMPLATES;
}

/**
 * Get templates filtered by platform
 * @param platform - Platform name to filter by
 * @returns Array of templates for the specified platform
 */
export function getTemplatesByPlatform(platform: string): CaptionTemplate[] {
  return CAPTION_TEMPLATES.filter(
    (template) =>
      template.platform.toLowerCase() === platform.toLowerCase() ||
      template.platform === "Universal"
  );
}

/**
 * Supported font families for caption styling
 * These fonts are available for use in caption templates and custom styles
 */
export const SUPPORTED_FONTS = [
  "Inter",
  "Roboto",
  "Montserrat",
  "Poppins",
  "Oswald",
  "Open Sans",
  "Lato",
  "Raleway",
  "Nunito",
  "Playfair Display",
] as const;

export type SupportedFont = (typeof SUPPORTED_FONTS)[number];

/**
 * Check if a font family is supported
 * @param fontFamily - Font family name to check
 * @returns true if the font is supported
 */
export function isSupportedFont(fontFamily: string): fontFamily is SupportedFont {
  return SUPPORTED_FONTS.includes(fontFamily as SupportedFont);
}
