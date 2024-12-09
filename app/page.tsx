import { TTSForm } from '@/components/tts-form';

export default function Home() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Text to Speech</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Convert your text to natural-sounding speech using ElevenLabs AI
          </p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <TTSForm />
        </div>
      </div>
    </div>
  );
}