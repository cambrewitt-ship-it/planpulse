'use client';

import { useEffect, useState } from 'react';
import { getClients } from '@/lib/db/plans';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, User, LayoutDashboard, BookOpen } from 'lucide-react';
import ActionPointsTodoList from '@/components/ActionPointsTodoList';

interface Client {
  id: string;
  name: string;
  created_at: string;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const data = await getClients();
      setClients(data || []);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Clients</h1>
        <div className="flex gap-3">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* To Do List - Left Side */}
        <div className="lg:col-span-1">
          <div className="sticky top-8">
            <ActionPointsTodoList />
          </div>
        </div>

        {/* Clients Grid - Right Side */}
        <div className="lg:col-span-2">
          {clients.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-gray-500 mb-4">No clients yet</p>
                <Link href="/clients/create">
                  <Button>Create Your First Client</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
              {clients.map(client => (
                <Card key={client.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="h-5 w-5" />
                      {client.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2">
                      <Link href={`/clients/${client.id}/new-client-dashboard`} className="w-full">
                        <Button className="w-full">
                          <LayoutDashboard className="h-4 w-4 mr-2" />
                          Dashboard
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

