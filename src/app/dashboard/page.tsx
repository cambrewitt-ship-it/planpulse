'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, startOfYear } from 'date-fns';
import Link from 'next/link';
import { Plus, BookOpen, RefreshCw } from 'lucide-react';
import type { ClientCardData } from '@/app/api/agency/clients/route';
import type { AgencyClientActionPoints } from '@/app/api/agency/action-points/route';
import { ClientCardCompact } from '@/components/agency/ClientCardCompact';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AccountManager {
  id: string;
  name: string;
  email: string | null;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientCardData[]>([]);
  const [actionPointClients, setActionPointClients] = useState<AgencyClientActionPoints[]>([]);
  const [accountManagers, setAccountManagers] = useState<AccountManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [accountManagerFilter, setAccountManagerFilter] = useState<string>('All');
  
  // Date range state - default to YTD (Jan 1 - now)
  const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string }>(() => {
    const today = new Date();
    const yearStart = startOfYear(today);
    return {
      startDate: format(yearStart, 'yyyy-MM-dd'),
      endDate: format(today, 'yyyy-MM-dd'),
    };
  });

  const fetchAccountManagers = useCallback(async () => {
    try {
      const response = await fetch('/api/account-managers');
      if (response.ok) {
        const data = await response.json();
        setAccountManagers(data.accountManagers || []);
      }
    } catch (err) {
      console.error('Error fetching account managers:', err);
    }
  }, []);

  const fetchData = useCallback(async (showRefreshing = false) => {
    try {
      showRefreshing ? setRefreshing(true) : setLoading(true);
      setError(null);

      // Build query params with date range and account manager filter
      const clientsParams = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      
      // Add account manager filter if not "All"
      if (accountManagerFilter && accountManagerFilter !== 'All') {
        clientsParams.set('accountManager', accountManagerFilter);
      }

      const [clientsRes, apRes] = await Promise.all([
        fetch(`/api/agency/clients?${clientsParams.toString()}`),
        fetch('/api/agency/action-points'),
      ]);

      if (!clientsRes.ok) {
        throw new Error(`Failed to fetch clients: ${clientsRes.statusText}`);
      }

      const clientsData = clientsRes.ok ? await clientsRes.json() : { clients: [] };
      const apData = apRes.ok ? await apRes.json() : { clients: [] };

      setClients(clientsData.clients || []);
      setActionPointClients(apData.clients || []);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error fetching clients:', err);
      setError(err instanceof Error ? err.message : 'Failed to load clients');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange, accountManagerFilter]);

  useEffect(() => {
    fetchAccountManagers();
  }, [fetchAccountManagers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(false);
  };

  const formatLastRefreshed = () => {
    if (!lastRefreshed) return 'Updated just now';
    const diffMs = Date.now() - lastRefreshed.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Updated just now';
    if (diffMins === 1) return 'Updated 1 minute ago';
    if (diffMins < 60) return `Updated ${diffMins} minutes ago`;
    return `Updated ${Math.floor(diffMins / 60)} hours ago`;
  };

  const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
  const serifFont: React.CSSProperties = { fontFamily: "'DM Serif Display', Georgia, serif" };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', ...pageFont }}>
        <div style={{ textAlign: 'center', color: '#8A8578', fontSize: 15 }}>Loading clients...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', ...pageFont }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#A0442A', marginBottom: 16 }}>{error}</p>
          <Button onClick={fetchData}>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F3EF', ...pageFont }}>
      <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold" style={{ color: '#1C1917', ...serifFont }}>Clients</h1>
        <div className="flex gap-3 items-center">
          {/* Account Manager Filter */}
          <Select value={accountManagerFilter} onValueChange={setAccountManagerFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Account Managers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Account Managers</SelectItem>
              {accountManagers.map((am) => (
                <SelectItem key={am.id} value={am.name}>
                  {am.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Date Range Picker */}
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
          
          {/* Refresh button */}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh data"
          >
            <RefreshCw 
              className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} 
            />
          </Button>

          <Link href="/library">
            <Button variant="outline">
              <BookOpen className="h-4 w-4 mr-2" />
              Library
            </Button>
          </Link>
          <Link href="/clients/create">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create New Client
            </Button>
          </Link>
        </div>
      </div>

      {/* Last refreshed indicator */}
      {lastRefreshed && (
        <div className="mb-4 text-sm" style={{ color: '#8A8578' }}>
          {formatLastRefreshed()}
        </div>
      )}

      {/* Client cards grid */}
      {clients.length === 0 ? (
        <div className="text-center py-12 text-sm rounded-lg" style={{ color: '#8A8578', border: '0.5px dashed #D5D0C5', borderRadius: 6 }}>
          No clients found
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {clients.map((client) => (
            <ClientCardCompact
              key={client.id}
              client={client}
              selected={selectedClientId === client.id}
              onClick={() => setSelectedClientId(client.id)}
              accountManagers={accountManagers}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

