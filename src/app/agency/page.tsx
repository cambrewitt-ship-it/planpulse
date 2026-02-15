// src/app/agency/page.tsx
// Master Agency Dashboard - Monitor all clients and their health status

'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ClientWithHealth } from '@/types/database';
import { AgencyMetricsCards } from '@/components/agency/AgencyMetricsCards';
import { ClientHealthTable } from '@/components/agency/ClientHealthTable';
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
  const [clients, setClients] = useState<ClientWithHealth[]>([]);
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

  // Manual refresh
  const handleRefresh = () => {
    fetchData(true);
  };

  // Client click handler
  const handleClientClick = (clientId: string) => {
    // The ClientHealthTable component handles navigation
    console.log('Client clicked:', clientId);
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

        {/* Table Skeleton */}
        <Card className="border shadow-sm rounded-lg p-6">
          <div className="space-y-4">
            <div className="h-10 w-full bg-muted animate-pulse rounded" />
            <div className="h-10 w-full bg-muted animate-pulse rounded" />
            <div className="h-10 w-full bg-muted animate-pulse rounded" />
            <div className="h-10 w-full bg-muted animate-pulse rounded" />
          </div>
        </Card>
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

      {/* Summary Metrics */}
      {metrics && (
        <AgencyMetricsCards
          metrics={{
            totalClients: metrics.totalClients,
            statusBreakdown: {
              red: metrics.statusBreakdown.red,
              amber: metrics.statusBreakdown.amber,
              green: metrics.statusBreakdown.green,
            },
            totalBudgetCents: metrics.totalBudgetCents,
            totalOverdueTasks: metrics.totalOverdueTasks,
            totalAtRiskTasks: metrics.totalAtRiskTasks,
          }}
        />
      )}

      {/* Client Health Table */}
      <div>
        <ClientHealthTable clients={clients} onClientClick={handleClientClick} />
      </div>
    </div>
  );
}
