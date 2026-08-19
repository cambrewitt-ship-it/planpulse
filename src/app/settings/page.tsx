'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Upload, Save } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { AgencySettings } from '@/types/database';

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

  // Teams integration state
  const [teamsWebhookUrl, setTeamsWebhookUrl] = useState('');
  const [teamsBotSecret, setTeamsBotSecret] = useState('');
  const [dailyBriefingEnabled, setDailyBriefingEnabled] = useState(false);
  const [anomalyAlertsEnabled, setAnomalyAlertsEnabled] = useState(false);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationSaving, setIntegrationSaving] = useState(false);

  // Agency settings state
  const [agency, setAgency] = useState<Partial<AgencySettings>>({});
  const [agencyLoading, setAgencyLoading] = useState(false);
  const [agencySaving, setAgencySaving] = useState(false);
  const [agencyLogoUploading, setAgencyLogoUploading] = useState(false);
  const agencyLogoInputRef = useRef<HTMLInputElement>(null);

  // Billing state
  const [subscription, setSubscription] = useState<{
    plan: string;
    billing_period: string | null;
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    stripe_customer_id: string | null;
  } | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    checkUser();
    fetchAccountManagers();
    fetchClients();
    fetchIntegration();
    fetchSubscription();
    fetchAgency();

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

  const fetchSubscription = async () => {
    setBillingLoading(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;
      const { data } = await supabase
        .from('subscriptions')
        .select('plan,billing_period,status,current_period_end,cancel_at_period_end,stripe_customer_id')
        .eq('user_id', currentUser.id)
        .single();
      setSubscription(data ?? null);
    } catch {
      // no subscription row = free plan
    } finally {
      setBillingLoading(false);
    }
  };

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Portal error', err);
    } finally {
      setPortalLoading(false);
    }
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
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;
      const { data, error: err } = await supabase
        .from('clients')
        .select('id, name, logo_url')
        .eq('user_id', currentUser.id)
        .order('name', { ascending: true });
      if (!err) setClients((data as Client[]) || []);
    } catch (e) {
      console.error('Error fetching clients:', e);
    } finally {
      setClientsLoading(false);
    }
  };

  const fetchIntegration = async () => {
    try {
      setIntegrationLoading(true);
      const res = await fetch('/api/settings/integrations');
      if (!res.ok) return;
      const { integration } = await res.json();
      if (integration) {
        setTeamsWebhookUrl(integration.teams_webhook_url ?? '');
        setTeamsBotSecret(integration.teams_bot_hmac_secret ?? '');
        setDailyBriefingEnabled(integration.daily_briefing_enabled ?? false);
        setAnomalyAlertsEnabled(integration.anomaly_alerts_enabled ?? false);
      }
    } catch (e) {
      console.error('Error fetching integration:', e);
    } finally {
      setIntegrationLoading(false);
    }
  };

  const handleSaveIntegration = async () => {
    try {
      setIntegrationSaving(true);
      setError(null);
      const res = await fetch('/api/settings/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teams_webhook_url: teamsWebhookUrl,
          teams_bot_hmac_secret: teamsBotSecret,
          daily_briefing_enabled: dailyBriefingEnabled,
          anomaly_alerts_enabled: anomalyAlertsEnabled,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to save integration settings');
        return;
      }
      setSuccess('Integration settings saved');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError('Failed to save integration settings');
    } finally {
      setIntegrationSaving(false);
    }
  };

  const fetchAgency = async () => {
    try {
      setAgencyLoading(true);
      const res = await fetch('/api/settings/agency');
      if (res.ok) {
        const data = await res.json();
        setAgency(data ?? {});
      }
    } catch (e) {
      console.error('Error fetching agency settings:', e);
    } finally {
      setAgencyLoading(false);
    }
  };

  const handleSaveAgency = async () => {
    try {
      setAgencySaving(true);
      setError(null);
      const res = await fetch('/api/settings/agency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agency),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to save agency settings');
        return;
      }
      const data = await res.json();
      setAgency(data);
      setSuccess('Agency settings saved');
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError('Failed to save agency settings');
    } finally {
      setAgencySaving(false);
    }
  };

  const handleAgencyLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAgencyLogoUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/settings/agency/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64, contentType: file.type || 'image/png', ext }),
      });
      if (res.ok) {
        const { url } = await res.json();
        setAgency(prev => ({ ...prev, logo_url: url }));
        setSuccess('Agency logo updated');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const { error: err } = await res.json();
        setError(err || 'Logo upload failed');
      }
    } catch {
      setError('Logo upload failed');
    } finally {
      setAgencyLogoUploading(false);
      if (agencyLogoInputRef.current) agencyLogoInputRef.current.value = '';
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !logoUploadClientId) return;

    setUploadingClientId(logoUploadClientId);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/clients/${logoUploadClientId}/upload-logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64, contentType: file.type || 'image/png', ext }),
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

        {/* Hidden file inputs */}
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleLogoUpload}
        />
        <input
          ref={agencyLogoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAgencyLogoUpload}
        />

        <Tabs defaultValue="account" className="w-full">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="agency">Agency</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
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

          <TabsContent value="agency" className="mt-6">
            <div className="space-y-6">
              {agencyLoading ? (
                <div className="text-sm text-muted-foreground py-4">Loading…</div>
              ) : (
                <>
                  {/* Branding */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Agency Branding</CardTitle>
                      <CardDescription>Your agency name, logo, and contact details — shown on invoices</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Logo */}
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {agency.logo_url ? (
                            <img src={agency.logo_url} alt="Agency logo" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-2xl font-bold text-gray-300 select-none">
                              {(agency.agency_name || 'A').charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <Button variant="outline" size="sm" onClick={() => agencyLogoInputRef.current?.click()} disabled={agencyLogoUploading}>
                            <Upload className="h-3 w-3 mr-2" />
                            {agencyLogoUploading ? 'Uploading…' : agency.logo_url ? 'Replace logo' : 'Upload logo'}
                          </Button>
                          <p className="text-xs text-muted-foreground mt-1">PNG or JPG, max 5 MB, shown at 52×52px</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Agency name</Label>
                          <Input value={agency.agency_name ?? ''} onChange={e => setAgency(p => ({ ...p, agency_name: e.target.value }))} placeholder="OneOneThree Digital" />
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input type="email" value={agency.agency_email ?? ''} onChange={e => setAgency(p => ({ ...p, agency_email: e.target.value }))} placeholder="billing@agency.com" />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input value={agency.agency_phone ?? ''} onChange={e => setAgency(p => ({ ...p, agency_phone: e.target.value }))} placeholder="09-123-4567" />
                        </div>
                        <div className="space-y-2">
                          <Label>Address</Label>
                          <Input value={agency.agency_address ?? ''} onChange={e => setAgency(p => ({ ...p, agency_address: e.target.value }))} placeholder="104 Oriental Parade, Wellington" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Payment details */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Payment Details</CardTitle>
                      <CardDescription>Bank details printed in the invoice footer</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Bank name</Label>
                          <Input value={agency.bank_name ?? ''} onChange={e => setAgency(p => ({ ...p, bank_name: e.target.value }))} placeholder="ANZ Bank New Zealand" />
                        </div>
                        <div className="space-y-2">
                          <Label>Account name</Label>
                          <Input value={agency.bank_account_name ?? ''} onChange={e => setAgency(p => ({ ...p, bank_account_name: e.target.value }))} placeholder="Agency Ltd" />
                        </div>
                        <div className="space-y-2">
                          <Label>Account number</Label>
                          <Input value={agency.bank_account_number ?? ''} onChange={e => setAgency(p => ({ ...p, bank_account_number: e.target.value }))} placeholder="06-0123-0123456-00" />
                        </div>
                        <div className="space-y-2">
                          <Label>Invoice due days</Label>
                          <Input type="number" min={0} max={365} value={agency.invoice_due_days ?? 14} onChange={e => setAgency(p => ({ ...p, invoice_due_days: parseInt(e.target.value) || 14 }))} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Notes */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Invoice Notes</CardTitle>
                      <CardDescription>Payment terms or any notes printed on every invoice</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <textarea
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                        value={agency.invoice_notes ?? ''}
                        onChange={e => setAgency(p => ({ ...p, invoice_notes: e.target.value }))}
                        placeholder="Payment due within 14 days. Late payments may incur a 2% monthly fee."
                      />
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button onClick={handleSaveAgency} disabled={agencySaving}>
                      <Save className="h-4 w-4 mr-2" />
                      {agencySaving ? 'Saving…' : 'Save agency settings'}
                    </Button>
                  </div>
                </>
              )}
            </div>
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

          <TabsContent value="integrations" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Microsoft Teams</CardTitle>
                <CardDescription>
                  Connect PlanPulse to your Teams workspace for daily briefings, anomaly alerts, and the @PlanPulse bot.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {integrationLoading ? (
                  <div className="text-sm text-muted-foreground py-4">Loading...</div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="teams-webhook">Incoming Webhook URL</Label>
                        <Input
                          id="teams-webhook"
                          type="url"
                          value={teamsWebhookUrl}
                          onChange={(e) => setTeamsWebhookUrl(e.target.value)}
                          placeholder="https://your-org.webhook.office.com/webhookb2/..."
                        />
                        <p className="text-xs text-muted-foreground">
                          Used to send daily briefings and alerts to your Teams channel.
                          Create an Incoming Webhook connector in your Teams channel settings.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="teams-secret">Bot HMAC Secret</Label>
                        <Input
                          id="teams-secret"
                          type="password"
                          value={teamsBotSecret}
                          onChange={(e) => setTeamsBotSecret(e.target.value)}
                          placeholder="Paste the secret from your Teams Outgoing Webhook"
                        />
                        <p className="text-xs text-muted-foreground">
                          Used to verify inbound @PlanPulse messages. Copy from Teams Admin → Manage Team → Apps → Outgoing Webhooks.
                          Set the callback URL to: <code className="font-mono bg-gray-100 px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : ''}/api/bots/teams/{typeof window !== 'undefined' ? '<your-user-id>' : ''}</code>
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 border-t pt-4">
                      <p className="text-sm font-medium" style={{ color: '#1C1917' }}>Notifications</p>

                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="daily-briefing"
                          checked={dailyBriefingEnabled}
                          onCheckedChange={(v) => setDailyBriefingEnabled(Boolean(v))}
                          disabled={!teamsWebhookUrl}
                        />
                        <div className="space-y-0.5">
                          <Label htmlFor="daily-briefing" className="cursor-pointer font-medium text-sm">
                            Daily briefing
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Sends a health summary to your Teams channel at 8 AM on weekdays.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="anomaly-alerts"
                          checked={anomalyAlertsEnabled}
                          onCheckedChange={(v) => setAnomalyAlertsEnabled(Boolean(v))}
                          disabled={!teamsWebhookUrl}
                        />
                        <div className="space-y-0.5">
                          <Label htmlFor="anomaly-alerts" className="cursor-pointer font-medium text-sm">
                            Anomaly alerts
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Sends an alert when a client goes red, spend pacing crosses ±30%, or new tasks become overdue. Checks every 2 hours.
                          </p>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={handleSaveIntegration}
                      disabled={integrationSaving}
                      className="mt-2"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {integrationSaving ? 'Saving...' : 'Save integration settings'}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Billing &amp; Subscription</CardTitle>
                <CardDescription>Manage your plan and payment details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {billingLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {subscription?.plan ?? 'Free'} plan
                          {subscription?.billing_period && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              · {subscription.billing_period}
                            </span>
                          )}
                        </p>
                        {subscription?.status && subscription.status !== 'active' && (
                          <p className="text-xs text-destructive mt-0.5 capitalize">{subscription.status}</p>
                        )}
                        {subscription?.current_period_end && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {subscription.cancel_at_period_end ? 'Cancels' : 'Renews'}{' '}
                            {new Date(subscription.current_period_end).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <a href="/pricing" className="text-sm font-medium underline underline-offset-4">
                        {(!subscription || subscription.plan === 'free') ? 'Upgrade' : 'Change plan'}
                      </a>
                    </div>

                    {subscription?.stripe_customer_id && (
                      <Button
                        variant="outline"
                        onClick={handleOpenPortal}
                        disabled={portalLoading}
                      >
                        {portalLoading ? 'Opening…' : 'Manage billing & invoices'}
                      </Button>
                    )}

                    {(!subscription || subscription.plan === 'free') && (
                      <p className="text-sm text-muted-foreground">
                        You&apos;re on the free plan.{' '}
                        <a href="/pricing" className="underline underline-offset-4">
                          Upgrade
                        </a>{' '}
                        to unlock more clients, users, and features.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
