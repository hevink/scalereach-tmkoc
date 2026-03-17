import { generateText, streamObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { z } from "zod";

const google = createGoogleGenerativeAI({
  apiKey: process.env.VERTEX_AI_API_KEY || "",
});

const MODEL_ID = "gemini-2.5-pro";

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
      maxOutputTokens: Math.min(maxTokens, 300000),
    });

    console.log(`[AI] ${result.usage?.outputTokens ?? "?"} tokens used`);
    return result.text;
  }

  async generateObject<T>(
    prompt: string,
    options: { schema: z.ZodType<T>; systemPrompt?: string; temperature?: number; maxTokens?: number }
  ): Promise<T> {
    const { schema, systemPrompt, temperature = 0.7, maxTokens = 4096 } = options;

    const startTime = Date.now();
    let chunkCount = 0;

    // Heartbeat logger so we know the stream is alive
    const heartbeat = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`[AI] ⏳ Streaming... ${elapsed}s elapsed, ${chunkCount} chunks received`);
    }, 5000);

    try {
      const { partialObjectStream, object, usage } = streamObject({
        model: google(MODEL_ID),
        system: systemPrompt,
        prompt,
        schema,
        temperature,
        maxOutputTokens: Math.min(maxTokens, 300000),
      });

      // Consume the stream to drive it forward + log progress
      for await (const partial of partialObjectStream) {
        chunkCount++;
        // Log first chunk so we know streaming started
        if (chunkCount === 1) {
          console.log(`[AI] ✅ First chunk received after ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
        }
      }

      clearInterval(heartbeat);

      const result = await object;
      const usageInfo = await usage;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[AI] ✅ Stream complete: ${usageInfo?.outputTokens ?? "?"} tokens, ${chunkCount} chunks, ${elapsed}s`);

      return result as T;
    } catch (error) {
      clearInterval(heartbeat);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`[AI] ❌ Stream failed after ${elapsed}s, ${chunkCount} chunks received`);
      throw error;
    }
  }
}

export const aiService = new AIService();
