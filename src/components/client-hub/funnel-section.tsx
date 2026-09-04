'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { COLOR, sectionTitleStyle } from './tokens';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { FunnelChart } from '@/components/funnel-chart';
import { FunnelBuilderModal } from '@/components/funnel-builder-modal';
import type { FunnelConfig, FunnelStage, MediaPlanFunnel } from '@/lib/types/funnel';
import { subDays, format } from 'date-fns';

interface MediaChannel {
  id: string;
  name: string;
  platform: string;
}

interface HubClient {
  id: string;
  name: string;
  logo_url?: string | null;
}

export interface FunnelSectionProps {
  clientId: string;
  token?: string;
  editable: boolean;
  client?: HubClient;
}

function defaultRange() {
  const end = new Date();
  const start = subDays(end, 29);
  return { startDate: format(start, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') };
}

export function FunnelSection({ clientId, token, editable, client }: FunnelSectionProps) {
  const [funnels, setFunnels] = useState<MediaPlanFunnel[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [totalSpend, setTotalSpend] = useState(0);
  const [loadingFunnels, setLoadingFunnels] = useState(true);
  const [dateRange, setDateRange] = useState(defaultRange);
  const [mediaChannels, setMediaChannels] = useState<MediaChannel[]>([]);
  const [isFunnelBuilderOpen, setIsFunnelBuilderOpen] = useState(false);
  const [editingFunnel, setEditingFunnel] = useState<MediaPlanFunnel | null>(null);
  const [commission, setCommission] = useState(0);
  const [grossUp, setGrossUp] = useState(false);

  const calculateFunnel = useCallback(async (funnelId: string) => {
    setLoadingFunnels(true);
    try {
      const base = token
        ? `/api/hub/${token}/funnels/${funnelId}/calculate`
        : `/api/funnels/${funnelId}/calculate`;
      const res = await fetch(`${base}?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
      const data = await res.json();
      if (data.success) {
        setFunnelStages(data.stages || []);
        setTotalSpend(data.totalSpend || 0);
      }
    } catch {
      setFunnelStages([]);
      setTotalSpend(0);
    } finally {
      setLoadingFunnels(false);
    }
  }, [token, dateRange]);

  const loadFunnels = useCallback(async () => {
    setLoadingFunnels(true);
    try {
      const res = await fetch(token ? `/api/hub/${token}/funnels` : `/api/funnels?clientId=${clientId}`);
      const data = await res.json();
      if (data.success && data.funnels) {
        setCommission(data.commission || 0);
        setFunnels(data.funnels);
        if (data.funnels.length > 0) {
          const firstId = data.funnels[0].id;
          setSelectedFunnelId(firstId);
          await calculateFunnel(firstId);
        } else {
          setLoadingFunnels(false);
        }
      } else {
        setLoadingFunnels(false);
      }
    } catch {
      setLoadingFunnels(false);
    }
  }, [clientId, token, calculateFunnel]);

  useEffect(() => { loadFunnels(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedFunnelId) calculateFunnel(selectedFunnelId);
  }, [dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editable) return;
    fetch(`/api/media-plan/channels?clientId=${clientId}`)
      .then(res => res.json())
      .then(data => { if (data.success && data.channels) setMediaChannels(data.channels); })
      .catch(() => {});
  }, [clientId, editable]);

  const handleFunnelSaved = async (config: FunnelConfig) => {
    try {
      if (editingFunnel) {
        await fetch(`/api/funnels/${editingFunnel.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelIds: config.channelIds, name: config.name, config }),
        });
      } else {
        await fetch('/api/funnels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, channelIds: config.channelIds, name: config.name, config }),
        });
      }
      await loadFunnels();
    } catch (error) {
      console.error('Error saving funnel:', error);
    } finally {
      setIsFunnelBuilderOpen(false);
      setEditingFunnel(null);
    }
  };

  const handleDeleteFunnel = async (funnelId: string) => {
    if (!confirm('Are you sure you want to delete this funnel? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/funnels/${funnelId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setFunnels(prev => prev.filter(f => f.id !== funnelId));
        if (selectedFunnelId === funnelId) {
          const remaining = funnels.filter(f => f.id !== funnelId);
          if (remaining.length > 0) {
            setSelectedFunnelId(remaining[0].id);
            await calculateFunnel(remaining[0].id);
          } else {
            setSelectedFunnelId(null);
            setFunnelStages([]);
          }
        }
      } else {
        alert(data.error || 'Failed to delete funnel');
      }
    } catch {
      alert('Failed to delete funnel. Please try again.');
    }
  };

  const hubClient = useMemo(() => client ? { id: client.id, name: client.name, logo_url: client.logo_url } : undefined, [client]);

  // Commission is stored net-of-agency-fee (e.g. 20 means the client is billed at
  // net / (1 - 0.20)); grossing up multiplies spend and cost-per-action figures
  // by the same factor so they reflect what the client is actually billed.
  const grossUpMultiplier = grossUp && commission > 0 && commission < 100 ? 100 / (100 - commission) : 1;
  const displayTotalSpend = totalSpend * grossUpMultiplier;
  const displayStages = useMemo(() => (
    grossUpMultiplier === 1
      ? funnelStages
      : funnelStages.map(stage => stage.costPerAction !== undefined
          ? { ...stage, costPerAction: stage.costPerAction * grossUpMultiplier }
          : stage)
  ), [funnelStages, grossUpMultiplier]);

  if (!editable && !loadingFunnels && funnels.length === 0) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Funnels</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DateRangePicker value={dateRange} onChange={setDateRange} disabled={loadingFunnels} />
          {commission > 0 && (
            <div style={{ display: 'flex', borderRadius: 6, border: `0.5px solid ${COLOR.cardBorder}`, overflow: 'hidden' }}>
              <button
                onClick={() => setGrossUp(false)}
                style={{
                  padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                  background: !grossUp ? COLOR.accent : 'transparent',
                  color: !grossUp ? COLOR.bg : COLOR.muted,
                }}
              >
                Net
              </button>
              <button
                onClick={() => setGrossUp(true)}
                title={`Gross up by ${commission}% commission`}
                style={{
                  padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                  background: grossUp ? COLOR.accent : 'transparent',
                  color: grossUp ? COLOR.bg : COLOR.muted,
                }}
              >
                Gross
              </button>
            </div>
          )}
          {editable && (
            <button
              onClick={() => { setEditingFunnel(null); setIsFunnelBuilderOpen(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 4, border: 'none', background: COLOR.accent, color: COLOR.bg, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >
              Create funnel
            </button>
          )}
        </div>
      </div>

      {editable && (
        loadingFunnels && funnels.length === 0 ? (
          <p style={{ fontSize: 13, color: COLOR.muted, padding: '20px 0' }}>Loading funnels…</p>
        ) : funnels.length === 0 ? (
          <div style={{ background: COLOR.card, border: `1px solid ${COLOR.cardBorder}`, borderRadius: 6, padding: '20px 24px', fontSize: 13.5, color: COLOR.muted, marginBottom: 16 }}>
            No funnels created yet — click &quot;Create funnel&quot; to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            {funnels.map(funnel => (
              <div
                key={funnel.id}
                style={{
                  padding: '10px 14px', borderRadius: 6,
                  border: selectedFunnelId === funnel.id ? `1.5px solid ${COLOR.accent}` : `0.5px solid ${COLOR.cardBorder}`,
                  background: selectedFunnelId === funnel.id ? COLOR.card : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <button
                  onClick={async () => {
                    if (loadingFunnels) return;
                    setSelectedFunnelId(funnel.id);
                    await calculateFunnel(funnel.id);
                  }}
                  disabled={loadingFunnels}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13.5, fontWeight: 500, color: COLOR.ink }}
                >
                  {funnel.name}
                </button>
                <span style={{ fontSize: 12, color: COLOR.muted }}>
                  {(funnel.config as FunnelConfig).stages.length} stages
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingFunnel(funnel); setIsFunnelBuilderOpen(true); }}
                  title="Edit funnel"
                  style={{ background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer', color: COLOR.muted }}
                >
                  Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteFunnel(funnel.id); }}
                  title="Delete funnel"
                  style={{ background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer', color: COLOR.accent }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {selectedFunnelId && (
        <FunnelChart
          funnelStages={displayStages}
          totalCost={displayTotalSpend}
          dateRange={dateRange}
          isLoading={loadingFunnels}
          client={hubClient}
        />
      )}

      {editable && (
        <FunnelBuilderModal
          isOpen={isFunnelBuilderOpen}
          onClose={() => { setIsFunnelBuilderOpen(false); setEditingFunnel(null); }}
          onSave={handleFunnelSaved}
          initialConfig={editingFunnel?.config as FunnelConfig | undefined}
          availableChannels={mediaChannels}
          clientId={clientId}
        />
      )}
    </div>
  );
}
