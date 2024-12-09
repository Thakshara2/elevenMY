import { type Voice } from '@/types/voice';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

export async function getVoices(apiKey: string): Promise<Voice[]> {
  const response = await fetch('https://api.elevenlabs.io/v1/voices?show_legacy=true', {
    headers: {
      'Accept': 'application/json',
      'xi-api-key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch voices');
  }

  const data = await response.json();
  return data.voices;
}

export async function generateSpeech(
  text: string,
  voiceId: string,
  apiKey: string,
  stability: number,
  speed: number,
  modelId: string = 'eleven_multilingual_v2',
  speakerBoost: boolean = true,
  style: number = 0,
) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability,
          similarity_boost: 0.75,
          style,
          use_speaker_boost: speakerBoost,
          speed,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to generate speech');
  }

  return response.arrayBuffer();
}