import axios from "axios";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

// Log configuration on startup (without exposing the key)
console.log(`[GROQ] Groq configured:`);
console.log(`  - API Key: ${GROQ_API_KEY ? "***set***" : "NOT SET"}`);

export type GroqModel =
  | "openai/gpt-oss-20b"       // Fast, cheap — replaces gemini-2.5-flash-lite
  | "llama-3.3-70b-versatile"  // Balanced — replaces gemini-2.5-flash
  | "openai/gpt-oss-120b";     // Most capable — replaces gemini-2.5-pro

// Maximum output tokens for each model
const MODEL_MAX_TOKENS: Record<GroqModel, number> = {
  "openai/gpt-oss-20b": 65536,
  "llama-3.3-70b-versatile": 32768,
  "openai/gpt-oss-120b": 65536,
};

// Context window sizes
const MODEL_CONTEXT_WINDOW: Record<GroqModel, number> = {
  "openai/gpt-oss-20b": 131072,
  "llama-3.3-70b-versatile": 131072,
  "openai/gpt-oss-120b": 131072,
};

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqChatResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GroqService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || GROQ_API_KEY;
    this.baseUrl = GROQ_BASE_URL;

    if (!this.apiKey) {
      throw new Error("GROQ_API_KEY is not set");
    }
  }

  /**
   * Generate text using Groq model
   */
  async generateText(
    prompt: string,
    options: {
      model?: GroqModel;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    const {
      model = "llama-3.3-70b-versatile",
      systemPrompt,
      temperature = 0.7,
      maxTokens,
    } = options;

    const outputTokens = maxTokens || MODEL_MAX_TOKENS[model];

    const messages: ChatMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    messages.push({ role: "user", content: prompt });

    try {
      const response = await axios.post<GroqChatResponse>(
        `${this.baseUrl}/chat/completions`,
        {
          model,
          messages,
          temperature,
          max_tokens: outputTokens,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const text = response.data.choices[0]?.message?.content;
      if (!text) {
        throw new Error("No text generated from Groq");
      }

      console.log(
        `[GROQ] Generated ${response.data.usage.completion_tokens} tokens (max: ${outputTokens})`
      );
      return text;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[GROQ] API Error:`, error.response?.data || error.message);
        throw new Error(
          `Groq API error: ${error.response?.data?.error?.message || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Generate structured JSON output using Groq
   */
  async generateJSON<T>(
    prompt: string,
    options: {
      model?: GroqModel;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      schema?: string;
    } = {}
  ): Promise<T> {
    const {
      model = "openai/gpt-oss-20b",
      systemPrompt,
      temperature = 0.7,
      maxTokens,
      schema,
    } = options;

    const outputTokens = maxTokens || MODEL_MAX_TOKENS[model];

    const jsonSystemPrompt = `${systemPrompt || ""}

CRITICAL: You must respond with ONLY valid JSON. No markdown, no code blocks, no explanations.
${schema ? `\nThe JSON must match this schema:\n${schema}` : ""}

Your response must be parseable by JSON.parse(). Start with { and end with }.`;

    const text = await this.generateText(prompt, {
      model,
      systemPrompt: jsonSystemPrompt,
      temperature,
      maxTokens: outputTokens,
    });

    try {
      let jsonText = text.trim();

      // Remove markdown code blocks if present
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      return JSON.parse(jsonText) as T;
    } catch (error) {
      console.error(`[GROQ] Failed to parse JSON response:`, text.substring(0, 500));
      throw new Error(`Failed to parse Groq JSON response: ${error}`);
    }
  }

  /**
   * Stream text generation
   */
  async streamText(
    prompt: string,
    options: {
      model?: GroqModel;
      systemPrompt?: string;
      temperature?: number;
      onChunk?: (text: string) => void;
    } = {}
  ): Promise<string> {
    const {
      model = "openai/gpt-oss-20b",
      systemPrompt,
      temperature = 0.7,
      onChunk,
    } = options;

    const messages: ChatMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    messages.push({ role: "user", content: prompt });

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model,
          messages,
          temperature,
          stream: true,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          responseType: "text",
        }
      );

      let fullText = "";
      const lines = response.data.split("\n").filter((line: string) => line.startsWith("data: "));

      for (const line of lines) {
        const data = line.replace("data: ", "").trim();
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || "";
          if (content) {
            fullText += content;
            if (onChunk) onChunk(content);
          }
        } catch {
          // skip unparseable chunks
        }
      }

      return fullText;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[GROQ] Stream API Error:`, error.response?.data || error.message);
        throw new Error(
          `Groq Stream API error: ${error.response?.data?.error?.message || error.message}`
        );
      }
      throw error;
    }
  }
}

// Export singleton instance
export const groqService = new GroqService();

/**
 * Get model information
 */
export function getModelInfo(model: GroqModel) {
  return {
    model,
    maxOutputTokens: MODEL_MAX_TOKENS[model],
    contextWindow: MODEL_CONTEXT_WINDOW[model],
  };
}

/**
 * Get all available models with their specs
 */
export function getAllModels() {
  return Object.keys(MODEL_MAX_TOKENS).map((model) =>
    getModelInfo(model as GroqModel)
  );
}
