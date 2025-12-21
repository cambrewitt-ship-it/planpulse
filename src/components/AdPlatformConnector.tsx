'use client';

import { useState, useEffect } from 'react';
import Nango from '@nangohq/frontend';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface ConnectionStatus {
  'google-ads': boolean;
  'facebook': boolean;
  'google-analytics': boolean;
  'linkedin': boolean;
  'tiktok': boolean;
}

interface Platform {
  id: 'google-ads' | 'facebook' | 'google-analytics' | 'linkedin' | 'tiktok';
  name: string;
  displayName: string;
  description: string;
  icon: string;
  color: string;
  comingSoon?: boolean;
}

interface GoogleAdsAccount {
  id: string;
  customerId: string;
  displayCustomerId: string;
  accountName: string | null;
  isActive: boolean;
  createdAt: string;
}

interface MetaAdsAccount {
  id: string;
  accountId: string;
  accountName: string | null;
  isActive: boolean;
  createdAt: string;
}

interface DiscoveredMetaAccount {
  accountId: string;
  accountName: string;
  accountStatus: number;
  currency: string;
}

interface GoogleAnalyticsAccount {
  id: string;
  propertyId: string;
  propertyName: string | null;
  accountId: string | null;
  accountName: string | null;
  isActive: boolean;
  createdAt: string;
}

interface DiscoveredGoogleAnalyticsAccount {
  propertyId: string;
  propertyName: string;
  accountId: string;
  accountName: string;
}

const platforms: Platform[] = [
  {
    id: 'google-ads',
    name: 'Google Ads',
    displayName: 'Google Ads',
    description: 'Connect your Google Ads account',
    icon: '🔍', // Replace with actual logo
    color: 'from-blue-500 to-green-500',
  },
  {
    id: 'facebook',
    name: 'Facebook Ads',
    displayName: 'Meta Ads',
    description: 'Connect your Meta advertising account',
    icon: '📘', // Replace with actual logo
    color: 'from-blue-600 to-indigo-600',
  },
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    displayName: 'Google Analytics',
    description: 'Connect your Google Analytics account',
    icon: '📊',
    color: 'from-orange-500 to-yellow-500',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn Ads',
    displayName: 'LinkedIn Ads',
    description: 'Connect your LinkedIn advertising account',
    icon: '💼',
    color: 'from-blue-700 to-blue-800',
    comingSoon: true,
  },
  {
    id: 'tiktok',
    name: 'TikTok Ads',
    displayName: 'TikTok Ads',
    description: 'Connect your TikTok advertising account',
    icon: '🎵',
    color: 'from-black to-gray-800',
    comingSoon: true,
  },
];

interface AdPlatformConnectorProps {
  clientId: string;
}

