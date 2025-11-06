// src/app/plan-entry/page.tsx
'use client';

import { useState, useEffect } from 'react';
import PlanEntryForm from '@/components/plan-entry/PlanEntryForm';
import IntegrationManager from '@/components/integrations/IntegrationManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getClients } from '@/lib/db/plans';

export default function PlanEntryPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    const clientData = await getClients();
    if (clientData && clientData.length > 0) {
      setClients(clientData);
      setSelectedClient(clientData[0]); // Select first client by default
    }
  };

  if (!selectedClient) {
    return <div className="p-8">Loading clients...</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Media Plan Management</h1>
      
      <Tabs defaultValue="plan" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="plan">Create Plan</TabsTrigger>
          <TabsTrigger value="integrations">Connect Accounts</TabsTrigger>
        </TabsList>
        
        <TabsContent value="plan" className="mt-6">
          <PlanEntryForm />
        </TabsContent>
        
        <TabsContent value="integrations" className="mt-6">
          <IntegrationManager 
            clientId={selectedClient.id}
            clientName={selectedClient.name}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}