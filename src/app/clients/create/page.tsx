'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createDbClient, updateClientLogoUrl } from '@/lib/db/plans';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';
import Nango from '@nangohq/frontend';
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
  Building2,
  BarChart2,
  Wifi,
  List,
  GitBranch,
  Upload,
  X,
  CheckCircle2,
  RefreshCw,
  Plus,
  Trash2,
} from 'lucide-react';
import { MediaPlanGrid, MediaPlanChannel, createEmptyChannel } from '@/components/media-plan-builder/media-plan-grid';
import Image from 'next/image';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;
type PlatformId = 'facebook' | 'google-ads' | 'google-analytics' | 'linkedin' | 'tiktok';

interface Platform {
  id: PlatformId;
  label: string;
  description: string;
  comingSoon?: boolean;
}

interface DiscoveredMetaAccount {
  accountId: string;
  accountName: string;
  accountStatus: number;
  currency: string;
}

interface DiscoveredGAAccount {
  propertyId: string;
  propertyName: string;
  accountId: string;
  accountName: string;
}

interface SavedGadsAccount {
  id: string;
  customerId: string;
  displayCustomerId: string;
  accountName: string | null;
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  accountId: string;
  accountName: string | null;
}

// ── Static data ───────────────────────────────────────────────────────────────

const STEPS: { num: Step; label: string; icon: React.ElementType }[] = [
  { num: 1, label: 'Details', icon: Building2 },
  { num: 2, label: 'Plan', icon: BarChart2 },
  { num: 3, label: 'Connect', icon: Wifi },
  { num: 4, label: 'Accounts', icon: List },
  { num: 5, label: 'Campaigns', icon: GitBranch },
];

const PLATFORMS: Platform[] = [
  { id: 'facebook', label: 'Meta Ads', description: 'Facebook & Instagram advertising' },
  { id: 'google-ads', label: 'Google Ads', description: 'Search, Display & YouTube ads' },
  { id: 'google-analytics', label: 'Google Analytics', description: 'Website & app analytics' },
  { id: 'linkedin', label: 'LinkedIn Ads', description: 'B2B advertising', comingSoon: true },
  { id: 'tiktok', label: 'TikTok Ads', description: 'Short-form video ads', comingSoon: true },
];

// ── Platform SVG logos ────────────────────────────────────────────────────────

