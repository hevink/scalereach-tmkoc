/**
 * Caption Template Controller Unit Tests
 *
 * Tests for caption template API endpoints.
 * Validates: Requirement 11.7
 */

import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import captionTemplateRouter from "../routes/caption-template.routes";
import {
  CAPTION_TEMPLATES,
  SUPPORTED_FONTS,
} from "../data/caption-templates";

// Create a test app with the caption template routes
const app = new Hono();
app.route("/api/caption-templates", captionTemplateRouter);

describe("Caption Template Controller", () => {
  describe("GET /api/caption-templates", () => {
    it("should return all templates", async () => {
      const res = await app.request("/api/caption-templates");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.templates).toBeDefined();
      expect(json.data.templates.length).toBe(CAPTION_TEMPLATES.length);
      expect(json.data.total).toBe(CAPTION_TEMPLATES.length);
    });

    it("should return templates with correct structure", async () => {
      const res = await app.request("/api/caption-templates");
      const json = await res.json();

      const template = json.data.templates[0];
      expect(template.id).toBeDefined();
      expect(template.name).toBeDefined();
      expect(template.description).toBeDefined();
      expect(template.platform).toBeDefined();
      expect(template.style).toBeDefined();
      expect(template.preview).toBeDefined();
    });

    it("should filter templates by TikTok platform", async () => {
      const res = await app.request("/api/caption-templates?platform=TikTok");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);

      const expectedIds = CAPTION_TEMPLATES.filter(
        (template) =>
          template.platform === "Universal" || template.platform === "TikTok"
      ).map((template) => template.id);

      expect(json.data.templates.length).toBe(expectedIds.length);
      expect(
        json.data.templates.some(
          (t: { id: string }) => t.id === "tiktok-native"
        )
      ).toBe(true);
      expect(
        json.data.templates.every((t: { id: string }) =>
          expectedIds.includes(t.id)
        )
      ).toBe(true);
    });

    it("should filter templates by YouTube platform", async () => {
      const res = await app.request(
        "/api/caption-templates?platform=YouTube"
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);

      const expectedIds = CAPTION_TEMPLATES.filter(
        (template) =>
          template.platform === "Universal" || template.platform === "YouTube"
      ).map((template) => template.id);

      expect(json.data.templates.length).toBe(expectedIds.length);
      expect(
        json.data.templates.some(
          (t: { id: string }) => t.id === "hormozi"
        )
      ).toBe(true);
      expect(
        json.data.templates.every((t: { id: string }) =>
          expectedIds.includes(t.id)
        )
      ).toBe(true);
    });
  });

  describe("GET /api/caption-templates/:id", () => {
    it("should return Classic template by ID", async () => {
      const res = await app.request("/api/caption-templates/classic");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("classic");
      expect(json.data.name).toBe("Classic");
      expect(json.data.style.fontFamily).toBe("Poppins");
    });

    it("should return Hormozi template by ID", async () => {
      const res = await app.request("/api/caption-templates/hormozi");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("hormozi");
      expect(json.data.name).toBe("Hormozi");
      expect(json.data.platform).toBe("YouTube");
    });

    it("should return TikTok Native template by ID", async () => {
      const res = await app.request(
        "/api/caption-templates/tiktok-native"
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("tiktok-native");
      expect(json.data.name).toBe("TikTok Native");
      expect(json.data.platform).toBe("TikTok");
    });

    it("should return 404 for non-existent template", async () => {
      const res = await app.request("/api/caption-templates/non-existent");
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("NOT_FOUND");
      expect(json.error.message).toContain("non-existent");
    });
  });

  describe("GET /api/caption-templates/fonts", () => {
    it("should return list of supported fonts", async () => {
      const res = await app.request("/api/caption-templates/fonts");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.fonts)).toBe(true);
      expect(json.data.fonts).toEqual([...SUPPORTED_FONTS]);
      expect(json.data.total).toBe(SUPPORTED_FONTS.length);
    });

    it("should include common web fonts", async () => {
      const res = await app.request("/api/caption-templates/fonts");
      const json = await res.json();

      expect(json.data.fonts).toContain("Inter");
      expect(json.data.fonts).toContain("Roboto");
      expect(json.data.fonts).toContain("Montserrat");
    });
  });

  describe("Template Style Validation", () => {
    it("all templates should have valid style configurations", async () => {
      const res = await app.request("/api/caption-templates");
      const json = await res.json();

      for (const template of json.data.templates) {
        const { style } = template;

        // Font properties
        expect(style.fontFamily).toBeDefined();
        expect(style.fontSize).toBeGreaterThanOrEqual(12);
        expect(style.fontSize).toBeLessThanOrEqual(72);

        // Color properties
        expect(style.textColor).toMatch(/^#[0-9A-Fa-f]{6}$/);

        // Position and alignment
        if (style.position) {
          expect(["top", "center", "bottom"]).toContain(style.position);
        } else {
          expect(style.x).toBeGreaterThanOrEqual(0);
          expect(style.x).toBeLessThanOrEqual(100);
          expect(style.y).toBeGreaterThanOrEqual(0);
          expect(style.y).toBeLessThanOrEqual(100);
        }
        expect(["left", "center", "right"]).toContain(style.alignment);

        // Animation
        expect([
          "none",
          "word-by-word",
          "karaoke",
          "bounce",
          "fade",
        ]).toContain(style.animation);

        // Opacity
        expect(style.backgroundOpacity).toBeGreaterThanOrEqual(0);
        expect(style.backgroundOpacity).toBeLessThanOrEqual(100);
      }
    });
  });
});
