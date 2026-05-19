'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PerfData {
  needle: number;       // 0..1 — 0=bad, 0.5=on target, 1=great
  metric: string;
  actualLabel: string;
  targetLabel: string;
  targetValue: number | null;
  color: string;
  hasData: boolean;
  trend?: { pctChange: number; improving: boolean } | null;
  trend24h?: { pctChange: number; improving: boolean } | null;
  dailySeries: number[];  // last 7 days of metric values, oldest first (only days with data)
}

interface WidgetConfig {
  platform: '' | 'meta-ads' | 'google-ads';
  campaignIds: string[];
  metricSource: 'ad' | 'ga4';
  ga4EventName: string;    // GA4 metric_name used as conversion denominator
  metaActionType: string;  // meta_actions action_type used as conversion count
}

interface Campaign {
  id: string;
  name: string;
  platform: string;
}

interface Goal {
  id: string;
  metric: string;
  target_value: number | null;
  is_primary: boolean;
  channel: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FONT = "'DM Sans', system-ui, sans-serif";

const METRIC_OPTIONS = ['CPA', 'CPL', 'CPC', 'CPM', 'CTR', 'ROAS', 'Conversions', 'Clicks', 'Impressions', 'Reach'];

const PLATFORM_OPTIONS = [
  { id: '' as const, label: 'All' },
  { id: 'meta-ads' as const, label: 'Meta' },
  { id: 'google-ads' as const, label: 'Google' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMetric(value: number, metric: string): string {
  const mk = metric.toLowerCase();
  if (/ctr/.test(mk)) return `${value.toFixed(1)}%`;
  if (/roas/.test(mk)) return `${value.toFixed(1)}x`;
  if (/cpa|cpc|cpm|cpl/.test(mk)) return value >= 100 ? `$${Math.round(value)}` : `$${value.toFixed(2)}`;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

function metricFromDayRow(
  row: { spend: number; impressions: number; clicks: number; conversions: number },
  metric: string,
): number | null {
  const mk = metric.toLowerCase();
  if (/cpa|cpl/.test(mk)) return row.conversions > 0 ? row.spend / row.conversions : null;
  if (/cpc/.test(mk)) return row.clicks > 0 ? row.spend / row.clicks : null;
  if (/cpm/.test(mk)) return row.impressions > 0 ? (row.spend / row.impressions) * 1000 : null;
  if (/ctr/.test(mk)) return row.impressions > 0 ? (row.clicks / row.impressions) * 100 : null;
  if (/roas/.test(mk)) return null; // not available in raw rows
  if (/conversion/.test(mk)) return row.conversions;
  if (/click/.test(mk)) return row.clicks;
  if (/impression/.test(mk)) return row.impressions;
  if (/spend/.test(mk)) return row.spend;
  return null;
}

function calcNeedle(actual: number, target: number, metric: string): number {
  const mk = metric.toLowerCase();
  const lowerBetter = /cpa|cpc|cpm|cpl|cost/.test(mk);
  const ratio = actual / target;
  return lowerBetter
    ? Math.max(0, Math.min(1, 1 - (ratio - 1) * 0.75))
    : Math.max(0, Math.min(1, ratio * 0.6));
}

function loadConfig(clientId: string): WidgetConfig {
  try {
    if (typeof window === 'undefined') return defaultConfig();
    const raw = localStorage.getItem(`perf_widget_${clientId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Backfill new fields for existing saved configs
      return { ...defaultConfig(), ...parsed };
    }
  } catch {}
  return defaultConfig();
}

function defaultConfig(): WidgetConfig {
  return { platform: '', campaignIds: [], metricSource: 'ad', ga4EventName: '', metaActionType: '' };
}

function persistConfig(clientId: string, config: WidgetConfig) {
  try { localStorage.setItem(`perf_widget_${clientId}`, JSON.stringify(config)); } catch {}
}

// Friendly label for a Meta action type key
function metaActionLabel(key: string): string {
  return key
    .replace('offsite_conversion.fb_pixel_', '')
    .replace('offsite_conversion.', '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ── Settings gear icon ────────────────────────────────────────────────────────

function GearIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ── Small shared select style ─────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '7px 8px', borderRadius: 8,
  border: '1px solid #E8E4DC', background: '#FDFCF8',
  fontSize: 12, color: '#1C1917', fontFamily: FONT,
  appearance: 'none' as const,
};

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  clientId: string;
  initialConfig: WidgetConfig;
  goals: Goal[];
  campaigns: Campaign[];
  ga4Events: string[];
  metaEvents: Array<{ name: string; count: number }>;
  onSave: (config: WidgetConfig) => void;
  onClose: () => void;
}

function ConfigModal({ clientId, initialConfig, goals, campaigns, ga4Events, metaEvents, onSave, onClose }: ModalProps) {
  const primaryGoal = goals.find(g => g.is_primary) ?? goals[0] ?? null;
  const [editMetric, setEditMetric] = useState(primaryGoal?.metric ?? 'CPA');
  const [editTarget, setEditTarget] = useState(primaryGoal?.target_value?.toString() ?? '');
  const [editGoalId] = useState(primaryGoal?.id ?? null);
  const [editConfig, setEditConfig] = useState<WidgetConfig>({ ...initialConfig });
  const [saving, setSaving] = useState(false);

  const filteredCampaigns = editConfig.platform
    ? campaigns.filter(c => c.platform === editConfig.platform)
    : campaigns;

  // Show Meta event picker when platform is meta or all-platforms with ad source
  const showMetaEvents = editConfig.metricSource === 'ad'
    && (editConfig.platform === 'meta-ads' || editConfig.platform === '')
    && metaEvents.length > 0;

  // Show GA4 event picker when GA4 source selected
  const showGa4Events = editConfig.metricSource === 'ga4' && ga4Events.length > 0;

  // Needs configuration nudge
  const needsConversionEvent =
    (editConfig.metricSource === 'ga4' && !editConfig.ga4EventName && ga4Events.length > 0) ||
    (editConfig.metricSource === 'ad' && editConfig.platform === 'meta-ads' && !editConfig.metaActionType && metaEvents.length > 0);

  async function handleSave() {
    setSaving(true);
    try {
      const targetNum = parseFloat(editTarget);
      if (!isNaN(targetNum) && editMetric) {
        await fetch(`/api/clients/${clientId}/goals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editGoalId ?? undefined,
            channel: 'overarching',
            metric: editMetric,
            target_value: targetNum,
            is_primary: true,
          }),
        });
      }
      onSave(editConfig);
    } finally {
      setSaving(false);
    }
  }

  const pill = (active: boolean) => ({
    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
    border: active ? '1.5px solid #4A6580' : '1px solid #E8E4DC',
    background: active ? 'rgba(74,101,128,0.1)' : '#FDFCF8',
    color: active ? '#4A6580' : '#8A8578',
    cursor: 'pointer' as const, fontFamily: FONT,
  });

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#8A8578',
    textTransform: 'uppercase', letterSpacing: '0.07em',
    marginBottom: 8, display: 'block',
  };

  const fieldLabel: React.CSSProperties = { fontSize: 11, color: '#8A8578', marginBottom: 4 };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, fontFamily: FONT,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FDFCF8', borderRadius: 18, padding: 24,
          width: 380, maxHeight: '88vh', overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.15)', border: '1px solid #E8E4DC',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1C1917' }}>Performance Goal</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B5B0A5', fontSize: 18, padding: '2px 4px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Needs-config nudge */}
        {needsConversionEvent && (
          <div style={{ background: 'rgba(176,112,48,0.08)', border: '1px solid rgba(176,112,48,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#8A5C10' }}>
            ⚠ Select a conversion event below so actuals can be calculated.
          </div>
        )}

        {/* ── Goal ── */}
        <div style={{ marginBottom: 20 }}>
          <span style={sectionLabel}>Goal</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Metric</div>
              <select value={editMetric} onChange={e => setEditMetric(e.target.value)} style={selectStyle}>
                {METRIC_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={fieldLabel}>Target value</div>
              <input
                type="number"
                value={editTarget}
                onChange={e => setEditTarget(e.target.value)}
                placeholder="e.g. 50"
                style={{ ...selectStyle, boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>

        {/* ── Metric Source ── */}
        <div style={{ marginBottom: 20 }}>
          <span style={sectionLabel}>Metric Source</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {([{ id: 'ad', label: 'Ad Platform' }, { id: 'ga4', label: 'GA4' }] as const).map(src => (
              <button key={src.id} onClick={() => setEditConfig(c => ({ ...c, metricSource: src.id }))} style={pill(editConfig.metricSource === src.id)}>
                {src.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 10, color: '#B5B0A5', marginTop: 5 }}>
            {editConfig.metricSource === 'ga4'
              ? 'Uses GA4 event count as conversion denominator for cost metrics'
              : 'Uses ad platform reported conversions / actions'}
          </p>
        </div>

        {/* ── GA4 Conversion Event ── */}
        {editConfig.metricSource === 'ga4' && (
          <div style={{ marginBottom: 20 }}>
            <span style={sectionLabel}>GA4 Conversion Event</span>
            {ga4Events.length > 0 ? (
              <>
                <select
                  value={editConfig.ga4EventName}
                  onChange={e => setEditConfig(c => ({ ...c, ga4EventName: e.target.value }))}
                  style={selectStyle}
                >
                  <option value="">— select event —</option>
                  {ga4Events.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                </select>
                <p style={{ fontSize: 10, color: '#B5B0A5', marginTop: 4 }}>
                  This event count becomes the denominator for CPA / CPL calculation
                </p>
              </>
            ) : (
              <p style={{ fontSize: 12, color: '#B5B0A5' }}>No GA4 events found for this client this month. Sync GA4 data first.</p>
            )}
          </div>
        )}

        {/* ── Platform ── */}
        <div style={{ marginBottom: 20 }}>
          <span style={sectionLabel}>Platform</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PLATFORM_OPTIONS.map(p => (
              <button
                key={p.id}
                onClick={() => setEditConfig(c => ({ ...c, platform: p.id, campaignIds: [] }))}
                style={pill(editConfig.platform === p.id)}
              >{p.label}</button>
            ))}
          </div>
        </div>

        {/* ── Meta Conversion Action ── */}
        {showMetaEvents && (
          <div style={{ marginBottom: 20 }}>
            <span style={sectionLabel}>Meta Conversion Action</span>
            <select
              value={editConfig.metaActionType}
              onChange={e => setEditConfig(c => ({ ...c, metaActionType: e.target.value }))}
              style={selectStyle}
            >
              <option value="">— use platform conversions —</option>
              {metaEvents.map(ev => (
                <option key={ev.name} value={ev.name}>
                  {metaActionLabel(ev.name)} ({ev.count.toLocaleString()})
                </option>
              ))}
            </select>
            <p style={{ fontSize: 10, color: '#B5B0A5', marginTop: 4 }}>
              Select a Meta pixel event to use as the conversion count for CPA
            </p>
          </div>
        )}

        {/* ── Campaigns ── */}
        {filteredCampaigns.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <span style={sectionLabel}>Campaigns</span>
            <div style={{ border: '1px solid #E8E4DC', borderRadius: 10, maxHeight: 160, overflowY: 'auto' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '0.5px solid #F0EDE8', cursor: 'pointer' }}>
                <input type="checkbox" checked={editConfig.campaignIds.length === 0} onChange={() => setEditConfig(c => ({ ...c, campaignIds: [] }))} style={{ accentColor: '#4A6580' }} />
                <span style={{ fontSize: 12, color: '#1C1917', fontWeight: 500 }}>All campaigns</span>
              </label>
              {filteredCampaigns.map(campaign => {
                const checked = editConfig.campaignIds.includes(campaign.id);
                return (
                  <label key={campaign.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: '0.5px solid #F0EDE8', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setEditConfig(c => ({
                        ...c,
                        campaignIds: checked
                          ? c.campaignIds.filter(id => id !== campaign.id)
                          : [...c.campaignIds, campaign.id],
                      }))}
                      style={{ accentColor: '#4A6580', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 12, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: '1px solid #E8E4DC', background: '#FDFCF8', color: '#8A8578', cursor: 'pointer', fontFamily: FONT }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', background: '#4A6580', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: FONT }}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function PerformanceWidget({
  clientId,
  onNeedle,
  hideControls = false,
  hideDisplay = false,
  floatingGear = false,
}: {
  clientId: string;
  onNeedle?: (data: PerfData | null) => void;
  hideControls?: boolean;
  hideDisplay?: boolean;
  floatingGear?: boolean;
}) {
  const [config, setConfig] = useState<WidgetConfig>(() => loadConfig(clientId));
  const [goals, setGoals] = useState<Goal[]>([]);
  const [combinedActuals, setCombinedActuals] = useState<Record<string, number>>({});
  const [ga4Actuals, setGa4Actuals] = useState<Record<string, number>>({});
  const [last7DaysActuals, setLast7DaysActuals] = useState<Record<string, number>>({});
  const [prev7DaysActuals, setPrev7DaysActuals] = useState<Record<string, number>>({});
  const [yesterdayActuals, setYesterdayActuals] = useState<Record<string, number>>({});
  const [dayBeforeActuals, setDayBeforeActuals] = useState<Record<string, number>>({});
  const [last7DaysSeries, setLast7DaysSeries] = useState<Array<{ date: string; spend: number; impressions: number; clicks: number; conversions: number }>>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [ga4Events, setGa4Events] = useState<string[]>([]);
  const [metaEvents, setMetaEvents] = useState<Array<{ name: string; count: number }>>([]);
  const [perfData, setPerfData] = useState<PerfData | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  const onNeedleRef = useRef(onNeedle);
  onNeedleRef.current = onNeedle;

  useEffect(() => { setMounted(true); }, []);

  // Fetch data whenever config changes
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (config.campaignIds.length > 0) params.set('campaignIds', config.campaignIds.join(','));
    if (config.platform) params.set('platforms', config.platform);
    if (config.ga4EventName) params.set('ga4EventName', config.ga4EventName);
    if (config.metaActionType) params.set('metaActionType', config.metaActionType);

    fetch(`/api/clients/${clientId}/goals?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json || cancelled) return;
        setGoals(json.goals ?? []);
        setCombinedActuals(json.combinedActuals ?? {});
        setGa4Actuals(json.ga4Actuals ?? {});
        setLast7DaysActuals(json.last7DaysActuals ?? {});
        setPrev7DaysActuals(json.prev7DaysActuals ?? {});
        setYesterdayActuals(json.yesterdayActuals ?? {});
        setDayBeforeActuals(json.dayBeforeActuals ?? {});
        setLast7DaysSeries(json.last7DaysSeries ?? []);
        setCampaigns(json.campaigns ?? []);
        setGa4Events(json.ga4Events ?? []);
        setMetaEvents(json.metaEvents ?? []);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [clientId, config]);

  // Derive perf data from goals + actuals
  useEffect(() => {
    const primaryGoal = goals.find(g => g.is_primary) ?? goals[0] ?? null;

    if (!primaryGoal) {
      const noData: PerfData = { needle: 0.5, metric: '', actualLabel: '', targetLabel: '', targetValue: null, color: '#B5B0A5', hasData: false, trend: null, trend24h: null, dailySeries: [] };
      setPerfData(noData);
      onNeedleRef.current?.(noData);
      return;
    }

    const mk = primaryGoal.metric.toLowerCase();
    const actuals = config.metricSource === 'ga4' ? ga4Actuals : combinedActuals;
    const actual = actuals[mk] ?? null;

    const lowerBetter = /cpa|cpc|cpm|cpl|cost/.test(mk);

    // 7-day trend
    const last7Val = last7DaysActuals[mk] ?? null;
    const prev7Val = prev7DaysActuals[mk] ?? null;
    const trend = (last7Val != null && prev7Val != null && prev7Val !== 0)
      ? { pctChange: ((last7Val - prev7Val) / prev7Val) * 100, improving: lowerBetter ? last7Val < prev7Val : last7Val > prev7Val }
      : null;

    // 24h trend: yesterday vs day before yesterday
    const yVal = yesterdayActuals[mk] ?? null;
    const dbVal = dayBeforeActuals[mk] ?? null;
    const trend24h = (yVal != null && dbVal != null && dbVal !== 0)
      ? { pctChange: ((yVal - dbVal) / dbVal) * 100, improving: lowerBetter ? yVal < dbVal : yVal > dbVal }
      : null;

    // Daily sparkline series — oldest first
    // CPA/CPL use cumulative spend÷conversions so sparse-conversion days don't drop out
    let dailySeries: number[];
    if (/cpa|cpl/.test(mk)) {
      let cumSpend = 0, cumConv = 0;
      dailySeries = last7DaysSeries.reduce<number[]>((acc, row) => {
        cumSpend += row.spend;
        cumConv += row.conversions;
        if (cumConv > 0) acc.push(cumSpend / cumConv);
        return acc;
      }, []);
    } else {
      dailySeries = last7DaysSeries
        .map(row => metricFromDayRow(row, primaryGoal.metric))
        .filter((v): v is number => v !== null);
    }

    if (actual == null || !primaryGoal.target_value) {
      const noData: PerfData = {
        needle: 0.5,
        metric: primaryGoal.metric,
        actualLabel: 'No data',
        targetLabel: primaryGoal.target_value ? fmtMetric(primaryGoal.target_value, primaryGoal.metric) : '—',
        targetValue: primaryGoal.target_value ?? null,
        color: '#B5B0A5',
        hasData: false,
        trend,
        trend24h,
        dailySeries,
      };
      setPerfData(noData);
      onNeedleRef.current?.(noData);
      return;
    }

    const needle = calcNeedle(actual, primaryGoal.target_value, primaryGoal.metric);
    const color = needle >= 0.6 ? '#4A7C59' : needle >= 0.35 ? '#B07030' : '#A0442A';
    const data: PerfData = {
      needle,
      metric: primaryGoal.metric,
      actualLabel: fmtMetric(actual, primaryGoal.metric),
      targetLabel: fmtMetric(primaryGoal.target_value, primaryGoal.metric),
      targetValue: primaryGoal.target_value,
      color,
      hasData: true,
      trend,
      trend24h,
      dailySeries,
    };
    setPerfData(data);
    onNeedleRef.current?.(data);
  }, [goals, combinedActuals, ga4Actuals, last7DaysActuals, prev7DaysActuals, yesterdayActuals, dayBeforeActuals, last7DaysSeries, config.metricSource]);

  const handleSave = useCallback((newConfig: WidgetConfig) => {
    persistConfig(clientId, newConfig);
    setConfig(newConfig);
    setShowModal(false);
  }, [clientId]);

  // Badge text
  const sourceBadge = config.metricSource === 'ga4'
    ? `GA4${config.ga4EventName ? ` · ${config.ga4EventName}` : ' · no event'}`
    : config.platform === 'meta-ads'
      ? `Meta${config.metaActionType ? ` · ${metaActionLabel(config.metaActionType)}` : ''}`
      : config.platform === 'google-ads' ? 'Google' : 'All platforms';

  const needsSetup = !perfData?.hasData && (
    (config.metricSource === 'ga4' && !config.ga4EventName) ||
    (config.metricSource === 'ad' && config.platform === 'meta-ads' && !config.metaActionType)
  );

  if (hideDisplay) return null;

  return (
    <>
      {/* Gear button */}
      {!hideControls && (
        <div style={floatingGear ? { position: 'absolute', bottom: 10, left: 10 } : { display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={e => { e.stopPropagation(); setShowModal(true); }}
            title="Configure performance metric"
            style={{
              display: 'flex', alignItems: 'center',
              background: 'none', border: 'none',
              cursor: 'pointer', padding: 4,
              color: needsSetup ? '#B07030' : '#6B7280',
            }}
          >
            <GearIcon size={floatingGear ? 18 : 12} />
          </button>
        </div>
      )}

      {/* Config modal via portal */}
      {mounted && showModal && createPortal(
        <ConfigModal
          clientId={clientId}
          initialConfig={config}
          goals={goals}
          campaigns={campaigns}
          ga4Events={ga4Events}
          metaEvents={metaEvents}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />,
        document.body
      )}
    </>
  );
}
