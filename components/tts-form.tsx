'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { motion } from "framer-motion";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Volume2, Upload, Download, RefreshCcw, X, Plus, BadgeInfo } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { type Voice } from '@/types/voice';
import { getVoices, generateSpeech } from '@/lib/elevenlabs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from "@/components/ui/tooltip";

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const formSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  mode: z.enum(['single', 'multiple']),
  text: z.string().optional(),
  voiceId: z.string().optional(),
  model: z.string().default('eleven_multilingual_v2'),
  emphasize: z.boolean().default(false),
  script: z.array(z.object({
    speaker: z.string(),
    text: z.string(),
    voiceId: z.string(),
    stability: z.number().min(0).max(1).default(0.5),
    speed: z.number().min(0.5).max(2).default(1),
    speakerBoost: z.boolean().default(true),
    style: z.number().min(0).max(1).default(0),
  })).optional(),
}).refine((data) => {
  if (data.mode === 'single') {
    return !!data.text && !!data.voiceId;
  }
  return true;
}, {
  message: "Text and voice are required for single mode",
  path: ['text']
}).refine((data) => {
  if (data.mode === 'multiple') {
    return data.script?.every(line => !!line.voiceId);
  }
  return true;
}, {
  message: "Voice selection is required for all speakers",
  path: ['script']
});

const API_KEY_STORAGE_KEY = 'elevenlabs_api_key';

const groupVoicesByCategory = (voices: Voice[]) => {
  return voices.reduce((acc, voice) => {
    const isLegacy = voice.name.toLowerCase().includes('legacy');
    const category = isLegacy ? 'Legacy Voices' : (voice.category || 'Other');
    
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push({
      ...voice,
      labels: {
        ...voice.labels,
        gender: voice.labels?.gender || 'unknown',
        age: voice.labels?.age || 'unknown',
        accent: voice.labels?.accent || 'unknown',
      }
    });
    return acc;
  }, {} as Record<string, Voice[]>);
};

const SpeakerCard = React.forwardRef<
  HTMLDivElement,
  {
    index: number;
    speaker: any;
    voices: Voice[];
    audioUrl?: string;
    isLoading: boolean;
    onRegenerate: () => void;
    onRemove: () => void;
    onVoiceChange: (voiceId: string) => void;
    onDownload: (speaker: string) => void;
    form: any;
    onGenerate: () => void;
    emphasize: boolean;
  }
