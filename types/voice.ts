export interface Voice {
  voice_id: string;
  name: string;
  preview_url: string;
  category: string;
  labels?: {
    gender?: string;
    accent?: string;
    age?: string;
    [key: string]: string | undefined;
  };
  description?: string;
}