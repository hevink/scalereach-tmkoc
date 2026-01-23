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
  previewThumbnail?: string; // Static thumbnail for grid display
  isNew?: boolean; // Flag for new templates
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

// ============================================
// Opus.pro-style Templates (New)
// ============================================

/**
 * Karaoke Template - Opus.pro style
 * Classic karaoke highlighting with yellow text
 */
export const KARAOKE_TEMPLATE: CaptionTemplate = {
  id: "karaoke",
  name: "Karaoke",
  description: "Classic karaoke-style word highlighting. Great for music and podcast content.",
  platform: "Universal",
  style: {
    fontFamily: "Montserrat",
    fontSize: 48,
    textColor: "#FFFF00",
    backgroundColor: "#000000",
    backgroundOpacity: 60,
    position: "bottom",
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#FFFFFF",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/karaoke-preview.png",
  previewThumbnail: "/templates/karaoke-thumb.png",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

/**
 * Deep Diver Template - Opus.pro style
 * Clean, professional look with white text on dark background
 */
export const DEEP_DIVER_TEMPLATE: CaptionTemplate = {
  id: "deep-diver",
  name: "Deep Diver",
  description: "Clean, professional captions. Perfect for educational and documentary content.",
  platform: "Universal",
  style: {
    fontFamily: "Inter",
    fontSize: 36,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 80,
    position: "bottom",
    alignment: "center",
    animation: "fade",
    highlightColor: "#4A90D9",
    highlightEnabled: true,
    shadow: false,
    outline: false,
    outlineColor: undefined,
  },
  preview: "/templates/deep-diver-preview.png",
  previewThumbnail: "/templates/deep-diver-thumb.png",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

/**
 * Pod P Template - Opus.pro style
 * Podcast-optimized with magenta accents
 */
export const POD_P_TEMPLATE: CaptionTemplate = {
  id: "pod-p",
  name: "Pod P",
  description: "Podcast-optimized captions with vibrant accents. Great for interview content.",
  platform: "Podcast",
  style: {
    fontFamily: "Poppins",
    fontSize: 42,
    textColor: "#FF00FF",
    backgroundColor: "#1A1A2E",
    backgroundOpacity: 75,
    position: "bottom",
    alignment: "center",
    animation: "fade",
    highlightColor: "#00FFFF",
    highlightEnabled: true,
    shadow: true,
    outline: false,
    outlineColor: undefined,
  },
  preview: "/templates/pod-p-preview.png",
  previewThumbnail: "/templates/pod-p-thumb.png",
  isNew: true,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

/**
 * Popline Template - Opus.pro style
 * Bold, attention-grabbing with pop animation
 */
export const POPLINE_TEMPLATE: CaptionTemplate = {
  id: "popline",
  name: "Popline",
  description: "Bold, attention-grabbing captions with pop animation. Perfect for viral content.",
  platform: "Universal",
  style: {
    fontFamily: "Oswald",
    fontSize: 44,
    textColor: "#FFFFFF",
    backgroundColor: "#FF4500",
    backgroundOpacity: 85,
    position: "center",
    alignment: "center",
    animation: "bounce",
    highlightColor: "#FFD700",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/popline-preview.png",
  previewThumbnail: "/templates/popline-thumb.png",
  isNew: true,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

/**
 * Seamless Bounce Template - Opus.pro style
 * Smooth bouncing animation with green accents
 */
export const SEAMLESS_BOUNCE_TEMPLATE: CaptionTemplate = {
  id: "seamless-bounce",
  name: "Seamless Bounce",
  description: "Smooth bouncing animation that keeps viewers engaged. Great for energetic content.",
  platform: "Universal",
  style: {
    fontFamily: "Nunito",
    fontSize: 40,
    textColor: "#00FF00",
    backgroundColor: "#0D0D0D",
    backgroundOpacity: 70,
    position: "bottom",
    alignment: "center",
    animation: "bounce",
    highlightColor: "#FFFFFF",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/seamless-bounce-preview.png",
  previewThumbnail: "/templates/seamless-bounce-thumb.png",
  createdAt: new Date("2024-06-01"),
  updatedAt: new Date("2024-06-01"),
};

/**
 * Beasty Template - Opus.pro style
 * Clean, minimal style inspired by MrBeast
 */
export const BEASTY_TEMPLATE: CaptionTemplate = {
  id: "beasty",
  name: "Beasty",
  description: "Clean, minimal style inspired by top YouTubers. Professional and readable.",
  platform: "YouTube",
  style: {
    fontFamily: "Roboto",
    fontSize: 38,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 65,
    position: "bottom",
    alignment: "center",
    animation: "none",
    highlightColor: "#FF0000",
    highlightEnabled: false,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/beasty-preview.png",
  previewThumbnail: "/templates/beasty-thumb.png",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

/**
 * Youshaei Template - Opus.pro style
 * Slide animation with cyan accents
 */
export const YOUSHAEI_TEMPLATE: CaptionTemplate = {
  id: "youshaei",
  name: "Youshaei",
  description: "Elegant slide animation with modern aesthetics. Perfect for lifestyle content.",
  platform: "Universal",
  style: {
    fontFamily: "Raleway",
    fontSize: 42,
    textColor: "#00BFFF",
    backgroundColor: "#1C1C1C",
    backgroundOpacity: 75,
    position: "bottom",
    alignment: "center",
    animation: "fade",
    highlightColor: "#FF69B4",
    highlightEnabled: true,
    shadow: true,
    outline: false,
    outlineColor: undefined,
  },
  preview: "/templates/youshaei-preview.png",
  previewThumbnail: "/templates/youshaei-thumb.png",
  isNew: true,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

/**
 * Mozi Template - Opus.pro style
 * Yellow text with green highlight, karaoke style
 */
export const MOZI_TEMPLATE: CaptionTemplate = {
  id: "mozi",
  name: "Mozi",
  description: "Vibrant karaoke style with dual-color highlighting. Eye-catching and dynamic.",
  platform: "Universal",
  style: {
    fontFamily: "Montserrat",
    fontSize: 46,
    textColor: "#FFFF00",
    backgroundColor: "#000000",
    backgroundOpacity: 70,
    position: "bottom",
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#00FF00",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/mozi-preview.png",
  previewThumbnail: "/templates/mozi-thumb.png",
  createdAt: new Date("2024-03-01"),
  updatedAt: new Date("2024-03-01"),
};

/**
 * Glitch Infinite Template - Opus.pro style
 * Glitch effect with orange text
 */
export const GLITCH_INFINITE_TEMPLATE: CaptionTemplate = {
  id: "glitch-infinite",
  name: "Glitch Infinite",
  description: "Edgy glitch effect for tech and gaming content. Adds a cyberpunk vibe.",
  platform: "Gaming",
  style: {
    fontFamily: "Oswald",
    fontSize: 44,
    textColor: "#FF6600",
    backgroundColor: "#0A0A0A",
    backgroundOpacity: 80,
    position: "center",
    alignment: "center",
    animation: "word-by-word",
    highlightColor: "#00FFFF",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#FF0000",
  },
  preview: "/templates/glitch-infinite-preview.png",
  previewThumbnail: "/templates/glitch-infinite-thumb.png",
  isNew: true,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

/**
 * Baby Earthquake Template - Opus.pro style
 * Shake animation with green text
 */
export const BABY_EARTHQUAKE_TEMPLATE: CaptionTemplate = {
  id: "baby-earthquake",
  name: "Baby Earthquake",
  description: "Subtle shake animation that adds energy without being distracting.",
  platform: "Universal",
  style: {
    fontFamily: "Poppins",
    fontSize: 40,
    textColor: "#00FF00",
    backgroundColor: "#000000",
    backgroundOpacity: 65,
    position: "bottom",
    alignment: "center",
    animation: "bounce",
    highlightColor: "#FFFF00",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/baby-earthquake-preview.png",
  previewThumbnail: "/templates/baby-earthquake-thumb.png",
  createdAt: new Date("2024-06-01"),
  updatedAt: new Date("2024-06-01"),
};

/**
 * All built-in caption templates
 * Validates: Requirement 11.1 (at least 5 pre-built templates)
 */
export const CAPTION_TEMPLATES: CaptionTemplate[] = [
  // Opus.pro-style templates (featured)
  KARAOKE_TEMPLATE,
  DEEP_DIVER_TEMPLATE,
  POD_P_TEMPLATE,
  POPLINE_TEMPLATE,
  SEAMLESS_BOUNCE_TEMPLATE,
  BEASTY_TEMPLATE,
  YOUSHAEI_TEMPLATE,
  MOZI_TEMPLATE,
  GLITCH_INFINITE_TEMPLATE,
  BABY_EARTHQUAKE_TEMPLATE,
  // Platform-specific templates
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
