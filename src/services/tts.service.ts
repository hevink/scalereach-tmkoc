/**
 * TTS Provider Interface
 * Abstraction layer for text-to-speech providers (ElevenLabs, Azure, Google, etc.)
 */

export interface TTSVoice {
  voiceId: string;
  name: string;
  language?: string;
  labels?: Record<string, string>;
  previewUrl?: string;
  provider: string;
}

export interface TTSSegmentRequest {
  text: string;
  voiceId: string;
  voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
  };
  language?: string;
}

export interface TTSProvider {
  name: string;
  generateSegment(request: TTSSegmentRequest): Promise<Buffer>;
  listVoices(language?: string): Promise<TTSVoice[]>;
}

import { ElevenLabsProvider } from "./tts-providers/elevenlabs.provider";

export class TTSService {
  private static providers: Record<string, TTSProvider> = {};

  private static getProvider(providerName: string): TTSProvider {
    if (!this.providers[providerName]) {
      switch (providerName) {
        case "elevenlabs":
          this.providers[providerName] = new ElevenLabsProvider();
          break;
        default:
          throw new Error(`Unsupported TTS provider: ${providerName}`);
      }
    }
    return this.providers[providerName];
  }

  /**
   * Generate TTS audio for a single text segment
   */
  static async generateSegment(
    providerName: string,
    request: TTSSegmentRequest
  ): Promise<Buffer> {
    console.log(
      `[TTS SERVICE] Generating segment with ${providerName}, text length: ${request.text.length}`
    );

    const provider = this.getProvider(providerName);
    return provider.generateSegment(request);
  }

  /**
   * List available voices for a provider
   */
  static async listVoices(
    providerName: string,
    language?: string
  ): Promise<TTSVoice[]> {
    console.log(
      `[TTS SERVICE] Listing voices for ${providerName}, language: ${language || "all"}`
    );

    const provider = this.getProvider(providerName);
    return provider.listVoices(language);
  }
}
