'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/db/plans';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function CreateClientPage() {
  const router = useRouter();
  const [clientName, setClientName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!clientName.trim()) {
      alert('Please enter a client name');
      return;
    }

    setCreating(true);
    try {
      await createClient(clientName.trim());
      router.push('/clients');
    } catch (error) {
      console.error('Error creating client:', error);
      let errorMessage = 'Error creating client. Please try again.';
      
      if (error instanceof Error) {
        try {
          const errorData = JSON.parse(error.message);
          errorMessage = errorData.message || errorData.details || errorMessage;
        } catch {
          errorMessage = error.message || errorMessage;
        }
      }
      
      alert(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <div className="mb-4">
        <Link href="/clients">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Clients
          </Button>
        </Link>
      </div>
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Create New Client</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="client-name">Client Name</Label>
              <Input
                id="client-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Enter client name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreate();
                  }
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={creating || !clientName.trim()}
                className="flex-1"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Client'
                )}
              </Button>
              <Link href="/clients">
                <Button variant="outline">Cancel</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

