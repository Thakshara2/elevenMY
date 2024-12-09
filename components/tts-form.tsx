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
    const category = voice.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(voice);
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
  const [textareaHeight, setTextareaHeight] = React.useState('100px');
  
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
      <Card ref={ref} className="relative border-2 transition-colors duration-200 hover:border-primary/50">
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
                    className="min-h-[100px] resize-none transition-all duration-200"
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
                                            gender === "female" && "bg-pink-500/10 text-pink-500 border-pink-500/20"
                                          )}
                                        >
                                          {gender}
                                        </Badge>
                                      )}
                                      {(age || accent) && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <BadgeInfo className="h-3 w-3 text-muted-foreground" />
                                          </TooltipTrigger>
                                          <TooltipContent className="space-y-1">
                                            {age && <p className="text-sm">Age: {age}</p>}
                                            {accent && <p className="text-sm">Accent: {accent}</p>}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
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

        const processedText = values.emphasize ? values.text.toUpperCase() : values.text;
        const audioBuffer = await generateSpeech(
          processedText,
          values.voiceId,
          values.apiKey,
          0.5,
          1.0,
          values.model,
          true,
          0
        );
        
        const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        setAudioUrls({ single: url });
      } else {
        if (!values.script?.length) {
          toast({
            title: 'Error',
            description: 'Please upload a script first',
            variant: 'destructive',
          });
          return;
        }

        const newAudioUrls: Record<string, string> = {};
        
        for (const line of values.script) {
          if (!line.voiceId) {
            toast({
              title: 'Error',
              description: `Please select a voice for ${line.speaker}`,
              variant: 'destructive',
            });
            return;
          }

          try {
            const processedText = values.emphasize ? line.text.toUpperCase() : line.text;
            const audioBuffer = await generateSpeech(
              processedText,
              line.voiceId,
              values.apiKey,
              line.stability,
              line.speed,
              values.model
            );
            
            const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
            const url = URL.createObjectURL(blob);
            newAudioUrls[line.speaker] = url;
          } catch (error) {
            toast({
              title: 'Error',
              description: `Failed to generate audio for ${line.speaker}`,
              variant: 'destructive',
            });
            return;
          }
        }
        
        setAudioUrls(newAudioUrls);
      }
      
      toast({
        title: 'Success',
        description: 'Audio generated successfully!',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate audio.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleRegenerate = async (line: any, index: number) => {
    try {
      setCurrentLoadingSpeaker(line.speaker);
      
      // Clear previous audio
      setAudioUrls(prev => {
        const newUrls = { ...prev };
        if (newUrls[line.speaker]) {
          URL.revokeObjectURL(newUrls[line.speaker]);
          delete newUrls[line.speaker];
        }
        return newUrls;
      });

      const text = form.getValues('emphasize') ? line.text.toUpperCase() : line.text;
      
      const audioBuffer = await generateSpeech(
        text,
        line.voiceId,
        form.getValues('apiKey'),
        line.stability,
        line.speed
      );
      
      const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);

      setAudioUrls(prev => ({
        ...prev,
        [line.speaker]: url
      }));

      toast({
        title: 'Success',
        description: `Regenerated audio for ${line.speaker}`,
      });
    } catch (error) {
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
      if (!script?.every(line => audioUrls[line.speaker])) {
        toast({
          title: 'Error',
          description: 'Please generate all audio files first',
          variant: 'destructive',
        });
        return;
      }

      // Download all audio files first
      const audioFiles = await Promise.all(
        script.map(async (line) => {
          const response = await fetch(audioUrls[line.speaker]);
          return await response.blob();
        })
      );

      // Combine all blobs
      const mergedBlob = new Blob(audioFiles, { type: 'audio/mpeg' });
      const url = URL.createObjectURL(mergedBlob);
      
      // Trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = 'merged_audio.mp3';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      URL.revokeObjectURL(url);

      toast({
        title: 'Success',
        description: 'Merged audio download started',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to merge and download audio files',
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
    form.setValue('script', currentScript.filter((_, i) => i !== index));
  };

  const handleGenerateSingle = async (line: any, index: number) => {
    try {
      setCurrentLoadingSpeaker(line.speaker);
      
      // Clear previous audio for this speaker
      setAudioUrls(prev => {
        const newUrls = { ...prev };
        delete newUrls[line.speaker];
        return newUrls;
      });

      const text = form.getValues('emphasize') ? line.text.toUpperCase() : line.text;
      
      const audioBuffer = await generateSpeech(
        text,
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
      
      // Cleanup old URL before setting new one
      if (audioUrls[line.speaker]) {
        URL.revokeObjectURL(audioUrls[line.speaker]);
      }

      setAudioUrls(prev => ({
        ...prev,
        [line.speaker]: url
      }));

      toast({
        title: 'Success',
        description: `Generated audio for ${line.speaker}`,
      });
    } catch (error) {
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

  return (
    <TooltipProvider>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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

            <TabsContent value="single">
              <FormField
                control={form.control}
                name="voiceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Voice</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a voice" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(groupVoicesByCategory(voices)).map(([category, categoryVoices]) => (
                          <SelectGroup key={category}>
                            <SelectLabel>{category}</SelectLabel>
                            {categoryVoices.map((voice) => (
                              <SelectItem key={voice.voice_id} value={voice.voice_id}>
                                {voice.name}
                              </SelectItem>
                            ))}
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
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="eleven_multilingual_v2">Multilingual V2 (Best Quality)</SelectItem>
                        <SelectItem value="eleven_monolingual_v1">Monolingual V1 (Faster)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose between higher quality or faster generation
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Text</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter the text you want to convert to speech"
                        className="h-32"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="emphasize"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Emphasize</FormLabel>
                      <FormDescription>
                        Transform text to uppercase to make the voice louder
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {audioUrls['single'] && (
                <div className="flex items-center gap-4 pt-2">
                  <audio controls className="flex-1">
                    <source src={audioUrls['single']} type="audio/mpeg" />
                  </audio>
                  
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => handleDownloadSingle('single')}
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

                <div className="grid gap-6">
                  {form.watch('script')?.map((line: any, index: number) => (
                    <SpeakerCard
                      key={index}
                      index={index}
                      speaker={line}
                      voices={voices}
                      audioUrl={audioUrls[line.speaker]}
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

            <Button type="submit" disabled={isLoading}>
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
        </form>
      </Form>
    </TooltipProvider>
  );
}