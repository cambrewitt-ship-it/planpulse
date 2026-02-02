'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';
import { CheckCircle2, Circle, ListTodo, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ActionPoint {
  id: string;
  text: string;
  completed: boolean;
  category: 'SET UP' | 'ONGOING';
  channel_type: string;
  reset_frequency?: string | null;
}

interface TodoSectionProps {
  mediaPlanBuilderChannels: MediaPlanChannel[];
}

// Helper function to get channel display name (same logic as MediaChannels)
const getChannelDisplayName = (channelName: string, detail: string) => {
  const lowerName = channelName.toLowerCase();
  if (lowerName.includes('facebook') && lowerName.includes('instagram')) {
    return 'Meta Ads';
  }
  if (lowerName.includes('facebook') || lowerName.includes('meta')) {
    return 'Meta Ads';
  }
  if (lowerName.includes('google')) {
    return 'Google Ads';
  }
  if (lowerName.includes('linkedin')) {
    return 'LinkedIn Ads';
  }
  if (lowerName.includes('tiktok')) {
    return 'TikTok Ads';
  }
  return channelName;
};

export default function TodoSection({ mediaPlanBuilderChannels }: TodoSectionProps) {
  const [actionPoints, setActionPoints] = useState<Record<string, ActionPoint[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>({});

  // Fetch action points for each channel
  useEffect(() => {
    if (!mediaPlanBuilderChannels || mediaPlanBuilderChannels.length === 0) {
      return;
    }

    const fetchActionPointsForChannels = async () => {
      const channelTypes = new Set<string>();
      
      // Get unique channel types from media plan builder channels
      mediaPlanBuilderChannels.forEach((channel) => {
        if (channel.channelName) {
          const channelType = getChannelDisplayName(channel.channelName, channel.format || '');
          channelTypes.add(channelType);
        }
      });

      // Fetch action points for each channel type
      for (const channelType of channelTypes) {
        setLoading(prev => ({ ...prev, [channelType]: true }));
        try {
          const response = await fetch(`/api/action-points?channel_type=${encodeURIComponent(channelType)}`);
          if (response.ok) {
            const { data } = await response.json();
            setActionPoints(prev => ({ ...prev, [channelType]: data || [] }));
          }
        } catch (error) {
          console.error(`Error fetching action points for ${channelType}:`, error);
        } finally {
          setLoading(prev => ({ ...prev, [channelType]: false }));
        }
      }
    };

    fetchActionPointsForChannels();
  }, [mediaPlanBuilderChannels]);

  // Handle toggle action point completion
  const handleToggleActionPoint = async (actionPointId: string, channelType: string, completed: boolean) => {
    try {
      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: actionPointId,
          completed: !completed,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update action point');
      }

      // Update local state
      setActionPoints(prev => ({
        ...prev,
        [channelType]: prev[channelType]?.map(ap =>
          ap.id === actionPointId ? { ...ap, completed: !completed } : ap
        ) || [],
      }));
    } catch (error) {
      console.error('Error updating action point:', error);
    }
  };

  // Group channels by channel type
  const channelsByType = mediaPlanBuilderChannels.reduce((acc, channel) => {
    if (!channel.channelName) return acc;
    
    const channelType = getChannelDisplayName(channel.channelName, channel.format || '');
    if (!acc[channelType]) {
      acc[channelType] = [];
    }
    acc[channelType].push(channel);
    return acc;
  }, {} as Record<string, MediaPlanChannel[]>);

  // If no channels, show empty state
  if (!mediaPlanBuilderChannels || mediaPlanBuilderChannels.length === 0) {
    return null;
  }

  return (
    <section className="mt-8" aria-label="To do section">
      <Card className="bg-white shadow-md">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <ListTodo className="w-6 h-6 text-[#0f172a]" />
            <h2 className="text-2xl font-bold text-[#0f172a]">To Do</h2>
          </div>

          <div className="space-y-6">
            {Object.entries(channelsByType).map(([channelType, channels]) => {
              const channelActionPoints = actionPoints[channelType] || [];
              const isLoading = loading[channelType];

              const isExpanded = expandedChannels[channelType] ?? false;
              const hasActionPoints = channelActionPoints.length > 0;
              const completedCount = channelActionPoints.filter(ap => ap.completed).length;
              const totalCount = channelActionPoints.length;

              return (
                <div key={channelType} className="border-l-4 border-primary pl-4">
                  <button
                    onClick={() => setExpandedChannels(prev => ({ ...prev, [channelType]: !prev[channelType] }))}
                    className="flex items-center gap-2 w-full text-left mb-3 hover:opacity-80 transition-opacity"
                    disabled={isLoading || !hasActionPoints}
                  >
                    {hasActionPoints && !isLoading ? (
                      isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[#64748b]" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[#64748b]" />
                      )
                    ) : null}
                    <div className="flex items-center justify-between flex-1">
                      <h3 className="text-lg font-semibold text-[#0f172a]">
                        {channelType}
                      </h3>
                      {hasActionPoints && !isLoading && (
                        <span className="text-sm font-medium text-[#64748b] ml-4">
                          {completedCount}/{totalCount} Completed
                        </span>
                      )}
                    </div>
                  </button>
                  
                  {isLoading ? (
                    <p className="text-sm text-[#64748b]">Loading action points...</p>
                  ) : !hasActionPoints ? (
                    <p className="text-sm text-[#64748b]">No action points for this channel.</p>
                  ) : isExpanded ? (
                    <ul className="space-y-2">
                      {channelActionPoints.map((actionPoint) => (
                        <li
                          key={actionPoint.id}
                          className="flex items-start gap-3 p-2 rounded-md hover:bg-gray-50 transition-colors"
                        >
                          <button
                            onClick={() => handleToggleActionPoint(actionPoint.id, channelType, actionPoint.completed)}
                            className="mt-0.5 flex-shrink-0"
                            aria-label={actionPoint.completed ? 'Mark as incomplete' : 'Mark as complete'}
                          >
                            {actionPoint.completed ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : (
                              <Circle className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                          <span
                            className={`flex-1 text-sm ${
                              actionPoint.completed
                                ? 'text-gray-500 line-through'
                                : 'text-[#0f172a]'
                            }`}
                          >
                            {actionPoint.text}
                          </span>
                          {actionPoint.category && (
                            <span
                              className={`text-xs px-2 py-1 rounded-full ${
                                actionPoint.category === 'SET UP'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-purple-100 text-purple-700'
                              }`}
                            >
                              {actionPoint.category}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>

          {Object.keys(channelsByType).length === 0 && (
            <p className="text-sm text-[#64748b] text-center py-8">
              No media channels found in the media plan.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