>(({ index, speaker, voices, audioUrl, isLoading, onRegenerate, onRemove, onVoiceChange, onDownload, form, onGenerate, emphasize }, ref) => {
  const [textareaHeight, setTextareaHeight] = React.useState('200px');
  
  const groupedVoices = React.useMemo(() => 
    voices.reduce((acc, voice) => {
      const category = voice.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(voice);
      return acc;
    }, {} as Record<string, Voice[]>)
  , [voices]);

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
    setTextareaHeight(`${textarea.scrollHeight}px`);
  };

  const processedText = React.useMemo(() => {
    return emphasize ? speaker.text.toUpperCase() : speaker.text;
  }, [speaker.text, emphasize]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
    >
      <Card ref={ref} className="relative border-2 transition-colors duration-200 hover:border-primary/50 h-full">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              <FormField
                control={form.control}
                name={`script.${index}.speaker`}
                render={({ field }) => (
                  <FormItem className="flex-1 max-w-[200px]">
                    <FormControl>
                      <Input 
                        {...field} 
                        className="text-lg font-semibold bg-background/50 backdrop-blur-sm"
                        placeholder="Speaker Name"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Badge 
                variant={speaker.voiceId ? "default" : "destructive"} 
                className={cn(
                  "h-6",
                  speaker.voiceId && "bg-green-500 hover:bg-green-600"
                )}
              >
                {speaker.voiceId ? "Voice Selected" : "No Voice Selected"}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 text-muted-foreground hover:text-destructive transition-colors"
              onClick={onRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name={`script.${index}.text`}
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="text-base">Dialogue</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onGenerate}
                    disabled={isLoading || !speaker.voiceId}
                    className="h-8"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Volume2 className="mr-2 h-4 w-4" />
                        Generate
                      </>
                    )}
                  </Button>
                </div>
                <FormControl>
                  <Textarea
                    {...field}
                    style={{ height: textareaHeight }}
                    onChange={(e) => {
                      field.onChange(e);
                      handleTextareaChange(e);
                    }}
                    placeholder="Enter dialogue for this speaker..."
                    className="min-h-[200px] resize-none transition-all duration-200"
                    value={emphasize ? field.value.toUpperCase() : field.value}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name={`script.${index}.voiceId`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base">Voice Selection</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        onVoiceChange(value);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger 
                          className={cn(
                            "transition-colors duration-200",
                            !field.value && "border-destructive",
                            field.value && "border-green-500"
                          )}
                        >
                          <SelectValue placeholder="Select a voice" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(groupedVoices).map(([category, voices]) => (
                          <SelectGroup key={category}>
                            <SelectLabel className="font-semibold text-primary">
                              {category}
                            </SelectLabel>
                            {voices.map((voice) => {
                              const gender = voice.labels?.gender?.toLowerCase();
                              const age = voice.labels?.age;
                              const accent = voice.labels?.accent;
                              const isLegacy = category === 'Legacy Voices';
                              
                              return (
                                <SelectItem 
                                  key={voice.voice_id} 
                                  value={voice.voice_id}
                                  className="cursor-pointer hover:bg-accent relative pr-12"
                                >
                                  <div className="flex items-center gap-2">
                                    <span>{voice.name}</span>
                                    <div className="flex items-center gap-1">
                                      {gender && (
                                        <Badge 
                                          variant="outline" 
                                          className={cn(
                                            "text-xs px-1 py-0",
                                            gender === "male" && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                                            gender === "female" && "bg-pink-500/10 text-pink-500 border-pink-500/20",
                                            isLegacy && "bg-orange-500/10 text-orange-500 border-orange-500/20"
                                          )}
                                        >
                                          {isLegacy ? "Legacy" : gender}
                                        </Badge>
                                      )}
                                      {(age || accent || voice.description) && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <BadgeInfo className="h-3 w-3 text-muted-foreground" />
                                          </TooltipTrigger>
                                          <TooltipContent className="space-y-1">
                                            {age && <p className="text-sm">Age: {age}</p>}
                                            {accent && <p className="text-sm">Accent: {accent}</p>}
                                            {voice.description && (
                                              <p className="text-sm">Description: {voice.description}</p>
                                            )}
                                            {isLegacy && (
                                              <p className="text-sm text-orange-500">
                                                Legacy voice - May have limited model support
                                              </p>
                                            )}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button 
                                            variant="ghost" 
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              const audio = new Audio(voice.preview_url);
                                              audio.play();
                                            }}
                                          >
                                            <Volume2 className="h-3 w-3" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-sm">Preview voice</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-6">
              <FormField
                control={form.control}
                name={`script.${index}.stability`}
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-base">Stability</FormLabel>
                      <span className="text-sm text-muted-foreground">
                        {field.value.toFixed(1)}
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.1}
                      value={[field.value]}
                      onValueChange={([value]) => field.onChange(value)}
                      className="cursor-pointer"
                    />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`script.${index}.speed`}
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-base">Speed</FormLabel>
                      <span className="text-sm text-muted-foreground">
                        {field.value.toFixed(1)}x
                      </span>
                    </div>
                    <Slider
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={[field.value]}
                      onValueChange={([value]) => field.onChange(value)}
                      className="cursor-pointer"
                    />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {audioUrl && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 pt-4"
            >
              <audio controls className="flex-1 h-12">
                <source src={audioUrl} type="audio/mpeg" />
              </audio>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onRegenerate}
                disabled={isLoading}
                className="transition-transform hover:scale-105"
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => onDownload(speaker.speaker)}
                className="transition-transform hover:scale-105"
              >
                <Download className="h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
});
SpeakerCard.displayName = 'SpeakerCard';

// Add this type for better type safety
type AudioUrls = Record<string, string>;

export function TTSForm() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrls, setAudioUrls] = useState<AudioUrls>({});
  const [speakerVoices, setSpeakerVoices] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const [savedApiKey, setSavedApiKey] = useState<string>('');
  const [currentLoadingSpeaker, setCurrentLoadingSpeaker] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      apiKey: '',
      mode: 'single',
      text: '',
      voiceId: '',
      model: 'eleven_multilingual_v2',
      script: [],
    },
  });

  useEffect(() => {
    const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedApiKey) {
      setSavedApiKey(storedApiKey);
      form.setValue('apiKey', storedApiKey);
      loadVoices(storedApiKey);
    }
  }, []);

  const handleVoiceChange = (speaker: string, voiceId: string) => {
    setSpeakerVoices(prev => ({ ...prev, [speaker]: voiceId }));
    
    const script = form.getValues('script');
    if (!script) return;

    // Clean up audio URLs for the changed speaker
    setAudioUrls(prev => {
      const newUrls = { ...prev };
      Object.keys(newUrls).forEach(key => {
        if (key.startsWith(speaker)) {
          URL.revokeObjectURL(newUrls[key]);
          delete newUrls[key];
        }
      });
      return newUrls;
    });

    const updatedScript = script.map(line => {
      if (line.speaker === speaker) {
        return { ...line, voiceId };
      }
      return line;
    });

    form.setValue('script', updatedScript);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    const script = lines.map(line => {
      const [speaker, ...textParts] = line.split(':');
      const speakerName = speaker.trim();
      return {
        speaker: speakerName,
        text: textParts.join(':').trim(),
        voiceId: speakerVoices[speakerName] || '',
        stability: 0.5,
        speed: 1,
        speakerBoost: true,
        style: 0,
      };
    });

    form.setValue('script', script);
  };

  async function loadVoices(apiKey: string) {
    try {
      const fetchedVoices = await getVoices(apiKey);
      setVoices(fetchedVoices);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load voices. Please check your API key.',
        variant: 'destructive',
      });
    }
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      setIsLoading(true);
      
      if (values.mode === 'single') {
        if (!values.text || !values.voiceId) {
          toast({
            title: 'Error',
            description: 'Please enter text and select a voice for single mode',
            variant: 'destructive',
          });
          return;
        }

        // Clean up previous audio URL
        if (audioUrls.single) {
          URL.revokeObjectURL(audioUrls.single);
        }

        const processedText = values.emphasize ? values.text.toUpperCase() : values.text;
        const audioBuffer = await generateSpeech(
          processedText,
          values.voiceId,
          values.apiKey,
          0.5, // Default stability
          1.0, // Default speed
          values.model,
          true, // Default speakerBoost
          0 // Default style
        );
        
        const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        setAudioUrls(prev => ({ ...prev, single: url }));

        toast({
          title: 'Success',
          description: 'Speech generated successfully',
        });
      } else {
        if (!values.script?.length) {
          toast({
            title: 'Error',
            description: 'Please add speakers first',
            variant: 'destructive',
          });
          return;
        }

        // Clear previous audio URLs
        setAudioUrls({});

        // Use Array.from to convert entries iterator to array
        const scriptEntries = Array.from(values.script.entries());
        
        // Generate audio for each line in order
        for (const [index, line] of scriptEntries) {
          if (!line.voiceId) {
            toast({
              title: 'Error',
              description: `Please select a voice for ${line.speaker}`,
              variant: 'destructive',
            });
            return;
          }

          try {
            setCurrentLoadingSpeaker(line.speaker);
            const audioKey = `${line.speaker}_${index}`;
            await generateAudioForLine(line, index, audioKey);
          } catch (error) {
            console.error(`Error generating audio for ${line.speaker}:`, error);
            toast({
              title: 'Error',
              description: `Failed to generate audio for ${line.speaker}`,
              variant: 'destructive',
            });
            return;
          }
        }

        toast({
          title: 'Success',
          description: 'All audio files generated successfully',
        });
      }
    } catch (error) {
      console.error('Error generating speech:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate speech',
        variant: 'destructive',
      });
    } finally {
      setCurrentLoadingSpeaker(null);
      setIsLoading(false);
    }
  }

  // Add helper function for generating audio
  const generateAudioForLine = async (
    line: {
      text: string;
      voiceId: string;
      speaker: string;
      stability: number;
      speed: number;
      speakerBoost: boolean;
      style: number;
    },
    index: number,
    audioKey: string
  ) => {
    const processedText = form.getValues('emphasize') ? line.text.toUpperCase() : line.text;
    
    const audioBuffer = await generateSpeech(
      processedText,
      line.voiceId,
      form.getValues('apiKey'),
      line.stability,
      line.speed,
      form.getValues('model'),
      line.speakerBoost,
      line.style
    );
    
    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    
    setAudioUrls(prev => ({
      ...prev,
      [audioKey]: url
    }));
  };

  const handleRegenerate = async (line: any, index: number) => {
    try {
      setCurrentLoadingSpeaker(line.speaker);
      const audioKey = `${line.speaker}_${index}`;
      
      // Clean up old audio URL before regenerating
      if (audioUrls[audioKey]) {
        URL.revokeObjectURL(audioUrls[audioKey]);
        setAudioUrls(prev => {
          const newUrls = { ...prev };
          delete newUrls[audioKey];
          return newUrls;
        });
      }
      
      await generateAudioForLine(line, index, audioKey);
      
      toast({
        title: 'Success',
        description: `Regenerated audio for ${line.speaker}`,
      });
    } catch (error) {
      console.error(`Error regenerating audio for ${line.speaker}:`, error);
      toast({
        title: 'Error',
        description: `Failed to regenerate audio for ${line.speaker}`,
        variant: 'destructive',
      });
    } finally {
      setCurrentLoadingSpeaker(null);
    }
  };

  const handleDownloadSingle = async (speakerName: string) => {
    if (!audioUrls[speakerName]) return;
    
    try {
      const response = await fetch(audioUrls[speakerName]);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${speakerName}_audio.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to download audio file',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadAll = async () => {
    try {
      setIsLoading(true);
      const script = form.getValues('script');
      if (!script?.length) return;

      // Create an array of audio elements in script order
      const audioPromises = script.map(async (line, index) => {
        const audioKey = `${line.speaker}_${index}`;
        const audioUrl = audioUrls[audioKey];
        
        if (!audioUrl) {
          console.warn(`No audio found for ${line.speaker} at index ${index}`);
          return null;
        }

        try {
          const response = await fetch(audioUrl);
          if (!response.ok) throw new Error(`Failed to fetch audio for ${line.speaker}`);
          return await response.arrayBuffer();
        } catch (error) {
          console.error(`Error fetching audio for ${line.speaker}:`, error);
          return null;
        }
      });

      // Wait for all audio buffers to be fetched
      const audioBuffers = await Promise.all(audioPromises);
      
      // Filter out null values and concatenate buffers in order
      const validBuffers = audioBuffers.filter(buffer => buffer !== null) as ArrayBuffer[];
      
      if (validBuffers.length === 0) {
        toast({
          title: 'Error',
          description: 'No audio files available to merge. Please generate audio first.',
          variant: 'destructive',
        });
        return;
      }

      // Merge audio buffers in order
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBufferPromises = validBuffers.map(buffer => 
        audioContext.decodeAudioData(buffer.slice(0))
      );
      
      const decodedBuffers = await Promise.all(audioBufferPromises);
      
      // Calculate total duration
      const totalLength = decodedBuffers.reduce((acc, buffer) => acc + buffer.length, 0);
      
      // Create output buffer
      const outputBuffer = audioContext.createBuffer(
        1, // mono
        totalLength,
        decodedBuffers[0].sampleRate
      );
      
      // Copy each buffer to the output
      let offset = 0;
      decodedBuffers.forEach(buffer => {
        outputBuffer.copyToChannel(buffer.getChannelData(0), 0, offset);
        offset += buffer.length;
      });

      // Convert to WAV
      const wavBuffer = audioBufferToWav(outputBuffer);
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'merged-speech.wav';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Success',
        description: 'Audio files merged and downloaded successfully',
      });
    } catch (error) {
      console.error('Error merging audio:', error);
      toast({
        title: 'Error',
        description: 'Failed to merge audio files',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSpeaker = () => {
    const currentScript = form.getValues('script') || [];
    form.setValue('script', [
      ...currentScript,
      {
        speaker: `Speaker ${currentScript.length + 1}`,
        text: '',
        voiceId: '',
        stability: 0.5,
        speed: 1,
        speakerBoost: true,
        style: 0,
      },
    ]);
  };

  const handleRemoveSpeaker = (index: number) => {
    const currentScript = form.getValues('script') || [];
    const removedSpeaker = currentScript[index];
    
    // Clean up audio URLs for the removed speaker
    if (removedSpeaker) {
      setAudioUrls(prev => {
        const newUrls = { ...prev };
        Object.keys(newUrls).forEach(key => {
          if (key.startsWith(removedSpeaker.speaker)) {
            URL.revokeObjectURL(newUrls[key]);
            delete newUrls[key];
          }
        });
        return newUrls;
      });
    }
    
    form.setValue('script', currentScript.filter((_, i) => i !== index));
  };

  const handleGenerateSingle = async (line: any, index: number) => {
    try {
      setCurrentLoadingSpeaker(line.speaker);
      const audioKey = `${line.speaker}_${index}`;
      
      // Clean up old audio URL before generating new one
      if (audioUrls[audioKey]) {
        URL.revokeObjectURL(audioUrls[audioKey]);
        setAudioUrls(prev => {
          const newUrls = { ...prev };
          delete newUrls[audioKey];
          return newUrls;
        });
      }
      
      await generateAudioForLine(line, index, audioKey);
      
      toast({
        title: 'Success',
        description: `Generated audio for ${line.speaker}`,
      });
    } catch (error) {
      console.error(`Error generating audio for ${line.speaker}:`, error);
      toast({
        title: 'Error',
        description: `Failed to generate audio for ${line.speaker}`,
        variant: 'destructive',
      });
    } finally {
      setCurrentLoadingSpeaker(null);
    }
  };

  // Add cleanup function
  useEffect(() => {
    return () => {
      // Cleanup all audio URLs when component unmounts
      Object.values(audioUrls).forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  const groupedVoices = React.useMemo(() => {
    return voices.reduce((acc, voice) => {
      const isLegacy = voice.name.toLowerCase().includes('legacy');
      const category = isLegacy ? 'Legacy Voices' : (voice.category || 'Other');
      
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push({
        ...voice,
        labels: {
          ...voice.labels,
          gender: voice.labels?.gender || 'unknown',
          age: voice.labels?.age || 'unknown',
          accent: voice.labels?.accent || 'unknown',
        }
      });
      return acc;
    }, {} as Record<string, Voice[]>);
  }, [voices]);

  // Add helper function for WAV conversion
  function audioBufferToWav(buffer: AudioBuffer) {
    const numChannels = 1;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const data = buffer.getChannelData(0);
    const dataLength = data.length * bytesPerSample;
    const bufferLength = 44 + dataLength;
    
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Write audio data
    floatTo16BitPCM(view, 44, data);
    
    return arrayBuffer;
  }

  function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  function floatTo16BitPCM(view: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  }

  return (
    <TooltipProvider>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full">
          <div className="flex flex-col space-y-4">
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ElevenLabs API Key</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Enter your API key"
                        className="flex-1"
                        onChange={(e) => {
                          field.onChange(e);
                          loadVoices(e.target.value);
                        }}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const apiKey = form.getValues('apiKey');
                        if (apiKey) {
                          localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
                          setSavedApiKey(apiKey);
                          toast({
                            title: 'Success',
                            description: 'API key saved successfully!',
                          });
                        }
                      }}
                    >
                      Save Key
                    </Button>
                    {savedApiKey && (
                      <Button
                        type="button"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => {
                          localStorage.removeItem(API_KEY_STORAGE_KEY);
                          setSavedApiKey('');
                          form.setValue('apiKey', '');
                          toast({
                            title: 'Success',
                            description: 'API key removed successfully!',
                          });
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <FormDescription>
                    {savedApiKey ? (
                      <span className="text-green-600 dark:text-green-400">
                        ✓ API key is saved
                      </span>
                    ) : (
                      'Enter your ElevenLabs API key to save it for future use'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Tabs defaultValue="single" onValueChange={(value) => form.setValue('mode', value as 'single' | 'multiple')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="single">Single Voice</TabsTrigger>
              <TabsTrigger value="multiple">Multiple Speakers</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-6">
              <div className="grid gap-6">
                <FormField
                  control={form.control}
                  name="voiceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Voice Selection</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger 
                            className={cn(
                              "transition-colors duration-200",
                              !field.value && "border-destructive",
                              field.value && "border-green-500"
                            )}
                          >
                            <SelectValue placeholder="Select a voice" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(groupedVoices).map(([category, categoryVoices]) => (
                            <SelectGroup key={category}>
                              <SelectLabel className="font-semibold text-primary">
                                {category}
                              </SelectLabel>
                              {categoryVoices.map((voice) => {
                                const gender = voice.labels?.gender?.toLowerCase();
                                const age = voice.labels?.age;
                                const accent = voice.labels?.accent;
                                const isLegacy = category === 'Legacy Voices';
                                
                                return (
                                  <SelectItem 
                                    key={voice.voice_id} 
                                    value={voice.voice_id}
                                    className="cursor-pointer hover:bg-accent relative pr-12"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span>{voice.name}</span>
                                      <div className="flex items-center gap-1">
                                        {gender && (
                                          <Badge 
                                            variant="outline" 
                                            className={cn(
                                              "text-xs px-1 py-0",
                                              gender === "male" && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                                              gender === "female" && "bg-pink-500/10 text-pink-500 border-pink-500/20",
                                              isLegacy && "bg-orange-500/10 text-orange-500 border-orange-500/20"
                                            )}
                                          >
                                            {isLegacy ? "Legacy" : gender}
                                          </Badge>
                                        )}
                                        {(age || accent || voice.description) && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <BadgeInfo className="h-3 w-3 text-muted-foreground" />
                                            </TooltipTrigger>
                                            <TooltipContent className="space-y-1">
                                              {age && <p className="text-sm">Age: {age}</p>}
                                              {accent && <p className="text-sm">Accent: {accent}</p>}
                                              {voice.description && (
                                                <p className="text-sm">Description: {voice.description}</p>
                                              )}
                                              {isLegacy && (
                                                <p className="text-sm text-orange-500">
                                                  Legacy voice - May have limited model support
                                                </p>
                                              )}
                                            </TooltipContent>
                                          </Tooltip>
                                        )}
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button 
                                              variant="ghost" 
                                              size="sm"
                                              className="h-6 w-6 p-0"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const audio = new Audio(voice.preview_url);
                                                audio.play();
                                              }}
                                            >
                                              <Volume2 className="h-3 w-3" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p className="text-sm">Preview voice</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="text"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Text</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Enter text to convert to speech..."
                          className="min-h-[200px] resize-none"
                          value={form.watch('emphasize') ? field.value?.toUpperCase() : field.value}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end mt-4">
                <Button 
                  type="submit" 
                  disabled={isLoading || !form.watch('text') || !form.watch('voiceId')}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Volume2 className="mr-2 h-4 w-4" />
                      Generate Speech
                    </>
                  )}
                </Button>
              </div>

              {audioUrls.single && (
                <div className="flex items-center gap-4 mt-4">
                  <audio
                    controls
                    src={audioUrls.single}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = audioUrls.single;
                      link.download = 'generated-speech.mp3';
                      link.click();
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="multiple">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Model</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="eleven_multilingual_v2">
                              Multilingual V2 (Best Quality)
                            </SelectItem>
                            <SelectItem value="eleven_monolingual_v1">
                              Monolingual V1 (Faster)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose between higher quality or faster generation
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="emphasize"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Emphasize All</FormLabel>
                            <FormDescription>
                              Transform all text to uppercase to make voices louder
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".txt"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="script-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('script-upload')?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Script
                  </Button>
                  <Button type="button" variant="outline" onClick={handleAddSpeaker}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Speaker
                  </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {form.watch('script')?.map((line: any, index: number) => (
                    <SpeakerCard
                      key={index}
                      index={index}
                      speaker={line}
                      voices={voices}
                      audioUrl={audioUrls[`${line.speaker}_${index}`]}
                      isLoading={currentLoadingSpeaker === line.speaker}
                      onRegenerate={() => handleRegenerate(line, index)}
                      onRemove={() => handleRemoveSpeaker(index)}
                      onVoiceChange={(voiceId) => handleVoiceChange(line.speaker, voiceId)}
                      onGenerate={() => handleGenerateSingle(line, index)}
                      onDownload={handleDownloadSingle}
                      emphasize={form.watch('emphasize')}
                      form={form}
                    />
                  ))}
                </div>

                {(form.watch('script')?.length ?? 0) > 0 && (
                  <div className="flex justify-end gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDownloadAll}
                      disabled={isLoading || !form.watch('script')?.some(line => audioUrls[line.speaker])}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download All Merged
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {form.watch('mode') === 'multiple' && (
            <div className="flex justify-between mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadAll}
                disabled={isLoading || !form.watch('script')?.length}
              >
                <Download className="mr-2 h-4 w-4" />
                Download All Merged
              </Button>

              <Button 
                type="submit" 
                disabled={isLoading || !form.watch('script')?.length}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating All...
                  </>
                ) : (
                  <>
                    <Volume2 className="mr-2 h-4 w-4" />
                    Generate All
                  </>
                )}
              </Button>
            </div>
          )}
        </form>
      </Form>
    </TooltipProvider>
  );
}