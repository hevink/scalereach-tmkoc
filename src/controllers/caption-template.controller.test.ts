/**
 * Caption Template Controller Unit Tests
 *
 * Tests for caption template API endpoints.
 * Validates: Requirement 11.7
 */

import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import captionTemplateRouter from "../routes/caption-template.routes";

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
      expect(json.data.templates.length).toBe(5);
      expect(json.data.total).toBe(5);
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

    it("should filter templates by platform", async () => {
      const res = await app.request("/api/caption-templates?platform=TikTok");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      // Should include TikTok template and Universal templates
      expect(json.data.templates.length).toBeGreaterThanOrEqual(1);
      expect(
        json.data.templates.some(
          (t: { id: string }) => t.id === "tiktok"
        )
      ).toBe(true);
    });

    it("should filter templates by Instagram Reels platform", async () => {
      const res = await app.request(
        "/api/caption-templates?platform=Instagram%20Reels"
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(
        json.data.templates.some(
          (t: { id: string }) => t.id === "reels"
        )
      ).toBe(true);
    });

    it("should filter templates by YouTube Shorts platform", async () => {
      const res = await app.request(
        "/api/caption-templates?platform=YouTube%20Shorts"
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(
        json.data.templates.some(
          (t: { id: string }) => t.id === "shorts"
        )
      ).toBe(true);
    });
  });

  describe("GET /api/caption-templates/:id", () => {
    it("should return TikTok template by ID", async () => {
      const res = await app.request("/api/caption-templates/tiktok");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("tiktok");
      expect(json.data.name).toBe("TikTok");
      expect(json.data.style).toBeDefined();
    });

    it("should return Reels template by ID", async () => {
      const res = await app.request("/api/caption-templates/reels");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("reels");
      expect(json.data.name).toBe("Reels");
    });

    it("should return Shorts template by ID", async () => {
      const res = await app.request("/api/caption-templates/shorts");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("shorts");
      expect(json.data.name).toBe("Shorts");
    });

    it("should return Minimal template by ID", async () => {
      const res = await app.request("/api/caption-templates/minimal");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("minimal");
      expect(json.data.name).toBe("Minimal");
    });

    it("should return Bold template by ID", async () => {
      const res = await app.request("/api/caption-templates/bold");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("bold");
      expect(json.data.name).toBe("Bold");
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
      expect(json.data.fonts).toBeDefined();
      expect(Array.isArray(json.data.fonts)).toBe(true);
      expect(json.data.fonts.length).toBeGreaterThanOrEqual(5);
      expect(json.data.total).toBe(json.data.fonts.length);
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
        expect(["top", "center", "bottom"]).toContain(style.position);
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
