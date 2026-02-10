import axios from "axios";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_BASE_URL = "https://aiplatform.googleapis.com/v1/publishers/google/models";

// Log configuration on startup (without exposing the key)
console.log(`[GEMINI] Gemini configured:`);
console.log(`  - API Key: ${GEMINI_API_KEY ? "***set***" : "NOT SET"}`);

export type GeminiModel = "gemini-2.5-flash-lite" | "gemini-2.5-flash" | "gemini-2.5-pro";

export interface GeminiMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface GeminiGenerateRequest {
  contents: GeminiMessage[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
  };
}

export interface GeminiGenerateResponse {
  candidates: Array<{
    content: {
      role: string;
      parts: Array<{ text: string }>;
    };
    finishReason: string;
    avgLogprobs?: number;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    thoughtsTokenCount?: number;
  };
  modelVersion: string;
}

export class GeminiService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || GEMINI_API_KEY;
    this.baseUrl = GEMINI_BASE_URL;

    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
  }

  /**
   * Generate text using Gemini model
   */
  async generateText(
    prompt: string,
    options: {
      model?: GeminiModel;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    const {
      model = "gemini-2.5-flash",
      systemPrompt,
      temperature = 0.7,
      maxTokens = 8192,
    } = options;

    const messages: GeminiMessage[] = [];

    // Add system prompt as first user message if provided
    if (systemPrompt) {
      messages.push({
        role: "user",
        parts: [{ text: `System Instructions: ${systemPrompt}\n\nNow respond to the following:` }],
      });
    }

    messages.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    const request: GeminiGenerateRequest = {
      contents: messages,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    try {
      const response = await axios.post<GeminiGenerateResponse>(
        `${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`,
        request,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const text = response.data.candidates[0]?.content?.parts[0]?.text;
      if (!text) {
        throw new Error("No text generated from Gemini");
      }

      console.log(`[GEMINI] Generated ${response.data.usageMetadata.candidatesTokenCount} tokens`);
      return text;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[GEMINI] API Error:`, error.response?.data || error.message);
        throw new Error(`Gemini API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate structured JSON output using Gemini
   */
  async generateJSON<T>(
    prompt: string,
    options: {
      model?: GeminiModel;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      schema?: string; // JSON schema description for better results
    } = {}
  ): Promise<T> {
    const {
      model = "gemini-2.5-flash-lite",
      systemPrompt,
      temperature = 0.7,
      maxTokens = 8192,
      schema,
    } = options;

    // Enhance system prompt to request JSON output
    const jsonSystemPrompt = `${systemPrompt || ""}

CRITICAL: You must respond with ONLY valid JSON. No markdown, no code blocks, no explanations.
${schema ? `\nThe JSON must match this schema:\n${schema}` : ""}

Your response must be parseable by JSON.parse(). Start with { and end with }.`;

    const text = await this.generateText(prompt, {
      model,
      systemPrompt: jsonSystemPrompt,
      temperature,
      maxTokens,
    });

    try {
      // Try to extract JSON from markdown code blocks if present
      let jsonText = text.trim();
      
      // Remove markdown code blocks
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      return JSON.parse(jsonText) as T;
    } catch (error) {
      console.error(`[GEMINI] Failed to parse JSON response:`, text.substring(0, 500));
      throw new Error(`Failed to parse Gemini JSON response: ${error}`);
    }
  }

  /**
   * Stream text generation (for future use)
   */
  async streamText(
    prompt: string,
    options: {
      model?: GeminiModel;
      systemPrompt?: string;
      temperature?: number;
      onChunk?: (text: string) => void;
    } = {}
  ): Promise<string> {
    const {
      model = "gemini-2.5-flash-lite",
      systemPrompt,
      temperature = 0.7,
      onChunk,
    } = options;

    const messages: GeminiMessage[] = [];

    if (systemPrompt) {
      messages.push({
        role: "user",
        parts: [{ text: `System Instructions: ${systemPrompt}\n\nNow respond to the following:` }],
      });
    }

    messages.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    const request: GeminiGenerateRequest = {
      contents: messages,
      generationConfig: {
        temperature,
      },
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/${model}:streamGenerateContent?key=${this.apiKey}`,
        request,
        {
          headers: {
            "Content-Type": "application/json",
          },
          responseType: "text",
        }
      );

      // Parse streaming response (array of JSON objects)
      const chunks = response.data
        .split("\n")
        .filter((line: string) => line.trim())
        .map((line: string) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      let fullText = "";
      for (const chunk of chunks) {
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text) {
          fullText += text;
          if (onChunk) {
            onChunk(text);
          }
        }
      }

      return fullText;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[GEMINI] Stream API Error:`, error.response?.data || error.message);
        throw new Error(`Gemini Stream API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }
}

// Export singleton instance
export const geminiService = new GeminiService();
