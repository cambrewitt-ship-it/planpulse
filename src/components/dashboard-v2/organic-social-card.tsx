'use client';

import { useState, useEffect, useMemo } from 'react';
import { Instagram, Facebook, Linkedin, RefreshCw, Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';
import type { OrganicSocialActual } from '@/types/database';
import { format, startOfMonth, endOfMonth, parseISO, eachWeekOfInterval } from 'date-fns';
import Nango from '@nangohq/frontend';
import InlineActionPoints from './inline-action-points';
import { getChannelLogo } from '@/lib/utils/channel-icons';

interface OrganicSocialCardProps {
  channel: MediaPlanChannel;
  clientId: string;
  weekCommencing: string; // Current week in 'yyyy-MM-dd' format
  actuals: OrganicSocialActual[];
  onRefresh?: () => void; // Callback to reload actuals after fetching
}

function getChannelIcon(channelName: string) {
  // Return the colored logo component
  return getChannelLogo(channelName, "w-5 h-5");
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
  const postsPerWeek = channel.postsPerWeek || 0;
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  
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
  const [manualStampCount, setManualStampCount] = useState<number>(
    currentWeekActual?.manual_stamp_count ?? 0
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasPageConnection, setHasPageConnection] = useState<boolean | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isStamping, setIsStamping] = useState(false);

  // Update local state when actuals change
  useEffect(() => {
    const actual = actuals.find(
      a => a.week_commencing === weekCommencing && a.channel_name === channel.channelName
    );
    setPostsPublished(actual?.posts_published ?? null);
    setPostsAutomatic(actual?.posts_automatic ?? null);
    setManualStampCount(actual?.manual_stamp_count ?? 0);
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

  // Generic helper to stamp for a specific week (used by week + month views)
  const stampWeek = async (targetWeekCommencing: string, delta: number = 1, syncCurrentWeekState: boolean = false) => {
    setIsStamping(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/organic-social-actuals/stamp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_name: channel.channelName,
          week_commencing: targetWeekCommencing,
          delta,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to stamp post' }));
        throw new Error(errorData.error || 'Failed to stamp post');
      }

      const data = await response.json();
      if (data?.data && syncCurrentWeekState && targetWeekCommencing === weekCommencing) {
        const nextCount = data.data.manual_stamp_count ?? 0;
        setManualStampCount(nextCount);
        // Keep posts_published in sync with stamps for this week
        setPostsPublished(nextCount);
      }

      if (onRefresh) {
        onRefresh();
      }
    } catch (error: any) {
      console.error('Error stamping post:', error);
      alert(error.message || 'Failed to stamp post');
    } finally {
      setIsStamping(false);
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

  // Convenience wrapper for the current week (used in "This week" view)
  const handleStampCurrentWeek = (delta: number = 1) => {
    return stampWeek(weekCommencing, delta, true);
  };

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

  const channelLower = channel.channelName.toLowerCase();
  const isMetaPlatform = channelLower.includes('facebook') || channelLower.includes('instagram');
  const showConnectButton = isMetaPlatform && hasPageConnection === false;
  
  // Aggregate month view for this channel
  const monthViewWeeks = useMemo(() => {
    try {
      const wcDate = parseISO(weekCommencing);
      const monthStart = startOfMonth(wcDate);
      const monthEnd = endOfMonth(wcDate);
      const startKey = format(monthStart, 'yyyy-MM-dd');
      const endKey = format(monthEnd, 'yyyy-MM-dd');

      return actuals
        .filter(a => a.channel_name === channel.channelName && a.week_commencing >= startKey && a.week_commencing <= endKey)
        .sort((a, b) => a.week_commencing.localeCompare(b.week_commencing));
    } catch {
      return [];
    }
  }, [actuals, channel.channelName, weekCommencing]);

  /**
   * Adjust the total number of stamped posts for the month.
   * For now, we apply the change to the current week, which keeps the API
   * usage simple while making the month view clickable.
   */
  const adjustMonthStamps = (delta: number) => {
    return handleStampCurrentWeek(delta);
  };

  const status = getStatusBadge(manualStampCount, postsPerWeek);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200 relative">
      {/* Header + layout */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Left: channel header + stamps/month view */}
          <div className="flex-1">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-pink-100 text-pink-600">
                {getChannelIcon(channel.channelName)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">
                    {channel.channelName}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color} ${status.text}`}
                  >
                    {status.label}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Target: {postsPerWeek} posts/week
                </p>
              </div>
            </div>

            {/* View toggle */}
            <div className="mt-3 inline-flex rounded-full bg-gray-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`px-3 py-1 rounded-full font-medium ${
                  viewMode === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                This week
              </button>
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`px-3 py-1 rounded-full font-medium ${
                  viewMode === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                This month
              </button>
            </div>

            {viewMode === 'week' ? (
              <div className="mt-3 space-y-2">
                <label className="text-xs text-gray-600 font-medium flex items-center justify-between">
                  <span>This Week</span>
                  <span className="text-[11px] text-gray-500">
                    {manualStampCount} / {postsPerWeek} stamped
                  </span>
                </label>

                {/* Stamp boxes for current week */}
                <div className="flex flex-wrap gap-2">
                  {Array.from({
                    length: Math.max(postsPerWeek || 0, manualStampCount || 0, 1),
                  }).map((_, idx) => {
                    const filled = idx < manualStampCount;
                    const nextCount = idx + 1;
                    const handleClick = () => {
                      const delta = nextCount - manualStampCount;
                      if (delta !== 0) {
                        handleStampCurrentWeek(delta);
                      }
                    };
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={handleClick}
                        disabled={isStamping}
                        className={`w-7 h-7 rounded-md border text-xs flex items-center justify-center transition-colors ${
                          filled
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-gray-300 text-gray-400 hover:border-blue-400'
                        }`}
                        aria-label={filled ? `Unstamp post ${nextCount}` : `Stamp post ${nextCount}`}
                      >
                        {filled ? nextCount : ''}
                      </button>
                    );
                  })}
                </div>

                <p className="text-[11px] text-gray-500">
                  Auto-detected posts this week: {postsAutomatic ?? 0}
                </p>

                <p className="text-[11px] text-gray-400">
                  Click boxes to mark posts as published. Platform auto-scanning will be added later.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-600 font-medium mb-1">
                  Monthly stamps for {format(parseISO(weekCommencing), 'MMMM yyyy')}
                </p>
                {monthViewWeeks.length === 0 ? (
                  <p className="text-xs text-gray-400">No posts logged for this month yet.</p>
                ) : (
                  (() => {
                    const totalStamped = monthViewWeeks.reduce(
                      (sum, w) => sum + (w.manual_stamp_count ?? 0),
                      0
                    );
                    // Calculate how many weeks are in this calendar month,
                    // rather than how many weeks currently have data.
                    const wcDate = parseISO(weekCommencing);
                    const monthStart = startOfMonth(wcDate);
                    const monthEnd = endOfMonth(wcDate);
                    const calendarWeeks = eachWeekOfInterval(
                      { start: monthStart, end: monthEnd },
                      { weekStartsOn: 1 } // Monday, matching week_commencing
                    );
                    const weeksInMonth = calendarWeeks.length || 1;
                    const monthTargetRaw = (postsPerWeek || 0) * weeksInMonth;
                    const monthTarget = monthTargetRaw > 0 ? monthTargetRaw : 1;
                    const boxCount = Math.max(monthTarget, totalStamped || 0, 1);

                    const handleMonthClick = (index: number) => {
                      const desiredTotal = index + 1;
                      const delta = desiredTotal - totalStamped;
                      if (delta === 0) return;
                      adjustMonthStamps(delta);
                    };

                    const totalAuto = monthViewWeeks.reduce(
                      (sum, w) => sum + (w.posts_automatic ?? 0),
                      0
                    );

                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-gray-600">
                            {totalStamped} / {monthTarget} stamped this month
                          </span>
                          <span className="text-[11px] text-gray-500">
                            Auto-detected: {totalAuto}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: boxCount }).map((_, idx) => {
                            const filled = idx < totalStamped;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleMonthClick(idx)}
                                disabled={isStamping}
                                className={`w-7 h-7 rounded-md border text-xs flex items-center justify-center transition-colors ${
                                  filled
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-white border-gray-300 text-gray-400 hover:border-blue-400'
                                }`}
                                aria-label={
                                  filled
                                    ? `Unstamp monthly post ${idx + 1}`
                                    : `Stamp monthly post ${idx + 1}`
                                }
                              >
                                {filled ? idx + 1 : ''}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            )}
          </div>

          {/* Right: action points (side column) + refresh/connect */}
          <div className="w-full md:w-64 md:border-l md:border-gray-100 md:pl-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Action points</span>
              <div className="flex items-center gap-2">
                {showConnectButton && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleConnectPage}
                    disabled={isConnecting || isSaving}
                    className="h-7 text-[11px] px-2"
                  >
                    <Link2 className={`h-3 w-3 mr-1 ${isConnecting ? 'animate-spin' : ''}`} />
                    {isConnecting ? 'Connecting…' : 'Connect'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={isRefreshing || isSaving || isConnecting}
                  className="h-7 text-[11px] px-2"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing…' : 'Refresh'}
                </Button>
              </div>
            </div>
            <InlineActionPoints
              channelType={channel.channelName}
              clientId={clientId}
              maxVisible={4}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
