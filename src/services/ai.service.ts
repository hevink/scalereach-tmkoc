import { generateText as aiGenerateText, generateObject as aiGenerateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { z } from "zod";

// ============================================================
// CHANGE MODEL HERE — one line swap
// ============================================================
const AI_MODEL = "claude-sonnet-4-5-20250929";

const ANTHROPIC_BASE_URL = "https://ais.scalereach.ai/v1";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "my-super-secret-password-123";

const anthropic = createAnthropic({
  apiKey: ANTHROPIC_API_KEY,
  baseURL: ANTHROPIC_BASE_URL,
});

console.log(`[AI] Anthropic model: ${AI_MODEL}`);
console.log(`[AI] Anthropic baseURL: ${ANTHROPIC_BASE_URL}`);

export class AIService {
  async generateText(
    prompt: string,
    options: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    const { systemPrompt, temperature = 0.7, maxTokens } = options;

    const result = await aiGenerateText({
      model: anthropic(AI_MODEL),
      system: systemPrompt,
      prompt,
      temperature,
      maxOutputTokens: maxTokens,
    });

    if (!result.text) throw new Error("No text generated from AI");

    console.log(`[AI] Generated ${result.usage?.outputTokens ?? "?"} tokens`);
    return result.text;
  }

  /**
   * Generate structured JSON using Vercel AI SDK's generateObject with Zod schema validation.
   * Falls back to generateText + JSON parsing if tool calling is unsupported by the proxy.
   */
  async generateObject<T>(
    prompt: string,
    options: {
      schema: z.ZodType<T>;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<T> {
    const { schema, systemPrompt, temperature = 0.7, maxTokens } = options;

    try {
      const result = await aiGenerateObject({
        model: anthropic(AI_MODEL),
        schema,
        system: systemPrompt,
        prompt,
        temperature,
        maxOutputTokens: maxTokens,
      });

      console.log(`[AI] generateObject: ${result.usage?.outputTokens ?? "?"} tokens`);
      return result.object as T;
    } catch (err: any) {
      // Proxy doesn't support tool calling — fall back to text + JSON parse
      if (err?.name === "AI_JSONParseError" || err?.name === "AI_NoObjectGeneratedError" || err?.message?.includes("could not parse")) {
        console.warn(`[AI] generateObject failed (proxy may not support tool calling), falling back to text mode`);

        const jsonSystemPrompt = `${systemPrompt || ""}

CRITICAL: You must respond with ONLY valid JSON that matches the required schema. No markdown, no code blocks, no explanations, no headers. Start directly with { and end with }.`;

        const text = await this.generateText(prompt, {
          systemPrompt: jsonSystemPrompt,
          temperature,
          maxTokens,
        });

        let jsonText = text.trim();
        // Strip markdown code blocks if present
        if (jsonText.startsWith("```json")) {
          jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (jsonText.startsWith("```")) {
          jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }
        // Find first { to strip any leading text
        const firstBrace = jsonText.indexOf("{");
        if (firstBrace > 0) jsonText = jsonText.slice(firstBrace);

        const parsed = JSON.parse(jsonText) as T;
        return schema.parse(parsed);
      }
      throw err;
    }
  }

  /**
   * @deprecated Use generateObject() with a Zod schema instead for reliable structured output.
   */
  async generateJSON<T>(
    prompt: string,
    options: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      schema?: string;
    } = {}
  ): Promise<T> {
    const { systemPrompt, temperature = 0.7, maxTokens, schema } = options;

    const jsonSystemPrompt = `${systemPrompt || ""}

CRITICAL: You must respond with ONLY valid JSON. No markdown, no code blocks, no explanations.
${schema ? `\nThe JSON must match this schema:\n${schema}` : ""}

Your response must be parseable by JSON.parse(). Start with { and end with }.`;

    const text = await this.generateText(prompt, {
      systemPrompt: jsonSystemPrompt,
      temperature,
      maxTokens,
    });

    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    try {
      return JSON.parse(jsonText) as T;
    } catch (error) {
      console.error(`[AI] Failed to parse JSON:`, text.substring(0, 500));
      throw new Error(`Failed to parse AI JSON response: ${error}`);
    }
  }
}

export const aiService = new AIService();
