import { generateText as aiGenerateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

// ============================================================
// CHANGE MODEL HERE — one line swap
// ============================================================
const AI_MODEL = "claude-sonnet-4-5-20250929";

const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://ais.scalereach.ai/";
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
