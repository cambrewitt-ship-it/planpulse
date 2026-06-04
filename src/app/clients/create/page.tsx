'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createDbClient, updateClientLogoUrl } from '@/lib/db/plans';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import Nango from '@nangohq/frontend';
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
  Building2,
  BarChart2,
  Target,
  FileText,
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
import { MediaPlanChannel, MediaFlight } from '@/components/media-plan-builder/media-plan-grid';
import { UploadWizard } from '@/components/sandbox/upload-wizard';
import { PlanGrid } from '@/components/sandbox/plan-grid';
import type { SandboxPlan } from '@/components/sandbox/types';
import Image from 'next/image';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
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

interface DiscoveredGadsAccount {
  customerId: string;
  descriptiveName: string | null;
  isManager: boolean;
  managerCustomerId: string | null;
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  accountId: string;
  accountName: string | null;
}

interface GoogleCampaign {
  id: string;
  name: string;
}

interface LinkableRow {
  id: string;
  channelName: string;
  detail: string;
  channelId: string;
  platform: 'meta' | 'google';
}

interface IntelDocument {
  id: string;
  file_name: string;
  file_type: string;
}

// ── Static data ───────────────────────────────────────────────────────────────

const STEPS: { num: Step; label: string; icon: React.ElementType }[] = [
  { num: 1, label: 'Details', icon: Building2 },
  { num: 2, label: 'Plan', icon: BarChart2 },
  { num: 3, label: 'Connect', icon: Wifi },
  { num: 4, label: 'Accounts', icon: List },
  { num: 5, label: 'Campaigns', icon: GitBranch },
  { num: 6, label: 'Goal', icon: Target },
  { num: 7, label: 'Intel', icon: FileText },
];

const PLATFORMS: Platform[] = [
  { id: 'facebook', label: 'Meta Ads', description: 'Facebook & Instagram advertising' },
  { id: 'google-ads', label: 'Google Ads', description: 'Search, Display & YouTube ads' },
  { id: 'google-analytics', label: 'Google Analytics', description: 'Website & app analytics' },
  { id: 'linkedin', label: 'LinkedIn Ads', description: 'B2B advertising', comingSoon: true },
  { id: 'tiktok', label: 'TikTok Ads', description: 'Short-form video ads', comingSoon: true },
];

const GOAL_METRICS = [
  { value: 'CPA', label: 'CPA – Cost per Acquisition' },
  { value: 'CPC', label: 'CPC – Cost per Click' },
  { value: 'CPL', label: 'CPL – Cost per Lead' },
  { value: 'ROAS', label: 'ROAS – Return on Ad Spend' },
  { value: 'CTR', label: 'CTR – Click-through Rate (%)' },
  { value: 'CPM', label: 'CPM – Cost per 1,000 Impressions' },
  { value: 'Conversions', label: 'Conversions' },
  { value: 'Clicks', label: 'Clicks' },
  { value: 'Impressions', label: 'Impressions' },
];

const INTEL_FILE_TYPES = [
  { value: 'brief', label: 'Brief' },
  { value: 'brand_guidelines', label: 'Brand Guidelines' },
  { value: 'biz_info', label: 'Business Info' },
  { value: 'tov', label: 'Tone of Voice' },
  { value: 'contract', label: 'Contract' },
  { value: 'rate_card', label: 'Rate Card' },
  { value: 'media_schedule', label: 'Media Schedule' },
  { value: 'handover_notes', label: 'Handover Notes' },
  { value: 'other', label: 'Other' },
];

const META_DEFAULT_EVENTS: Array<{ name: string; count: number }> = [
  { name: 'offsite_conversion.fb_pixel_purchase', count: 0 },
  { name: 'offsite_conversion.fb_pixel_lead', count: 0 },
  { name: 'offsite_conversion.fb_pixel_complete_registration', count: 0 },
  { name: 'offsite_conversion.fb_pixel_add_to_cart', count: 0 },
  { name: 'offsite_conversion.fb_pixel_initiate_checkout', count: 0 },
  { name: 'offsite_conversion.fb_pixel_view_content', count: 0 },
  { name: 'offsite_conversion.fb_pixel_contact', count: 0 },
  { name: 'offsite_conversion.fb_pixel_schedule', count: 0 },
  { name: 'mobile_app_install', count: 0 },
  { name: 'link_click', count: 0 },
];

const GA4_DEFAULT_EVENTS: string[] = [
  'purchase', 'generate_lead', 'begin_checkout', 'add_to_cart',
  'view_item', 'sign_up', 'form_submit', 'page_view',
];

const GOOGLE_ADS_DEFAULT_CONVERSIONS: string[] = [
  'Purchase', 'Lead', 'Sign-up', 'Add to cart', 'Begin checkout',
  'Contact', 'Submit lead form', 'Book appointment', 'Request quote',
  'Get directions', 'Phone call leads', 'Outbound click', 'Download',
];

const META_ACTION_LABELS: Record<string, string> = {
  'offsite_conversion.fb_pixel_purchase':              'Purchases',
  'offsite_conversion.fb_pixel_add_to_cart':           'Add to Cart',
  'offsite_conversion.fb_pixel_initiate_checkout':     'Checkout Started',
  'offsite_conversion.fb_pixel_complete_registration': 'Registrations',
  'offsite_conversion.fb_pixel_lead':                  'Pixel Leads',
  'offsite_conversion.fb_pixel_view_content':          'Content Views',
  'offsite_conversion.fb_pixel_contact':               'Contact',
  'offsite_conversion.fb_pixel_schedule':              'Schedule',
  'link_click':                                        'Link Clicks',
  'mobile_app_install':                                'App Installs',
};

