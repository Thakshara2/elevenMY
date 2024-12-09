'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UsageStats {
  character_count: number;
  character_limit: number;
  can_extend_limit: boolean;
  remaining_characters: number;
}

export function UsageStats({ apiKey }: { apiKey: string }) {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUsage = async () => {
      if (!apiKey) return;
      
      setLoading(true);
      try {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/user/subscription`,
          {
            headers: {
              'Accept': 'application/json',
              'xi-api-key': apiKey,
            },
          }
        );

        if (!response.ok) throw new Error('Failed to fetch usage stats');

        const data = await response.json();
        setStats({
          character_count: data.character_count,
          character_limit: data.character_limit,
          can_extend_limit: data.can_extend_limit,
          remaining_characters: data.character_limit - data.character_count,
        });
      } catch (error) {
        console.error('Error fetching usage stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsage();
  }, [apiKey]);

  if (!apiKey) return null;

  const getProgressColor = (percentage: number) => {
    if (percentage > 0.9) return 'bg-destructive';
    if (percentage > 0.7) return 'bg-yellow-500';
    return 'bg-primary';
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-primary/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium">API Usage</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : stats ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Characters Used</span>
                <span className="font-medium">
                  {stats.character_count.toLocaleString()} / {stats.character_limit.toLocaleString()}
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    getProgressColor(stats.character_count / stats.character_limit)
                  )}
                  style={{
                    width: `${(stats.character_count / stats.character_limit) * 100}%`
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Remaining Characters</span>
              <span className={cn(
                "font-medium",
                stats.remaining_characters < stats.character_limit * 0.1 
                  ? "text-destructive"
                  : "text-primary"
              )}>
                {stats.remaining_characters.toLocaleString()}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Unable to fetch usage stats
          </div>
        )}
      </CardContent>
    </Card>
  );
} 