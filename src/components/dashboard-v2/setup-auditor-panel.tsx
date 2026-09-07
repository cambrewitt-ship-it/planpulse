'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlatformCampaign, CampaignAuditFinding, SetupAuditorPlatform } from '@/types/setup-auditor';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#A0442A',
  warning: '#B07030',
  info: '#6B7280',
};
const CLEAN_COLOR = '#4A7C59';

const PLATFORM_LABELS: Record<SetupAuditorPlatform, string> = {
  'google-ads': 'Google Ads',
  'meta-ads': 'Meta Ads',
};

interface PickerCampaign {
  id: string;
  name: string;
  customerId?: string; // google-ads
  accountId?: string; // meta-ads
  accountName?: string;
}

function worstSeverity(findings: CampaignAuditFinding[]): 'critical' | 'warning' | null {
  if (findings.some((f) => f.severity === 'critical')) return 'critical';
  if (findings.some((f) => f.severity === 'warning')) return 'warning';
  return null;
}

export function SetupAuditorPanel({ clientId }: { clientId: string }) {
  const [campaigns, setCampaigns] = useState<PlatformCampaign[]>([]);
  const [findingsByCampaign, setFindingsByCampaign] = useState<Record<string, CampaignAuditFinding[]>>({});
  const [loading, setLoading] = useState(true);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignsRes, findingsRes] = await Promise.all([
        fetch(`/api/setup-auditor/campaigns?clientId=${clientId}`),
        fetch(`/api/setup-auditor/findings?clientId=${clientId}`),
      ]);
      const campaignsData = await campaignsRes.json();
      const findingsData = await findingsRes.json();
      setCampaigns(campaignsData.campaigns ?? []);
      const grouped: Record<string, CampaignAuditFinding[]> = {};
      for (const f of (findingsData.findings ?? []) as CampaignAuditFinding[]) {
        (grouped[f.platform_campaign_id] ??= []).push(f);
      }
      setFindingsByCampaign(grouped);
    } catch {
      setError('Failed to load Setup Auditor data.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  async function runAudit(campaignId: string) {
    setRunningId(campaignId);
    setError(null);
    try {
      const res = await fetch(`/api/setup-auditor/campaigns/${campaignId}/run`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Run failed');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunningId(null);
    }
  }

  async function unregister(campaignId: string) {
    if (!confirm('Stop auditing this campaign? Its finding history will be deleted.')) return;
    await fetch(`/api/setup-auditor/campaigns/${campaignId}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div
      id="setup-auditor-section"
      className="rounded-lg p-6"
      style={{
        background: '#FDFCF8',
        border: '1px solid rgba(232,228,220,0.7)',
        borderRadius: 18,
        boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Setup Auditor</h3>
          <p style={{ fontSize: 13, color: '#8A8578', margin: '2px 0 0' }}>
            Audits live Google/Meta campaigns against what they&apos;re supposed to be configured as. Flags only — never auto-corrects.
          </p>
        </div>
        <Button onClick={() => setRegisterOpen(true)}>Register Campaign</Button>
      </div>

      {error && (
        <div style={{ background: '#FDF7F5', border: '1px solid rgba(160,68,42,0.2)', borderRadius: 10, padding: '8px 12px', marginBottom: 12, color: '#A0442A', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: '#8A8578' }}>Loading…</p>
      ) : campaigns.length === 0 ? (
        <p style={{ fontSize: 13, color: '#8A8578' }}>No campaigns registered yet. Register a live campaign to start auditing it.</p>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => {
            const findings = findingsByCampaign[c.id] ?? [];
            const severity = worstSeverity(findings);
            const dotColor = severity ? SEVERITY_COLORS[severity] : CLEAN_COLOR;
            const expanded = expandedId === c.id;
            return (
              <div key={c.id} style={{ border: '0.5px solid #E8E4DC', borderRadius: 12, overflow: 'hidden' }}>
                <div className="flex items-center justify-between gap-2 px-3 py-2" style={{ background: '#FFFFFF' }}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dotColor }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#1C1917' }} className="truncate">
                      {c.campaign_name || c.external_campaign_id}
                    </span>
                    <span style={{ fontSize: 11, color: '#8A8578', flexShrink: 0 }}>{PLATFORM_LABELS[c.platform]}</span>
                    {findings.length > 0 && (
                      <span style={{ fontSize: 11, color: dotColor, flexShrink: 0 }}>
                        {findings.length} open finding{findings.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" disabled={runningId === c.id} onClick={() => runAudit(c.id)}>
                      {runningId === c.id ? 'Running…' : 'Run Now'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => unregister(c.id)}>Remove</Button>
                  </div>
                </div>
                {expanded && (
                  <div style={{ padding: '10px 14px', background: '#FAF9F5', borderTop: '0.5px solid #E8E4DC' }}>
                    {findings.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#4A7C59' }}>No open findings — configuration matches its intended spec.</p>
                    ) : (
                      <div className="space-y-2">
                        {findings.map((f) => (
                          <div key={f.id} className="flex items-start gap-2">
                            <span style={{ width: 6, height: 6, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: SEVERITY_COLORS[f.severity] }} />
                            <div>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#1C1917' }}>{f.rule_key.replace(/_/g, ' ')}</span>
                              <p style={{ fontSize: 12, color: '#57534E', margin: '2px 0 0' }}>{f.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#8A8578', marginTop: 10 }}>
                      Intended spec: {c.expected_geo?.length ? `geo [${c.expected_geo.join(', ')}]` : 'no geo set'}
                      {c.expected_budget_amount != null ? ` · budget ~${c.expected_budget_amount}` : ''}
                      {c.expected_destination_url ? ` · ${c.expected_destination_url}` : ''}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {registerOpen && (
        <RegisterCampaignDialog
          isOpen={registerOpen}
          onClose={() => setRegisterOpen(false)}
          clientId={clientId}
          onRegistered={() => { setRegisterOpen(false); void load(); }}
        />
      )}
    </div>
  );
}

function RegisterCampaignDialog({
  isOpen, onClose, clientId, onRegistered,
}: {
  isOpen: boolean; onClose: () => void; clientId: string; onRegistered: () => void;
}) {
  const [platform, setPlatform] = useState<SetupAuditorPlatform>('google-ads');
  const [pickerCampaigns, setPickerCampaigns] = useState<PickerCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [campaignPopoverOpen, setCampaignPopoverOpen] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [channelName, setChannelName] = useState('');
  const [expectedGeo, setExpectedGeo] = useState('');
  const [expectedGeoMode, setExpectedGeoMode] = useState<'presence' | 'presence_or_interest' | ''>('');
  const [expectedBudgetAmount, setExpectedBudgetAmount] = useState('');
  const [expectedOptimizationGoal, setExpectedOptimizationGoal] = useState('');
  const [expectedDestinationUrl, setExpectedDestinationUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSelectedCampaignId('');
    setCampaignSearch('');
    setPickerCampaigns([]);
    setLoadingCampaigns(true);
    const endpoint = platform === 'google-ads'
      ? `/api/ads/google-ads/campaigns?clientId=${clientId}`
      : `/api/ads/meta/campaigns?clientId=${clientId}`;
    fetch(endpoint)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setPickerCampaigns(data.campaigns ?? []); })
      .catch(() => { if (!cancelled) setPickerCampaigns([]); })
      .finally(() => { if (!cancelled) setLoadingCampaigns(false); });
    // Guards against a slow, stale response (e.g. from Google Ads, which can
    // take several seconds across multiple accounts) landing AFTER the user
    // has already switched platform/client — without this, switching to
    // Meta while a Google fetch is still in flight could briefly overwrite
    // the correct Meta list with the late-arriving Google one.
    return () => { cancelled = true; };
  }, [platform, clientId]);

  async function handleSubmit() {
    const selected = pickerCampaigns.find((c) => c.id === selectedCampaignId);
    if (!selected) { setError('Select a campaign to register.'); return; }
    const externalAccountId = platform === 'google-ads' ? selected.customerId : selected.accountId;
    if (!externalAccountId) { setError('This campaign is missing its account ID — try reselecting it.'); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/setup-auditor/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          platform,
          externalAccountId,
          externalCampaignId: selected.id,
          campaignName: selected.name,
          channelName: channelName || null,
          expectedGeo: expectedGeo ? expectedGeo.split(',').map((s) => s.trim()).filter(Boolean) : null,
          expectedGeoMode: platform === 'google-ads' && expectedGeoMode ? expectedGeoMode : null,
          expectedBudgetAmount: expectedBudgetAmount ? Number(expectedBudgetAmount) : null,
          expectedOptimizationGoal: expectedOptimizationGoal || null,
          expectedDestinationUrl: expectedDestinationUrl || null,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register campaign');
      onRegistered();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register Campaign for Setup Auditor</DialogTitle>
          <DialogDescription>
            Pick a live campaign and confirm what it&apos;s supposed to look like. Leave a field blank to skip that check.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Platform</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as SetupAuditorPlatform)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="google-ads">Google Ads</SelectItem>
                <SelectItem value="meta-ads">Meta Ads</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Campaign</Label>
            <Popover open={campaignPopoverOpen} onOpenChange={setCampaignPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={campaignPopoverOpen}
                  disabled={loadingCampaigns}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {loadingCampaigns
                      ? 'Loading…'
                      : pickerCampaigns.find((c) => c.id === selectedCampaignId)?.name ?? 'Select a campaign'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start" side="bottom" avoidCollisions={false}>
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search campaigns…"
                    value={campaignSearch}
                    onValueChange={setCampaignSearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <p className="p-2 text-sm text-slate-500">
                        {pickerCampaigns.length === 0
                          ? 'No campaigns found — check the platform is connected for this client.'
                          : 'No campaigns match your search.'}
                      </p>
                    </CommandEmpty>
                    <CommandGroup>
                      {pickerCampaigns
                        .filter((c) => c.name.toLowerCase().includes(campaignSearch.toLowerCase()))
                        .map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => {
                              setSelectedCampaignId(c.id);
                              setCampaignPopoverOpen(false);
                            }}
                          >
                            <Check className={cn('mr-2 h-4 w-4', selectedCampaignId === c.id ? 'opacity-100' : 'opacity-0')} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium truncate">{c.name}</div>
                              {c.accountName && <div className="text-xs text-slate-500 truncate">{c.accountName}</div>}
                            </div>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Channel name (optional — links client-wide rule overrides)</Label>
            <Input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="e.g. Google Search" />
          </div>

          <div>
            <Label>Expected geo targeting {platform === 'google-ads' ? '(Geo Target Constant IDs, comma-separated)' : '(location names, comma-separated)'}</Label>
            <Input value={expectedGeo} onChange={(e) => setExpectedGeo(e.target.value)} placeholder={platform === 'google-ads' ? '1013331' : 'Wellington'} />
          </div>

          {platform === 'google-ads' && (
            <div>
              <Label>Expected location targeting mode</Label>
              <Select value={expectedGeoMode} onValueChange={(v) => setExpectedGeoMode(v as any)}>
                <SelectTrigger><SelectValue placeholder="No assertion" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="presence">Presence (people in/regularly in the location)</SelectItem>
                  <SelectItem value="presence_or_interest">Presence or interest (broader — can silently expand reach)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Expected budget amount</Label>
            <Input type="number" value={expectedBudgetAmount} onChange={(e) => setExpectedBudgetAmount(e.target.value)} placeholder="e.g. 500" />
          </div>

          <div>
            <Label>Expected optimization goal / bidding strategy</Label>
            <Input value={expectedOptimizationGoal} onChange={(e) => setExpectedOptimizationGoal(e.target.value)} placeholder={platform === 'google-ads' ? 'TARGET_CPA' : 'OFFSITE_CONVERSIONS'} />
          </div>

          <div>
            <Label>Expected destination URL</Label>
            <Input value={expectedDestinationUrl} onChange={(e) => setExpectedDestinationUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {error && <p style={{ fontSize: 12, color: '#A0442A' }}>{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !selectedCampaignId}>{saving ? 'Registering…' : 'Register'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
