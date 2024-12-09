import { TTSForm } from '@/components/tts-form';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-64 border-r bg-card p-6 flex flex-col">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Text to Speech</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Convert text to natural speech
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="px-3 py-2">
              <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
                Features
              </h2>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground px-4 py-1">• Multiple Voices</p>
                <p className="text-sm text-muted-foreground px-4 py-1">• Text Emphasis</p>
                <p className="text-sm text-muted-foreground px-4 py-1">• Voice Settings</p>
                <p className="text-sm text-muted-foreground px-4 py-1">• Batch Processing</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="h-full p-8">
            <div className="mx-auto max-w-5xl">
              <div className="rounded-lg border bg-card p-8 shadow-sm">
                <TTSForm />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}