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
}

interface Platform {
  id: 'google-ads' | 'facebook';
  name: string;
  displayName: string;
  description: string;
  icon: string;
  color: string;
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
    displayName: 'Facebook & Instagram Ads',
    description: 'Connect your Meta advertising account',
    icon: '📘', // Replace with actual logo
    color: 'from-blue-600 to-indigo-600',
  },
];

interface AdPlatformConnectorProps {
  clientId: string;
}

export default function AdPlatformConnector({ clientId }: AdPlatformConnectorProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    'google-ads': false,
    'facebook': false,
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
        };
        
        if (data.connections && Array.isArray(data.connections)) {
          data.connections.forEach((conn: { platform: string; status: string }) => {
            console.log('Processing connection:', conn);
            // Normalize 'meta-ads' to 'facebook' for UI consistency
            const uiPlatform = conn.platform === 'meta-ads' ? 'facebook' : conn.platform;
            if (uiPlatform === 'google-ads' || uiPlatform === 'facebook') {
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

  const handleConnect = async (platformId: 'google-ads' | 'facebook') => {
    setLoadingStates((prev) => ({ ...prev, [platformId]: true }));

    try {
      // Initialize Nango
      const nango = new Nango();

      // Open Connect UI
      const connect = nango.openConnectUI({
        onEvent: async (event) => {
          if (event.type === 'close') {
            console.log('User closed the modal');
            setLoadingStates((prev) => ({ ...prev, [platformId]: false }));
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

  const handleDisconnect = async (platformId: 'google-ads' | 'facebook') => {
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <div className="text-4xl">{platform.icon}</div>
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
                  {!isConnected ? (
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

