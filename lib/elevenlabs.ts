import { type Voice } from '@/types/voice';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

export async function getVoices(apiKey: string): Promise<Voice[]> {
  const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
    headers: {
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
  stability?: number,
  speed?: number,
  model: string = 'eleven_multilingual_v2'
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
        model_id: model,
        voice_settings: {
          stability: stability || 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
          speed: speed || 1,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to generate speech');
  }

  return await response.arrayBuffer();
}