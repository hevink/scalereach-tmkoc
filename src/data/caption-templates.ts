/**
 * Caption Style Templates
 *
 * Pre-built caption style templates for different social media platforms.
 * Each template is optimized for specific platform aesthetics and engagement patterns.
 * Based on viral video caption styles from top creators.
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
  preview: string;
  previewThumbnail?: string;
  isNew?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Rainbow Template
 * Multi-color highlight with line-fill animation - Montserrat 900
 */
export const RAINBOW_TEMPLATE: CaptionTemplate = {
  id: "rainbow",
  name: "Rainbow",
  description: "Multi-color highlight effect with vibrant rainbow colors",
  platform: "Universal",
  style: {
    fontFamily: "Montserrat",
    fontSize: 40,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#FFFF00",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 5,
    highlightScale: 125,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/rainbow-preview.png",
  createdAt: new Date("2024-06-14"),
  updatedAt: new Date("2024-06-14"),
};

/**
 * Classic Template
 * Spring animation with yellow highlight - Poppins 900
 */
export const CLASSIC_TEMPLATE: CaptionTemplate = {
  id: "classic",
  name: "Classic",
  description: "Classic viral style with spring animation and yellow highlight",
  platform: "Universal",
  style: {
    fontFamily: "Poppins",
    fontSize: 32,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "bounce",
    highlightColor: "#FFFF00",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 5,
    highlightScale: 125,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/classic-preview.png",
  createdAt: new Date("2024-04-09"),
  updatedAt: new Date("2024-04-03"),
};

/**
 * Sara Template
 * Box highlight with red/orange accent - Lexend 900
 */
export const SARA_TEMPLATE: CaptionTemplate = {
  id: "sara",
  name: "Sara",
  description: "Bold box highlight style with warm accent colors",
  platform: "Universal",
  style: {
    fontFamily: "Lexend",
    fontSize: 48,
    textColor: "#fffee5",
    backgroundColor: "#e13809",
    backgroundOpacity: 100,
    position: "bottom",
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#e13809",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 5,
    highlightScale: 120,
    textTransform: "none",
    wordsPerLine: 3,
  },
  preview: "/templates/sara-preview.png",
  createdAt: new Date("2024-04-08"),
  updatedAt: new Date("2024-04-03"),
};

/**
 * Jimi Template
 * Blue tones with green highlight - Titan One 900
 */
export const JIMI_TEMPLATE: CaptionTemplate = {
  id: "jimi",
  name: "Jimi",
  description: "Cool blue tones with vibrant neon green highlight",
  platform: "Universal",
  style: {
    fontFamily: "Titan One",
    fontSize: 64,
    textColor: "#cddcf4",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "bounce",
    highlightColor: "#75FA55",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#103e89",
    outlineWidth: 5,
    highlightScale: 125,
    textTransform: "none",
    wordsPerLine: 3,
  },
  preview: "/templates/jimi-preview.png",
  createdAt: new Date("2024-04-03"),
  updatedAt: new Date("2024-04-03"),
};

/**
 * Basker Template
 * Elegant serif font with subtle shadow - Libre Baskerville 900
 */
export const BASKER_TEMPLATE: CaptionTemplate = {
  id: "basker",
  name: "Basker",
  description: "Elegant serif style with golden highlights for premium content",
  platform: "Universal",
  style: {
    fontFamily: "Libre Baskerville",
    fontSize: 32,
    textColor: "#fffff5",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "fade",
    highlightColor: "#fff194",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 3,
    highlightScale: 120,
    textTransform: "none",
    wordsPerLine: 3,
  },
  preview: "/templates/basker-preview.png",
  createdAt: new Date("2024-04-03"),
  updatedAt: new Date("2024-04-03"),
};

/**
 * Bobby Template
 * Box highlight with cyan accent - Poppins 700
 */
export const BOBBY_TEMPLATE: CaptionTemplate = {
  id: "bobby",
  name: "Bobby",
  description: "Bold box highlight with vibrant cyan accent",
  platform: "Universal",
  style: {
    fontFamily: "Poppins",
    fontSize: 32,
    textColor: "#FFFFFF",
    backgroundColor: "#5cd3ff",
    backgroundOpacity: 100,
    position: "bottom",
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#5cd3ff",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 4,
    highlightScale: 120,
    textTransform: "none",
    wordsPerLine: 3,
  },
  preview: "/templates/bobby-preview.png",
  createdAt: new Date("2024-04-03"),
  updatedAt: new Date("2024-04-03"),
};

/**
 * Billy Template
 * Lilita One font with purple highlight
 */
export const BILLY_TEMPLATE: CaptionTemplate = {
  id: "billy",
  name: "Billy",
  description: "Fun rounded font with vibrant purple highlight",
  platform: "Universal",
  style: {
    fontFamily: "Lilita One",
    fontSize: 44,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#dc7aff",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 5,
    highlightScale: 125,
    textTransform: "uppercase",
    wordsPerLine: 1,
  },
  preview: "/templates/billy-preview.png",
  createdAt: new Date("2024-04-03"),
  updatedAt: new Date("2024-04-03"),
};

/**
 * Simple Template
 * Clean Inter font with no highlight
 */
export const SIMPLE_TEMPLATE: CaptionTemplate = {
  id: "simple",
  name: "Simple",
  description: "Clean and minimal style - perfect for professional content",
  platform: "Universal",
  style: {
    fontFamily: "Inter",
    fontSize: 36,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "fade",
    highlightColor: "#FFFFFF",
    highlightEnabled: false,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 5,
    textTransform: "none",
    wordsPerLine: 3,
  },
  preview: "/templates/simple-preview.png",
  createdAt: new Date("2024-04-03"),
  updatedAt: new Date("2024-04-03"),
};

/**
 * Hormozi Template
 * Alex Hormozi style - bold Anton font with gold highlight
 */
export const HORMOZI_TEMPLATE: CaptionTemplate = {
  id: "hormozi",
  name: "Hormozi",
  description: "Bold entrepreneurial style with gold highlights - inspired by Alex Hormozi",
  platform: "YouTube",
  style: {
    fontFamily: "Anton",
    fontSize: 48,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#FFD700",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 5,
    highlightScale: 125,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/hormozi-preview.png",
  isNew: true,
  createdAt: new Date("2024-06-14"),
  updatedAt: new Date("2024-06-14"),
};

/**
 * MrBeast Pro Template
 * Enhanced MrBeast style with bright green highlight and bounce animation
 */
export const MRBEAST_PRO_TEMPLATE: CaptionTemplate = {
  id: "mrbeast-pro",
  name: "MrBeast Pro",
  description: "High-energy style with bright green highlights and bounce animation",
  platform: "YouTube",
  style: {
    fontFamily: "Bangers",
    fontSize: 56,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "bounce",
    highlightColor: "#00FF00",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 6,
    highlightScale: 130,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/mrbeast-pro-preview.png",
  isNew: true,
  createdAt: new Date("2024-06-14"),
  updatedAt: new Date("2024-06-14"),
};

/**
 * Clean Creator Template
 * Modern creator style - Iman Gadzhi inspired with cyan accent
 */
export const CLEAN_CREATOR_TEMPLATE: CaptionTemplate = {
  id: "clean-creator",
  name: "Clean Creator",
  description: "Modern minimalist style with cyan accents - perfect for educational content",
  platform: "YouTube",
  style: {
    fontFamily: "Montserrat",
    fontSize: 36,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "fade",
    highlightColor: "#00D4FF",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 4,
    highlightScale: 120,
    textTransform: "none",
    wordsPerLine: 4,
  },
  preview: "/templates/clean-creator-preview.png",
  isNew: true,
  createdAt: new Date("2024-06-14"),
  updatedAt: new Date("2024-06-14"),
};

/**
 * GaryVee Template
 * High energy style with red highlights - Gary Vaynerchuk inspired
 */
export const GARYVEE_TEMPLATE: CaptionTemplate = {
  id: "garyvee",
  name: "GaryVee",
  description: "High-energy motivational style with bold red highlights",
  platform: "Universal",
  style: {
    fontFamily: "Bebas Neue",
    fontSize: 48,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "word-by-word",
    highlightColor: "#FF0000",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 5,
    highlightScale: 125,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/garyvee-preview.png",
  isNew: true,
  createdAt: new Date("2024-06-14"),
  updatedAt: new Date("2024-06-14"),
};

/**
 * TikTok Native Template
 * Native TikTok caption look with pink highlight
 */
export const TIKTOK_NATIVE_TEMPLATE: CaptionTemplate = {
  id: "tiktok-native",
  name: "TikTok Native",
  description: "Native TikTok style captions with signature pink highlights",
  platform: "TikTok",
  style: {
    fontFamily: "Poppins",
    fontSize: 36,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#FE2C55",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 5,
    highlightScale: 125,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/tiktok-native-preview.png",
  isNew: true,
  createdAt: new Date("2024-06-14"),
  updatedAt: new Date("2024-06-14"),
};

/**
 * Neon Pop Template
 * Eye-catching neon style with cyan text and magenta highlight
 */
export const NEON_POP_TEMPLATE: CaptionTemplate = {
  id: "neon-pop",
  name: "Neon Pop",
  description: "Eye-catching neon style with vibrant cyan and magenta colors",
  platform: "Universal",
  style: {
    fontFamily: "Permanent Marker",
    fontSize: 44,
    textColor: "#00FFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#FF00FF",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 5,
    highlightScale: 125,
    glowEnabled: true,
    glowIntensity: 3,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/neon-pop-preview.png",
  isNew: true,
  createdAt: new Date("2024-06-14"),
  updatedAt: new Date("2024-06-14"),
};

/**
 * All built-in caption templates
 */
export const CAPTION_TEMPLATES: CaptionTemplate[] = [
  RAINBOW_TEMPLATE,
  CLASSIC_TEMPLATE,
  SARA_TEMPLATE,
  JIMI_TEMPLATE,
  BASKER_TEMPLATE,
  BOBBY_TEMPLATE,
  BILLY_TEMPLATE,
  SIMPLE_TEMPLATE,
  HORMOZI_TEMPLATE,
  MRBEAST_PRO_TEMPLATE,
  CLEAN_CREATOR_TEMPLATE,
  GARYVEE_TEMPLATE,
  TIKTOK_NATIVE_TEMPLATE,
  NEON_POP_TEMPLATE,
];

/**
 * Get a caption template by ID
 */
export function getTemplateById(id: string): CaptionTemplate | undefined {
  return CAPTION_TEMPLATES.find((template) => template.id === id);
}

/**
 * Get all caption templates
 */
export function getAllTemplates(): CaptionTemplate[] {
  return CAPTION_TEMPLATES;
}

/**
 * Get templates filtered by platform
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
  "Bangers",
  "Lilita One",
  "Titan One",
  "Lexend",
  "Libre Baskerville",
  "Anton",
  "Bebas Neue",
  "Permanent Marker",
] as const;

export type SupportedFont = (typeof SUPPORTED_FONTS)[number];

/**
 * Check if a font family is supported
 */
export function isSupportedFont(fontFamily: string): fontFamily is SupportedFont {
  return SUPPORTED_FONTS.includes(fontFamily as SupportedFont);
}
