/**
 * Caption Style Templates
 *
 * Pre-built caption style templates for different social media platforms.
 * Each template is optimized for specific platform aesthetics and engagement patterns.
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
 * Multi-color highlight with line-fill animation
 */
export const RAINBOW_TEMPLATE: CaptionTemplate = {
  id: "rainbow",
  name: "Rainbow",
  description: "Multi-color highlight effect with vibrant rainbow colors",
  platform: "Universal",
  style: {
    fontFamily: "Montserrat",
    fontSize: 36,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "word-by-word",
    highlightColor: "#FFFF00",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/rainbow-preview.png",
  createdAt: new Date("2024-06-14"),
  updatedAt: new Date("2024-06-14"),
};

/**
 * Classic Template
 * Spring animation with yellow highlight
 */
export const CLASSIC_TEMPLATE: CaptionTemplate = {
  id: "classic",
  name: "Classic",
  description: "Classic style with spring animation and yellow highlight",
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
  },
  preview: "/templates/classic-preview.png",
  createdAt: new Date("2024-04-09"),
  updatedAt: new Date("2024-04-03"),
};

/**
 * Sara Template
 * Box highlight with red/orange accent
 */
export const SARA_TEMPLATE: CaptionTemplate = {
  id: "sara",
  name: "Sara",
  description: "Elegant box highlight style with warm accent colors",
  platform: "Universal",
  style: {
    fontFamily: "Lexend",
    fontSize: 40,
    textColor: "#fffee5",
    backgroundColor: "#e13809",
    backgroundOpacity: 100,
    position: "bottom",
    alignment: "center",
    animation: "none",
    highlightColor: "#e13809",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/sara-preview.png",
  createdAt: new Date("2024-04-08"),
  updatedAt: new Date("2024-04-03"),
};

/**
 * Jimi Template
 * Blue tones with green highlight
 */
export const JIMI_TEMPLATE: CaptionTemplate = {
  id: "jimi",
  name: "Jimi",
  description: "Cool blue tones with vibrant green highlight",
  platform: "Universal",
  style: {
    fontFamily: "Titan One",
    fontSize: 44,
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
  },
  preview: "/templates/jimi-preview.png",
  createdAt: new Date("2024-04-03"),
  updatedAt: new Date("2024-04-03"),
};

/**
 * Basker Template
 * Elegant serif font with subtle shadow
 */
export const BASKER_TEMPLATE: CaptionTemplate = {
  id: "basker",
  name: "Basker",
  description: "Elegant serif style with subtle shadow effect",
  platform: "Universal",
  style: {
    fontFamily: "Libre Baskerville",
    fontSize: 32,
    textColor: "#fffff5",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "none",
    highlightColor: "#fff194",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/basker-preview.png",
  createdAt: new Date("2024-04-03"),
  updatedAt: new Date("2024-04-03"),
};

/**
 * Bobby Template
 * Box highlight with cyan accent
 */
export const BOBBY_TEMPLATE: CaptionTemplate = {
  id: "bobby",
  name: "Bobby",
  description: "Clean box highlight with cyan accent color",
  platform: "Universal",
  style: {
    fontFamily: "Poppins",
    fontSize: 32,
    textColor: "#FFFFFF",
    backgroundColor: "#5cd3ff",
    backgroundOpacity: 100,
    position: "bottom",
    alignment: "center",
    animation: "none",
    highlightColor: "#5cd3ff",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/bobby-preview.png",
  createdAt: new Date("2024-04-03"),
  updatedAt: new Date("2024-04-03"),
};

/**
 * Beast Template
 * Bold Bangers font with green highlight - MrBeast style
 */
export const BEAST_TEMPLATE: CaptionTemplate = {
  id: "beast",
  name: "Beast",
  description: "Bold and energetic style inspired by top YouTubers",
  platform: "YouTube",
  style: {
    fontFamily: "Bangers",
    fontSize: 42,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "bounce",
    highlightColor: "#50FE3C",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/beast-preview.png",
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
  description: "Fun rounded font with purple highlight",
  platform: "Universal",
  style: {
    fontFamily: "Lilita One",
    fontSize: 38,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "none",
    highlightColor: "#dc7aff",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
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
  description: "Clean and minimal style with no highlight",
  platform: "Universal",
  style: {
    fontFamily: "Inter",
    fontSize: 32,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    position: "bottom",
    alignment: "center",
    animation: "none",
    highlightColor: "#FFFFFF",
    highlightEnabled: false,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
  },
  preview: "/templates/simple-preview.png",
  createdAt: new Date("2024-04-03"),
  updatedAt: new Date("2024-04-03"),
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
  BEAST_TEMPLATE,
  BILLY_TEMPLATE,
  SIMPLE_TEMPLATE,
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
] as const;

export type SupportedFont = (typeof SUPPORTED_FONTS)[number];

/**
 * Check if a font family is supported
 */
export function isSupportedFont(fontFamily: string): fontFamily is SupportedFont {
  return SUPPORTED_FONTS.includes(fontFamily as SupportedFont);
}
