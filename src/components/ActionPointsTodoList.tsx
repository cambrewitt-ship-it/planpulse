'use client';

import { useEffect, useState } from 'react';
import { getClients, getMediaPlans, getClientMediaPlanBuilder } from '@/lib/db/plans';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckSquare, Building2, Radio, Facebook, Search, Linkedin, Music, Instagram, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ActionPoint {
  id: string;
  text: string;
  completed: boolean;
  category: 'SET UP' | 'ONGOING';
  channel_type: string;
}

interface ClientTodoItem {
  clientId: string;
  clientName: string;
  channelType: string;
  actionPoints: ActionPoint[];
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

// Helper function to get channel icon (same logic as MediaChannels)
const getChannelIcon = (channelType: string) => {
  const lowerName = channelType.toLowerCase();
  if (lowerName.includes('facebook') || lowerName.includes('meta')) {
    return <Facebook className="w-4 h-4 text-blue-600" />;
  }
  if (lowerName.includes('instagram')) {
    return <Instagram className="w-4 h-4 text-pink-600" />;
  }
  if (lowerName.includes('google')) {
    return <Search className="w-4 h-4 text-red-600" />;
  }
  if (lowerName.includes('linkedin')) {
    return <Linkedin className="w-4 h-4 text-blue-700" />;
  }
  if (lowerName.includes('tiktok')) {
    return <Music className="w-4 h-4 text-black" />;
  }
  return <Radio className="w-4 h-4 text-gray-500" />;
};

export default function ActionPointsTodoList() {
  const [todoItems, setTodoItems] = useState<ClientTodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadTodoItems();
  }, []);

  const loadTodoItems = async () => {
    try {
      setLoading(true);
      
      // Get all clients
      const clients = await getClients();
      if (!clients || clients.length === 0) {
        setTodoItems([]);
        return;
      }

      const allTodoItems: ClientTodoItem[] = [];

      // For each client, get their active plans and channels
      for (const client of clients) {
        const channelTypes = new Set<string>();
        
        // Check for active plan channels
        const plans = await getMediaPlans(client.id);
        const activePlan = plans?.find((p: any) => p.status?.toLowerCase() === 'active');
        
        if (activePlan && activePlan.channels && activePlan.channels.length > 0) {
          activePlan.channels.forEach((channel: any) => {
            const channelType = getChannelDisplayName(channel.channel, channel.detail || '');
            channelTypes.add(channelType);
          });
        }
        
        // Also check for media plan builder channels
        try {
          const mediaPlanBuilderData = await getClientMediaPlanBuilder(client.id);
          if (mediaPlanBuilderData && mediaPlanBuilderData.channels && mediaPlanBuilderData.channels.length > 0) {
            mediaPlanBuilderData.channels.forEach((channel: any) => {
              if (channel.channelName) {
                const channelType = getChannelDisplayName(channel.channelName, channel.format || '');
                channelTypes.add(channelType);
              }
            });
          }
        } catch (error) {
          console.error(`Error loading media plan builder for client ${client.id}:`, error);
        }
        
        // Skip if no channels found
        if (channelTypes.size === 0) {
          continue;
        }

        // Fetch unchecked action points for each channel type
        for (const channelType of channelTypes) {
          try {
            const response = await fetch(`/api/action-points?channel_type=${encodeURIComponent(channelType)}`);
            if (!response.ok) continue;
            
            const { data } = await response.json();
            if (!data || !Array.isArray(data)) continue;

            // Filter to only unchecked action points
            const uncheckedActionPoints = data.filter((ap: ActionPoint) => !ap.completed);
            
            if (uncheckedActionPoints.length > 0) {
              allTodoItems.push({
                clientId: client.id,
                clientName: client.name,
                channelType,
                actionPoints: uncheckedActionPoints,
              });
            }
          } catch (error) {
            console.error(`Error fetching action points for ${channelType}:`, error);
          }
        }
      }

      setTodoItems(allTodoItems);
    } catch (error) {
      console.error('Error loading todo items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActionPoint = async (actionPointId: string, channelType: string, completed: boolean) => {
    const newCompleted = !completed;
    
    // Optimistically update local state
    setTodoItems((prevItems) => {
      return prevItems.map((item) => {
        if (item.channelType === channelType) {
          return {
            ...item,
            actionPoints: item.actionPoints
              .map((ap) =>
                ap.id === actionPointId ? { ...ap, completed: newCompleted } : ap
              )
              .filter((ap) => !ap.completed), // Remove if now completed
          };
        }
        return item;
      }).filter((item) => item.actionPoints.length > 0); // Remove items with no unchecked action points
    });

    try {
      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: actionPointId,
          completed: newCompleted,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update action point');
      }

      // Reload todo items to ensure consistency
      loadTodoItems();
    } catch (error) {
      console.error('Error updating action point:', error);
      // Reload on error to revert optimistic update
      loadTodoItems();
    }
  };

  const handleDeleteActionPoint = async (actionPointId: string) => {
    if (!confirm('Are you sure you want to delete this action point? This will remove it from all channels.')) return;

    // Optimistically remove from local state
    setTodoItems((prevItems) =>
      prevItems
        .map((item) => ({
          ...item,
          actionPoints: item.actionPoints.filter((ap) => ap.id !== actionPointId),
        }))
        .filter((item) => item.actionPoints.length > 0)
    );

    try {
      const response = await fetch(`/api/action-points?id=${actionPointId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        loadTodoItems();
      }
    } catch (error) {
      console.error('Error deleting action point:', error);
      loadTodoItems();
    }
  };

  const handleClientClick = (clientId: string) => {
    router.push(`/clients/${clientId}/dashboard`);
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            To Do List
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-sm text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (todoItems.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            To Do List
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-sm text-gray-500">
            No unchecked action points found
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group by client
  const groupedByClient = todoItems.reduce((acc, item) => {
    if (!acc[item.clientId]) {
      acc[item.clientId] = {
        clientId: item.clientId,
        clientName: item.clientName,
        channels: [],
      };
    }
    acc[item.clientId].channels.push({
      channelType: item.channelType,
      actionPoints: item.actionPoints,
    });
    return acc;
  }, {} as Record<string, { clientId: string; clientName: string; channels: Array<{ channelType: string; actionPoints: ActionPoint[] }> }>);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <CheckSquare className="h-5 w-5" />
          To Do List
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="h-full overflow-y-auto px-6 pb-6">
          <div className="space-y-6">
            {Object.values(groupedByClient).map((clientGroup) => (
              <div key={clientGroup.clientId} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-gray-600" />
                  <h3 className="font-semibold text-sm text-gray-900">
                    <button
                      onClick={() => handleClientClick(clientGroup.clientId)}
                      className="hover:underline"
                    >
                      {clientGroup.clientName}
                    </button>
                  </h3>
                </div>
                
                {clientGroup.channels.map((channel, idx) => (
                  <div key={`${clientGroup.clientId}-${channel.channelType}-${idx}`} className="ml-6 space-y-2">
                    <div className="flex items-center gap-2">
                      <Radio className="h-3 w-3 text-gray-500" />
                      <span className="text-xs font-medium text-gray-700">{channel.channelType}</span>
                    </div>
                    
                    <div className="ml-5 space-y-1.5">
                      {channel.actionPoints.map((actionPoint) => (
                        <div
                          key={actionPoint.id}
                          className="group flex items-start gap-2 p-2 rounded hover:bg-gray-50 transition-colors"
                        >
                          <Checkbox
                            checked={actionPoint.completed}
                            onCheckedChange={() =>
                              handleToggleActionPoint(actionPoint.id, actionPoint.channel_type, actionPoint.completed)
                            }
                            className="mt-0.5"
                          />
                          <div className="flex-shrink-0 mt-0.5">
                            {getChannelIcon(channel.channelType)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-900">{actionPoint.text}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge
                                variant={actionPoint.category === 'SET UP' ? 'secondary' : 'default'}
                                className="text-xs"
                              >
                                {actionPoint.category}
                              </Badge>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteActionPoint(actionPoint.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 flex-shrink-0 mt-0.5"
                            aria-label="Delete action point"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

