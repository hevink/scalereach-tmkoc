import axios from "axios";
import type { z } from "zod";

const API_KEY = process.env.OPENAI_API_KEY || "";
const BASE_URL = process.env.OPENAI_BASE_URL || "https://bedrock-mantle.us-east-1.api.aws/v1";
const AI_MODEL = "openai.gpt-oss-120b";

console.log(`[AI] model: ${AI_MODEL}`);
console.log(`[AI] baseURL: ${BASE_URL}`);
console.log(`[AI] key set: ${!!API_KEY}`);

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResponse {
  choices: Array<{
    message: { role: string; content: string | null };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

async function callLLM(messages: ChatMessage[], maxTokens = 4096, temperature = 0.7): Promise<string> {
  const response = await axios.post<ChatResponse>(
    `${BASE_URL}/chat/completions`,
    { model: AI_MODEL, messages, temperature, max_tokens: maxTokens },
    { headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" } }
  );

  const content = response.data.choices[0]?.message?.content;
  if (!content) throw new Error("No content in AI response");

  console.log(`[AI] ${response.data.usage.completion_tokens} tokens used`);
  return content;
}

export class AIService {
  async generateText(
    prompt: string,
    options: { systemPrompt?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<string> {
    const { systemPrompt, temperature = 0.7, maxTokens = 4096 } = options;
    const messages: ChatMessage[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });
    return callLLM(messages, maxTokens, temperature);
  }

  async generateObject<T>(
    prompt: string,
    options: { schema: z.ZodType<T>; systemPrompt?: string; temperature?: number; maxTokens?: number }
  ): Promise<T> {
    const { schema, systemPrompt, temperature = 0.7, maxTokens = 4096 } = options;

    const jsonSystemPrompt = `${systemPrompt || ""}

CRITICAL: Respond with ONLY valid JSON matching the required schema. No markdown, no code blocks, no explanations. Start with { and end with }.`;

    const text = await this.generateText(prompt, { systemPrompt: jsonSystemPrompt, temperature, maxTokens });
    const parsed = parseJSON<T>(text);
    return schema.parse(parsed);
  }

  /** @deprecated Use generateObject() with a Zod schema instead. */
  async generateJSON<T>(
    prompt: string,
    options: { systemPrompt?: string; temperature?: number; maxTokens?: number; schema?: string } = {}
  ): Promise<T> {
    const { systemPrompt, temperature = 0.7, maxTokens = 4096, schema } = options;

    const jsonSystemPrompt = `${systemPrompt || ""}

CRITICAL: Respond with ONLY valid JSON. No markdown, no code blocks, no explanations.
${schema ? `\nThe JSON must match this schema:\n${schema}` : ""}
Start with { and end with }.`;

    const text = await this.generateText(prompt, { systemPrompt: jsonSystemPrompt, temperature, maxTokens });
    return parseJSON<T>(text);
  }
}

function parseJSON<T>(text: string): T {
  let json = text.trim();
  if (json.startsWith("```json")) json = json.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  else if (json.startsWith("```")) json = json.replace(/^```\s*/, "").replace(/\s*```$/, "");
  const brace = json.indexOf("{");
  if (brace > 0) json = json.slice(brace);
  try {
    return JSON.parse(json) as T;
  } catch (err) {
    console.error("[AI] Failed to parse JSON:", json.substring(0, 500));
    throw new Error(`Failed to parse AI JSON response: ${err}`);
  }
}

export const aiService = new AIService();
