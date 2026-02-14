import { generateText as aiGenerateText } from "ai";
import { createGroq } from "@ai-sdk/groq";

// ============================================================
// CHANGE MODEL HERE — one line swap
// ============================================================
const AI_MODEL = process.env.AI_MODEL || "openai/gpt-oss-120b";

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

console.log(`[AI] Groq model: ${AI_MODEL}`);

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
      model: groq(AI_MODEL),
      system: systemPrompt,
      prompt,
      temperature,
      maxTokens,
    });

    if (!result.text) throw new Error("No text generated from AI");

    console.log(`[AI] Generated ${result.usage?.completionTokens ?? "?"} tokens`);
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
