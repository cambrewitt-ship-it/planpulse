'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Upload } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface AccountManager {
  id: string;
  name: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

interface Client {
  id: string;
  name: string;
  logo_url: string | null;
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

  // Clients state
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [uploadingClientId, setUploadingClientId] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploadClientId, setLogoUploadClientId] = useState<string | null>(null);

  useEffect(() => {
    checkUser();
    fetchAccountManagers();
    fetchClients();

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

  const fetchClients = async () => {
    try {
      setClientsLoading(true);
      const { data, error: err } = await supabase
        .from('clients')
        .select('id, name, logo_url')
        .order('name', { ascending: true });
      if (!err) setClients((data as Client[]) || []);
    } catch (e) {
      console.error('Error fetching clients:', e);
    } finally {
      setClientsLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !logoUploadClientId) return;

    setUploadingClientId(logoUploadClientId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/clients/${logoUploadClientId}/upload-logo`, {
        method: 'POST',
        body: fd,
      });
      if (res.ok) {
        const { url } = await res.json();
        // Update logo_url in DB
        await supabase.from('clients').update({ logo_url: url }).eq('id', logoUploadClientId);
        setClients(prev => prev.map(c => c.id === logoUploadClientId ? { ...c, logo_url: url } : c));
        setSuccess('Logo updated successfully');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const { error: uploadErr } = await res.json();
        setError(uploadErr || 'Logo upload failed');
      }
    } catch (e) {
      setError('Logo upload failed');
    } finally {
      setUploadingClientId(null);
      setLogoUploadClientId(null);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const triggerLogoUpload = (clientId: string) => {
    setLogoUploadClientId(clientId);
    logoInputRef.current?.click();
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

        {/* Hidden file input for logo upload */}
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleLogoUpload}
        />

        <Tabs defaultValue="account" className="w-full">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
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
          <TabsContent value="clients" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Client Logos</CardTitle>
                <CardDescription>Upload or update logos for each client</CardDescription>
              </CardHeader>
              <CardContent>
                {clientsLoading ? (
                  <div className="text-sm text-muted-foreground py-4">Loading clients...</div>
                ) : clients.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 border rounded-lg text-center">
                    No clients found.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {clients.map(client => (
                      <div key={client.id} className="flex items-center gap-4 p-3 border rounded-lg bg-white">
                        {/* Logo preview */}
                        <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {client.logo_url ? (
                            <img src={client.logo_url} alt={client.name} className="w-full h-full object-contain p-1" />
                          ) : (
                            <span className="text-lg font-bold text-gray-300 select-none">
                              {client.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm" style={{ color: '#1C1917' }}>{client.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {client.logo_url ? 'Logo uploaded' : 'No logo'}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => triggerLogoUpload(client.id)}
                          disabled={uploadingClientId === client.id}
                        >
                          <Upload className="h-3 w-3 mr-2" />
                          {uploadingClientId === client.id ? 'Uploading...' : client.logo_url ? 'Replace' : 'Upload'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
