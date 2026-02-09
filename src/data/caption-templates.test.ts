/**
 * Caption Templates Unit Tests
 *
 * Tests for caption style template data and helper functions.
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { describe, expect, it } from "bun:test";
import {
  CAPTION_TEMPLATES,
  RAINBOW_TEMPLATE,
  CLASSIC_TEMPLATE,
  SIMPLE_TEMPLATE,
  HORMOZI_TEMPLATE,
  MRBEAST_PRO_TEMPLATE,
  CLEAN_CREATOR_TEMPLATE,
  GARYVEE_TEMPLATE,
  TIKTOK_NATIVE_TEMPLATE,
  NEON_POP_TEMPLATE,
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

    it("should have 22 templates including new viral templates", () => {
      expect(CAPTION_TEMPLATES.length).toBe(22);
    });
  });

  describe("Rainbow Template", () => {
    it("should have correct ID", () => {
      expect(RAINBOW_TEMPLATE.id).toBe("rainbow");
    });

    it("should have karaoke animation", () => {
      expect(RAINBOW_TEMPLATE.style.animation).toBe("karaoke");
    });

    it("should have highlighting enabled", () => {
      expect(RAINBOW_TEMPLATE.style.highlightEnabled).toBe(true);
    });

    it("should have bold font size", () => {
      expect(RAINBOW_TEMPLATE.style.fontSize).toBeGreaterThanOrEqual(32);
    });
  });

  describe("Classic Template", () => {
    it("should have correct ID", () => {
      expect(CLASSIC_TEMPLATE.id).toBe("classic");
    });

    it("should have bounce animation", () => {
      expect(CLASSIC_TEMPLATE.style.animation).toBe("bounce");
    });
  });

  describe("Simple Template (Minimal style)", () => {
    it("should have correct ID", () => {
      expect(SIMPLE_TEMPLATE.id).toBe("simple");
    });

    it("should have no background", () => {
      expect(SIMPLE_TEMPLATE.style.backgroundOpacity).toBe(0);
    });

    it("should have fade animation for smooth appearance", () => {
      expect(SIMPLE_TEMPLATE.style.animation).toBe("fade");
    });

    it("should have highlighting disabled", () => {
      expect(SIMPLE_TEMPLATE.style.highlightEnabled).toBe(false);
    });

    it("should have larger font size for readability", () => {
      expect(SIMPLE_TEMPLATE.style.fontSize).toBeGreaterThanOrEqual(32);
    });
  });

  describe("New Viral Templates", () => {
    describe("Hormozi Template", () => {
      it("should have correct ID", () => {
        expect(HORMOZI_TEMPLATE.id).toBe("hormozi");
      });

      it("should have Anton font", () => {
        expect(HORMOZI_TEMPLATE.style.fontFamily).toBe("Anton");
      });

      it("should have gold highlight color", () => {
        expect(HORMOZI_TEMPLATE.style.highlightColor).toBe("#FFD700");
      });

      it("should have karaoke animation", () => {
        expect(HORMOZI_TEMPLATE.style.animation).toBe("karaoke");
      });

      it("should be marked as new", () => {
        expect(HORMOZI_TEMPLATE.isNew).toBe(true);
      });
    });

    describe("MrBeast Pro Template", () => {
      it("should have correct ID", () => {
        expect(MRBEAST_PRO_TEMPLATE.id).toBe("mrbeast-pro");
      });

      it("should have Bangers font", () => {
        expect(MRBEAST_PRO_TEMPLATE.style.fontFamily).toBe("Bangers");
      });

      it("should have bright green highlight", () => {
        expect(MRBEAST_PRO_TEMPLATE.style.highlightColor).toBe("#00FF00");
      });

      it("should have bounce animation", () => {
        expect(MRBEAST_PRO_TEMPLATE.style.animation).toBe("bounce");
      });
    });

    describe("Clean Creator Template", () => {
      it("should have correct ID", () => {
        expect(CLEAN_CREATOR_TEMPLATE.id).toBe("clean-creator");
      });

      it("should have Montserrat font", () => {
        expect(CLEAN_CREATOR_TEMPLATE.style.fontFamily).toBe("Montserrat");
      });

      it("should have fade animation", () => {
        expect(CLEAN_CREATOR_TEMPLATE.style.animation).toBe("fade");
      });

      it("should have cyan highlight", () => {
        expect(CLEAN_CREATOR_TEMPLATE.style.highlightColor).toBe("#00D4FF");
      });
    });

    describe("GaryVee Template", () => {
      it("should have correct ID", () => {
        expect(GARYVEE_TEMPLATE.id).toBe("garyvee");
      });

      it("should have Bebas Neue font", () => {
        expect(GARYVEE_TEMPLATE.style.fontFamily).toBe("Bebas Neue");
      });

      it("should have word-by-word animation", () => {
        expect(GARYVEE_TEMPLATE.style.animation).toBe("word-by-word");
      });

      it("should have red highlight", () => {
        expect(GARYVEE_TEMPLATE.style.highlightColor).toBe("#FF0000");
      });
    });

    describe("TikTok Native Template", () => {
      it("should have correct ID", () => {
        expect(TIKTOK_NATIVE_TEMPLATE.id).toBe("tiktok-native");
      });

      it("should have Poppins font", () => {
        expect(TIKTOK_NATIVE_TEMPLATE.style.fontFamily).toBe("Poppins");
      });

      it("should have karaoke animation", () => {
        expect(TIKTOK_NATIVE_TEMPLATE.style.animation).toBe("karaoke");
      });

      it("should have TikTok pink highlight", () => {
        expect(TIKTOK_NATIVE_TEMPLATE.style.highlightColor).toBe("#FE2C55");
      });

      it("should be for TikTok platform", () => {
        expect(TIKTOK_NATIVE_TEMPLATE.platform).toBe("TikTok");
      });
    });

    describe("Neon Pop Template", () => {
      it("should have correct ID", () => {
        expect(NEON_POP_TEMPLATE.id).toBe("neon-pop");
      });

      it("should have Permanent Marker font", () => {
        expect(NEON_POP_TEMPLATE.style.fontFamily).toBe("Permanent Marker");
      });

      it("should have cyan text color", () => {
        expect(NEON_POP_TEMPLATE.style.textColor).toBe("#00FFFF");
      });

      it("should have magenta highlight", () => {
        expect(NEON_POP_TEMPLATE.style.highlightColor).toBe("#FF00FF");
      });
    });
  });

  describe("Template Style Properties", () => {
    const validateTemplateStyle = (template: CaptionTemplate) => {
      const { style } = template;

      // Font properties
      expect(style.fontFamily).toBeDefined();
      expect(typeof style.fontFamily).toBe("string");
      expect(style.fontSize).toBeGreaterThanOrEqual(12);
      expect(style.fontSize).toBeLessThanOrEqual(150);

      // Color properties
      expect(style.textColor).toMatch(/^#[0-9A-Fa-f]{6}$/);

      // Position and alignment
      expect(["top", "center", "bottom"]).toContain(style.position ?? "bottom");
      expect(["left", "center", "right"]).toContain(style.alignment ?? "center");

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

    it("all templates should have valid style properties", () => {
      for (const template of CAPTION_TEMPLATES) {
        validateTemplateStyle(template);
      }
    });
  });

  describe("getTemplateById", () => {
    it("should return Rainbow template for 'rainbow' ID", () => {
      const template = getTemplateById("rainbow");
      expect(template).toBeDefined();
      expect(template?.id).toBe("rainbow");
    });

    it("should return Beast template for 'beast' ID", () => {
      const template = getTemplateById("beast");
      expect(template).toBeDefined();
      expect(template?.id).toBe("beast");
    });

    it("should return Hormozi template for 'hormozi' ID", () => {
      const template = getTemplateById("hormozi");
      expect(template).toBeDefined();
      expect(template?.id).toBe("hormozi");
    });

    it("should return TikTok Native template for 'tiktok-native' ID", () => {
      const template = getTemplateById("tiktok-native");
      expect(template).toBeDefined();
      expect(template?.id).toBe("tiktok-native");
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
      expect(templates.length).toBe(22);
    });

    it("should return templates with unique IDs", () => {
      const templates = getAllTemplates();
      const ids = templates.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(templates.length);
    });
  });

  describe("getTemplatesByPlatform", () => {
    it("should return TikTok Native template for 'TikTok' platform", () => {
      const templates = getTemplatesByPlatform("TikTok");
      expect(templates.some((t) => t.id === "tiktok-native")).toBe(true);
    });

    it("should return YouTube templates for 'YouTube' platform", () => {
      const templates = getTemplatesByPlatform("YouTube");
      expect(templates.some((t) => t.id === "hormozi")).toBe(true);
      expect(templates.some((t) => t.id === "mrbeast-pro")).toBe(true);
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
    it("should have at least 18 supported fonts", () => {
      expect(SUPPORTED_FONTS.length).toBeGreaterThanOrEqual(18);
    });

    it("should include common web fonts", () => {
      expect(SUPPORTED_FONTS).toContain("Inter");
      expect(SUPPORTED_FONTS).toContain("Roboto");
      expect(SUPPORTED_FONTS).toContain("Montserrat");
    });

    it("should include new viral template fonts", () => {
      expect(SUPPORTED_FONTS).toContain("Anton");
      expect(SUPPORTED_FONTS).toContain("Bebas Neue");
      expect(SUPPORTED_FONTS).toContain("Permanent Marker");
    });

    it("isSupportedFont should return true for supported fonts", () => {
      expect(isSupportedFont("Inter")).toBe(true);
      expect(isSupportedFont("Roboto")).toBe(true);
      expect(isSupportedFont("Anton")).toBe(true);
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

    it("new viral templates should be marked as new", () => {
      expect(HORMOZI_TEMPLATE.isNew).toBe(true);
      expect(MRBEAST_PRO_TEMPLATE.isNew).toBe(true);
      expect(CLEAN_CREATOR_TEMPLATE.isNew).toBe(true);
      expect(GARYVEE_TEMPLATE.isNew).toBe(true);
      expect(TIKTOK_NATIVE_TEMPLATE.isNew).toBe(true);
      expect(NEON_POP_TEMPLATE.isNew).toBe(true);
    });
  });
});