function metaActionLabel(key: string): string {
  return META_ACTION_LABELS[key] ??
    key.replace('offsite_conversion.fb_pixel_', '')
       .replace('offsite_conversion.', '')
       .replace(/_/g, ' ')
       .replace(/\b\w/g, c => c.toUpperCase());
}

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
  const [channels, setChannels] = useState<MediaPlanChannel[]>([]);
  const [commission] = useState(0);
  const [sandboxPlan, setSandboxPlan] = useState<SandboxPlan | null>(null);
  const [sandboxPlanHydrated, setSandboxPlanHydrated] = useState(false);

  // ── Step 6: Performance Goal ──
  const [goalMetric, setGoalMetric] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalMetricSource, setGoalMetricSource] = useState<'ad' | 'meta' | 'google-ads' | 'ga4'>('meta');
  const [goalGoogleAdsConversionAction, setGoalGoogleAdsConversionAction] = useState('');
  const [goalMetaActionType, setGoalMetaActionType] = useState('');
  const [goalGa4EventName, setGoalGa4EventName] = useState('');
  const [goalAvailableGa4Events, setGoalAvailableGa4Events] = useState<string[]>([]);
  const [goalAvailableMetaEvents, setGoalAvailableMetaEvents] = useState<Array<{ name: string; count: number }>>([]);
  const [goalEventsSyncing, setGoalEventsSyncing] = useState(false);
  const [goalMetaCustomEvent, setGoalMetaCustomEvent] = useState('');

  // ── Step 4: Client Intel Hub ──
  const [intelDocs, setIntelDocs] = useState<IntelDocument[]>([]);
  const [intelUploading, setIntelUploading] = useState(false);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [intelFileType, setIntelFileType] = useState('other');
  const [intelDragOver, setIntelDragOver] = useState(false);
  const intelFileRef = useRef<HTMLInputElement>(null);

  // ── Step 5: platform connection status ──
  const [connectionStatus, setConnectionStatus] = useState<Record<PlatformId, boolean>>({
    facebook: false,
    'google-ads': false,
    'google-analytics': false,
    linkedin: false,
    tiktok: false,
  });
  const [connectingPlatform, setConnectingPlatform] = useState<PlatformId | null>(null);
  const [isCheckingConnections, setIsCheckingConnections] = useState(false);

  // ── Step 6: Meta accounts ──
  const [metaDiscovered, setMetaDiscovered] = useState<DiscoveredMetaAccount[]>([]);
  const [metaSelected, setMetaSelected] = useState<Set<string>>(new Set());
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaSearch, setMetaSearch] = useState('');
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);

  // ── Step 6: Google Ads accounts ──
  const [gadsCustomerId, setGadsCustomerId] = useState('');
  const [gadsAccountName, setGadsAccountName] = useState('');
  const [gadsSaved, setGadsSaved] = useState<SavedGadsAccount[]>([]);
  const [gadsSaving, setGadsSaving] = useState(false);
  const [gadsLoading, setGadsLoading] = useState(false);
  const [gadsMsg, setGadsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [gadsDiscovering, setGadsDiscovering] = useState(false);
  const [gadsDiscovered, setGadsDiscovered] = useState<DiscoveredGadsAccount[]>([]);
  const [gadsSelected, setGadsSelected] = useState<Set<string>>(new Set());
  const [gadsSearch, setGadsSearch] = useState('');
  const [gadsSavingSelected, setGadsSavingSelected] = useState(false);

  // ── Step 6: Google Analytics properties ──
  const [gaDiscovered, setGaDiscovered] = useState<DiscoveredGAAccount[]>([]);
  const [gaSelected, setGaSelected] = useState<Set<string>>(new Set());
  const [gaLoading, setGaLoading] = useState(false);
  const [gaError, setGaError] = useState<string | null>(null);
  const [gaSaving, setGaSaving] = useState(false);
  const [gaSaved, setGaSaved] = useState(false);

  // ── Step 7: campaigns ──
  const [metaCampaigns, setMetaCampaigns] = useState<MetaCampaign[]>([]);
  const [googleCampaigns, setGoogleCampaigns] = useState<GoogleCampaign[]>([]);
  const [channelCampaignMap, setChannelCampaignMap] = useState<Record<string, string[]>>({});
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsSaving, setCampaignsSaving] = useState(false);
  const [openCampaignDropdown, setOpenCampaignDropdown] = useState<string | null>(null);
  const [campaignSearchMap, setCampaignSearchMap] = useState<Record<string, string>>({});
  const [showGadsModal, setShowGadsModal] = useState(false);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const saveChannelsToApi = async (chs: MediaPlanChannel[]) => {
    if (!clientId || chs.length === 0) return;
    const serialized = chs.map((ch) => ({
      ...ch,
      flights: (ch.flights ?? []).map((f: any) => ({
        ...f,
        startWeek: f.startWeek instanceof Date ? f.startWeek.toISOString() : f.startWeek,
        endWeek: f.endWeek instanceof Date ? f.endWeek.toISOString() : f.endWeek,
      })),
    }));
    await fetch(`/api/clients/${clientId}/media-plan-builder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channels: serialized, commission }),
    });
  };

  const goToDashboard = () =>
    router.push(clientId ? `/clients/${clientId}/dashboard` : '/dashboard');

  const namedChannels = channels.filter((ch) => ch.channelName?.trim());

  const linkableChannels = namedChannels.filter((ch) => {
    const name = ((ch.customChannelName || ch.channelName) ?? '').toLowerCase();
    return ['meta', 'facebook', 'instagram', 'google', 'youtube', 'search', 'display', 'shopping', 'pmax', 'performance max'].some((kw) => name.includes(kw));
  });

  const META_KWS = ['meta', 'facebook', 'instagram'];
  const GOOGLE_KWS = ['google', 'youtube', 'search', 'display', 'shopping', 'pmax', 'performance max'];
  const LINKABLE_KWS = [...META_KWS, ...GOOGLE_KWS];
  const detectRowPlatform = (name: string): 'meta' | 'google' =>
    META_KWS.some((kw) => name.toLowerCase().includes(kw)) ? 'meta' : 'google';
  const linkableRows: LinkableRow[] = (() => {
    if (sandboxPlan) {
      const seen = new Set<string>();
      const rows: LinkableRow[] = [];
      for (const row of sandboxPlan.rows) {
        const channelRaw = (row.channel ?? '').trim();
        const funnelRaw = (row.funnel ?? '').trim();
        // Fall back to funnel if channel is empty (can happen when the parser assigns channels to the funnel column)
        const channelName = channelRaw || (LINKABLE_KWS.some(kw => funnelRaw.toLowerCase().includes(kw)) ? funnelRaw : '');
        if (!channelName) continue;
        if (!LINKABLE_KWS.some((kw) => channelName.toLowerCase().includes(kw))) continue;
        const detail = (row.detail ?? '').trim();
        const rowId = `${channelName}::${detail}`;
        if (seen.has(rowId)) continue;
        seen.add(rowId);
        const matchingChannel = channels.find((ch) => (ch.channelName ?? '').trim() === channelName);
        rows.push({ id: rowId, channelName, detail, channelId: matchingChannel?.id ?? channelName, platform: detectRowPlatform(channelName) });
      }
      return rows;
    }
    return linkableChannels.map((ch) => {
      const name = (ch.customChannelName || ch.channelName) ?? '';
      return { id: ch.id, channelName: name, detail: ch.channelSubType ?? '', channelId: ch.id, platform: detectRowPlatform(name) };
    });
  })();

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
    if (clientId) { setStep(2); return; }
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
          // Always parse the URL — the route returns it even when its own DB update fails.
          const uploadedUrl: string | null = await res.json()
            .then((d: { url?: string }) => d?.url ?? null)
            .catch(() => null);
          if (uploadedUrl) {
            await updateClientLogoUrl(newId, uploadedUrl);
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

  const sandboxPlanToChannels = (plan: SandboxPlan): MediaPlanChannel[] => {
    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    // Collect flights per channel, deduped by flight ID (skip slave rows which share a flight group)
    const channelMap = new Map<string, { subType?: string; flightMap: Map<string, { startWeek: string; endWeek: string; budget: number; color: string; id: string }> }>();

    const LINKABLE_KWS_LOCAL = ['meta', 'facebook', 'instagram', 'google', 'youtube', 'search', 'display', 'shopping', 'pmax', 'performance max'];
    for (const row of plan.rows) {
      const channelRaw = row.channel?.trim();
      const funnelRaw = row.funnel?.trim();
      // Fall back to funnel when channel is empty and the funnel value looks like a paid platform
      const key = channelRaw || (funnelRaw && LINKABLE_KWS_LOCAL.some(kw => funnelRaw.toLowerCase().includes(kw)) ? funnelRaw : '');
      if (!key) continue;
      if (!channelMap.has(key)) channelMap.set(key, { subType: row.detail?.trim() || undefined, flightMap: new Map() });
      if (row.isMasterRow === false) continue;
      for (const f of row.flights ?? []) {
        if (f.startWeek && f.endWeek && !channelMap.get(key)!.flightMap.has(f.id)) {
          channelMap.get(key)!.flightMap.set(f.id, f);
        }
      }
    }

    return Array.from(channelMap.entries()).map(([channelName, { subType, flightMap }]) => {
      const mediaFlights: MediaFlight[] = Array.from(flightMap.values()).map((sbFlight) => {
        const startDate = new Date(sbFlight.startWeek);
        const endDate = new Date(sbFlight.endWeek);
        const numWeeks = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_WEEK) + 1);
        const weeklyBudget = sbFlight.budget / numWeeks;

        const monthlySpend: Record<string, number> = {};
        let week = new Date(startDate);
        while (week <= endDate) {
          const monthKey = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, '0')}`;
          monthlySpend[monthKey] = (monthlySpend[monthKey] ?? 0) + weeklyBudget;
          week = new Date(week.getTime() + MS_PER_WEEK);
        }

        return { id: `sb-${sbFlight.id}`, startWeek: startDate, endWeek: endDate, monthlySpend, color: sbFlight.color, weeklyBudget };
      });

      const totalBudget = mediaFlights.reduce((sum, f) => sum + Object.values(f.monthlySpend).reduce((a, b) => a + b, 0), 0);

      return {
        id: `sandbox-${channelName.replace(/\s+/g, '-').toLowerCase()}`,
        channelName,
        channelSubType: subType,
        format: '',
        percentOfInvestment: 0,
        totalBudget,
        flights: mediaFlights,
      };
    });
  };

  useEffect(() => {
    if (!clientId) return;
    const raw = localStorage.getItem(`planpulse_sandbox_plan_${clientId}`);
    if (raw) {
      const plan: SandboxPlan = JSON.parse(raw);
      setSandboxPlan(plan);
      setChannels(sandboxPlanToChannels(plan));
    }
    setSandboxPlanHydrated(true);
  }, [clientId]);

  const handleSandboxPlanChange = (updated: SandboxPlan) => {
    setSandboxPlan(updated);
    setChannels(sandboxPlanToChannels(updated));
    try { localStorage.setItem(`planpulse_sandbox_plan_${clientId}`, JSON.stringify(updated)); } catch {}
  };
  const handleSandboxPlanLoaded = (loaded: SandboxPlan) => handleSandboxPlanChange(loaded);
  const handleSandboxPlanUpload = () => {
    setSandboxPlan(null);
    setChannels([]);
    try { localStorage.removeItem(`planpulse_sandbox_plan_${clientId}`); } catch {}
  };

  // ── Step 3 handlers: Performance Goal ────────────────────────────────────────

  const handleSaveGoal = async () => {
    if (!clientId) { setStep(7); return; }
    if (!goalMetric || !goalTarget) { setStep(7); return; }
    setGoalSaving(true);
    try {
      await fetch(`/api/clients/${clientId}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'overarching',
          metric: goalMetric,
          target_value: parseFloat(goalTarget),
          is_primary: true,
        }),
      });
      try {
        localStorage.setItem(`perf_widget_${clientId}`, JSON.stringify({
          platform: '',
          campaignIds: [],
          metricSource: goalMetricSource,
          ga4EventName: goalGa4EventName,
          metaActionType: goalMetaActionType === '__custom__' ? goalMetaCustomEvent.trim() : goalMetaActionType,
          googleAdsConversionAction: goalGoogleAdsConversionAction === '__custom__' ? '' : goalGoogleAdsConversionAction,
        }));
      } catch {}
    } catch {}
    setGoalSaving(false);
    setStep(7);
  };

  // ── Step 4 handlers: Client Intel Hub ────────────────────────────────────────

  const handleIntelUpload = async (file: File) => {
    if (!clientId) return;
    setIntelUploading(true);
    setIntelError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('file_type', intelFileType);
      const res = await fetch(`/api/clients/${clientId}/documents`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setIntelError(data.error ?? 'Upload failed'); return; }
      setIntelDocs(prev => [{ id: data.document.id, file_name: data.document.file_name, file_type: data.document.file_type }, ...prev]);
    } catch {
      setIntelError('Upload failed. Please try again.');
    }
    setIntelUploading(false);
  };

  const handleIntelFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleIntelUpload(file);
    e.target.value = '';
  };

  const handleIntelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIntelDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleIntelUpload(file);
  };

  // ── Step 5 handlers: Connect Platforms ───────────────────────────────────────

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

  const handleConnectPlatform = async (platformId: PlatformId, onConnected?: () => void) => {
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
                onConnected?.();
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
    if (connectionStatus['google-ads']) discoverGadsAccounts();
    if (connectionStatus['google-analytics']) discoverGaAccounts();
  };

  // ── Step 6: Meta Ads ──────────────────────────────────────────────────────────

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
        body: JSON.stringify({ accounts, clientId }),
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

  // ── Step 6: Google Ads ────────────────────────────────────────────────────────

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

  const formatGadsId = (id: string) => id.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');

  const discoverGadsAccounts = async () => {
    setGadsDiscovering(true);
    setGadsMsg(null);
    setGadsDiscovered([]);
    setGadsSelected(new Set());
    setGadsSearch('');
    try {
      const res = await fetch('/api/ads/google-ads/accounts');
      const data = await res.json();
      if (!res.ok) {
        setGadsMsg({ type: 'error', text: data.error ?? 'Failed to discover accounts.' });
        return;
      }
      const advertiserAccounts: DiscoveredGadsAccount[] = (data.accounts ?? []).filter((a: DiscoveredGadsAccount) => !a.isManager);
      if (advertiserAccounts.length === 0) {
        setGadsMsg({ type: 'error', text: 'No advertiser accounts found. Make sure you connected with the right Google account.' });
        return;
      }
      setGadsDiscovered(advertiserAccounts);
      setGadsSelected(new Set()); // user picks what they want
    } catch {
      setGadsMsg({ type: 'error', text: 'Failed to discover accounts. Please try again.' });
    }
    setGadsDiscovering(false);
  };

  const toggleGadsAccount = (customerId: string) => {
    setGadsSelected(prev => {
      const next = new Set(prev);
      next.has(customerId) ? next.delete(customerId) : next.add(customerId);
      return next;
    });
  };

  const saveSelectedGadsAccounts = async () => {
    if (gadsSelected.size === 0) return;
    setGadsSavingSelected(true);
    setGadsMsg(null);
    try {
      const toSave = gadsDiscovered.filter(a => gadsSelected.has(a.customerId));
      await Promise.all(toSave.map(a =>
        fetch('/api/ads/google-ads/save-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: a.customerId,
            accountName: a.descriptiveName ?? undefined,
            managerCustomerId: a.managerCustomerId ?? undefined,
          }),
        })
      ));
      // Update the saved list from what was just saved — no DB fetch so we don't pull in other clients' accounts
      const newlySaved: SavedGadsAccount[] = toSave.map(a => ({
        id: a.customerId,
        customerId: a.customerId,
        displayCustomerId: formatGadsId(a.customerId),
        accountName: a.descriptiveName ?? null,
      }));
      setGadsSaved(prev => {
        const existing = new Set(prev.map(p => p.customerId));
        return [...prev, ...newlySaved.filter(n => !existing.has(n.customerId))];
      });
      setGadsDiscovered([]);
      setGadsSelected(new Set());
      setGadsMsg({ type: 'success', text: `${toSave.length} account${toSave.length > 1 ? 's' : ''} saved.` });
      setTimeout(() => setGadsMsg(null), 3000);
    } catch {
      setGadsMsg({ type: 'error', text: 'Failed to save accounts. Please try again.' });
    }
    setGadsSavingSelected(false);
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
        const cleanId = gadsCustomerId.replace(/[-\s]/g, '');
        const name = gadsAccountName.trim() || null;
        setGadsSaved(prev => {
          if (prev.some(p => p.customerId === cleanId)) return prev;
          return [...prev, { id: cleanId, customerId: cleanId, displayCustomerId: formatGadsId(cleanId), accountName: name }];
        });
        setGadsCustomerId('');
        setGadsAccountName('');
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
      setGadsSaved(prev => prev.filter(a => a.id !== accountId));
    } catch {}
  };

  // ── Step 6: Google Analytics ──────────────────────────────────────────────────

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

  // ── Step 7 handlers ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (step === 5 && (connectionStatus.facebook || connectionStatus['google-ads'])) loadCampaigns();
  }, [step]);

  useEffect(() => {
    if (!openCampaignDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-campaign-dropdown]')) setOpenCampaignDropdown(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openCampaignDropdown]);

  const loadCampaigns = async () => {
    setCampaignsLoading(true);
    try {
      await Promise.all([
        connectionStatus.facebook
          ? fetch(clientId ? `/api/ads/meta/campaigns?clientId=${clientId}` : '/api/ads/meta/campaigns')
              .then(r => r.ok ? r.json() : null)
              .then(data => {
                if (data?.campaigns) {
                  const raw: MetaCampaign[] = data.campaigns ?? [];
                  setMetaCampaigns(Array.from(new Map(raw.map((c) => [c.id, c])).values()));
                }
              })
              .catch(() => {})
          : Promise.resolve(),
        connectionStatus['google-ads'] && gadsSaved.length > 0
          ? (() => {
              const ids = gadsSaved.map(a => a.customerId).join(',');
              const url = clientId
                ? `/api/ads/google-ads/campaigns?clientId=${clientId}&customerIds=${ids}`
                : `/api/ads/google-ads/campaigns?customerIds=${ids}`;
              return fetch(url)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                  if (data?.campaigns) {
                    setGoogleCampaigns(data.campaigns.map((c: any) => ({ id: c.id, name: c.name })));
                  }
                })
                .catch(() => {});
            })()
          : Promise.resolve(),
      ]);
    } catch {}
    setCampaignsLoading(false);
  };

  const saveCampaigns = async () => {
    if (!clientId) return;
    setCampaignsSaving(true);
    try {
      const channelCampaignsAgg: Record<string, string[]> = {};
      for (const row of linkableRows) {
        const ids = channelCampaignMap[row.id] ?? [];
        if (!channelCampaignsAgg[row.channelId]) channelCampaignsAgg[row.channelId] = [];
        channelCampaignsAgg[row.channelId].push(...ids);
      }
      const updatedChannels = channels.map((ch) => {
        const campaignIds = (channelCampaignsAgg[ch.id] ?? []).filter(Boolean);
        if (campaignIds.length > 0) {
          const campaigns = metaCampaigns.filter((c) => campaignIds.includes(c.id));
          return {
            ...ch,
            metaCampaignId: campaignIds[0],
            metaCampaignName: campaigns[0]?.name ?? null,
            metaCampaignIds: campaignIds,
            metaCampaignNames: campaigns.map((c) => c.name),
          };
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
    setStep(6);
  };

  // Set a sensible default metric source when entering the performance goal step
  useEffect(() => {
    if (step !== 6) return;
    setGoalMetricSource(
      connectionStatus.facebook ? 'meta'
      : connectionStatus['google-ads'] ? 'google-ads'
      : 'ga4'
    );
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 6: fetch spend data then poll for conversion events ──────────────────
  // ad_performance_metrics (where events come from) is only populated when the
  // spend fetch APIs are called. We trigger those here for connected platforms so
  // the events appear with real counts without requiring a dashboard visit first.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step !== 6 || !clientId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    const MAX_POLLS = 20;

    const poll = async () => {
      try {
        const r = await fetch(`/api/clients/${clientId}/goals`);
        const json = r.ok ? await r.json() : null;
        if (stopped) return;
        if (json) {
          setGoalAvailableGa4Events(json.ga4Events ?? []);
          setGoalAvailableMetaEvents(json.metaEvents ?? []);
          const hasCounts = (json.metaEvents ?? []).some((e: { count: number }) => e.count > 0)
            || (json.ga4Events ?? []).length > 0;
          if (hasCounts || polls >= MAX_POLLS) {
            setGoalEventsSyncing(false);
            return;
          }
        }
      } catch {}
      if (!stopped && polls < MAX_POLLS) {
        polls++;
        timer = setTimeout(poll, 5000);
      } else {
        setGoalEventsSyncing(false);
      }
    };

    // Trigger spend data fetch so ad_performance_metrics gets populated for this client.
    // Fire-and-forget — polling below will pick up the data once it lands.
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    const startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (connectionStatus.facebook) {
      fetch('/api/ads/meta/fetch-spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, clientId }),
      }).catch(() => {});
    }
    if (connectionStatus['google-ads']) {
      fetch('/api/ads/fetch-spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'google-ads', startDate, endDate, clientId }),
      }).catch(() => {});
    }

    setGoalEventsSyncing(true);
    poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [step, clientId]); // connectionStatus captured at mount; won't change after Step 3

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: '#F5F3EF', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="container mx-auto px-4 py-8 max-w-5xl">

        {/* Back */}
        <div className="mb-8">
          {step === 1 ? (
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Clients
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setStep((prev) => (prev - 1) as Step)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
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
                  <div className={`w-10 h-0.5 mx-2 mb-5 flex-shrink-0 ${step > s.num ? 'bg-green-400' : 'bg-gray-200'}`} />
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
        {step === 2 && clientId && sandboxPlanHydrated && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Media Plan Builder</h2>
                <p className="text-sm text-gray-500 mt-1">Upload or build your media plan</p>
              </div>
              <Button onClick={async () => { await saveChannelsToApi(channels); setStep(3); }}>
                Continue<ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
            {sandboxPlan ? (
              <div style={{ height: 'calc(100vh - 220px)', borderRadius: 12, border: '1px solid rgba(232,228,220,0.7)', boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                <PlanGrid
                  plan={sandboxPlan}
                  onPlanChange={handleSandboxPlanChange}
                  onUpload={handleSandboxPlanUpload}
                  outerStyle={{ height: '100%' }}
                />
              </div>
            ) : (
              <div style={{ borderRadius: 12, border: '1px solid rgba(232,228,220,0.7)', boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                <UploadWizard onPlanLoaded={handleSandboxPlanLoaded} />
              </div>
            )}
          </div>
        )}

        {/* ── Step 6: Performance Goal ───────────────────────────────────────── */}
        {step === 6 && clientId && (() => {
          const mergedMetaEvents = [
            ...goalAvailableMetaEvents,
            ...META_DEFAULT_EVENTS.filter(d => !goalAvailableMetaEvents.some(e => e.name === d.name)),
          ];
          const mergedGa4Events = [
            ...goalAvailableGa4Events,
            ...GA4_DEFAULT_EVENTS.filter(d => !goalAvailableGa4Events.includes(d)),
          ];
          const showMetaEvents = (goalMetricSource === 'meta' || goalMetricSource === 'ad') && connectionStatus.facebook;
          const showGoogleAdsConversion = goalMetricSource === 'google-ads' && connectionStatus['google-ads'];
          const showGa4Events = goalMetricSource === 'ga4';
          return (
            <Card className="max-w-lg mx-auto" style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18 }}>
              <CardHeader>
                <CardTitle>Performance Goal</CardTitle>
                <CardDescription>Set your primary KPI and the conversion event to measure against</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* KPI + Target */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="goal-metric">Primary KPI</Label>
                      {!goalMetric && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex-shrink-0">!</span>
                      )}
                    </div>
                    <select
                      id="goal-metric"
                      value={goalMetric}
                      onChange={(e) => setGoalMetric(e.target.value)}
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Select a metric…</option>
                      {GOAL_METRICS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="goal-target">Target Value</Label>
                      {!goalTarget && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex-shrink-0">!</span>
                      )}
                    </div>
                    <Input
                      id="goal-target"
                      type="number"
                      min="0"
                      step="any"
                      value={goalTarget}
                      onChange={(e) => setGoalTarget(e.target.value)}
                      placeholder="e.g. 25.00"
                    />
                  </div>
                </div>

                {/* Conversion Source toggle */}
                <div className="grid gap-2">
                  <Label>Conversion Source</Label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      ...(connectionStatus.facebook ? [{ id: 'meta' as const, label: 'Meta' }] : []),
                      ...(connectionStatus['google-ads'] ? [{ id: 'google-ads' as const, label: 'Google Ads' }] : []),
                      { id: 'ga4' as const, label: 'GA4' },
                    ].map((src) => (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => setGoalMetricSource(src.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          goalMetricSource === src.id
                            ? 'bg-[rgba(74,101,128,0.1)] border-[#4A6580] text-[#4A6580]'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {src.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    {goalMetricSource === 'ga4'
                      ? 'Uses GA4 event count as the conversion denominator for cost metrics'
                      : goalMetricSource === 'google-ads'
                        ? 'Uses Google Ads reported conversions'
                        : 'Uses Meta reported actions / conversions'}
                  </p>
                </div>

                {/* GA4 Conversion Event */}
                {showGa4Events && (
                  <div className="grid gap-2">
                    <Label htmlFor="goal-ga4-event">GA4 Conversion Event</Label>
                    <select
                      id="goal-ga4-event"
                      value={goalGa4EventName}
                      onChange={(e) => setGoalGa4EventName(e.target.value)}
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">— select event —</option>
                      {mergedGa4Events.map((ev) => (
                        <option key={ev} value={ev}>{ev}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400">This event count becomes the denominator for CPA / CPL calculation</p>
                  </div>
                )}

                {/* Google Ads Conversion Action */}
                {showGoogleAdsConversion && (
                  <div className="grid gap-2">
                    <Label htmlFor="goal-gads-conversion">Google Ads Conversion Action</Label>
                    <select
                      id="goal-gads-conversion"
                      value={goalGoogleAdsConversionAction}
                      onChange={(e) => setGoalGoogleAdsConversionAction(e.target.value)}
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">— All Conversions (default) —</option>
                      {GOOGLE_ADS_DEFAULT_CONVERSIONS.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                      <option value="__custom__">Custom…</option>
                    </select>
                    {goalGoogleAdsConversionAction === '__custom__' && (
                      <input
                        type="text"
                        placeholder="Exact conversion action name from Google Ads"
                        onChange={(e) => setGoalGoogleAdsConversionAction(e.target.value)}
                        className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                      />
                    )}
                    <p className="text-xs text-gray-400">Used as the conversion count for CPA / CPL on the performance gauge</p>
                  </div>
                )}

                {/* Meta Conversion Event */}
                {showMetaEvents && (
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="goal-meta-event">Meta Conversion Event</Label>
                      {!goalMetaActionType && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex-shrink-0">!</span>
                      )}
                      {goalEventsSyncing && (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Syncing data…
                        </span>
                      )}
                    </div>
                    <select
                      id="goal-meta-event"
                      value={goalMetaActionType}
                      onChange={(e) => setGoalMetaActionType(e.target.value)}
                      disabled={goalEventsSyncing}
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">— auto-detect best event —</option>
                      {mergedMetaEvents.map((ev) => (
                        <option key={ev.name} value={ev.name}>
                          {metaActionLabel(ev.name)}{ev.count > 0 ? ` (${ev.count.toLocaleString()})` : ''}
                        </option>
                      ))}
                      <option value="__custom__">Custom event…</option>
                    </select>
                    {goalMetaActionType === '__custom__' && (
                      <Input
                        placeholder="e.g. offsite_conversion.fb_pixel_purchase"
                        value={goalMetaCustomEvent}
                        onChange={(e) => setGoalMetaCustomEvent(e.target.value)}
                        className="text-sm font-mono"
                      />
                    )}
                    <p className="text-xs text-gray-400">
                      {goalEventsSyncing
                        ? 'Fetching your conversion event counts from Meta — counts will appear shortly'
                        : 'Used as the conversion count for CPA / CPL on the performance gauge'}
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    onClick={handleSaveGoal}
                    disabled={goalSaving || !goalMetric || !goalTarget || (showMetaEvents && !goalMetaActionType)}
                    className="w-full"
                  >
                    {goalSaving
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                      : <>Save Goal & Continue<ArrowRight className="h-4 w-4 ml-2" /></>
                    }
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goToDashboard}
                    className="w-full bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  >
                    Set Up in Dashboard Later
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* ── Step 7: Client Intel Hub (optional final step) ─────────────────── */}
        {step === 7 && clientId && (
          <div className="max-w-xl mx-auto space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Client Intel Hub</h2>
              <p className="text-sm text-gray-500 mt-1">Upload documents for this client's intel hub — briefs, contracts, brand guidelines, and more. This step is optional.</p>
            </div>

            <Card style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18 }}>
              <CardContent className="pt-6 space-y-4">

                {/* File type selector */}
                <div className="grid gap-2">
                  <Label htmlFor="intel-file-type">Document Type</Label>
                  <select
                    id="intel-file-type"
                    value={intelFileType}
                    onChange={(e) => setIntelFileType(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {INTEL_FILE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIntelDragOver(true); }}
                  onDragLeave={() => setIntelDragOver(false)}
                  onDrop={handleIntelDrop}
                  onClick={() => intelFileRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${intelDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50'}`}
                >
                  {intelUploading ? (
                    <><Loader2 className="h-7 w-7 animate-spin text-blue-500" /><p className="text-sm text-gray-500">Uploading…</p></>
                  ) : (
                    <>
                      <Upload className="h-7 w-7 text-gray-400" />
                      <div className="text-center">
                        <p className="text-sm font-medium text-gray-700">Drop a file or click to browse</p>
                        <p className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT, CSV — up to 50 MB</p>
                      </div>
                    </>
                  )}
                </div>
                <input
                  ref={intelFileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.csv,.md,.xls,.xlsx,.ppt,.pptx"
                  className="hidden"
                  onChange={handleIntelFileInput}
                />

                {intelError && (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{intelError}</p>
                )}

                {/* Uploaded files list */}
                {intelDocs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploaded</p>
                    {intelDocs.map((doc) => {
                      const typeLabel = INTEL_FILE_TYPES.find(t => t.value === doc.file_type)?.label ?? doc.file_type;
                      return (
                        <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-green-200 bg-green-50">
                          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                            <p className="text-xs text-gray-400">{typeLabel}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </CardContent>
            </Card>

            <Button onClick={goToDashboard} className="w-full">
              Finish Setup<Check className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* ── Step 3: Connect Platforms ──────────────────────────────────────── */}
        {step === 3 && clientId && (
          <div className="max-w-xl mx-auto space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Connect Ad Platforms</h2>
              <p className="text-sm text-gray-500 mt-1">Connect whichever platforms you run ads on for this client</p>
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
            >
              Continue to Load Accounts<ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* ── Step 4: Configure Accounts ─────────────────────────────────────── */}
        {step === 4 && (
          <div className="max-w-2xl mx-auto space-y-5">
            <div>
              <h2 className="text-xl font-semibold">Load Ad Accounts</h2>
              <p className="text-sm text-gray-500 mt-1">Select the accounts you want to track for this client</p>
            </div>

            {!anyConnected && (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
                No platforms connected yet. Go back to connect a platform first.
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
                  {gadsMsg && (
                    <p className={`text-sm rounded-lg p-2.5 border ${gadsMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                      {gadsMsg.text}
                    </p>
                  )}

                  {/* Discover flow */}
                  {gadsDiscovering ? (
                    <div className="flex items-center justify-center py-6 gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                      <span className="text-sm text-gray-500">Finding accounts&hellip;</span>
                    </div>
                  ) : gadsDiscovered.length > 0 ? (
                    <>
                      <Input
                        placeholder="Search accounts…"
                        value={gadsSearch}
                        onChange={e => setGadsSearch(e.target.value)}
                        className="text-sm"
                      />
                      <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {gadsDiscovered
                          .filter(a => {
                            const q = gadsSearch.toLowerCase();
                            return !q || formatGadsId(a.customerId).includes(q) || (a.descriptiveName ?? '').toLowerCase().includes(q);
                          })
                          .map(a => {
                            const alreadySaved = gadsSaved.some(s => s.customerId === a.customerId);
                            return (
                              <label key={a.customerId} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${gadsSelected.has(a.customerId) ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                <input type="checkbox" checked={gadsSelected.has(a.customerId)} onChange={() => toggleGadsAccount(a.customerId)} className="w-4 h-4 text-blue-600 rounded" />
                                <span className="text-sm font-mono text-gray-900">
                                  {formatGadsId(a.customerId)}{a.descriptiveName ? ` | ${a.descriptiveName}` : ''}
                                </span>
                                {alreadySaved && <span className="ml-auto text-xs text-gray-400">saved</span>}
                              </label>
                            );
                          })}
                      </div>
                      <Button size="sm" onClick={saveSelectedGadsAccounts} disabled={gadsSavingSelected || gadsSelected.size === 0} className="w-full">
                        {gadsSavingSelected ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Saving&hellip;</> : `Save ${gadsSelected.size > 0 ? gadsSelected.size + ' ' : ''}Account${gadsSelected.size !== 1 ? 's' : ''}`}
                      </Button>
                      <button onClick={() => { setGadsDiscovered([]); setGadsSelected(new Set()); }} className="text-xs text-gray-400 hover:text-gray-600 w-full text-center">Cancel</button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={discoverGadsAccounts}
                        disabled={gadsDiscovering}
                        className="w-full"
                      >
                        Find my Google Ads accounts
                      </Button>
                      <div className="relative flex items-center gap-2">
                        <div className="flex-1 border-t border-gray-200" />
                        <span className="text-xs text-gray-400 shrink-0">or add manually</span>
                        <div className="flex-1 border-t border-gray-200" />
                      </div>
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
                    </>
                  )}

                  {/* Saved accounts list */}
                  {gadsLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : gadsSaved.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {gadsSaved.map(acc => (
                        <div key={acc.id} className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 bg-white">
                          <p className="text-sm font-mono text-gray-900">
                            {acc.displayCustomerId}{acc.accountName ? ` | ${acc.accountName}` : ''}
                          </p>
                          <button onClick={() => removeGadsAccount(acc.id)} className="text-gray-400 hover:text-red-500 transition-colors ml-3 shrink-0">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : gadsDiscovered.length === 0 ? (
                    <p className="text-xs text-center text-gray-400 py-2">No accounts added yet</p>
                  ) : null}
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
              onClick={() => connectionStatus.facebook ? setStep(5) : setStep(6)}
              disabled={connectionStatus.facebook ? !metaSaved : false}
              className={`w-full ${connectionStatus.facebook && !metaSaved ? 'bg-white text-gray-400 border border-gray-200 hover:bg-white' : ''}`}
            >
              {connectionStatus.facebook ? (
                <>Continue to Link Campaigns<ArrowRight className="h-4 w-4 ml-2" /></>
              ) : (
                <>Continue<ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </div>
        )}

        {/* ── Step 5: Link Campaigns ─────────────────────────────────────────── */}
        {step === 5 && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Link Campaigns</h2>
              <p className="text-sm text-gray-500 mt-1">Assign campaigns to your Meta and Google channels</p>
            </div>

            <Card style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18 }}>
              <CardContent className="pt-6 space-y-4">
                {campaignsLoading ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <p className="text-sm text-gray-500">Loading campaigns&hellip;</p>
                  </div>
                ) : linkableRows.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <p className="text-sm text-gray-500">No Meta or Google channels found in your media plan.</p>
                    <p className="text-xs text-gray-400">You can link campaigns from the client dashboard after setting up your media plan.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {linkableRows.map((row) => {
                      const selectedIds = channelCampaignMap[row.id] ?? [];
                      const platformLogoId: PlatformId = row.platform === 'meta' ? 'facebook' : 'google-ads';
                      const platformConnected = row.platform === 'meta' ? connectionStatus.facebook : connectionStatus['google-ads'];
                      const rowCampaigns = row.platform === 'meta' ? metaCampaigns : googleCampaigns;
                      const [dropOpen, setDropOpen] = [
                        openCampaignDropdown === row.id,
                        (v: boolean) => setOpenCampaignDropdown(v ? row.id : null),
                      ];
                      const [search, setSearch] = [
                        campaignSearchMap[row.id] ?? '',
                        (v: string) => setCampaignSearchMap(prev => ({ ...prev, [row.id]: v })),
                      ];
                      const filtered = rowCampaigns.filter((c) =>
                        c.name.toLowerCase().includes(search.toLowerCase())
                      );
                      const triggerLabel = selectedIds.length === 0
                        ? 'Select campaigns…'
                        : selectedIds.length === 1
                          ? (rowCampaigns.find(c => c.id === selectedIds[0])?.name ?? 'Select campaigns…')
                          : `${selectedIds.length} campaigns selected`;
                      return (
                      <div key={row.id} className="flex items-center gap-4 p-3 rounded-xl border border-gray-200 bg-white">
                        <div className="flex-shrink-0">
                          <PlatformLogo id={platformLogoId} size={22} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{row.channelName}</p>
                          {row.detail && (
                            <p className="text-xs text-gray-400 truncate">{row.detail}</p>
                          )}
                        </div>
                        {!platformConnected ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleConnectPlatform(platformLogoId, row.platform === 'google' ? () => {
                              setShowGadsModal(true);
                              fetchGadsAccounts();
                            } : undefined)}
                            disabled={!!connectingPlatform}
                            className="text-xs flex-shrink-0"
                          >
                            {connectingPlatform === platformLogoId
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : 'Connect'}
                          </Button>
                        ) : (
                        <div className="w-56 flex-shrink-0 relative" data-campaign-dropdown>
                          <button
                            type="button"
                            onClick={() => setDropOpen(!dropOpen)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-gray-200 rounded-md bg-white hover:bg-gray-50 focus:outline-none"
                          >
                            <span className="truncate text-left min-w-0 text-gray-700">{triggerLabel}</span>
                            <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                          {dropOpen && (
                            <div className="absolute z-50 top-full right-0 mt-1 w-96 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                              <div className="p-2 border-b border-gray-100">
                                <input
                                  autoFocus
                                  type="text"
                                  placeholder="Search campaigns…"
                                  value={search}
                                  onChange={(e) => setSearch(e.target.value)}
                                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                              <div className="max-h-52 overflow-y-auto">
                                {filtered.length === 0 ? (
                                  <div className="py-3 px-3 text-xs text-gray-400 text-center">No campaigns found</div>
                                ) : (
                                  filtered.map((c) => {
                                    const checked = selectedIds.includes(c.id);
                                    return (
                                      <button
                                        key={c.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          const rowId = row.id;
                                          const cId = c.id;
                                          setChannelCampaignMap(prev => {
                                            const cur = prev[rowId] ?? [];
                                            const isSelected = cur.includes(cId);
                                            return {
                                              ...prev,
                                              [rowId]: isSelected ? cur.filter(id => id !== cId) : [...cur, cId],
                                            };
                                          });
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                                      >
                                        <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                                          {checked && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none" stroke="currentColor"><path d="M1.5 5l2.5 2.5 4.5-4.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                        </span>
                                        <span className="text-gray-700 break-words">{c.name}</span>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                              {selectedIds.length > 0 && (
                                <div className="p-2 border-t border-gray-100">
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setChannelCampaignMap(prev => ({ ...prev, [row.id]: [] }))}
                                    className="text-xs text-gray-400 hover:text-gray-600"
                                  >
                                    Clear selection
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        )}
                      </div>
                      );
                    })}
                    <Button onClick={saveCampaigns} disabled={campaignsSaving} className="w-full mt-2">
                      {campaignsSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving&hellip;</> : <>Next<ArrowRight className="h-4 w-4 ml-2" /></>}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

      </div>

      {/* ── Google Ads account modal (triggered after OAuth connect in Step 6) ── */}
      {showGadsModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-md mx-4 rounded-2xl shadow-2xl p-6 space-y-5" style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PlatformLogo id="google-ads" size={24} />
              <div>
                <h3 className="text-base font-semibold text-gray-900">Connect Google Ads Account</h3>
                <p className="text-xs text-gray-400">Add your Customer ID to link campaigns</p>
              </div>
            </div>
            <button onClick={() => setShowGadsModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {gadsMsg && (
            <p className={`text-sm rounded-lg p-2.5 border ${gadsMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              {gadsMsg.text}
            </p>
          )}

          {/* Discover flow */}
          {gadsDiscovering ? (
            <div className="flex items-center justify-center py-6 gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <span className="text-sm text-gray-500">Finding accounts&hellip;</span>
            </div>
          ) : gadsDiscovered.length > 0 ? (
            <div className="space-y-3">
              <Input
                placeholder="Search accounts…"
                value={gadsSearch}
                onChange={e => setGadsSearch(e.target.value)}
                className="text-sm"
              />
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {gadsDiscovered
                  .filter(a => {
                    const q = gadsSearch.toLowerCase();
                    return !q || formatGadsId(a.customerId).includes(q) || (a.descriptiveName ?? '').toLowerCase().includes(q);
                  })
                  .map(a => {
                    const alreadySaved = gadsSaved.some(s => s.customerId === a.customerId);
                    return (
                      <label key={a.customerId} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${gadsSelected.has(a.customerId) ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                        <input type="checkbox" checked={gadsSelected.has(a.customerId)} onChange={() => toggleGadsAccount(a.customerId)} className="w-4 h-4 text-blue-600 rounded" />
                        <span className="text-sm font-mono text-gray-900">
                          {formatGadsId(a.customerId)}{a.descriptiveName ? ` | ${a.descriptiveName}` : ''}
                        </span>
                        {alreadySaved && <span className="ml-auto text-xs text-gray-400">saved</span>}
                      </label>
                    );
                  })}
              </div>
              <Button size="sm" onClick={saveSelectedGadsAccounts} disabled={gadsSavingSelected || gadsSelected.size === 0} className="w-full">
                {gadsSavingSelected ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Saving&hellip;</> : `Save ${gadsSelected.size > 0 ? gadsSelected.size + ' ' : ''}Account${gadsSelected.size !== 1 ? 's' : ''}`}
              </Button>
              <button onClick={() => { setGadsDiscovered([]); setGadsSelected(new Set()); }} className="text-xs text-gray-400 hover:text-gray-600 w-full text-center">Cancel</button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button size="sm" variant="outline" onClick={discoverGadsAccounts} disabled={gadsDiscovering} className="w-full">
                Find my Google Ads accounts
              </Button>
              <div className="relative flex items-center gap-2">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400 shrink-0">or add manually</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Customer ID (123-456-7890)"
                    value={gadsCustomerId}
                    onChange={(e) => setGadsCustomerId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addGadsAccount()}
                    className="text-sm font-mono"
                  />
                  <Input
                    placeholder="Name (optional)"
                    value={gadsAccountName}
                    onChange={(e) => setGadsAccountName(e.target.value)}
                    className="text-sm"
                  />
                  <Button size="sm" onClick={addGadsAccount} disabled={gadsSaving || !gadsCustomerId.trim()}>
                    {gadsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-gray-400">Find your 10-digit Customer ID in the top-right corner of Google Ads</p>
              </div>
            </div>
          )}

          {/* Saved accounts */}
          {gadsLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : gadsSaved.length > 0 ? (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {gadsSaved.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 bg-white">
                  <p className="text-sm font-mono text-gray-900">
                    {acc.displayCustomerId}{acc.accountName ? ` | ${acc.accountName}` : ''}
                  </p>
                  <button onClick={() => removeGadsAccount(acc.id)} className="text-gray-400 hover:text-red-500 transition-colors ml-3 shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : gadsDiscovered.length === 0 ? (
            <p className="text-xs text-center text-gray-400 py-2">No accounts added yet</p>
          ) : null}

          <Button onClick={() => setShowGadsModal(false)} disabled={gadsSaved.length === 0} className="w-full">
            {gadsSaved.length > 0
              ? <><Check className="h-4 w-4 mr-2" />Done</>
              : 'Add an account to continue'}
          </Button>
        </div>
      </div>
    )}
    </div>
  );
}
