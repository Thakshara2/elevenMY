export interface Voice {
  voice_id: string;
  name: string;
  preview_url: string;
  category: string;
  labels?: Record<string, string>;
  description?: string;
}