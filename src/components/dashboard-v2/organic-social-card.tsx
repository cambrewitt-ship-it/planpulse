'use client';

import { useState, useEffect } from 'react';
import { Instagram, Facebook, Linkedin, RefreshCw, Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';
import type { OrganicSocialActual } from '@/types/database';
import { format, startOfWeek, addDays } from 'date-fns';
import Nango from '@nangohq/frontend';
import InlineActionPoints from './inline-action-points';

interface OrganicSocialCardProps {
  channel: MediaPlanChannel;
  clientId: string;
  weekCommencing: string; // Current week in 'yyyy-MM-dd' format
  actuals: OrganicSocialActual[];
  onRefresh?: () => void; // Callback to reload actuals after fetching
}

function getChannelIcon(channelName: string) {
  const lower = channelName.toLowerCase();
  if (lower.includes('instagram')) return Instagram;
  if (lower.includes('facebook')) return Facebook;
  if (lower.includes('linkedin')) return Linkedin;
  return Instagram; // Default
}

function getStatusBadge(postsPublished: number | null, postsPerWeek: number) {
  if (postsPublished === null || postsPublished === undefined) {
    return { color: 'bg-gray-100', text: 'text-gray-700', label: '⚪ Not logged', emoji: '⚪' };
  }
  if (postsPublished >= postsPerWeek) {
    return { color: 'bg-emerald-100', text: 'text-emerald-700', label: '🟢 On Track', emoji: '🟢' };
  }
  if (postsPublished === postsPerWeek - 1) {
    return { color: 'bg-amber-100', text: 'text-amber-700', label: '🟡 Behind', emoji: '🟡' };
  }
  return { color: 'bg-red-100', text: 'text-red-700', label: '🔴 Off Track', emoji: '🔴' };
}

export default function OrganicSocialCard({ channel, clientId, weekCommencing, actuals, onRefresh }: OrganicSocialCardProps) {
  const Icon = getChannelIcon(channel.channelName);
  const postsPerWeek = channel.postsPerWeek || 0;
  
  // Find actual for current week
  const currentWeekActual = actuals.find(
    a => a.week_commencing === weekCommencing && a.channel_name === channel.channelName
  );
  
  const [postsPublished, setPostsPublished] = useState<number | null>(
    currentWeekActual?.posts_published ?? null
  );
  const [postsAutomatic, setPostsAutomatic] = useState<number | null>(
    currentWeekActual?.posts_automatic ?? null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasPageConnection, setHasPageConnection] = useState<boolean | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Update local state when actuals change
  useEffect(() => {
    const actual = actuals.find(
      a => a.week_commencing === weekCommencing && a.channel_name === channel.channelName
    );
    setPostsPublished(actual?.posts_published ?? null);
    setPostsAutomatic(actual?.posts_automatic ?? null);
  }, [actuals, weekCommencing, channel.channelName]);

  const handleBlur = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/organic-social-actuals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_name: channel.channelName,
          week_commencing: weekCommencing,
          posts_published: postsPublished ?? 0,
          posts_automatic: postsAutomatic ?? 0,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save');
      }
    } catch (error) {
      console.error('Error saving organic social actuals:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Check if Facebook page is connected (only for Meta platforms)
  useEffect(() => {
    const channelLower = channel.channelName.toLowerCase();
    if (!channelLower.includes('facebook') && !channelLower.includes('instagram')) {
      setHasPageConnection(null); // Not applicable
      return;
    }

    // Don't check immediately - wait for user to try refresh first
    // The check will happen when refresh is attempted
    setHasPageConnection(null);
  }, [channel.channelName]);

  const handleConnectPage = async () => {
    setIsConnecting(true);
    try {
      const nango = new Nango();

      // Open Connect UI for Facebook (which includes pages)
      const connect = nango.openConnectUI({
        onEvent: async (event) => {
          if (event.type === 'close') {
            console.log('User closed the modal');
            setIsConnecting(false);
          } else if (event.type === 'error') {
            console.error('Nango connection error:', event);
            setIsConnecting(false);
            const errorMessage = (event as any).error?.message || (event as any).error || 'An error occurred during connection';
            alert(`Connection error: ${errorMessage}`);
          } else if (event.type === 'connect') {
            console.log('Facebook Page connection successful!');
            
            // Sync the connection to our database
            try {
              const syncResponse = await fetch('/api/integrations/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: 'facebook', clientId }),
              });

              if (!syncResponse.ok) {
                const syncData = await syncResponse.json();
                console.error('Failed to sync connection:', syncData);
                alert(`Connection succeeded but failed to save: ${syncData.error}`);
              } else {
                console.log('Connection synced successfully');
                setHasPageConnection(true);
              }
            } catch (syncError) {
              console.error('Sync error:', syncError);
              alert('Connection succeeded but failed to save. Please refresh the page.');
            }

            setIsConnecting(false);
          }
        },
      });

      // Get session token
      const response = await fetch('/api/nango/session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'facebook', clientId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get session token');
      }

      const data = await response.json();
      connect.setSessionToken(data.sessionToken);
    } catch (error: any) {
      console.error('Connection error:', error);
      setIsConnecting(false);
      alert(`Failed to connect: ${error.message || 'Unknown error'}`);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Calculate date range for the current week
      const weekStart = new Date(weekCommencing);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6); // End of week (Sunday)
      
      const startDate = weekStart.toISOString().split('T')[0];
      const endDate = weekEnd.toISOString().split('T')[0];

      const response = await fetch(`/api/clients/${clientId}/organic-social-actuals/fetch-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_name: channel.channelName,
          start_date: startDate,
          end_date: endDate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch posts' }));
        
        // If no page connection, update state to show connect button
        if (response.status === 404) {
          setHasPageConnection(false);
          
          // Provide more helpful error message
          let errorMessage = errorData.error || 'Failed to fetch posts';
          
          // If it's a permissions issue, suggest reconnecting
          if (errorData.hasPagePermissions === false) {
            errorMessage += '\n\nPlease disconnect and reconnect using the "Connect Page" button to grant the required permissions.';
          } else if (errorData.grantedPermissions) {
            errorMessage += `\n\nCurrent permissions: ${errorData.grantedPermissions.join(', ')}`;
          }
          
          throw new Error(errorMessage);
        }
        
        throw new Error(errorData.error || 'Failed to fetch posts');
      }

      const data = await response.json();
      
      // Update local state with fetched data
      if (data.data) {
        setPostsPublished(data.data.posts_published);
        setPostsAutomatic(data.data.posts_automatic);
        setHasPageConnection(true); // Success means page is connected
      }

      // Trigger parent to reload actuals
      if (onRefresh) {
        onRefresh();
      }
    } catch (error: any) {
      console.error('Error fetching posts:', error);
      alert(error.message || 'Failed to fetch posts from social media platform');
    } finally {
      setIsRefreshing(false);
    }
  };

  const status = getStatusBadge(postsPublished, postsPerWeek);

  const channelLower = channel.channelName.toLowerCase();
  const isMetaPlatform = channelLower.includes('facebook') || channelLower.includes('instagram');
  const showConnectButton = isMetaPlatform && hasPageConnection === false;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200 relative">
      {/* Action Buttons */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {showConnectButton && (
          <Button
            size="sm"
            variant="default"
            onClick={handleConnectPage}
            disabled={isConnecting || isSaving}
            className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
          >
            <Link2 className={`h-3 w-3 mr-1 ${isConnecting ? 'animate-spin' : ''}`} />
            {isConnecting ? 'Connecting...' : 'Connect Page'}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing || isSaving || isConnecting}
          className="h-7 text-xs"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-pink-100 text-pink-600">
            <Icon className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0 pr-20">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{channel.channelName}</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color} ${status.text}`}>
                {status.label}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Target: {postsPerWeek} posts/week</p>
          </div>
        </div>

        {/* This week input */}
        <div className="mt-3 space-y-2">
          <div className="space-y-1">
            <label className="text-xs text-gray-600 font-medium">This Week</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="1"
                value={postsPublished ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
                  setPostsPublished(isNaN(value as number) ? null : value);
                }}
                onBlur={handleBlur}
                placeholder="0"
                className="flex-1 h-8 text-sm"
                disabled={isSaving}
              />
              <span className="text-xs text-gray-500">posts</span>
            </div>
          </div>
          
          <div className="space-y-1">
            <label className="text-xs text-gray-600 font-medium">Automatic Posts</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="1"
                value={postsAutomatic ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? null : parseInt(e.target.value, 10);
                  setPostsAutomatic(isNaN(value as number) ? null : value);
                }}
                onBlur={handleBlur}
                placeholder="0"
                className="flex-1 h-8 text-sm"
                disabled={isSaving}
              />
              <span className="text-xs text-gray-500">posts</span>
            </div>
          </div>
          
          {isSaving && (
            <p className="text-xs text-gray-400">Saving...</p>
          )}
        </div>
      </div>

      {/* Action Points */}
      <InlineActionPoints
        channelType={channel.channelName}
        clientId={clientId}
        maxVisible={3}
      />
    </div>
  );
}
