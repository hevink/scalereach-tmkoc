import { generateText, generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { z } from "zod";

const google = createGoogleGenerativeAI({
  apiKey: process.env.VERTEX_AI_API_KEY || "",
  fetch: ((url: any, init: any) => {
    return fetch(url, { ...init, signal: AbortSignal.timeout(5 * 60 * 1000) });
  }) as any,
});

const MODEL_ID = "gemini-2.5-flash";

console.log(`[AI] provider: google (vertex-ai)`);
console.log(`[AI] model: ${MODEL_ID}`);
console.log(`[AI] key set: ${!!process.env.VERTEX_AI_API_KEY}`);

export class AIService {
  async generateText(
    prompt: string,
    options: { systemPrompt?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<string> {
    const { systemPrompt, temperature = 0.7, maxTokens = 4096 } = options;

    const result = await generateText({
      model: google(MODEL_ID),
      system: systemPrompt,
      prompt,
      temperature,
      maxOutputTokens: Math.min(maxTokens, 90000),
    });

    console.log(`[AI] ${result.usage?.outputTokens ?? "?"} tokens used`);
    return result.text;
  }

  async generateObject<T>(
    prompt: string,
    options: { schema: z.ZodType<T>; systemPrompt?: string; temperature?: number; maxTokens?: number }
  ): Promise<T> {
    const { schema, systemPrompt, temperature = 0.7, maxTokens = 4096 } = options;

        const result = await generateObject({
          model: google(MODEL_ID),
          system: systemPrompt,
          prompt,
          schema,
          temperature,
          maxOutputTokens: Math.min(maxTokens, 90000),
        });

        console.log(`[AI] ${result.usage?.outputTokens ?? "?"} tokens used`);
        return result.object;
  }
}

export const aiService = new AIService();
