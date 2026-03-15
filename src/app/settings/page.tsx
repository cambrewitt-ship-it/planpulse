'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Settings as SettingsIcon } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface AccountManager {
  id: string;
  name: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [accountManagers, setAccountManagers] = useState<AccountManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newManagerName, setNewManagerName] = useState('');
  const [newManagerEmail, setNewManagerEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    checkUser();
    fetchAccountManagers();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user ?? null);
  };

  const fetchAccountManagers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/account-managers');
      if (response.ok) {
        const data = await response.json();
        setAccountManagers(data.accountManagers || []);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to load account managers');
      }
    } catch (err) {
      console.error('Error fetching account managers:', err);
      setError('Failed to load account managers');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccountManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newManagerName.trim()) {
      setError('Name is required');
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/account-managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newManagerName.trim(),
          email: newManagerEmail.trim() || null,
        }),
      });

      if (response.ok) {
        setNewManagerName('');
        setNewManagerEmail('');
        setSuccess('Account manager created successfully');
        await fetchAccountManagers();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create account manager');
      }
    } catch (err) {
      console.error('Error creating account manager:', err);
      setError('Failed to create account manager');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAccountManager = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    setDeleting(id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/account-managers/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSuccess('Account manager deleted successfully');
        await fetchAccountManagers();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete account manager');
      }
    } catch (err) {
      console.error('Error deleting account manager:', err);
      setError('Failed to delete account manager');
    } finally {
      setDeleting(null);
    }
  };

  const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
  const serifFont: React.CSSProperties = { fontFamily: "'DM Serif Display', Georgia, serif" };

  return (
    <div style={{ minHeight: '100vh', background: '#F5F3EF', ...pageFont }}>
      <div className="container mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: '#1C1917', ...serifFont }}>
            Settings
          </h1>
          <p className="text-sm" style={{ color: '#8A8578' }}>
            Manage your account settings and team members
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm">
            {success}
          </div>
        )}

        <Tabs defaultValue="account" className="w-full">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Details</CardTitle>
                <CardDescription>
                  Your account information and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="bg-gray-50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your email address cannot be changed here
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-id">User ID</Label>
                  <Input
                    id="user-id"
                    type="text"
                    value={user?.id || ''}
                    disabled
                    className="bg-gray-50 font-mono text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Managers</CardTitle>
                <CardDescription>
                  Create and manage account managers for your team
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Create New Account Manager Form */}
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h3 className="font-semibold mb-4 text-sm" style={{ color: '#1C1917' }}>
                    Create New Account Manager
                  </h3>
                  <form onSubmit={handleCreateAccountManager} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="manager-name">Name *</Label>
                      <Input
                        id="manager-name"
                        type="text"
                        value={newManagerName}
                        onChange={(e) => setNewManagerName(e.target.value)}
                        placeholder="Enter account manager name"
                        required
                        disabled={creating}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manager-email">Email (optional)</Label>
                      <Input
                        id="manager-email"
                        type="email"
                        value={newManagerEmail}
                        onChange={(e) => setNewManagerEmail(e.target.value)}
                        placeholder="Enter email address"
                        disabled={creating}
                      />
                    </div>
                    <Button type="submit" disabled={creating || !newManagerName.trim()}>
                        <Plus className="h-4 w-4 mr-2" />
                        {creating ? 'Creating...' : 'Create Account Manager'}
                    </Button>
                  </form>
                </div>

                {/* Account Managers List */}
                <div>
                  <h3 className="font-semibold mb-4 text-sm" style={{ color: '#1C1917' }}>
                    Existing Account Managers
                  </h3>
                  {loading ? (
                    <div className="text-sm text-muted-foreground py-4">Loading...</div>
                  ) : accountManagers.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4 border rounded-lg text-center">
                      No account managers yet. Create one above to get started.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {accountManagers.map((manager) => (
                        <div
                          key={manager.id}
                          className="flex items-center justify-between p-3 border rounded-lg bg-white"
                        >
                          <div className="flex-1">
                            <div className="font-medium" style={{ color: '#1C1917' }}>
                              {manager.name}
                            </div>
                            {manager.email && (
                              <div className="text-sm text-muted-foreground mt-1">
                                {manager.email}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteAccountManager(manager.id, manager.name)}
                            disabled={deleting === manager.id}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {deleting === manager.id ? 'Deleting...' : 'Delete'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
