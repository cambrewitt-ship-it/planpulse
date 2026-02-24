// src/app/agency/page.tsx
// Master Agency Dashboard - Monitor all clients and their health status

'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ClientCardData } from '@/app/api/agency/clients/route';
import { AgencyClientCards } from '@/components/agency/AgencyClientCards';
import { AgencyActionPoints } from '@/components/agency/AgencyActionPoints';
import { AgencyCalendar } from '@/components/agency/AgencyCalendar';
import { AgencyBriefing } from '@/components/agency/AgencyBriefing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface AgencyMetrics {
  totalClients: number;
  statusBreakdown: {
    red: number;
    amber: number;
    green: number;
    unknown: number;
  };
  totalBudgetCents: number;
  totalSpentCents: number;
  totalOverdueTasks: number;
  totalAtRiskTasks: number;
  lastUpdated: string;
}

export default function AgencyDashboard() {
  const [clients, setClients] = useState<ClientCardData[]>([]);
  const [metrics, setMetrics] = useState<AgencyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Fetch data
  const fetchData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch both clients and metrics in parallel
      const [clientsRes, metricsRes] = await Promise.all([
        fetch('/api/agency/clients'),
        fetch('/api/agency/metrics'),
      ]);

      if (!clientsRes.ok) {
        throw new Error(`Failed to fetch clients: ${clientsRes.statusText}`);
      }

      if (!metricsRes.ok) {
        throw new Error(`Failed to fetch metrics: ${metricsRes.statusText}`);
      }

      const clientsData = await clientsRes.json();
      const metricsData = await metricsRes.json();

      setClients(clientsData.clients || []);
      setMetrics(metricsData);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error fetching agency data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true);
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [fetchData]);

  // Manual refresh - also fetch fresh spend data from ad platforms
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // First, refresh spend data for all clients by calling the same APIs
      // that the new-client-dashboard uses
      const refreshPromises: Promise<any>[] = [];
      
      // Get all client IDs from current clients (or fetch them if not loaded yet)
      const clientIds = clients.length > 0 
        ? clients.map(c => c.id)
        : [];
      
      // Calculate current month date range
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const startDate = currentMonthStart.toISOString().split('T')[0];
      const endDate = now.toISOString().split('T')[0];
      
      // For each client, trigger spend data refresh for Meta and Google Ads
      // Note: These may fail if accounts aren't connected, which is okay
      for (const clientId of clientIds) {
        // Fetch Meta Ads spend data
        refreshPromises.push(
          fetch('/api/ads/meta/fetch-spend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              startDate,
              endDate,
              clientId: clientId,
            }),
          })
            .then(res => {
              if (!res.ok) {
                console.warn(`Meta Ads refresh failed for client ${clientId}: ${res.status} ${res.statusText}`);
                return null;
              }
              return res.json();
            })
            .catch(err => {
              console.warn(`Failed to refresh Meta Ads spend for client ${clientId}:`, err.message);
              return null;
            })
        );
        
        // Fetch Google Ads spend data
        refreshPromises.push(
          fetch('/api/ads/fetch-spend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: 'google-ads',
              startDate,
              endDate,
              clientId: clientId,
            }),
          })
            .then(res => {
              if (!res.ok) {
                console.warn(`Google Ads refresh failed for client ${clientId}: ${res.status} ${res.statusText}`);
                return null;
              }
              return res.json();
            })
            .catch(err => {
              console.warn(`Failed to refresh Google Ads spend for client ${clientId}:`, err.message);
              return null;
            })
        );
      }
      
      // Wait for all spend data refreshes to complete (or fail gracefully)
      // Don't wait for errors - just proceed with dashboard refresh
      Promise.allSettled(refreshPromises).then(results => {
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
        const failCount = results.length - successCount;
        if (successCount > 0) {
          console.log(`Refreshed spend data for ${successCount} API calls`);
        }
        if (failCount > 0) {
          console.warn(`${failCount} API calls failed (this is normal if accounts aren't connected)`);
        }
      });
      
      // Wait a moment for any successful database writes to complete
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Always refresh the dashboard data (even if API calls failed)
      await fetchData(false);
    } catch (err) {
      console.error('Error refreshing spend data:', err);
      // Still refresh dashboard data even if spend refresh fails
      await fetchData(false);
    } finally {
      setRefreshing(false);
    }
  };

  // Format last refreshed time
  const formatLastRefreshed = () => {
    if (!lastRefreshed) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - lastRefreshed.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    return `${diffHours} hours ago`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-8">
        {/* Header Skeleton */}
        <div className="space-y-2">
          <div className="h-9 w-64 bg-muted animate-pulse rounded" />
          <div className="h-5 w-96 bg-muted animate-pulse rounded" />
        </div>

        {/* Metrics Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border shadow-sm rounded-lg p-6">
              <div className="space-y-3">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              </div>
            </Card>
          ))}
        </div>

        {/* Client card skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i} className="border shadow-sm rounded-lg p-4">
              <div className="space-y-3">
                <div className="flex gap-3 items-center">
                  <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                  </div>
                </div>
                <div className="h-8 w-full bg-muted animate-pulse rounded-lg" />
                <div className="h-8 w-full bg-muted animate-pulse rounded-lg" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-lg font-semibold text-destructive mb-2">
              Failed to Load Dashboard
            </p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => fetchData()} variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agency Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Monitor all clients and their health status
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
            />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          {lastRefreshed && (
            <p className="text-xs text-muted-foreground">
              Updated {formatLastRefreshed()}
            </p>
          )}
        </div>
      </div>

      {/* Briefing */}
      <AgencyBriefing clients={clients} />

      {/* Calendar + Action Points side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 items-start">
        <AgencyCalendar />
        <AgencyActionPoints />
      </div>

      {/* Client Cards */}
      <AgencyClientCards clients={clients} />
    </div>
  );
}
