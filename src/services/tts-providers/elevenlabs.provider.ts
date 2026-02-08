import type { TTSProvider, TTSSegmentRequest, TTSVoice } from "../tts.service";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

export class ElevenLabsProvider implements TTSProvider {
  name = "elevenlabs";

  private getApiKey(): string {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) {
      throw new Error("ELEVENLABS_API_KEY environment variable is not set");
    }
    return key;
  }

  async generateSegment(request: TTSSegmentRequest): Promise<Buffer> {
    const apiKey = this.getApiKey();

    const body: any = {
      text: request.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: request.voiceSettings?.stability ?? 0.5,
        similarity_boost: request.voiceSettings?.similarityBoost ?? 0.75,
        style: request.voiceSettings?.style ?? 0,
        use_speaker_boost: request.voiceSettings?.useSpeakerBoost ?? true,
      },
    };

    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${request.voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ElevenLabs TTS failed (${response.status}): ${errorText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async listVoices(language?: string): Promise<TTSVoice[]> {
    const apiKey = this.getApiKey();

    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        "xi-api-key": apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ElevenLabs list voices failed (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as {
      voices: Array<{
        voice_id: string;
        name: string;
        labels?: Record<string, string>;
        preview_url?: string;
      }>;
    };

    let voices: TTSVoice[] = data.voices.map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      labels: v.labels,
      previewUrl: v.preview_url,
      provider: "elevenlabs",
    }));

    // Filter by language label if specified
    if (language) {
      const langLower = language.toLowerCase();
      voices = voices.filter((v) => {
        const accent = v.labels?.accent?.toLowerCase() || "";
        const lang = v.labels?.language?.toLowerCase() || "";
        return accent.includes(langLower) || lang.includes(langLower);
      });
    }

    return voices;
  }
}
