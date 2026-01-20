/**
 * Caption Templates Unit Tests
 *
 * Tests for caption style template data and helper functions.
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { describe, expect, it } from "bun:test";
import {
  CAPTION_TEMPLATES,
  TIKTOK_TEMPLATE,
  REELS_TEMPLATE,
  SHORTS_TEMPLATE,
  MINIMAL_TEMPLATE,
  BOLD_TEMPLATE,
  getTemplateById,
  getAllTemplates,
  getTemplatesByPlatform,
  SUPPORTED_FONTS,
  isSupportedFont,
  type CaptionTemplate,
} from "./caption-templates";

describe("Caption Templates", () => {
  describe("Template Count", () => {
    it("should have at least 5 built-in templates (Requirement 11.1)", () => {
      expect(CAPTION_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    });

    it("should have exactly 5 templates", () => {
      expect(CAPTION_TEMPLATES.length).toBe(5);
    });
  });

  describe("TikTok Template (Requirement 11.2)", () => {
    it("should have correct ID", () => {
      expect(TIKTOK_TEMPLATE.id).toBe("tiktok");
    });

    it("should have bold, centered text", () => {
      expect(TIKTOK_TEMPLATE.style.alignment).toBe("center");
      expect(TIKTOK_TEMPLATE.style.fontSize).toBeGreaterThanOrEqual(40);
    });

    it("should have word-by-word animation", () => {
      expect(TIKTOK_TEMPLATE.style.animation).toBe("word-by-word");
    });

    it("should have highlighting enabled", () => {
      expect(TIKTOK_TEMPLATE.style.highlightEnabled).toBe(true);
    });
  });

  describe("Reels Template (Requirement 11.3)", () => {
    it("should have correct ID", () => {
      expect(REELS_TEMPLATE.id).toBe("reels");
    });

    it("should have gradient-style background", () => {
      expect(REELS_TEMPLATE.style.backgroundColor).toBeDefined();
      expect(REELS_TEMPLATE.style.backgroundOpacity).toBeGreaterThan(0);
    });

    it("should have fade animation", () => {
      expect(REELS_TEMPLATE.style.animation).toBe("fade");
    });
  });

  describe("Shorts Template (Requirement 11.4)", () => {
    it("should have correct ID", () => {
      expect(SHORTS_TEMPLATE.id).toBe("shorts");
    });

    it("should have word highlighting (karaoke style)", () => {
      expect(SHORTS_TEMPLATE.style.animation).toBe("karaoke");
      expect(SHORTS_TEMPLATE.style.highlightEnabled).toBe(true);
    });
  });

  describe("Minimal Template (Requirement 11.5)", () => {
    it("should have correct ID", () => {
      expect(MINIMAL_TEMPLATE.id).toBe("minimal");
    });

    it("should have clean, simple text with no background", () => {
      expect(MINIMAL_TEMPLATE.style.backgroundOpacity).toBe(0);
    });

    it("should have no animation", () => {
      expect(MINIMAL_TEMPLATE.style.animation).toBe("none");
    });

    it("should have highlighting disabled", () => {
      expect(MINIMAL_TEMPLATE.style.highlightEnabled).toBe(false);
    });
  });

  describe("Bold Template (Requirement 11.6)", () => {
    it("should have correct ID", () => {
      expect(BOLD_TEMPLATE.id).toBe("bold");
    });

    it("should have large, impactful text", () => {
      expect(BOLD_TEMPLATE.style.fontSize).toBeGreaterThanOrEqual(50);
    });

    it("should have bounce animation", () => {
      expect(BOLD_TEMPLATE.style.animation).toBe("bounce");
    });

    it("should be positioned in center for maximum impact", () => {
      expect(BOLD_TEMPLATE.style.position).toBe("center");
    });
  });

  describe("Template Style Properties", () => {
    const validateTemplateStyle = (template: CaptionTemplate) => {
      const { style } = template;

      // Font properties
      expect(style.fontFamily).toBeDefined();
      expect(typeof style.fontFamily).toBe("string");
      expect(style.fontSize).toBeGreaterThanOrEqual(12);
      expect(style.fontSize).toBeLessThanOrEqual(72);

      // Color properties
      expect(style.textColor).toMatch(/^#[0-9A-Fa-f]{6}$/);

      // Position and alignment
      expect(["top", "center", "bottom"]).toContain(style.position);
      expect(["left", "center", "right"]).toContain(style.alignment);

      // Animation
      expect(["none", "word-by-word", "karaoke", "bounce", "fade"]).toContain(
        style.animation
      );

      // Opacity
      expect(style.backgroundOpacity).toBeGreaterThanOrEqual(0);
      expect(style.backgroundOpacity).toBeLessThanOrEqual(100);

      // Boolean properties
      expect(typeof style.highlightEnabled).toBe("boolean");
      expect(typeof style.shadow).toBe("boolean");
      expect(typeof style.outline).toBe("boolean");
    };

    it("TikTok template should have valid style properties", () => {
      validateTemplateStyle(TIKTOK_TEMPLATE);
    });

    it("Reels template should have valid style properties", () => {
      validateTemplateStyle(REELS_TEMPLATE);
    });

    it("Shorts template should have valid style properties", () => {
      validateTemplateStyle(SHORTS_TEMPLATE);
    });

    it("Minimal template should have valid style properties", () => {
      validateTemplateStyle(MINIMAL_TEMPLATE);
    });

    it("Bold template should have valid style properties", () => {
      validateTemplateStyle(BOLD_TEMPLATE);
    });
  });

  describe("getTemplateById", () => {
    it("should return TikTok template for 'tiktok' ID", () => {
      const template = getTemplateById("tiktok");
      expect(template).toBeDefined();
      expect(template?.id).toBe("tiktok");
      expect(template?.name).toBe("TikTok");
    });

    it("should return Reels template for 'reels' ID", () => {
      const template = getTemplateById("reels");
      expect(template).toBeDefined();
      expect(template?.id).toBe("reels");
    });

    it("should return Shorts template for 'shorts' ID", () => {
      const template = getTemplateById("shorts");
      expect(template).toBeDefined();
      expect(template?.id).toBe("shorts");
    });

    it("should return Minimal template for 'minimal' ID", () => {
      const template = getTemplateById("minimal");
      expect(template).toBeDefined();
      expect(template?.id).toBe("minimal");
    });

    it("should return Bold template for 'bold' ID", () => {
      const template = getTemplateById("bold");
      expect(template).toBeDefined();
      expect(template?.id).toBe("bold");
    });

    it("should return undefined for non-existent ID", () => {
      const template = getTemplateById("non-existent");
      expect(template).toBeUndefined();
    });

    it("should return undefined for empty string", () => {
      const template = getTemplateById("");
      expect(template).toBeUndefined();
    });
  });

  describe("getAllTemplates", () => {
    it("should return all templates", () => {
      const templates = getAllTemplates();
      expect(templates.length).toBe(5);
    });

    it("should return templates with unique IDs", () => {
      const templates = getAllTemplates();
      const ids = templates.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(templates.length);
    });
  });

  describe("getTemplatesByPlatform", () => {
    it("should return TikTok template for 'TikTok' platform", () => {
      const templates = getTemplatesByPlatform("TikTok");
      expect(templates.some((t) => t.id === "tiktok")).toBe(true);
    });

    it("should return Reels template for 'Instagram Reels' platform", () => {
      const templates = getTemplatesByPlatform("Instagram Reels");
      expect(templates.some((t) => t.id === "reels")).toBe(true);
    });

    it("should return Shorts template for 'YouTube Shorts' platform", () => {
      const templates = getTemplatesByPlatform("YouTube Shorts");
      expect(templates.some((t) => t.id === "shorts")).toBe(true);
    });

    it("should include Universal templates for any platform", () => {
      const templates = getTemplatesByPlatform("TikTok");
      const universalTemplates = templates.filter(
        (t) => t.platform === "Universal"
      );
      expect(universalTemplates.length).toBeGreaterThan(0);
    });

    it("should be case-insensitive", () => {
      const templates1 = getTemplatesByPlatform("tiktok");
      const templates2 = getTemplatesByPlatform("TIKTOK");
      expect(templates1.length).toBe(templates2.length);
    });
  });

  describe("Supported Fonts", () => {
    it("should have at least 5 supported fonts", () => {
      expect(SUPPORTED_FONTS.length).toBeGreaterThanOrEqual(5);
    });

    it("should include common web fonts", () => {
      expect(SUPPORTED_FONTS).toContain("Inter");
      expect(SUPPORTED_FONTS).toContain("Roboto");
      expect(SUPPORTED_FONTS).toContain("Montserrat");
    });

    it("isSupportedFont should return true for supported fonts", () => {
      expect(isSupportedFont("Inter")).toBe(true);
      expect(isSupportedFont("Roboto")).toBe(true);
    });

    it("isSupportedFont should return false for unsupported fonts", () => {
      expect(isSupportedFont("Comic Sans")).toBe(false);
      expect(isSupportedFont("Arial")).toBe(false);
    });
  });

  describe("Template Metadata", () => {
    it("all templates should have required metadata fields", () => {
      for (const template of CAPTION_TEMPLATES) {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.platform).toBeDefined();
        expect(template.style).toBeDefined();
        expect(template.preview).toBeDefined();
        expect(template.createdAt).toBeInstanceOf(Date);
        expect(template.updatedAt).toBeInstanceOf(Date);
      }
    });

    it("all templates should have non-empty descriptions", () => {
      for (const template of CAPTION_TEMPLATES) {
        expect(template.description.length).toBeGreaterThan(0);
      }
    });
  });
});