function PlatformLogo({ id, size = 32 }: { id: PlatformId; size?: number }) {
  const s = size;
  if (id === 'facebook') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2" />
      </svg>
    );
  }
  if (id === 'google-ads' || id === 'google-analytics') {
    const colors =
      id === 'google-ads'
        ? ['#4285F4', '#34A853', '#FBBC05', '#EA4335']
        : ['#F9AB00', '#E37400', '#F9AB00', '#E37400'];
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill={colors[0]} />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill={colors[1]} />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill={colors[2]} />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill={colors[3]} />
      </svg>
    );
  }
  if (id === 'linkedin') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" fill="#0077B5" />
      </svg>
    );
  }
  if (id === 'tiktok') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7.41a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" fill="#000" />
      </svg>
    );
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreateClientPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [clientId, setClientId] = useState<string | null>(null);

  // ── Step 1 ──
  const [clientName, setClientName] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Step 2 ──
  const [channels, setChannels] = useState<MediaPlanChannel[]>(() => [createEmptyChannel()]);
  const [commission, setCommission] = useState(0);
  const [savingPlan, setSavingPlan] = useState(false);

  // ── Step 3: platform connection status ──
  const [connectionStatus, setConnectionStatus] = useState<Record<PlatformId, boolean>>({
    facebook: false,
    'google-ads': false,
    'google-analytics': false,
    linkedin: false,
    tiktok: false,
  });
  const [connectingPlatform, setConnectingPlatform] = useState<PlatformId | null>(null);
  const [isCheckingConnections, setIsCheckingConnections] = useState(false);

  // ── Step 4: Meta accounts ──
  const [metaDiscovered, setMetaDiscovered] = useState<DiscoveredMetaAccount[]>([]);
  const [metaSelected, setMetaSelected] = useState<Set<string>>(new Set());
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaSearch, setMetaSearch] = useState('');
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);

  // ── Step 4: Google Ads accounts ──
  const [gadsCustomerId, setGadsCustomerId] = useState('');
  const [gadsAccountName, setGadsAccountName] = useState('');
  const [gadsSaved, setGadsSaved] = useState<SavedGadsAccount[]>([]);
  const [gadsSaving, setGadsSaving] = useState(false);
  const [gadsLoading, setGadsLoading] = useState(false);
  const [gadsMsg, setGadsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Step 4: Google Analytics properties ──
  const [gaDiscovered, setGaDiscovered] = useState<DiscoveredGAAccount[]>([]);
  const [gaSelected, setGaSelected] = useState<Set<string>>(new Set());
  const [gaLoading, setGaLoading] = useState(false);
  const [gaError, setGaError] = useState<string | null>(null);
  const [gaSaving, setGaSaving] = useState(false);
  const [gaSaved, setGaSaved] = useState(false);

  // ── Step 5: campaigns ──
  const [metaCampaigns, setMetaCampaigns] = useState<MetaCampaign[]>([]);
  const [channelCampaignMap, setChannelCampaignMap] = useState<Record<string, string>>({});
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsSaving, setCampaignsSaving] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState('');

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const goToDashboard = () =>
    router.push(clientId ? `/clients/${clientId}/dashboard` : '/dashboard');

  const namedChannels = channels.filter((ch) => ch.channelName?.trim());

  // ── Step 1 handlers ───────────────────────────────────────────────────────────

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCreateClient = async () => {
    if (!clientName.trim()) return;
    setCreating(true);
    try {
      const client = await createDbClient(clientName.trim());
      const newId = client.id;
      if (logoFile) {
        try {
          const ext = logoFile.name.split('.').pop() || 'png';
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(logoFile);
          });
          const res = await fetch(`/api/clients/${newId}/upload-logo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: base64, contentType: logoFile.type || 'image/png', ext }),
          });
          if (res.ok) {
            const { url } = await res.json();
            await updateClientLogoUrl(newId, url);
          }
        } catch {}
      }
      setClientId(newId);
      setStep(2);
    } catch {
      alert('Error creating client. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  // ── Step 2 handlers ───────────────────────────────────────────────────────────

  const handleSaveMediaPlan = async () => {
    if (!clientId) return;
    setSavingPlan(true);
    try {
      await fetch(`/api/clients/${clientId}/media-plan-builder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels, commission }),
      });
    } catch {}
    setSavingPlan(false);
    setStep(3);
  };

  // ── Step 3 handlers ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (step === 3 && clientId) fetchConnectionStatus();
  }, [step, clientId]);

  const fetchConnectionStatus = async () => {
    if (!clientId) return;
    setIsCheckingConnections(true);
    try {
      const res = await fetch(`/api/connections/status?clientId=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        const conns: { platform: string; status: string }[] = data.connections ?? [];
        setConnectionStatus((prev) => {
          const next = { ...prev };
          conns.forEach((c) => {
            const id = (c.platform === 'meta-ads' ? 'facebook' : c.platform) as PlatformId;
            if (id in next) next[id] = c.status === 'active';
          });
          return next;
        });
      }
    } catch {}
    setIsCheckingConnections(false);
  };

  const handleConnectPlatform = async (platformId: PlatformId) => {
    if (!clientId) return;
    setConnectingPlatform(platformId);
    try {
      const nango = new Nango();
      const connect = nango.openConnectUI({
        onEvent: async (event) => {
          if (event.type === 'close' || event.type === 'error') {
            setConnectingPlatform(null);
          } else if (event.type === 'connect') {
            try {
              const res = await fetch('/api/integrations/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: platformId, clientId }),
              });
              if (res.ok) {
                setConnectionStatus((prev) => ({ ...prev, [platformId]: true }));
              }
            } catch {}
            setConnectingPlatform(null);
          }
        },
      });
      const tokenRes = await fetch('/api/nango/session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platformId, clientId }),
      });
      if (!tokenRes.ok) throw new Error('Failed to get session token');
      const { sessionToken } = await tokenRes.json();
      connect.setSessionToken(sessionToken);
    } catch {
      setConnectingPlatform(null);
      alert('Failed to connect. Please try again.');
    }
  };

  const anyConnected = Object.values(connectionStatus).some(Boolean);

  // When advancing from Step 3 to Step 4, load accounts for connected platforms
  const handleAdvanceToStep4 = async () => {
    setStep(4);
    if (connectionStatus.facebook) discoverMetaAccounts();
    if (connectionStatus['google-ads']) fetchGadsAccounts();
    if (connectionStatus['google-analytics']) discoverGaAccounts();
  };

  // ── Step 4: Meta Ads ──────────────────────────────────────────────────────────

  const discoverMetaAccounts = async () => {
    setMetaLoading(true);
    setMetaError(null);
    setMetaDiscovered([]);
    setMetaSelected(new Set());
    setMetaSearch('');
    try {
      const res = await fetch('/api/ads/meta/accounts');
      const data = await res.json();
      if (res.ok) {
        setMetaDiscovered(data.accounts ?? []);
        if ((data.accounts ?? []).length === 0) setMetaError('No ad accounts found.');
      } else {
        setMetaError(data.error ?? 'Failed to load accounts.');
      }
    } catch {
      setMetaError('Failed to load accounts. Please try again.');
    }
    setMetaLoading(false);
  };

  const toggleMetaAccount = (id: string) =>
    setMetaSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const saveMetaAccounts = async () => {
    if (metaSelected.size === 0) return;
    setMetaSaving(true);
    try {
      const accounts = metaDiscovered
        .filter((a) => metaSelected.has(a.accountId))
        .map((a) => ({ accountId: a.accountId, accountName: a.accountName }));
      const res = await fetch('/api/ads/meta/save-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts }),
      });
      if (res.ok) setMetaSaved(true);
      else {
        const d = await res.json();
        setMetaError(d.error ?? 'Failed to save accounts.');
      }
    } catch {
      setMetaError('Failed to save accounts.');
    }
    setMetaSaving(false);
  };

  // ── Step 4: Google Ads ────────────────────────────────────────────────────────

  const fetchGadsAccounts = async () => {
    setGadsLoading(true);
    try {
      const res = await fetch('/api/ads/google-ads/get-accounts');
      if (res.ok) {
        const data = await res.json();
        setGadsSaved(data.accounts ?? []);
      }
    } catch {}
    setGadsLoading(false);
  };

  const addGadsAccount = async () => {
    if (!gadsCustomerId.trim()) return;
    setGadsSaving(true);
    setGadsMsg(null);
    try {
      const res = await fetch('/api/ads/google-ads/save-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: gadsCustomerId, accountName: gadsAccountName.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setGadsMsg({ type: 'success', text: 'Account added!' });
        setGadsCustomerId('');
        setGadsAccountName('');
        await fetchGadsAccounts();
        setTimeout(() => setGadsMsg(null), 3000);
      } else {
        setGadsMsg({ type: 'error', text: data.error ?? 'Failed to add account.' });
      }
    } catch {
      setGadsMsg({ type: 'error', text: 'Failed to add account.' });
    }
    setGadsSaving(false);
  };

  const removeGadsAccount = async (accountId: string) => {
    try {
      await fetch('/api/ads/google-ads/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      await fetchGadsAccounts();
    } catch {}
  };

  // ── Step 4: Google Analytics ──────────────────────────────────────────────────

  const discoverGaAccounts = async () => {
    setGaLoading(true);
    setGaError(null);
    setGaDiscovered([]);
    setGaSelected(new Set());
    try {
      const res = await fetch('/api/ads/google-analytics/accounts');
      const data = await res.json();
      if (res.ok) {
        setGaDiscovered(data.accounts ?? []);
        if ((data.accounts ?? []).length === 0) setGaError('No Analytics properties found.');
      } else {
        setGaError(data.error ?? 'Failed to load properties.');
      }
    } catch {
      setGaError('Failed to load properties. Please try again.');
    }
    setGaLoading(false);
  };

  const toggleGaAccount = (id: string) =>
    setGaSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const saveGaAccounts = async () => {
    if (gaSelected.size === 0) return;
    setGaSaving(true);
    try {
      const accounts = gaDiscovered
        .filter((a) => gaSelected.has(a.propertyId))
        .map((a) => ({
          propertyId: a.propertyId,
          propertyName: a.propertyName,
          accountId: a.accountId,
          accountName: a.accountName,
        }));
      const res = await fetch('/api/ads/google-analytics/save-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts }),
      });
      if (res.ok) setGaSaved(true);
      else {
        const d = await res.json();
        setGaError(d.error ?? 'Failed to save properties.');
      }
    } catch {
      setGaError('Failed to save properties.');
    }
    setGaSaving(false);
  };

  // ── Step 5 handlers ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (step === 5 && connectionStatus.facebook) loadCampaigns();
  }, [step]);

  const loadCampaigns = async () => {
    setCampaignsLoading(true);
    try {
      const res = await fetch('/api/ads/meta/campaigns');
      if (res.ok) {
        const data = await res.json();
        setMetaCampaigns(data.campaigns ?? []);
      }
    } catch {}
    setCampaignsLoading(false);
  };

  const saveCampaigns = async () => {
    if (!clientId) return;
    setCampaignsSaving(true);
    try {
      const updatedChannels = channels.map((ch) => {
        const campaignId = channelCampaignMap[ch.id];
        if (campaignId) {
          const campaign = metaCampaigns.find((c) => c.id === campaignId);
          return { ...ch, metaCampaignId: campaignId, metaCampaignName: campaign?.name ?? null };
        }
        return ch;
      });
      await fetch(`/api/clients/${clientId}/media-plan-builder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: updatedChannels, commission }),
      });
    } catch {}
    setCampaignsSaving(false);
    goToDashboard();
  };

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: '#F5F3EF', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="container mx-auto px-4 py-8 max-w-5xl">

        {/* Back */}
        <div className="mb-8">
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Clients
            </Button>
          </Link>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center mb-10 overflow-x-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = step > s.num;
            const current = step === s.num;
            return (
              <div key={s.num} className="flex items-center flex-shrink-0">
                <div className="flex flex-col items-center">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${done ? 'bg-green-500 border-green-500 text-white' : current ? 'bg-white border-blue-500 text-blue-500' : 'bg-white border-gray-200 text-gray-400'}`}>
                    {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={`mt-1 text-xs font-medium whitespace-nowrap ${current ? 'text-blue-600' : done ? 'text-green-600' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-12 h-0.5 mx-2 mb-5 flex-shrink-0 ${step > s.num ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: Client Details ─────────────────────────────────────────── */}
        {step === 1 && (
          <Card className="max-w-lg mx-auto" style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18 }}>
            <CardHeader>
              <CardTitle>Client Details</CardTitle>
              <CardDescription>Name your client and add their logo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-2">
                <Label htmlFor="client-name">Client Name *</Label>
                <Input
                  id="client-name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Enter client name"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateClient()}
                />
              </div>
              <div className="grid gap-2">
                <Label>Logo (optional)</Label>
                {logoPreview ? (
                  <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 group">
                    <Image src={logoPreview} alt="Logo preview" fill style={{ objectFit: 'contain' }} className="p-2" />
                    <button onClick={() => { setLogoFile(null); setLogoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-3 w-3 text-gray-600" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()} className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-colors">
                    <Upload className="h-5 w-5" />
                    <span className="text-xs">Upload</span>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleCreateClient} disabled={creating || !clientName.trim()} className="flex-1">
                  {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : <>Next: Media Plan<ArrowRight className="h-4 w-4 ml-2" /></>}
                </Button>
                <Link href="/dashboard"><Button variant="outline">Cancel</Button></Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Media Plan Builder ─────────────────────────────────────── */}
        {step === 2 && clientId && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Media Plan Builder</h2>
                <p className="text-sm text-gray-500 mt-1">Configure media channels and budget allocation</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(3)}>Skip for now</Button>
                <Button onClick={handleSaveMediaPlan} disabled={savingPlan}>
                  {savingPlan ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <>Save & Continue<ArrowRight className="h-4 w-4 ml-2" /></>}
                </Button>
              </div>
            </div>
            <div className="rounded-lg p-6" style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
              <MediaPlanGrid channels={channels} onChannelsChange={setChannels} commission={commission} onCommissionChange={setCommission} />
            </div>
          </div>
        )}

        {/* ── Step 3: Connect Platforms ──────────────────────────────────────── */}
        {step === 3 && clientId && (
          <div className="max-w-xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Connect Ad Platforms</h2>
                <p className="text-sm text-gray-500 mt-1">Connect whichever platforms you run ads on for this client</p>
              </div>
              <button onClick={goToDashboard} className="text-xs text-gray-400 hover:text-gray-600 underline">Skip for now</button>
            </div>

            <Card style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18 }}>
              <CardContent className="pt-6 space-y-3">
                {isCheckingConnections ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <>
                    {PLATFORMS.map((platform) => {
                      const connected = connectionStatus[platform.id];
                      const connecting = connectingPlatform === platform.id;
                      return (
                        <div
                          key={platform.id}
                          className={`flex items-center gap-4 p-3 rounded-xl border transition-colors ${connected ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'} ${platform.comingSoon ? 'opacity-50' : ''}`}
                        >
                          <div className="flex-shrink-0">
                            <PlatformLogo id={platform.id} size={28} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{platform.label}</p>
                            <p className="text-xs text-gray-400">{platform.description}</p>
                          </div>
                          {platform.comingSoon ? (
                            <span className="text-xs text-gray-400 font-medium px-2 py-1 bg-gray-100 rounded-full">Soon</span>
                          ) : connected ? (
                            <span className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
                              <CheckCircle2 className="h-4 w-4" />
                              Connected
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleConnectPlatform(platform.id)}
                              disabled={!!connectingPlatform}
                              className="text-xs"
                            >
                              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Connect'}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </CardContent>
            </Card>

            <Button
              onClick={handleAdvanceToStep4}
              disabled={isCheckingConnections}
              className="w-full"
              variant={anyConnected ? 'default' : 'outline'}
            >
              {anyConnected ? (
                <>Continue to Load Accounts<ArrowRight className="h-4 w-4 ml-2" /></>
              ) : (
                <>Skip accounts — go to dashboard</>
              )}
            </Button>
          </div>
        )}

        {/* ── Step 4: Configure Accounts ─────────────────────────────────────── */}
        {step === 4 && (
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Load Ad Accounts</h2>
                <p className="text-sm text-gray-500 mt-1">Select the accounts you want to track for this client</p>
              </div>
              <button onClick={goToDashboard} className="text-xs text-gray-400 hover:text-gray-600 underline">Skip for now</button>
            </div>

            {!anyConnected && (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
                No platforms connected yet. Go back to connect a platform first, or skip to the dashboard.
              </div>
            )}

            {/* Meta Ads section */}
            {connectionStatus.facebook && (
              <Card style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18 }}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <PlatformLogo id="facebook" size={20} />
                    <CardTitle className="text-base">Meta Ads Accounts</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {metaLoading ? (
                    <div className="flex items-center justify-center py-8 gap-3">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                      <span className="text-sm text-gray-500">Loading from Meta&hellip;</span>
                    </div>
                  ) : metaError && metaDiscovered.length === 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{metaError}</p>
                      <Button variant="outline" size="sm" onClick={discoverMetaAccounts}>
                        <RefreshCw className="h-3.5 w-3.5 mr-2" />Try Again
                      </Button>
                    </div>
                  ) : metaSaved ? (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                      <CheckCircle2 className="h-4 w-4" />
                      {metaSelected.size} account{metaSelected.size !== 1 ? 's' : ''} saved
                    </div>
                  ) : (
                    <>
                      {metaDiscovered.length > 0 && (
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Found {metaDiscovered.length} account{metaDiscovered.length !== 1 ? 's' : ''}</span>
                          <button className="text-blue-600 hover:underline" onClick={() =>
                            metaDiscovered.every(a => metaSelected.has(a.accountId))
                              ? setMetaSelected(new Set())
                              : setMetaSelected(new Set(metaDiscovered.map(a => a.accountId)))
                          }>
                            {metaDiscovered.every(a => metaSelected.has(a.accountId)) ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>
                      )}
                      {metaDiscovered.length > 5 && (
                        <Input placeholder="Search accounts&hellip;" value={metaSearch} onChange={e => setMetaSearch(e.target.value)} className="text-sm" />
                      )}
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {metaDiscovered
                          .filter(a => a.accountName.toLowerCase().includes(metaSearch.toLowerCase()) || a.accountId.includes(metaSearch))
                          .map(account => (
                            <label key={account.accountId} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${metaSelected.has(account.accountId) ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                              <input type="checkbox" checked={metaSelected.has(account.accountId)} onChange={() => toggleMetaAccount(account.accountId)} className="w-4 h-4 text-blue-600 rounded" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{account.accountName}</p>
                                <p className="text-xs text-gray-400 font-mono">{account.accountId} · {account.currency}</p>
                              </div>
                            </label>
                          ))
                        }
                      </div>
                      <Button size="sm" onClick={saveMetaAccounts} disabled={metaSaving || metaSelected.size === 0} className="w-full">
                        {metaSaving ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Saving&hellip;</> : `Save ${metaSelected.size > 0 ? metaSelected.size + ' ' : ''}Account${metaSelected.size !== 1 ? 's' : ''}`}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Google Ads section */}
            {connectionStatus['google-ads'] && (
              <Card style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18 }}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <PlatformLogo id="google-ads" size={20} />
                    <CardTitle className="text-base">Google Ads Accounts</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {gadsMsg && (
                    <p className={`text-sm rounded-lg p-2.5 border ${gadsMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                      {gadsMsg.text}
                    </p>
                  )}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Customer ID (123-456-7890)"
                        value={gadsCustomerId}
                        onChange={e => setGadsCustomerId(e.target.value)}
                        className="text-sm font-mono"
                      />
                      <Input
                        placeholder="Name (optional)"
                        value={gadsAccountName}
                        onChange={e => setGadsAccountName(e.target.value)}
                        className="text-sm"
                      />
                      <Button size="sm" onClick={addGadsAccount} disabled={gadsSaving || !gadsCustomerId.trim()}>
                        {gadsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400">Find your 10-digit Customer ID in the top-right of Google Ads</p>
                  </div>
                  {gadsLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : gadsSaved.length > 0 ? (
                    <div className="space-y-2">
                      {gadsSaved.map(acc => (
                        <div key={acc.id} className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 bg-white">
                          <div>
                            <p className="text-sm font-mono font-medium text-gray-900">{acc.displayCustomerId}</p>
                            {acc.accountName && <p className="text-xs text-gray-400">{acc.accountName}</p>}
                          </div>
                          <button onClick={() => removeGadsAccount(acc.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-center text-gray-400 py-2">No accounts added yet</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Google Analytics section */}
            {connectionStatus['google-analytics'] && (
              <Card style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18 }}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <PlatformLogo id="google-analytics" size={20} />
                    <CardTitle className="text-base">Google Analytics Properties</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {gaLoading ? (
                    <div className="flex items-center justify-center py-8 gap-3">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                      <span className="text-sm text-gray-500">Discovering properties&hellip;</span>
                    </div>
                  ) : gaError && gaDiscovered.length === 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{gaError}</p>
                      <Button variant="outline" size="sm" onClick={discoverGaAccounts}>
                        <RefreshCw className="h-3.5 w-3.5 mr-2" />Try Again
                      </Button>
                    </div>
                  ) : gaSaved ? (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                      <CheckCircle2 className="h-4 w-4" />
                      {gaSelected.size} propert{gaSelected.size !== 1 ? 'ies' : 'y'} saved
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {gaDiscovered.map(prop => (
                          <label key={prop.propertyId} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${gaSelected.has(prop.propertyId) ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                            <input type="checkbox" checked={gaSelected.has(prop.propertyId)} onChange={() => toggleGaAccount(prop.propertyId)} className="w-4 h-4 text-blue-600 rounded" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{prop.propertyName}</p>
                              <p className="text-xs text-gray-400 font-mono">{prop.propertyId} · {prop.accountName}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      <Button size="sm" onClick={saveGaAccounts} disabled={gaSaving || gaSelected.size === 0} className="w-full">
                        {gaSaving ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Saving&hellip;</> : `Save ${gaSelected.size > 0 ? gaSelected.size + ' ' : ''}Propert${gaSelected.size !== 1 ? 'ies' : 'y'}`}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Continue button */}
            <Button
              onClick={() => connectionStatus.facebook ? setStep(5) : goToDashboard()}
              className="w-full"
            >
              {connectionStatus.facebook ? (
                <>Continue to Link Campaigns<ArrowRight className="h-4 w-4 ml-2" /></>
              ) : (
                <>Finish Setup<Check className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </div>
        )}

        {/* ── Step 5: Link Campaigns ─────────────────────────────────────────── */}
        {step === 5 && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Link Campaigns</h2>
                <p className="text-sm text-gray-500 mt-1">Assign a Meta campaign to each channel in your media plan</p>
              </div>
              <button onClick={goToDashboard} className="text-xs text-gray-400 hover:text-gray-600 underline">Skip for now</button>
            </div>

            <Card style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18 }}>
              <CardContent className="pt-6 space-y-4">
                {campaignsLoading ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <p className="text-sm text-gray-500">Loading campaigns from Meta&hellip;</p>
                  </div>
                ) : namedChannels.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <p className="text-sm text-gray-500">No media channels configured.</p>
                    <p className="text-xs text-gray-400">You can link campaigns from the client dashboard after setting up your media plan.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {metaCampaigns.length === 0 && (
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                        No campaigns found in your saved Meta accounts. You can link campaigns later from the client dashboard.
                      </div>
                    )}
                    {metaCampaigns.length > 0 && (
                      <Input
                        placeholder="Search campaigns…"
                        value={campaignSearch}
                        onChange={(e) => setCampaignSearch(e.target.value)}
                        className="text-sm"
                      />
                    )}
                    {namedChannels.map((channel) => {
                      const filteredCampaigns = metaCampaigns.filter((c) =>
                        c.name.toLowerCase().includes(campaignSearch.toLowerCase())
                      );
                      return (
                      <div key={channel.id} className="flex items-center gap-4 p-3 rounded-xl border border-gray-200 bg-white">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {channel.customChannelName || channel.channelName}
                          </p>
                          {channel.channelSubType && (
                            <p className="text-xs text-gray-400">{channel.channelSubType}</p>
                          )}
                        </div>
                        <div className="w-56 flex-shrink-0">
                          <Select
                            value={channelCampaignMap[channel.id] ?? '__none__'}
                            onValueChange={(val) =>
                              setChannelCampaignMap((prev) => ({ ...prev, [channel.id]: val === '__none__' ? '' : val }))
                            }
                          >
                            <SelectTrigger className="text-sm">
                              <SelectValue placeholder="Select campaign…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No campaign</SelectItem>
                              {filteredCampaigns.length === 0 && campaignSearch ? (
                                <div className="py-2 px-3 text-xs text-gray-400">No campaigns match "{campaignSearch}"</div>
                              ) : (
                                filteredCampaigns.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      );
                    })}
                    <Button onClick={saveCampaigns} disabled={campaignsSaving} className="w-full mt-2">
                      {campaignsSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving&hellip;</> : <>Finish Setup<Check className="h-4 w-4 ml-2" /></>}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
