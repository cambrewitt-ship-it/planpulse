'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Connection {
  platform: string;
  status: string;
  connection_id: string;
}

interface SpendResponse {
  success: boolean;
  platform: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  data: any;
  rawDataSample?: any;
}

export default function TestDataPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingData, setFetchingData] = useState<Record<string, boolean>>({});
  const [spendData, setSpendData] = useState<Record<string, SpendResponse | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch user's connections on mount
  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      console.log('Fetching connections from /api/connections/user-status...');
      const response = await fetch('/api/connections/user-status');
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('API Error:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch connections`);
      }

      const data = await response.json();
      console.log('Connections data:', data);
      setConnections(data.connections || []);
    } catch (error) {
      console.error('Error fetching connections:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load connections';
      setErrors(prev => ({ ...prev, connections: errorMessage }));
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = () => {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const formatDate = (date: Date) => {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    };

    return {
      startDate: formatDate(sevenDaysAgo),
      endDate: formatDate(today),
    };
  };

  const handleFetchSpendData = async (platform: string) => {
    setFetchingData(prev => ({ ...prev, [platform]: true }));
    setErrors(prev => ({ ...prev, [platform]: '' }));
    setSpendData(prev => ({ ...prev, [platform]: null }));

    try {
      const { startDate, endDate } = getDateRange();

      console.log(`Fetching spend data for ${platform}:`, { startDate, endDate });

      // Use platform-specific endpoint for Meta Ads
      const endpoint = platform === 'meta-ads' || platform === 'facebook' 
        ? '/api/ads/meta/fetch-spend'
        : '/api/ads/fetch-spend';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform,
          startDate,
          endDate,
        }),
      });

      console.log(`Response status: ${response.status}`);
      console.log(`Response content-type: ${response.headers.get('content-type')}`);

      // Get response text first
      const responseText = await response.text();
      console.log(`Response text (first 500 chars):`, responseText.substring(0, 500));

      if (!response.ok) {
        // Try to parse as JSON, fallback to text
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 200)}`);
        }
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Parse the JSON response
      const data = JSON.parse(responseText);
      console.log(`Spend data received for ${platform}:`, data);
      
      setSpendData(prev => ({ ...prev, [platform]: data }));
    } catch (error) {
      console.error(`Error fetching spend data for ${platform}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setErrors(prev => ({ ...prev, [platform]: errorMessage }));
    } finally {
      setFetchingData(prev => ({ ...prev, [platform]: false }));
    }
  };

  const getPlatformDisplayName = (platform: string) => {
    const names: Record<string, string> = {
      'google-ads': 'Google Ads',
      'meta-ads': 'Meta Ads (Facebook)',
      'facebook': 'Meta Ads (Facebook)',
    };
    return names[platform] || platform;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Ad Spend Data Test
          </h1>
          <p className="text-gray-600">
            Test the /api/ads/fetch-spend endpoint by fetching data from connected platforms
          </p>
        </div>

        {/* Error Alert */}
        {errors.connections && (
          <Card className="mb-6 p-4 bg-red-50 border-red-200">
            <p className="text-red-800">{errors.connections}</p>
          </Card>
        )}

        {/* Connection Status */}
        <Card className="mb-8 p-6">
          <h2 className="text-2xl font-semibold mb-4">Connected Platforms</h2>
          
          {/* Debug Info */}
          <div className="mb-4 p-3 bg-gray-100 rounded text-xs">
            <p className="font-semibold mb-1">Debug Info:</p>
            <p>Total connections found: {connections.length}</p>
            <p>Check browser console for detailed logs</p>
          </div>
          
          {connections.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No platforms connected yet</p>
              <p className="text-sm text-gray-400">
                Connect your ad platforms first to test data fetching
              </p>
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-blue-600 hover:underline">
                  Troubleshooting Steps
                </summary>
                <div className="mt-2 p-4 bg-yellow-50 border border-yellow-200 rounded">
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>Make sure you're logged in with the same account that connected the platform</li>
                    <li>Go to a client dashboard and connect Google Ads or Meta Ads</li>
                    <li>Check your browser console for any error messages</li>
                    <li>Check the terminal/server logs to see if the connection was saved</li>
                    <li>Refresh this page after connecting</li>
                  </ol>
                </div>
              </details>
            </div>
          ) : (
            <div className="space-y-4">
              {connections.map((connection) => (
                <div
                  key={connection.platform}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="font-semibold text-lg">
                        {getPlatformDisplayName(connection.platform)}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Connection ID: {connection.connection_id}
                      </p>
                    </div>
                    <Badge
                      variant={connection.status === 'active' ? 'default' : 'secondary'}
                    >
                      {connection.status}
                    </Badge>
                  </div>

                  <Button
                    onClick={() => handleFetchSpendData(connection.platform)}
                    disabled={
                      connection.status !== 'active' ||
                      fetchingData[connection.platform]
                    }
                  >
                    {fetchingData[connection.platform] ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Fetching...
                      </span>
                    ) : (
                      'Fetch Spend Data (Last 7 Days)'
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Results Section */}
        {Object.keys(spendData).length > 0 || Object.keys(errors).length > 1 ? (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Results</h2>

            {connections.map((connection) => {
              const data = spendData[connection.platform];
              const error = errors[connection.platform];

              if (!data && !error) return null;

              return (
                <Card key={connection.platform} className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-xl font-semibold">
                      {getPlatformDisplayName(connection.platform)}
                    </h3>
                    {data && (
                      <Badge variant="default">Success</Badge>
                    )}
                    {error && (
                      <Badge variant="destructive">Error</Badge>
                    )}
                  </div>

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-800 font-semibold mb-1">Error:</p>
                      <p className="text-red-700">{error}</p>
                    </div>
                  )}

                  {data && (
                    <div className="space-y-4">
                      {/* Summary */}
                      <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div>
                          <p className="text-sm text-blue-600 font-semibold">Platform</p>
                          <p className="text-blue-900">{data.platform}</p>
                        </div>
                        <div>
                          <p className="text-sm text-blue-600 font-semibold">Date Range</p>
                          <p className="text-blue-900">
                            {data.dateRange.startDate} to {data.dateRange.endDate}
                          </p>
                        </div>
                      </div>

                      {/* Raw Data Sample */}
                      {data.rawDataSample && (
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-2">
                            Raw Data Sample:
                          </p>
                          <pre className="p-4 bg-gray-900 text-green-400 rounded-lg overflow-x-auto text-xs">
                            {JSON.stringify(data.rawDataSample, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Full Response */}
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">
                          Full Response:
                        </p>
                        <pre className="p-4 bg-gray-900 text-green-400 rounded-lg overflow-x-auto text-xs max-h-96">
                          {JSON.stringify(data, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : null}

        {/* Instructions */}
        <Card className="mt-8 p-6 bg-yellow-50 border-yellow-200">
          <h3 className="font-semibold text-yellow-900 mb-2">Testing Instructions:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-yellow-800">
            <li>Make sure you have connected at least one ad platform on a client dashboard</li>
            <li>Look for connected platforms listed above (refresh the page after connecting)</li>
            <li>Click the "Fetch Spend Data (Last 7 Days)" button for a connected platform</li>
            <li>Check the browser console for detailed logging</li>
            <li>Review the JSON response in the Results section below</li>
            <li>The API fetches data from the last 7 days automatically</li>
          </ol>
          
          <div className="mt-4 pt-4 border-t border-yellow-300">
            <p className="font-semibold text-yellow-900 mb-2">How to connect a platform:</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-yellow-800">
              <li>Navigate to <code className="bg-yellow-100 px-1 rounded">/dashboard</code></li>
              <li>Click on a client or create a new client</li>
              <li>Go to the client's dashboard</li>
              <li>Look for the "Ad Platform Connections" section</li>
              <li>Click "Connect" on Google Ads or Facebook Ads</li>
              <li>Complete the OAuth flow</li>
              <li>Return to this page and refresh</li>
            </ol>
          </div>
        </Card>
        
        {/* Quick Link */}
        <div className="mt-4 text-center">
          <a 
            href="/dashboard" 
            className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Clients Page to Connect Platforms
          </a>
        </div>
      </div>
    </div>
  );
}