export default function AdPlatformConnector({ clientId }: AdPlatformConnectorProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    'google-ads': false,
    'facebook': false,
    'google-analytics': false,
  });
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  
  // Google Ads account management state
  const [showAccountManagement, setShowAccountManagement] = useState(false);
  const [googleAdsAccounts, setGoogleAdsAccounts] = useState<GoogleAdsAccount[]>([]);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountMessage, setAccountMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Meta Ads account management state
  const [showMetaAccountManagement, setShowMetaAccountManagement] = useState(false);
  const [metaAdsAccounts, setMetaAdsAccounts] = useState<MetaAdsAccount[]>([]);
  const [discoveredMetaAccounts, setDiscoveredMetaAccounts] = useState<DiscoveredMetaAccount[]>([]);
  const [selectedMetaAccounts, setSelectedMetaAccounts] = useState<Set<string>>(new Set());
  const [isLoadingMetaAccounts, setIsLoadingMetaAccounts] = useState(false);
  const [isDiscoveringMetaAccounts, setIsDiscoveringMetaAccounts] = useState(false);
  const [isSavingMetaAccounts, setIsSavingMetaAccounts] = useState(false);
  const [metaAccountMessage, setMetaAccountMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Google Analytics account management state
  const [showGoogleAnalyticsAccountManagement, setShowGoogleAnalyticsAccountManagement] = useState(false);
  const [googleAnalyticsAccounts, setGoogleAnalyticsAccounts] = useState<GoogleAnalyticsAccount[]>([]);
  const [discoveredGoogleAnalyticsAccounts, setDiscoveredGoogleAnalyticsAccounts] = useState<DiscoveredGoogleAnalyticsAccount[]>([]);
  const [selectedGoogleAnalyticsAccounts, setSelectedGoogleAnalyticsAccounts] = useState<Set<string>>(new Set());
  const [isLoadingGoogleAnalyticsAccounts, setIsLoadingGoogleAnalyticsAccounts] = useState(false);
  const [isDiscoveringGoogleAnalyticsAccounts, setIsDiscoveringGoogleAnalyticsAccounts] = useState(false);
  const [isSavingGoogleAnalyticsAccounts, setIsSavingGoogleAnalyticsAccounts] = useState(false);
  const [googleAnalyticsAccountMessage, setGoogleAnalyticsAccountMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch connection status on mount
  useEffect(() => {
    if (clientId) {
      fetchConnectionStatus();
    }
  }, [clientId]);

  const fetchConnectionStatus = async () => {
    try {
      console.log('Fetching connection status for client:', clientId);
      const response = await fetch(`/api/connections/status?clientId=${clientId}`);
      
      console.log('Connection status response:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Connection status data:', data);
        
        // Convert array of connections to object with platform keys
        const statusMap: ConnectionStatus = {
          'google-ads': false,
          'facebook': false,
          'google-analytics': false,
          'linkedin': false,
          'tiktok': false,
        };
        
        if (data.connections && Array.isArray(data.connections)) {
          data.connections.forEach((conn: { platform: string; status: string }) => {
            console.log('Processing connection:', conn);
            // Normalize 'meta-ads' to 'facebook' for UI consistency
            const uiPlatform = conn.platform === 'meta-ads' ? 'facebook' : conn.platform;
            if (uiPlatform === 'google-ads' || uiPlatform === 'facebook' || uiPlatform === 'google-analytics') {
              statusMap[uiPlatform] = conn.status === 'active';
            }
          });
        }
        
        console.log('Final status map:', statusMap);
        setConnectionStatus(statusMap);
      } else {
        console.error('Failed to fetch connection status:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch connection status:', error);
    } finally {
      setIsInitialLoading(false);
    }
  };

  const handleConnect = async (platformId: 'google-ads' | 'facebook' | 'google-analytics') => {
    setLoadingStates((prev) => ({ ...prev, [platformId]: true }));

    try {
      // Initialize Nango (works without public key if configured server-side)
      const nango = new Nango();

      // Open Connect UI
      const connect = nango.openConnectUI({
        onEvent: async (event) => {
          if (event.type === 'close') {
            console.log('User closed the modal');
            setLoadingStates((prev) => ({ ...prev, [platformId]: false }));
          } else if (event.type === 'error') {
            console.error('Nango connection error:', event);
            setLoadingStates((prev) => ({ ...prev, [platformId]: false }));
            const errorMessage = (event as any).error?.message || (event as any).error || 'An error occurred during connection';
            alert(`Connection error: ${errorMessage}\n\nPlease check your Nango configuration and try again.`);
          } else if (event.type === 'connect') {
            console.log('Connection successful! Syncing to database...');
            
            // Manually sync the connection to our database
            try {
              const syncResponse = await fetch('/api/integrations/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: platformId, clientId }),
              });

              const syncData = await syncResponse.json();

              if (!syncResponse.ok) {
                console.error('Failed to sync connection:', syncData);
                alert(`Connection succeeded but failed to save: ${syncData.error}\n\nPlease refresh the page.`);
              } else {
                console.log('Connection synced successfully:', syncData);
                // Refresh connection status to show the saved connection
                await fetchConnectionStatus();
              }
            } catch (syncError) {
              console.error('Sync error:', syncError);
              alert('Connection succeeded but failed to save. Please refresh the page.');
            }

            // Update connection status in UI
            setConnectionStatus((prev) => ({
              ...prev,
              [platformId]: true,
            }));
            setLoadingStates((prev) => ({ ...prev, [platformId]: false }));
          }
        },
      });

      // Get session token
      const response = await fetch('/api/nango/session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platformId, clientId }),
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          throw new Error(`Failed to get session token: ${response.status} ${response.statusText}`);
        }
        console.error('Session token error:', errorData);
        throw new Error(errorData.error || 'Failed to get session token');
      }

      const data = await response.json();

      // Set the token (shows loading until this is set)
      connect.setSessionToken(data.sessionToken);
    } catch (error) {
      console.error('Connection error:', error);
      setLoadingStates((prev) => ({ ...prev, [platformId]: false }));
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect';
      alert(`Failed to connect: ${errorMessage}\n\nPlease check the console for more details.`);
    }
  };

  const handleDisconnect = async (platformId: 'google-ads' | 'facebook' | 'google-analytics') => {
    if (!confirm(`Are you sure you want to disconnect ${platforms.find(p => p.id === platformId)?.displayName}?`)) {
      return;
    }

    setLoadingStates((prev) => ({ ...prev, [platformId]: true }));

    try {
      console.log('Disconnecting platform:', platformId, 'clientId:', clientId);
      
      const response = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platformId, clientId }),
      });

      console.log('Disconnect response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Disconnect error:', errorData);
        throw new Error(errorData.error || errorData.details || 'Failed to disconnect');
      }

      const data = await response.json();
      console.log('Disconnected successfully:', data);

      setConnectionStatus((prev) => ({
        ...prev,
        [platformId]: false,
      }));
      
      alert('Successfully disconnected!');
    } catch (error) {
      console.error('Disconnect error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect';
      alert(`Failed to disconnect: ${errorMessage}\n\nCheck the console for more details.`);
    } finally {
      setLoadingStates((prev) => ({ ...prev, [platformId]: false }));
    }
  };

  // Fetch Google Ads accounts
  const fetchGoogleAdsAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const response = await fetch('/api/ads/google-ads/get-accounts');
      if (response.ok) {
        const data = await response.json();
        setGoogleAdsAccounts(data.accounts || []);
      } else {
        console.error('Failed to fetch Google Ads accounts');
      }
    } catch (error) {
      console.error('Error fetching Google Ads accounts:', error);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  // Add new Google Ads account
  const handleAddAccount = async () => {
    if (!newCustomerId.trim()) {
      setAccountMessage({ type: 'error', text: 'Customer ID is required' });
      return;
    }

    setIsSavingAccount(true);
    setAccountMessage(null);

    try {
      const response = await fetch('/api/ads/google-ads/save-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: newCustomerId,
          accountName: newAccountName.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setAccountMessage({ type: 'success', text: 'Account added successfully!' });
        setNewCustomerId('');
        setNewAccountName('');
        await fetchGoogleAdsAccounts();
        
        // Clear success message after 3 seconds
        setTimeout(() => setAccountMessage(null), 3000);
      } else {
        setAccountMessage({ type: 'error', text: data.error || 'Failed to add account' });
      }
    } catch (error) {
      console.error('Error adding account:', error);
      setAccountMessage({ type: 'error', text: 'Failed to add account. Please try again.' });
    } finally {
      setIsSavingAccount(false);
    }
  };

  // Delete Google Ads account
  const handleDeleteAccount = async (accountId: string, displayCustomerId: string) => {
    if (!confirm(`Remove account ${displayCustomerId}?`)) {
      return;
    }

    try {
      const response = await fetch('/api/ads/google-ads/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });

      if (response.ok) {
        setAccountMessage({ type: 'success', text: 'Account removed successfully!' });
        await fetchGoogleAdsAccounts();
        
        // Clear success message after 3 seconds
        setTimeout(() => setAccountMessage(null), 3000);
      } else {
        const data = await response.json();
        setAccountMessage({ type: 'error', text: data.error || 'Failed to remove account' });
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      setAccountMessage({ type: 'error', text: 'Failed to remove account. Please try again.' });
    }
  };

  // Fetch Google Ads accounts when connection status changes
  useEffect(() => {
    if (connectionStatus['google-ads']) {
      fetchGoogleAdsAccounts();
    }
  }, [connectionStatus['google-ads']]);

  // Fetch Meta Ads accounts when connection status changes
  useEffect(() => {
    if (connectionStatus['facebook']) {
      fetchMetaAdsAccounts();
    }
  }, [connectionStatus['facebook']]);

  // Fetch Google Analytics accounts when connection status changes
  useEffect(() => {
    if (connectionStatus['google-analytics']) {
      fetchGoogleAnalyticsAccounts();
    }
  }, [connectionStatus['google-analytics']]);

  // Fetch Meta Ads accounts
  const fetchMetaAdsAccounts = async () => {
    setIsLoadingMetaAccounts(true);
    try {
      const response = await fetch('/api/ads/meta/get-accounts');
      if (response.ok) {
        const data = await response.json();
        setMetaAdsAccounts(data.accounts || []);
      } else {
        console.error('Failed to fetch Meta Ads accounts');
      }
    } catch (error) {
      console.error('Error fetching Meta Ads accounts:', error);
    } finally {
      setIsLoadingMetaAccounts(false);
    }
  };

  // Discover Meta Ads accounts from Meta API
  const handleDiscoverMetaAccounts = async () => {
    setIsDiscoveringMetaAccounts(true);
    setMetaAccountMessage(null);

    try {
      const response = await fetch('/api/ads/meta/accounts');
      
      if (response.ok) {
        const data = await response.json();
        setDiscoveredMetaAccounts(data.accounts || []);
        setSelectedMetaAccounts(new Set());
        
        if (data.accounts.length === 0) {
          setMetaAccountMessage({ type: 'error', text: 'No Meta ad accounts found' });
        } else {
          setMetaAccountMessage({ type: 'success', text: `Found ${data.accounts.length} account(s)` });
        }
      } else {
        const errorData = await response.json();
        setMetaAccountMessage({ type: 'error', text: errorData.error || 'Failed to discover accounts' });
      }
    } catch (error) {
      console.error('Error discovering Meta accounts:', error);
      setMetaAccountMessage({ type: 'error', text: 'Failed to discover accounts. Please try again.' });
    } finally {
      setIsDiscoveringMetaAccounts(false);
    }
  };

  // Toggle Meta account selection
  const toggleMetaAccountSelection = (accountId: string) => {
    setSelectedMetaAccounts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountId)) {
        newSet.delete(accountId);
      } else {
        newSet.add(accountId);
      }
      return newSet;
    });
  };

  // Save selected Meta Ads accounts
  const handleSaveMetaAccounts = async () => {
    if (selectedMetaAccounts.size === 0) {
      setMetaAccountMessage({ type: 'error', text: 'Please select at least one account' });
      return;
    }

    setIsSavingMetaAccounts(true);
    setMetaAccountMessage(null);

    try {
      const accountsToSave = discoveredMetaAccounts
        .filter(acc => selectedMetaAccounts.has(acc.accountId))
        .map(acc => ({
          accountId: acc.accountId,
          accountName: acc.accountName,
        }));

      const response = await fetch('/api/ads/meta/save-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: accountsToSave }),
      });

      const data = await response.json();

      if (response.ok) {
        setMetaAccountMessage({ type: 'success', text: `${accountsToSave.length} account(s) added successfully!` });
        setDiscoveredMetaAccounts([]);
        setSelectedMetaAccounts(new Set());
        await fetchMetaAdsAccounts();
        
        // Clear success message after 3 seconds
        setTimeout(() => setMetaAccountMessage(null), 3000);
      } else {
        setMetaAccountMessage({ type: 'error', text: data.error || 'Failed to save accounts' });
      }
    } catch (error) {
      console.error('Error saving Meta accounts:', error);
      setMetaAccountMessage({ type: 'error', text: 'Failed to save accounts. Please try again.' });
    } finally {
      setIsSavingMetaAccounts(false);
    }
  };

  // Delete Meta Ads account
  const handleDeleteMetaAccount = async (accountId: string, accountName: string) => {
    if (!confirm(`Remove account ${accountName}?`)) {
      return;
    }

    try {
      const response = await fetch('/api/ads/meta/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });

      if (response.ok) {
        setMetaAccountMessage({ type: 'success', text: 'Account removed successfully!' });
        await fetchMetaAdsAccounts();
        
        // Clear success message after 3 seconds
        setTimeout(() => setMetaAccountMessage(null), 3000);
      } else {
        const data = await response.json();
        setMetaAccountMessage({ type: 'error', text: data.error || 'Failed to remove account' });
      }
    } catch (error) {
      console.error('Error deleting Meta account:', error);
      setMetaAccountMessage({ type: 'error', text: 'Failed to remove account. Please try again.' });
    }
  };

  // Fetch Google Analytics accounts
  const fetchGoogleAnalyticsAccounts = async () => {
    setIsLoadingGoogleAnalyticsAccounts(true);
    try {
      const response = await fetch('/api/ads/google-analytics/get-accounts');
      if (response.ok) {
        const data = await response.json();
        setGoogleAnalyticsAccounts(data.accounts || []);
      } else {
        console.error('Failed to fetch Google Analytics accounts');
      }
    } catch (error) {
      console.error('Error fetching Google Analytics accounts:', error);
    } finally {
      setIsLoadingGoogleAnalyticsAccounts(false);
    }
  };

  // Discover Google Analytics accounts from Google Analytics API
  const handleDiscoverGoogleAnalyticsAccounts = async () => {
    setIsDiscoveringGoogleAnalyticsAccounts(true);
    setGoogleAnalyticsAccountMessage(null);

    try {
      const response = await fetch('/api/ads/google-analytics/accounts');
      
      if (response.ok) {
        const data = await response.json();
        setDiscoveredGoogleAnalyticsAccounts(data.accounts || []);
        setSelectedGoogleAnalyticsAccounts(new Set());
        
        if (data.accounts.length === 0) {
          setGoogleAnalyticsAccountMessage({ type: 'error', text: 'No Google Analytics properties found' });
        } else {
          setGoogleAnalyticsAccountMessage({ type: 'success', text: `Found ${data.accounts.length} property(ies)` });
        }
      } else {
        const errorData = await response.json();
        setGoogleAnalyticsAccountMessage({ type: 'error', text: errorData.error || 'Failed to discover properties' });
      }
    } catch (error) {
      console.error('Error discovering Google Analytics properties:', error);
      setGoogleAnalyticsAccountMessage({ type: 'error', text: 'Failed to discover properties. Please try again.' });
    } finally {
      setIsDiscoveringGoogleAnalyticsAccounts(false);
    }
  };

  // Toggle Google Analytics account selection
  const toggleGoogleAnalyticsAccountSelection = (propertyId: string) => {
    setSelectedGoogleAnalyticsAccounts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(propertyId)) {
        newSet.delete(propertyId);
      } else {
        newSet.add(propertyId);
      }
      return newSet;
    });
  };

  // Save selected Google Analytics accounts
  const handleSaveGoogleAnalyticsAccounts = async () => {
    if (selectedGoogleAnalyticsAccounts.size === 0) {
      setGoogleAnalyticsAccountMessage({ type: 'error', text: 'Please select at least one property' });
      return;
    }

    setIsSavingGoogleAnalyticsAccounts(true);
    setGoogleAnalyticsAccountMessage(null);

    try {
      const accountsToSave = discoveredGoogleAnalyticsAccounts
        .filter(acc => selectedGoogleAnalyticsAccounts.has(acc.propertyId))
        .map(acc => ({
          propertyId: acc.propertyId,
          propertyName: acc.propertyName,
          accountId: acc.accountId,
          accountName: acc.accountName,
        }));

      const response = await fetch('/api/ads/google-analytics/save-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: accountsToSave }),
      });

      const data = await response.json();

      if (response.ok) {
        setGoogleAnalyticsAccountMessage({ type: 'success', text: `${accountsToSave.length} property(ies) added successfully!` });
        setDiscoveredGoogleAnalyticsAccounts([]);
        setSelectedGoogleAnalyticsAccounts(new Set());
        await fetchGoogleAnalyticsAccounts();
        
        // Clear success message after 3 seconds
        setTimeout(() => setGoogleAnalyticsAccountMessage(null), 3000);
      } else {
        setGoogleAnalyticsAccountMessage({ type: 'error', text: data.error || 'Failed to save properties' });
      }
    } catch (error) {
      console.error('Error saving Google Analytics accounts:', error);
      setGoogleAnalyticsAccountMessage({ type: 'error', text: 'Failed to save properties. Please try again.' });
    } finally {
      setIsSavingGoogleAnalyticsAccounts(false);
    }
  };

  // Delete Google Analytics account
  const handleDeleteGoogleAnalyticsAccount = async (accountId: string, propertyName: string) => {
    if (!confirm(`Remove property ${propertyName}?`)) {
      return;
    }

    try {
      const response = await fetch('/api/ads/google-analytics/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });

      if (response.ok) {
        setGoogleAnalyticsAccountMessage({ type: 'success', text: 'Property removed successfully!' });
        await fetchGoogleAnalyticsAccounts();
        
        // Clear success message after 3 seconds
        setTimeout(() => setGoogleAnalyticsAccountMessage(null), 3000);
      } else {
        const data = await response.json();
        setGoogleAnalyticsAccountMessage({ type: 'error', text: data.error || 'Failed to remove property' });
      }
    } catch (error) {
      console.error('Error deleting Google Analytics account:', error);
      setGoogleAnalyticsAccountMessage({ type: 'error', text: 'Failed to remove property. Please try again.' });
    }
  };

  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Ad Platform Connections
        </h2>
        <p className="text-gray-600">
          Connect your advertising platforms to sync campaigns and performance data
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {platforms.map((platform) => {
          const isConnected = connectionStatus[platform.id];
          const isLoading = loadingStates[platform.id];

          return (
            <Card
              key={platform.id}
              className="relative overflow-hidden transition-all duration-300 hover:shadow-lg border-2 hover:border-gray-300"
            >
              {/* Gradient Background Header */}
              <div className={`h-2 bg-gradient-to-r ${platform.color}`} />

              <div className="p-6">
                {/* Platform Icon and Name */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      {platform.id === 'google-ads' ? (
                        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                      ) : platform.id === 'facebook' ? (
                        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/>
                        </svg>
                      ) : platform.id === 'google-analytics' ? (
                        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#F9AB00"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#E37400"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#F9AB00"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#E37400"/>
                        </svg>
                      ) : platform.id === 'linkedin' ? (
                        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" fill="#0077B5"/>
                        </svg>
                      ) : platform.id === 'tiktok' ? (
                        <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7.41a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" fill="#000000"/>
                        </svg>
                      ) : (
                        <div className="text-4xl">{platform.icon}</div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        {platform.displayName}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {platform.description}
                      </p>
                    </div>
                  </div>

                  {/* Connection Status Badge */}
                  {isConnected && !isLoading && (
                    <div className="flex items-center space-x-1 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                      <span>✓</span>
                      <span>Connected</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3">
                  {platform.comingSoon ? (
                    <Button
                      disabled
                      className="flex-1 bg-gray-300 text-gray-600 font-medium py-2 px-4 rounded-lg cursor-not-allowed"
                    >
                      Coming Soon
                    </Button>
                  ) : !isConnected ? (
                    <Button
                      onClick={() => handleConnect(platform.id)}
                      disabled={isLoading}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200"
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center">
                          <svg
                            className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Connecting...
                        </span>
                      ) : (
                        'Connect'
                      )}
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => handleDisconnect(platform.id)}
                        disabled={isLoading}
                        className="flex-1 border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 font-medium py-2 px-4 rounded-lg transition-all duration-200"
                      >
                        {isLoading ? (
                          <span className="flex items-center justify-center">
                            <svg
                              className="animate-spin -ml-1 mr-2 h-4 w-4"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                            Disconnecting...
                          </span>
                        ) : (
                          'Disconnect'
                        )}
                      </Button>
                    </>
                  )}
                </div>

                {/* Google Ads Account Management */}
                {platform.id === 'google-ads' && isConnected && !isLoading && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <Button
                      variant="outline"
                      onClick={() => setShowAccountManagement(!showAccountManagement)}
                      className="w-full mb-3 text-sm font-medium"
                    >
                      {showAccountManagement ? '▼' : '▶'} Manage Google Ads Accounts
                    </Button>

                    {showAccountManagement && (
                      <div className="space-y-4 animate-in slide-in-from-top duration-200">
                        {/* Success/Error Messages */}
                        {accountMessage && (
                          <div
                            className={`p-3 rounded-lg text-sm ${
                              accountMessage.type === 'success'
                                ? 'bg-green-50 text-green-800 border border-green-200'
                                : 'bg-red-50 text-red-800 border border-red-200'
                            }`}
                          >
                            {accountMessage.text}
                          </div>
                        )}

                        {/* Add Account Form */}
                        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                          <h4 className="font-semibold text-sm text-gray-900">Add New Account</h4>
                          
                          <div>
                            <Label htmlFor="customerId" className="text-xs font-medium text-gray-700">
                              Google Ads Customer ID *
                            </Label>
                            <Input
                              id="customerId"
                              type="text"
                              placeholder="123-456-7890"
                              value={newCustomerId}
                              onChange={(e) => setNewCustomerId(e.target.value)}
                              className="mt-1"
                              disabled={isSavingAccount}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Find your Customer ID in Google Ads (top right corner, 10-digit number)
                            </p>
                          </div>

                          <div>
                            <Label htmlFor="accountName" className="text-xs font-medium text-gray-700">
                              Account Name (Optional)
                            </Label>
                            <Input
                              id="accountName"
                              type="text"
                              placeholder="Client ABC"
                              value={newAccountName}
                              onChange={(e) => setNewAccountName(e.target.value)}
                              className="mt-1"
                              disabled={isSavingAccount}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              A friendly name to identify this account
                            </p>
                          </div>

                          <Button
                            onClick={handleAddAccount}
                            disabled={isSavingAccount || !newCustomerId.trim()}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {isSavingAccount ? (
                              <span className="flex items-center justify-center">
                                <svg
                                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                                Adding...
                              </span>
                            ) : (
                              'Add Account'
                            )}
                          </Button>
                        </div>

                        {/* Saved Accounts List */}
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm text-gray-900">Saved Accounts</h4>
                          
                          {isLoadingAccounts ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            </div>
                          ) : googleAdsAccounts.length === 0 ? (
                            <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                              <p className="text-sm text-gray-500">No accounts added yet</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {googleAdsAccounts.map((account) => (
                                <div
                                  key={account.id}
                                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                      <span className="font-mono text-sm font-medium text-gray-900">
                                        {account.displayCustomerId}
                                      </span>
                                      {account.isActive && (
                                        <span className="text-xs text-green-600">●</span>
                                      )}
                                    </div>
                                    {account.accountName && (
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        {account.accountName}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteAccount(account.id, account.displayCustomerId)}
                                    className="text-red-600 hover:bg-red-50 border-red-200"
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Meta Ads Account Management */}
                {platform.id === 'facebook' && isConnected && !isLoading && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <Button
                      variant="outline"
                      onClick={() => setShowMetaAccountManagement(!showMetaAccountManagement)}
                      className="w-full mb-3 text-sm font-medium"
                    >
                      {showMetaAccountManagement ? '▼' : '▶'} Manage Meta Ads Accounts
                    </Button>

                    {showMetaAccountManagement && (
                      <div className="space-y-4 animate-in slide-in-from-top duration-200">
                        {/* Success/Error Messages */}
                        {metaAccountMessage && (
                          <div
                            className={`p-3 rounded-lg text-sm ${
                              metaAccountMessage.type === 'success'
                                ? 'bg-green-50 text-green-800 border border-green-200'
                                : 'bg-red-50 text-red-800 border border-red-200'
                            }`}
                          >
                            {metaAccountMessage.text}
                          </div>
                        )}

                        {/* Discover Accounts Section */}
                        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                          <h4 className="font-semibold text-sm text-gray-900">Add New Accounts</h4>
                          
                          <Button
                            onClick={handleDiscoverMetaAccounts}
                            disabled={isDiscoveringMetaAccounts}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {isDiscoveringMetaAccounts ? (
                              <span className="flex items-center justify-center">
                                <svg
                                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                                Discovering...
                              </span>
                            ) : (
                              '🔍 Discover My Ad Accounts'
                            )}
                          </Button>

                          {/* Discovered Accounts List with Checkboxes */}
                          {discoveredMetaAccounts.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs text-gray-600 font-medium">
                                Select accounts to add:
                              </p>
                              <div className="max-h-48 overflow-y-auto space-y-2 border border-gray-200 rounded p-2">
                                {discoveredMetaAccounts.map((account) => (
                                  <label
                                    key={account.accountId}
                                    className="flex items-center space-x-3 p-2 hover:bg-gray-100 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedMetaAccounts.has(account.accountId)}
                                      onChange={() => toggleMetaAccountSelection(account.accountId)}
                                      className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    <div className="flex-1">
                                      <div className="text-sm font-medium text-gray-900">
                                        {account.accountName}
                                      </div>
                                      <div className="text-xs text-gray-500 font-mono">
                                        {account.accountId}
                                      </div>
                                    </div>
                                  </label>
                                ))}
                              </div>

                              <Button
                                onClick={handleSaveMetaAccounts}
                                disabled={isSavingMetaAccounts || selectedMetaAccounts.size === 0}
                                className="w-full bg-green-600 hover:bg-green-700 text-white"
                              >
                                {isSavingMetaAccounts ? (
                                  <span className="flex items-center justify-center">
                                    <svg
                                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      ></circle>
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      ></path>
                                    </svg>
                                    Saving...
                                  </span>
                                ) : (
                                  `✓ Save Selected Accounts (${selectedMetaAccounts.size})`
                                )}
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Saved Accounts List */}
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm text-gray-900">Saved Accounts</h4>
                          
                          {isLoadingMetaAccounts ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            </div>
                          ) : metaAdsAccounts.length === 0 ? (
                            <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                              <p className="text-sm text-gray-500">No accounts added yet</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {metaAdsAccounts.map((account) => (
                                <div
                                  key={account.id}
                                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-sm font-medium text-gray-900">
                                        {account.accountName || 'Unnamed Account'}
                                      </span>
                                      {account.isActive && (
                                        <span className="text-xs text-green-600">●</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-500 font-mono mt-0.5">
                                      {account.accountId}
                                    </p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteMetaAccount(account.id, account.accountName || account.accountId)}
                                    className="text-red-600 hover:bg-red-50 border-red-200"
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Google Analytics Account Management */}
                {platform.id === 'google-analytics' && isConnected && !isLoading && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <Button
                      variant="outline"
                      onClick={() => setShowGoogleAnalyticsAccountManagement(!showGoogleAnalyticsAccountManagement)}
                      className="w-full mb-3 text-sm font-medium"
                    >
                      {showGoogleAnalyticsAccountManagement ? '▼' : '▶'} Manage Google Analytics Properties
                    </Button>

                    {showGoogleAnalyticsAccountManagement && (
                      <div className="space-y-4 animate-in slide-in-from-top duration-200">
                        {/* Success/Error Messages */}
                        {googleAnalyticsAccountMessage && (
                          <div
                            className={`p-3 rounded-lg text-sm ${
                              googleAnalyticsAccountMessage.type === 'success'
                                ? 'bg-green-50 text-green-800 border border-green-200'
                                : 'bg-red-50 text-red-800 border border-red-200'
                            }`}
                          >
                            {googleAnalyticsAccountMessage.text}
                          </div>
                        )}

                        {/* Discover Properties Section */}
                        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                          <h4 className="font-semibold text-sm text-gray-900">Add New Properties</h4>
                          
                          <Button
                            onClick={handleDiscoverGoogleAnalyticsAccounts}
                            disabled={isDiscoveringGoogleAnalyticsAccounts}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {isDiscoveringGoogleAnalyticsAccounts ? (
                              <span className="flex items-center justify-center">
                                <svg
                                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  ></circle>
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  ></path>
                                </svg>
                                Discovering...
                              </span>
                            ) : (
                              '🔍 Discover My Properties'
                            )}
                          </Button>

                          {/* Discovered Properties List with Checkboxes */}
                          {discoveredGoogleAnalyticsAccounts.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs text-gray-600 font-medium">
                                Select properties to add:
                              </p>
                              <div className="max-h-48 overflow-y-auto space-y-2 border border-gray-200 rounded p-2">
                                {discoveredGoogleAnalyticsAccounts.map((account) => (
                                  <label
                                    key={account.propertyId}
                                    className="flex items-center space-x-3 p-2 hover:bg-gray-100 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedGoogleAnalyticsAccounts.has(account.propertyId)}
                                      onChange={() => toggleGoogleAnalyticsAccountSelection(account.propertyId)}
                                      className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    <div className="flex-1">
                                      <div className="text-sm font-medium text-gray-900">
                                        {account.propertyName}
                                      </div>
                                      <div className="text-xs text-gray-500 font-mono">
                                        {account.propertyId}
                                      </div>
                                      {account.accountName && (
                                        <div className="text-xs text-gray-400">
                                          Account: {account.accountName}
                                        </div>
                                      )}
                                    </div>
                                  </label>
                                ))}
                              </div>

                              <Button
                                onClick={handleSaveGoogleAnalyticsAccounts}
                                disabled={isSavingGoogleAnalyticsAccounts || selectedGoogleAnalyticsAccounts.size === 0}
                                className="w-full bg-green-600 hover:bg-green-700 text-white"
                              >
                                {isSavingGoogleAnalyticsAccounts ? (
                                  <span className="flex items-center justify-center">
                                    <svg
                                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      ></circle>
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      ></path>
                                    </svg>
                                    Saving...
                                  </span>
                                ) : (
                                  `✓ Save Selected Properties (${selectedGoogleAnalyticsAccounts.size})`
                                )}
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Saved Properties List */}
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm text-gray-900">Saved Properties</h4>
                          
                          {isLoadingGoogleAnalyticsAccounts ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            </div>
                          ) : googleAnalyticsAccounts.length === 0 ? (
                            <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                              <p className="text-sm text-gray-500">No properties added yet</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {googleAnalyticsAccounts.map((account) => (
                                <div
                                  key={account.id}
                                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-sm font-medium text-gray-900">
                                        {account.propertyName || 'Unnamed Property'}
                                      </span>
                                      {account.isActive && (
                                        <span className="text-xs text-green-600">●</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-500 font-mono mt-0.5">
                                      {account.propertyId}
                                    </p>
                                    {account.accountName && (
                                      <p className="text-xs text-gray-400 mt-0.5">
                                        Account: {account.accountName}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteGoogleAnalyticsAccount(account.id, account.propertyName || account.propertyId)}
                                    className="text-red-600 hover:bg-red-50 border-red-200"
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Help Text */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Connecting your ad platforms allows you to automatically sync campaign data,
          track performance metrics, and generate comprehensive reports across all your advertising channels.
        </p>
      </div>
    </div>
  );
}

