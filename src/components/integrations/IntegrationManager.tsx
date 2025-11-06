// src/components/integrations/IntegrationManager.tsx
'use client';

import { useState, useEffect } from 'react';
import Nango from '@nangohq/frontend';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, Link } from 'lucide-react';

// Make sure to get your public key from environment
const NANGO_PUBLIC_KEY = process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY;

if (!NANGO_PUBLIC_KEY) {
  console.error('Missing NEXT_PUBLIC_NANGO_PUBLIC_KEY environment variable');
}

const AVAILABLE_INTEGRATIONS = [
  {
    integrationId: 'facebook-ads', // This must match EXACTLY what's in Nango dashboard
    name: 'Facebook Ads',
    icon: '📘',
    description: 'Connect Facebook & Instagram Ads'
  },
  {
    integrationId: 'google-ads',
    name: 'Google Ads', 
    icon: '🔍',
    description: 'Connect Google Ads campaigns'
  },
  {
    integrationId: 'linkedin-ads',
    name: 'LinkedIn Ads',
    icon: '💼',
    description: 'Connect LinkedIn advertising'
  },
  {
    integrationId: 'tiktok-ads',
    name: 'TikTok Ads',
    icon: '🎵',
    description: 'Connect TikTok advertising'
  }
];

interface IntegrationManagerProps {
  clientId: string;
  clientName: string;
}

export default function IntegrationManager({ clientId, clientName }: IntegrationManagerProps) {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nango, setNango] = useState<Nango | null>(null);

  useEffect(() => {
    // Initialize Nango only on client side
    if (typeof window !== 'undefined' && NANGO_PUBLIC_KEY) {
      const nangoInstance = new Nango({ publicKey: NANGO_PUBLIC_KEY });
      setNango(nangoInstance);
      console.log('Nango initialized with public key:', NANGO_PUBLIC_KEY.substring(0, 10) + '...');
    }
    checkConnections();
  }, []);

  const checkConnections = async () => {
    setLoading(true);
    try {
      // For now, just set all as not connected
      const integrationsWithStatus = AVAILABLE_INTEGRATIONS.map(integration => ({
        ...integration,
        connected: false,
        connectionId: null
      }));
      
      setIntegrations(integrationsWithStatus);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (integrationId: string) => {
    if (!nango) {
      alert('Nango not initialized. Please check your public key configuration.');
      console.error('Nango is null. NANGO_PUBLIC_KEY:', NANGO_PUBLIC_KEY);
      return;
    }

    setConnecting(integrationId);
    
    try {
      // The correct order is: integrationId, connectionId
      const connectionId = `${clientId}-${integrationId}`;
      
      console.log('Attempting to connect:', { integrationId, connectionId });
      
      // Call nango.auth with correct parameters
      const result = await nango.auth(
        integrationId, // The integration ID from Nango dashboard (e.g., 'facebook-ads')
        connectionId   // Your unique connection ID
      );

      console.log('Connection result:', result);

      if (result) {
        // Update local state to show connected
        setIntegrations(prev => 
          prev.map(int => 
            int.integrationId === integrationId 
              ? { ...int, connected: true, connectionId } 
              : int
          )
        );

        // Save to your database
        await fetch('/api/integrations/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            provider: integrationId,
            connectionId: result.connectionId,
            providerConfigKey: result.providerConfigKey
          })
        });

        alert('Successfully connected!');
      }
    } catch (error: any) {
      console.error('Connection failed:', error);
      alert(`Failed to connect: ${error.message || 'Unknown error'}`);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (integrationId: string, connectionId: string) => {
    if (!confirm('Are you sure you want to disconnect this integration?')) {
      return;
    }

    setConnecting(integrationId);
    try {
      // Update local state
      setIntegrations(prev => 
        prev.map(int => 
          int.integrationId === integrationId 
            ? { ...int, connected: false, connectionId: null } 
            : int
        )
      );

      // Remove from database
      await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          provider: integrationId,
          connectionId
        })
      });
    } catch (error) {
      console.error('Disconnect failed:', error);
      alert('Failed to disconnect. Please try again.');
      // Revert state on error
      await checkConnections();
    } finally {
      setConnecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!nango) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4">
          Nango is not initialized. Please check your configuration.
        </p>
        <p className="text-sm text-gray-600">
          Make sure NEXT_PUBLIC_NANGO_PUBLIC_KEY is set in your .env.local file
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Current value: {NANGO_PUBLIC_KEY ? 'Set' : 'Missing'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Connected Ad Accounts</h3>
        <p className="text-sm text-gray-600">
          Connect your advertising platforms to automatically sync spend data for {clientName}
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Client ID: {clientId}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((integration) => (
          <Card key={integration.integrationId} className={integration.connected ? 'border-green-200' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{integration.icon}</span>
                  <span className="text-base">{integration.name}</span>
                </div>
                {integration.connected && (
                  <Badge variant="outline" className="bg-green-50 text-green-700">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                {integration.description}
              </p>

              {integration.connected ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">
                    Connection ID: {integration.connectionId}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect(integration.integrationId, integration.connectionId!)}
                    disabled={connecting === integration.integrationId}
                    className="w-full text-red-600 hover:text-red-700"
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => handleConnect(integration.integrationId)}
                  disabled={connecting === integration.integrationId}
                  className="w-full"
                  size="sm"
                >
                  {connecting === integration.integrationId ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link className="h-4 w-4 mr-2" />
                      Connect
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}