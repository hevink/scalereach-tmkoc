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
    x: 50, y: 85,
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
    x: 50, y: 85,
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
    x: 50, y: 85,
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
    x: 50, y: 85,
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
    x: 50, y: 85,
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
    x: 50, y: 85,
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
    x: 50, y: 85,
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
    x: 50, y: 85,
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
    glowEnabled: true,
    glowColor: "#00FF00",
    glowIntensity: 12,
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
    x: 50, y: 85,
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
    x: 50, y: 85,
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
    x: 50, y: 85,
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
    x: 50, y: 85,
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#FF00FF",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 5,
    highlightScale: 125,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/neon-pop-preview.png",
  isNew: true,
  createdAt: new Date("2024-06-14"),
  updatedAt: new Date("2024-06-14"),
};

/**
 * Gold Luxe Template
 * Luxurious gold with thick outline - premium creator aesthetic
 */
export const GOLD_LUXE_TEMPLATE: CaptionTemplate = {
  id: "gold-luxe",
  name: "Gold Luxe",
  description: "Luxurious gold with thick outline - premium creator aesthetic",
  platform: "Universal",
  style: {
    fontFamily: "Righteous",
    fontSize: 42,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    x: 50, y: 85,
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#FFD700",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#8B6914",
    outlineWidth: 5,
    highlightScale: 125,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/gold-luxe-preview.png",
  isNew: true,
  createdAt: new Date("2026-02-09"),
  updatedAt: new Date("2026-02-09"),
};

/**
 * Cinematic Template
 * Warm ivory tones with elegant fade - film-quality subtitles
 */
export const CINEMATIC_TEMPLATE: CaptionTemplate = {
  id: "cinematic",
  name: "Cinematic",
  description: "Warm ivory tones with elegant fade - film-quality subtitles",
  platform: "Universal",
  style: {
    fontFamily: "Montserrat",
    fontSize: 34,
    textColor: "#F0E6D3",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    x: 50, y: 85,
    alignment: "center",
    animation: "fade",
    highlightColor: "#F0E6D3",
    highlightEnabled: false,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 2,
    textTransform: "none",
    wordsPerLine: 5,
  },
  preview: "/templates/cinematic-preview.png",
  isNew: true,
  createdAt: new Date("2026-02-09"),
  updatedAt: new Date("2026-02-09"),
};

/**
 * Electric Blue Template
 * High-voltage cyan with deep blue outline - gaming & tech aesthetic
 */
export const ELECTRIC_BLUE_TEMPLATE: CaptionTemplate = {
  id: "electric-blue",
  name: "Electric Blue",
  description: "High-voltage cyan with deep blue outline - gaming & tech aesthetic",
  platform: "Universal",
  style: {
    fontFamily: "Russo One",
    fontSize: 46,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    x: 50, y: 85,
    alignment: "center",
    animation: "bounce",
    highlightColor: "#00FFFF",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#001133",
    outlineWidth: 5,
    highlightScale: 130,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/electric-blue-preview.png",
  isNew: true,
  createdAt: new Date("2026-02-09"),
  updatedAt: new Date("2026-02-09"),
};

/**
 * Sunset Fire Template
 * Blazing orange with karaoke yellow highlight - high-energy viral style
 */
export const SUNSET_FIRE_TEMPLATE: CaptionTemplate = {
  id: "sunset-fire",
  name: "Sunset Fire",
  description: "Blazing orange with karaoke yellow highlight - high-energy viral style",
  platform: "Universal",
  style: {
    fontFamily: "Bangers",
    fontSize: 50,
    textColor: "#FF6B35",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    x: 50, y: 85,
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#FFE500",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#8B0000",
    outlineWidth: 5,
    highlightScale: 125,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/sunset-fire-preview.png",
  isNew: true,
  createdAt: new Date("2026-02-09"),
  updatedAt: new Date("2026-02-09"),
};

/**
 * Ice Cold Template
 * Frosty ice-blue with steel outline - cool & crisp word-by-word reveal
 */
export const ICE_COLD_TEMPLATE: CaptionTemplate = {
  id: "ice-cold",
  name: "Ice Cold",
  description: "Frosty ice-blue with steel outline - cool & crisp word-by-word reveal",
  platform: "Universal",
  style: {
    fontFamily: "Black Ops One",
    fontSize: 44,
    textColor: "#B8E8FF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    x: 50, y: 85,
    alignment: "center",
    animation: "word-by-word",
    highlightColor: "#FFFFFF",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#2C5F7C",
    outlineWidth: 4,
    highlightScale: 120,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/ice-cold-preview.png",
  isNew: true,
  createdAt: new Date("2026-02-09"),
  updatedAt: new Date("2026-02-09"),
};

/**
 * Coral Pop Template
 * Vibrant pink with bouncy animation - fun & feminine aesthetic
 */
export const CORAL_POP_TEMPLATE: CaptionTemplate = {
  id: "coral-pop",
  name: "Coral Pop",
  description: "Vibrant pink with bouncy animation - fun & feminine aesthetic",
  platform: "Universal",
  style: {
    fontFamily: "Poppins",
    fontSize: 38,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    x: 50, y: 85,
    alignment: "center",
    animation: "bounce",
    highlightColor: "#FF1493",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#C71585",
    outlineWidth: 4,
    highlightScale: 120,
    textTransform: "none",
    wordsPerLine: 3,
  },
  preview: "/templates/coral-pop-preview.png",
  isNew: true,
  createdAt: new Date("2026-02-09"),
  updatedAt: new Date("2026-02-09"),
};

/**
 * Midnight Purple Template
 * Deep purple with lavender text - mysterious & stylish karaoke
 */
export const MIDNIGHT_PURPLE_TEMPLATE: CaptionTemplate = {
  id: "midnight-purple",
  name: "Midnight Purple",
  description: "Deep purple with lavender text - mysterious & stylish karaoke",
  platform: "Universal",
  style: {
    fontFamily: "Oswald",
    fontSize: 44,
    textColor: "#E8D5FF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    x: 50, y: 85,
    alignment: "center",
    animation: "karaoke",
    highlightColor: "#BF40FF",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#2D0A4E",
    outlineWidth: 5,
    highlightScale: 125,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/midnight-purple-preview.png",
  isNew: true,
  createdAt: new Date("2026-02-09"),
  updatedAt: new Date("2026-02-09"),
};

/**
 * Toxic Green Template
 * Radioactive neon green with dark outline - bold & attention-grabbing
 */
export const TOXIC_GREEN_TEMPLATE: CaptionTemplate = {
  id: "toxic-green",
  name: "Toxic Green",
  description: "Radioactive neon green with dark outline - bold & attention-grabbing",
  platform: "Universal",
  style: {
    fontFamily: "Anton",
    fontSize: 48,
    textColor: "#00FF41",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    x: 50, y: 85,
    alignment: "center",
    animation: "bounce",
    highlightColor: "#39FF14",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#003300",
    outlineWidth: 5,
    highlightScale: 130,
    textTransform: "uppercase",
    wordsPerLine: 3,
  },
  preview: "/templates/toxic-green-preview.png",
  isNew: true,
  createdAt: new Date("2026-02-09"),
  updatedAt: new Date("2026-02-09"),
};

/**
 * Georgia Elegance Template
 * Classic serif style with warm tones - refined & editorial aesthetic
 */
export const GEORGIA_ELEGANCE_TEMPLATE: CaptionTemplate = {
  id: "georgia-elegance",
  name: "Georgia Elegance",
  description: "Classic serif style with warm tones - refined & editorial aesthetic",
  platform: "Universal",
  style: {
    fontFamily: "Georgia",
    fontSize: 36,
    textColor: "#FFFFFF",
    backgroundColor: "#000000",
    backgroundOpacity: 0,
    x: 50, y: 85,
    alignment: "center",
    animation: "fade",
    highlightColor: "#D4AF37",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "#000000",
    outlineWidth: 3,
    textTransform: "none",
    wordsPerLine: 5,
  },
  preview: "/templates/georgia-elegance-preview.png",
  isNew: true,
  createdAt: new Date("2026-02-09"),
  updatedAt: new Date("2026-02-09"),
};

/**
 * Glassmorphism Template
 * Frosted glass background with soft white text - modern UI-inspired look
 */
export const GLASSMORPHISM_TEMPLATE: CaptionTemplate = {
  id: "glassmorphism",
  name: "Glassmorphism",
  description: "Frosted glass panel with soft glow and translucent backdrop - modern UI aesthetic",
  platform: "Universal",
  style: {
    fontFamily: "Montserrat",
    fontSize: 34,
    textColor: "#FFFFFF",
    backgroundColor: "#88AAFF",
    backgroundOpacity: 25,
    x: 50, y: 85,
    alignment: "center",
    animation: "fade",
    highlightColor: "#E0E8FF",
    highlightEnabled: true,
    shadow: true,
    outline: true,
    outlineColor: "rgba(255,255,255,0.3)",
    outlineWidth: 1,
    textTransform: "none",
    wordsPerLine: 5,
  },
  preview: "/templates/glassmorphism-preview.png",
  isNew: true,
  createdAt: new Date("2026-02-09"),
  updatedAt: new Date("2026-02-09"),
};

/**
 * All built-in caption templates
 */
export const CAPTION_TEMPLATES: CaptionTemplate[] = [
  CLASSIC_TEMPLATE,
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
  GOLD_LUXE_TEMPLATE,
  CINEMATIC_TEMPLATE,
  ELECTRIC_BLUE_TEMPLATE,
  SUNSET_FIRE_TEMPLATE,
  ICE_COLD_TEMPLATE,
  CORAL_POP_TEMPLATE,
  MIDNIGHT_PURPLE_TEMPLATE,
  GEORGIA_ELEGANCE_TEMPLATE,
  GLASSMORPHISM_TEMPLATE,
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
  "Righteous",
  "Russo One",
  "Black Ops One",
  "Georgia",
] as const;

export type SupportedFont = (typeof SUPPORTED_FONTS)[number];

/**
 * Check if a font family is supported
 */
export function isSupportedFont(fontFamily: string): fontFamily is SupportedFont {
  return SUPPORTED_FONTS.includes(fontFamily as SupportedFont);
}
