'use client';

import { useState, useEffect } from 'react';
import Nango from '@nangohq/frontend';
import { Card } from './ui/card';
import { Button } from './ui/button';

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

  // Fetch connection status on mount
  useEffect(() => {
    if (clientId) {
      fetchConnectionStatus();
    }
  }, [clientId]);

  const fetchConnectionStatus = async () => {
    try {
      const response = await fetch(`/api/connections/status?clientId=${clientId}`);
      if (response.ok) {
        const data = await response.json();
        // Convert array of connections to object with platform keys
        const statusMap: ConnectionStatus = {
          'google-ads': false,
          'facebook': false,
        };
        
        if (data.connections && Array.isArray(data.connections)) {
          data.connections.forEach((conn: { platform: string; status: string }) => {
            if (conn.platform === 'google-ads' || conn.platform === 'facebook') {
              statusMap[conn.platform] = conn.status === 'active';
            }
          });
        }
        
        setConnectionStatus(statusMap);
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
        onEvent: (event) => {
          if (event.type === 'close') {
            console.log('User closed the modal');
            setLoadingStates((prev) => ({ ...prev, [platformId]: false }));
          } else if (event.type === 'connect') {
            console.log('Connection successful!');
            // Update connection status
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
      const response = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platformId, clientId }),
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      setConnectionStatus((prev) => ({
        ...prev,
        [platformId]: false,
      }));
    } catch (error) {
      console.error('Disconnect error:', error);
      alert('Failed to disconnect. Please try again.');
    } finally {
      setLoadingStates((prev) => ({ ...prev, [platformId]: false }));
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

                {/* Last Synced Info (optional, for connected platforms) */}
                {isConnected && !isLoading && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-xs text-gray-500">
                      Last synced: Just now
                    </p>
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

