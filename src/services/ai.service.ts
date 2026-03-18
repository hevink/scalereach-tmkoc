import { generateText, streamObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { z } from "zod";

const google = createGoogleGenerativeAI({
  apiKey: process.env.VERTEX_AI_API_KEY || "",
});

const PRIMARY_MODEL = "gemini-2.5-pro";
const FALLBACK_MODEL = "gemini-2.5-flash";

console.log(`[AI] provider: google (vertex-ai)`);
console.log(`[AI] primary model: ${PRIMARY_MODEL}`);
console.log(`[AI] fallback model: ${FALLBACK_MODEL}`);
console.log(`[AI] key set: ${!!process.env.VERTEX_AI_API_KEY}`);

export class AIService {
  async generateText(
    prompt: string,
    options: { systemPrompt?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<string> {
    const { systemPrompt, temperature = 0.7, maxTokens = 4096 } = options;

    try {
      const result = await generateText({
        model: google(PRIMARY_MODEL),
        system: systemPrompt,
        prompt,
        temperature,
        maxOutputTokens: Math.min(maxTokens, 300000),
      });

      console.log(`[AI] ${result.usage?.outputTokens ?? "?"} tokens used (${PRIMARY_MODEL})`);
      return result.text;
    } catch (error) {
      console.warn(`[AI] ⚠️ ${PRIMARY_MODEL} failed, falling back to ${FALLBACK_MODEL}:`, (error as Error).message);

      const result = await generateText({
        model: google(FALLBACK_MODEL),
        system: systemPrompt,
        prompt,
        temperature,
        maxOutputTokens: Math.min(maxTokens, 300000),
      });

      console.log(`[AI] ${result.usage?.outputTokens ?? "?"} tokens used (${FALLBACK_MODEL} fallback)`);
      return result.text;
    }
  }

  async generateObject<T>(
    prompt: string,
    options: { schema: z.ZodType<T>; systemPrompt?: string; temperature?: number; maxTokens?: number }
  ): Promise<T> {
    const { schema, systemPrompt, temperature = 0.7, maxTokens = 4096 } = options;

    try {
      return await this._streamObject<T>(PRIMARY_MODEL, prompt, { schema, systemPrompt, temperature, maxTokens });
    } catch (error) {
      console.warn(`[AI] ⚠️ ${PRIMARY_MODEL} failed, falling back to ${FALLBACK_MODEL}:`, (error as Error).message);
      return await this._streamObject<T>(FALLBACK_MODEL, prompt, { schema, systemPrompt, temperature, maxTokens });
    }
  }

  private async _streamObject<T>(
    modelId: string,
    prompt: string,
    options: { schema: z.ZodType<T>; systemPrompt?: string; temperature?: number; maxTokens?: number }
  ): Promise<T> {
    const { schema, systemPrompt, temperature = 0.7, maxTokens = 4096 } = options;

    // 3 min timeout for first chunk, 5 min total — if Pro hangs, we bail to Flash
    const FIRST_CHUNK_TIMEOUT = 180_000;
    const TOTAL_TIMEOUT = 300_000;

    const startTime = Date.now();
    let chunkCount = 0;
    let lastChunkTime = startTime;

    const heartbeat = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const sinceLast = ((Date.now() - lastChunkTime) / 1000).toFixed(0);
      console.log(`[AI] ⏳ Streaming (${modelId})... ${elapsed}s elapsed, ${chunkCount} chunks, ${sinceLast}s since last chunk`);
    }, 5000);

    try {
      const { partialObjectStream, object, usage } = streamObject({
        model: google(modelId),
        system: systemPrompt,
        prompt,
        schema,
        temperature,
        maxOutputTokens: Math.min(maxTokens, 300000),
      });

      // Wrap the stream consumption with a timeout
      const streamPromise = (async () => {
        for await (const _partial of partialObjectStream) {
          chunkCount++;
          lastChunkTime = Date.now();
          if (chunkCount === 1) {
            console.log(`[AI] ✅ First chunk received after ${((Date.now() - startTime) / 1000).toFixed(1)}s (${modelId})`);
          }
        }
      })();

      // Race: stream vs first-chunk timeout (if no chunks yet) or total timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        const checkInterval = setInterval(() => {
          const now = Date.now();
          const elapsed = now - startTime;
          const sinceLastChunk = now - lastChunkTime;

          if (chunkCount === 0 && elapsed > FIRST_CHUNK_TIMEOUT) {
            clearInterval(checkInterval);
            reject(new Error(`Timeout: no chunks received after ${(elapsed / 1000).toFixed(0)}s`));
          } else if (elapsed > TOTAL_TIMEOUT) {
            clearInterval(checkInterval);
            reject(new Error(`Timeout: total ${(elapsed / 1000).toFixed(0)}s exceeded (${chunkCount} chunks received)`));
          } else if (chunkCount > 0 && sinceLastChunk > 60_000) {
            // Stall detection: no new chunks for 60s after streaming started
            clearInterval(checkInterval);
            reject(new Error(`Stall: no chunks for ${(sinceLastChunk / 1000).toFixed(0)}s after ${chunkCount} chunks`));
          }
        }, 2000);

        // Clean up interval when stream finishes normally
        streamPromise.then(() => clearInterval(checkInterval)).catch(() => clearInterval(checkInterval));
      });

      await Promise.race([streamPromise, timeoutPromise]);

      clearInterval(heartbeat);

      const result = await object;
      const usageInfo = await usage;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[AI] ✅ Stream complete (${modelId}): ${usageInfo?.outputTokens ?? "?"} tokens, ${chunkCount} chunks, ${elapsed}s`);

      return result as T;
    } catch (error) {
      clearInterval(heartbeat);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`[AI] ❌ Stream failed (${modelId}) after ${elapsed}s, ${chunkCount} chunks received`);
      throw error;
    }
  }
}

export const aiService = new AIService();
