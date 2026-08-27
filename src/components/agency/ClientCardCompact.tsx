// src/components/agency/ClientCardCompact.tsx
'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientCardData } from '@/app/api/agency/clients/route';
import { PerformanceWidget, type PerfData } from './PerformanceWidget';
import { nzToday, formatNZ } from '@/lib/timezone';

interface AccountManager {
  id: string;
  name: string;
  email: string | null;
}

const COLORS = ['#4A6580', '#B07030', '#4A7C59', '#A0442A', '#4A6580', '#8A8578', '#4A7C59', '#A0442A'];

function clientColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function clientInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function formatCurrency(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

// ── Speedometer arc SVG (matches dashboard HealthRing design) ─────────────
// needle=0 → left (worst), needle=0.5 → top (target), needle=1 → right (best)

function Speedometer({ needle, color, label, sublabel }: {
  needle: number; color: string; label?: string; sublabel?: string;
}) {
  const W = 88, H = 68;
  const sw = 6;
  const r = 37;
  const cx = W / 2;
  const cy = 44;

  const n = Math.max(0.002, Math.min(0.998, needle));
  const rad = Math.PI * (1 - n);
  const ex = cx + r * Math.cos(rad);
  const ey = cy - r * Math.sin(rad);
  const nLen = r - sw / 2 - 3;
  const nx = cx + nLen * Math.cos(rad);
  const ny = cy - nLen * Math.sin(rad);

  const ticks = [0, 33, 67, 100].map(v => {
    const tr = Math.PI * (1 - Math.min(0.999, Math.max(0.001, v / 100)));
    const inner = r - sw / 2 - 2;
    const outer = r + sw / 2 + 2;
    return {
      x1: cx + inner * Math.cos(tr), y1: cy - inner * Math.sin(tr),
      x2: cx + outer * Math.cos(tr), y2: cy - outer * Math.sin(tr),
    };
  });

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#e5e7eb" strokeWidth={sw} strokeLinecap="round"
      />
      {/* Coloured fill */}
      {needle > 0.01 && (
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}`}
          fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
        />
      )}
      {/* Zone tick marks at 0%, 33%, 67%, 100% */}
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke="#d1d5db" strokeWidth={1} strokeLinecap="round" />
      ))}
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#374151" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={3} fill="#374151" />
      {/* Value label inside SVG */}
      {label && (
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fontWeight="700" fill="#1C1917">{label}</text>
      )}
      {sublabel && (
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize={11} fontWeight="600" fill={color}
          style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>{sublabel}</text>
      )}
    </svg>
  );
}

// ── Media plan time progress ───────────────────────────────────────────────

function getMediaPlanProgress(channels: { startDate: string | null; endDate: string | null }[]) {
  const starts = channels.map(c => c.startDate).filter(Boolean) as string[];
  const ends = channels.map(c => c.endDate).filter(Boolean) as string[];
  if (!starts.length || !ends.length) return null;
  const earliest = [...starts].sort()[0];
  const latest = [...ends].sort().reverse()[0];
  const today = new Date(`${nzToday()}T00:00:00Z`);
  const startD = new Date(earliest);
  const endD = new Date(latest);
  if (startD >= endD) return null;
  const progress = today < startD ? 0 : today > endD ? 1 : (today.getTime() - startD.getTime()) / (endD.getTime() - startD.getTime());
  const fmt = (d: Date) => formatNZ(d, { day: 'numeric', month: 'short' }, 'en-GB');
  return { progress, startLabel: fmt(startD), endLabel: fmt(endD) };
}

// ── Month elapsed % for pacing marker ─────────────────────────────────────

function getMonthElapsed(): number {
  const [y, m, d] = nzToday().split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return Math.min(1, d / daysInMonth);
}

// ── Action points colour ───────────────────────────────────────────────────

function apColor(count: number): string {
  if (count >= 6) return '#A0442A';
  if (count >= 3) return '#B07030';
  return '#B5B0A5';
}

// ── Split area paths: above-target segments vs below-target segments ──────────

function buildSplitAreaPaths(
  pts: { x: number; y: number }[],
  targetY: number,
  bottom: number
): { redPath: string; greenPath: string } {
  if (pts.length === 0) return { redPath: '', greenPath: '' };

  const isAbove = (p: { x: number; y: number }) => p.y < targetY;

  function crossX(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    if (p2.y === p1.y) return p1.x;
    return p1.x + ((targetY - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x);
  }

  const aug: { x: number; y: number; above: boolean }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i > 0) {
      const prev = pts[i - 1];
      if (isAbove(prev) !== isAbove(p)) {
        const cx = crossX(prev, p);
        aug.push({ x: cx, y: targetY, above: isAbove(prev) });
        aug.push({ x: cx, y: targetY, above: isAbove(p) });
      }
    }
    aug.push({ x: p.x, y: p.y, above: isAbove(p) });
  }

  function buildPath(wantAbove: boolean): string {
    let d = '';
    let seg: { x: number; y: number }[] = [];

    const flush = () => {
      if (seg.length < 1) return;
      const f = seg[0], l = seg[seg.length - 1];
      d += `M ${f.x.toFixed(1)} ${bottom.toFixed(1)} L ${f.x.toFixed(1)} ${f.y.toFixed(1)}`;
      for (let i = 1; i < seg.length; i++) d += ` L ${seg[i].x.toFixed(1)} ${seg[i].y.toFixed(1)}`;
      d += ` L ${l.x.toFixed(1)} ${bottom.toFixed(1)} Z `;
      seg = [];
    };

    for (const p of aug) {
      if (p.above === wantAbove) seg.push(p);
      else flush();
    }
    flush();
    return d.trim();
  }

  return { redPath: buildPath(true), greenPath: buildPath(false) };
}

// ── Sparkline: 30-day metric series fetched from API (matches hero card) ──────

function SparkLine({ clientId, perf }: { clientId: string; perf: PerfData | null }) {
  const [series, setSeries] = useState<Array<{ date: string; value: number }>>([]);
  const [fetched, setFetched] = useState(false);

  // Load cached series before the first browser paint so the graph never flashes blank.
  // useLayoutEffect fires synchronously after React commits but before the browser paints,
  // so the state update + re-render completes before any pixels are drawn.
  useLayoutEffect(() => {
    if (!perf?.metric) return;
    try {
      const raw = sessionStorage.getItem(`series_cache_${clientId}_${perf.metric}`);
      if (raw) {
        setSeries(JSON.parse(raw));
        setFetched(true);
      }
    } catch {}
  }, [clientId, perf?.metric]);

  useEffect(() => {
    if (!perf?.metric) return;
    let cancelled = false;
    let config: { platform?: string; campaignIds?: string[]; metaActionType?: string } = {};
    try {
      const raw = localStorage.getItem(`perf_widget_${clientId}`);
      if (raw) config = JSON.parse(raw);
    } catch {}

    const params = new URLSearchParams();
    params.set('metric', perf.metric);
    if (config.platform) params.set('platforms', config.platform);
    if (config.campaignIds?.length) params.set('campaignIds', config.campaignIds.join(','));
    if (config.metaActionType) params.set('metaActionType', config.metaActionType);

    fetch(`/api/clients/${clientId}/perf-series?${params}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data.series)) {
          setSeries(data.series);
          try { sessionStorage.setItem(`series_cache_${clientId}_${perf.metric}`, JSON.stringify(data.series)); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFetched(true); });

    return () => { cancelled = true; };
  }, [clientId, perf?.metric]);

  const cleanSeries = series.filter(s => s.value != null && isFinite(s.value) && !isNaN(s.value));

  // Only show spinner when there is truly no data to display yet
  if (cleanSeries.length === 0 && !fetched) {
    return perf?.hasData ? <GraphSpinner /> : null;
  }

  if (!perf?.hasData || cleanSeries.length === 0) return null;

  const metric = perf.metric;

  const target = (perf.targetValue != null && isFinite(perf.targetValue)) ? perf.targetValue : null;
  const mk = metric.toLowerCase();
  const values = cleanSeries.map(s => s.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);

  let chartMin: number, chartMax: number;
  if (target !== null) {
    const maxDev = Math.max(Math.abs(dataMin - target), Math.abs(dataMax - target));
    const pad = Math.max(maxDev * 1.25, Math.abs(target) * 0.1, 1);
    chartMin = target - pad;
    chartMax = target + pad;
  } else {
    const rng = (dataMax - dataMin) || Math.abs(dataMax) * 0.1 || 1;
    chartMin = dataMin - rng * 0.15;
    chartMax = dataMax + rng * 0.15;
  }
  const span = chartMax - chartMin || 1;

  const W = 300, H = 72;
  const PL = 30, PR = 8, PT = 5, PB = 16;
  const pw = W - PL - PR;
  const ph = H - PT - PB;

  const toX = (i: number) =>
    PL + (cleanSeries.length === 1 ? pw / 2 : (i / (cleanSeries.length - 1)) * pw);
  const toY = (v: number) =>
    PT + Math.max(0, Math.min(1, (chartMax - v) / span)) * ph;

  const pts = values.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const polyPts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const bottom = PT + ph;
  const areaPath = [
    `M ${pts[0].x.toFixed(1)} ${bottom}`,
    `L ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`,
    ...pts.slice(1).map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${pts[pts.length - 1].x.toFixed(1)} ${bottom}`,
    'Z',
  ].join(' ');
  const targetY = target !== null ? PT + ph / 2 : null;

  function fmtY(v: number): string {
    if (/ctr/.test(mk)) return `${v.toFixed(1)}%`;
    if (/cpa|cpc|cpm|cpl/.test(mk)) return v >= 100 ? `$${Math.round(v)}` : `$${v.toFixed(1)}`;
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
  }

  let lineColor = perf.color ?? '#6366f1';
  if (perf.trend24h) {
    const { pctChange, improving } = perf.trend24h;
    if (Math.abs(pctChange) > 3) lineColor = improving ? '#4A7C59' : '#A0442A';
    else lineColor = '#B07030';
  }

  const lowerBetter = /cpa|cpc|cpm|cpl|cost/.test(mk);
  const aboveColor = lowerBetter ? '#ef4444' : '#22c55e';
  const belowColor = lowerBetter ? '#22c55e' : '#ef4444';
  const hasSplit = targetY !== null;

  const gradId = `sg_${clientId}`;
  const clipId = `sc_${clientId}`;

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 9, fontWeight: 600, color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {metric} · 30d
        </span>
        {perf.trend24h && (
          <span style={{ fontSize: 9, fontWeight: 700, color: perf.trend24h.improving ? '#4A7C59' : '#A0442A' }}>
            {perf.trend24h.pctChange < 0 ? '↓' : '↑'}{Math.abs(perf.trend24h.pctChange).toFixed(1)}% 24h
          </span>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          {hasSplit ? (
            <>
              <linearGradient id={`${gradId}_a`} x1="0" y1={PT} x2="0" y2={bottom} gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor={aboveColor} stopOpacity={0.15} />
                <stop offset="100%" stopColor={aboveColor} stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id={`${gradId}_b`} x1="0" y1={PT} x2="0" y2={bottom} gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor={belowColor} stopOpacity={0.03} />
                <stop offset="100%" stopColor={belowColor} stopOpacity={0.15} />
              </linearGradient>
              <clipPath id={clipId}><rect x={PL} y={PT} width={pw} height={ph} /></clipPath>
              <clipPath id={`${clipId}_a`}><rect x={PL} y={PT} width={pw} height={targetY! - PT} /></clipPath>
              <clipPath id={`${clipId}_b`}><rect x={PL} y={targetY!} width={pw} height={bottom - targetY!} /></clipPath>
            </>
          ) : (
            <>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0.01} />
              </linearGradient>
              <clipPath id={clipId}><rect x={PL} y={PT} width={pw} height={ph} /></clipPath>
            </>
          )}
        </defs>
        <line x1={PL} y1={PT} x2={PL} y2={bottom} stroke="#E5E7EB" strokeWidth={0.75} />
        <line x1={PL} y1={bottom} x2={PL + pw} y2={bottom} stroke="#E5E7EB" strokeWidth={0.75} />
        {[{ y: PT, label: fmtY(chartMax) }, { y: bottom, label: fmtY(chartMin) }].map(({ y, label }, i) => (
          <g key={i}>
            <line x1={PL - 3} y1={y} x2={PL} y2={y} stroke="#D1D5DB" strokeWidth={0.75} />
            <text x={PL - 5} y={y + 3} textAnchor="end" fontSize={7} fill="#9CA3AF" fontFamily="system-ui, sans-serif">{label}</text>
          </g>
        ))}
        {targetY !== null && (
          <line x1={PL} y1={targetY} x2={PL + pw} y2={targetY} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 3" />
        )}
        {cleanSeries.map((s, i) => {
          const x = toX(i);
          const d = new Date(`${s.date}T12:00:00`);
          const label = isNaN(d.getTime()) ? '' : String(d.getDate());
          const show = i === 0 || i === cleanSeries.length - 1 || i % 7 === 0;
          return (
            <g key={i}>
              <line x1={x} y1={bottom} x2={x} y2={bottom + 2} stroke="#D1D5DB" strokeWidth={0.75} />
              {show && <text x={x} y={bottom + 11} textAnchor="middle" fontSize={7} fill="#9CA3AF" fontFamily="system-ui, sans-serif">{label}</text>}
            </g>
          );
        })}
        {hasSplit ? (() => {
          const { redPath, greenPath } = buildSplitAreaPaths(pts, targetY!, bottom);
          return (
            <>
              {redPath && <path d={redPath} fill={`url(#${gradId}_a)`} clipPath={`url(#${clipId})`} />}
              {greenPath && <path d={greenPath} fill={`url(#${gradId}_b)`} clipPath={`url(#${clipId})`} />}
            </>
          );
        })() : (
          <path d={areaPath} fill={`url(#${gradId})`} clipPath={`url(#${clipId})`} />
        )}
        {hasSplit ? (
          <>
            <polyline points={polyPts} fill="none" stroke={aboveColor}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              clipPath={`url(#${clipId}_a)`} />
            <polyline points={polyPts} fill="none" stroke={belowColor}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              clipPath={`url(#${clipId}_b)`} />
          </>
        ) : (
          <polyline points={polyPts} fill="none" stroke={lineColor} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId})`} />
        )}
        {(() => {
          const lp = pts[pts.length - 1];
          const dotColor = hasSplit && targetY !== null
            ? (lp.y < targetY ? aboveColor : belowColor)
            : lineColor;
          return <circle cx={lp.x} cy={lp.y} r={3} fill={dotColor} />;
        })()}
      </svg>
    </div>
  );
}

// ── Subtle arc spinner shown while graph data is loading ──────────────────

function GraphSpinner() {
  return (
    <div style={{ width: '100%', height: 66, paddingTop: 4, position: 'relative' }}>
      <style>{`
        @keyframes cardArcSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      {/* Faint baseline to fill the space naturally */}
      <svg width="100%" height="100%" viewBox="0 0 300 62" preserveAspectRatio="none" style={{ display: 'block', position: 'absolute', inset: 0 }}>
        <line x1="0" y1="54" x2="300" y2="54" stroke="#F0EDE8" strokeWidth="0.75" />
      </svg>
      {/* Centred spinning arc */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={18} height={18} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <g style={{ animation: 'cardArcSpin 1.2s linear infinite', transformOrigin: '9px 9px' }}>
            <circle cx={9} cy={9} r={6.5} fill="none" stroke="#EAE7E1" strokeWidth={1.5} />
            <path d="M 9 2.5 A 6.5 6.5 0 0 1 15.5 9" fill="none" stroke="#8A8578" strokeWidth={1.5} strokeLinecap="round" />
          </g>
        </svg>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface ClientCardCompactProps {
  client: ClientCardData;
  selected: boolean;
  onClick: () => void;
  index?: number;
  onAccountManagerChange?: (clientId: string, am: string | null) => void;
  accountManagers?: AccountManager[];
  variant?: 'agency' | 'clients';
}

export function ClientCardCompact({
  client, selected, onClick, onAccountManagerChange, accountManagers = [], variant = 'agency',
}: ClientCardCompactProps) {
  const router = useRouter();
  const color = clientColor(client.id);
  const initials = clientInitials(client.name);
  const [showAmMenu, setShowAmMenu] = useState(false);
  const [currentAm, setCurrentAm] = useState<string | null>(client.account_manager ?? null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCurrentAm(client.account_manager ?? null); }, [client.account_manager]);

  useEffect(() => {
    if (!showAmMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowAmMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAmMenu]);

  async function assignAm(am: string | null) {
    setShowAmMenu(false);
    setCurrentAm(am);
    try {
      await fetch(`/api/agency/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_manager: am }),
      });
      onAccountManagerChange?.(client.id, am);
    } catch {
      setCurrentAm(client.account_manager ?? null);
    }
  }

  const [perf, setPerf] = useState<PerfData | null>(null);
  const [perfReady, setPerfReady] = useState(false);

  // Restore cached perf state before the first browser paint so the graph and
  // speedometer appear immediately instead of showing a blank/spinner frame.
  useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(`perf_cache_${client.id}`);
      if (raw) {
        setPerf(JSON.parse(raw));
        setPerfReady(true);
      }
    } catch {}
  }, [client.id]);

  const handleNeedle = useCallback((data: PerfData | null) => {
    setPerf(data);
    try {
      if (data) sessionStorage.setItem(`perf_cache_${client.id}`, JSON.stringify(data));
    } catch {}
  }, [client.id]);

  const outstanding = Math.max(0, client.totalActionPoints - client.completedActionPoints);
  const hasSpend = client.plannedBudget > 0;
  const spendPct = hasSpend ? Math.min(100, (client.actualSpend / client.plannedBudget) * 100) : 0;
  const monthElapsedPct = getMonthElapsed() * 100;
  const planProgress = getMediaPlanProgress(client.channels);

  return (
    <div
      style={{
        background: '#FDFCF8',
        border: selected ? '1.5px solid rgba(74,101,128,0.5)' : '1px solid #E0DCD4',
        borderRadius: 18,
        padding: '14px',
        marginBottom: 6,
        cursor: 'pointer',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        boxShadow: selected ? '0 2px 12px rgba(74,101,128,0.15)' : '0 2px 8px rgba(0,0,0,0.06)',
      }}
      onClick={() => { onClick(); router.push(`/clients/${client.id}/dashboard`); }}
    >
      {/* Row 1: Avatar + Name/AM */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: '#E8E5DE', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, overflow: 'hidden',
        }}>
          {client.logo_url ? (
            <img src={client.logo_url} alt={client.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
          ) : (
            <span style={{ color: '#8A8578', fontWeight: 500, fontSize: 13 }}>{initials}</span>
          )}
        </div>
        <span style={{
          flex: 1, fontWeight: 500, fontSize: 15, color: '#1C1917',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{client.name}</span>
        <div style={{ position: 'relative', flexShrink: 0 }} ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowAmMenu(v => !v); }}
            style={{
              fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 12,
              border: currentAm ? '0.5px solid rgba(74,101,128,0.3)' : '0.5px dashed #D5D0C5',
              background: currentAm ? 'rgba(74,101,128,0.08)' : 'transparent',
              color: currentAm ? '#4A6580' : '#B5B0A5',
              cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >{currentAm ?? 'AM'}</button>
          {showAmMenu && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4,
              background: '#FDFCF8', border: '0.5px solid #E8E4DC',
              borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              zIndex: 50, minWidth: 90, overflow: 'hidden',
            }}>
              {accountManagers.map(am => (
                <button key={am.id}
                  onClick={(e) => { e.stopPropagation(); void assignAm(am.name); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 12px', fontSize: 12,
                    color: currentAm === am.name ? '#4A6580' : '#1C1917',
                    fontWeight: currentAm === am.name ? 600 : 400,
                    background: currentAm === am.name ? 'rgba(74,101,128,0.06)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >{am.name}</button>
              ))}
              {currentAm && (
                <button onClick={(e) => { e.stopPropagation(); void assignAm(null); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 12px', fontSize: 11, color: '#B5B0A5',
                    background: 'transparent', border: 'none',
                    borderTop: '0.5px solid #E8E4DC', cursor: 'pointer',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >Unassign</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Performance metric + Open Actions + Speedometer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Hidden widget: fetches goals data and signals when the API has actually settled */}
          <div style={{ display: 'none' }}>
            <PerformanceWidget clientId={client.id} onNeedle={handleNeedle} onFetched={() => setPerfReady(true)} hideControls hideDisplay />
          </div>
          {!perfReady ? (
            <GraphSpinner />
          ) : variant === 'agency' ? (
            <SparkLine clientId={client.id} perf={perf} />
          ) : (
            <div style={{ minWidth: 0 }}>
              {/* Visible widget (shows metric label) — only mounted after data is ready */}
              <PerformanceWidget clientId={client.id} onNeedle={handleNeedle} hideControls />
              <SparkLine clientId={client.id} perf={perf} />
            </div>
          )}
        </div>
        <div style={{ width: 0.5, height: 40, background: '#E8E4DC', flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: apColor(outstanding) }}>{outstanding}</span>
          <span style={{ fontSize: 9, color: '#8A8578', textAlign: 'center', lineHeight: 1.3 }}>open actions</span>
        </div>
        <div style={{ width: 0.5, height: 40, background: '#E8E4DC', flexShrink: 0 }} />
        <div style={{ width: 62, height: 48, flexShrink: 0, overflow: 'hidden' }}>
          <div style={{ transform: 'scale(0.7)', transformOrigin: 'left top' }}>
            {!perfReady ? (
              /* Tiny centred spinner in the speedometer space */
              <div style={{ width: 88, height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width={14} height={14} viewBox="0 0 14 14" style={{ display: 'block' }}>
                  <g style={{ animation: 'cardArcSpin 1.2s linear infinite', transformOrigin: '7px 7px' }}>
                    <circle cx={7} cy={7} r={5} fill="none" stroke="#EAE7E1" strokeWidth={1.5} />
                    <path d="M 7 2 A 5 5 0 0 1 12 7" fill="none" stroke="#B5B0A5" strokeWidth={1.5} strokeLinecap="round" />
                  </g>
                </svg>
              </div>
            ) : perf?.hasData ? (
              <Speedometer needle={perf.needle} color={perf.color} sublabel="Performance" />
            ) : (
              <Speedometer needle={0.5} color="#B5B0A5" />
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Pacing bar — actual vs planned spend */}
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: '#8A8578', fontWeight: 500 }}>Spend</span>
          {hasSpend ? (
            <span style={{ fontSize: 10, color: '#1C1917', marginLeft: 'auto' }}>
              {formatCurrency(client.actualSpend)}
              <span style={{ color: '#B5B0A5' }}> / {formatCurrency(client.plannedBudget)}</span>
            </span>
          ) : (
            <span style={{ fontSize: 10, color: '#B5B0A5', marginLeft: 'auto' }}>No data</span>
          )}
        </div>
        <div style={{
          position: 'relative', width: '100%', height: 5,
          background: '#E8E4DC', borderRadius: 3, overflow: 'visible',
        }}>
          {hasSpend && (
            <div style={{
              height: '100%', width: `${spendPct}%`,
              background: spendPct > monthElapsedPct + 10 ? '#A0442A' :
                          spendPct < monthElapsedPct - 10 ? '#B07030' : '#4A7C59',
              borderRadius: 3, transition: 'width 0.3s',
            }} />
          )}
          {/* Time marker tick */}
          {hasSpend && (
            <div style={{
              position: 'absolute', top: -2, bottom: -2,
              left: `${Math.min(100, monthElapsedPct)}%`,
              width: 1.5, background: '#1C1917', opacity: 0.35, borderRadius: 1,
            }} />
          )}
        </div>
      </div>

      {/* Row 4: Time progress bar — media plan dates */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: '#8A8578', fontWeight: 500 }}>Plan</span>
          {planProgress ? (
            <span style={{ fontSize: 10, color: '#B5B0A5', marginLeft: 'auto' }}>
              {planProgress.startLabel} → {planProgress.endLabel}
            </span>
          ) : (
            <span style={{ fontSize: 10, color: '#B5B0A5', marginLeft: 'auto' }}>No dates set</span>
          )}
        </div>
        <div style={{
          position: 'relative', width: '100%', height: 5,
          background: '#E8E4DC', borderRadius: 3, overflow: 'hidden',
        }}>
          {planProgress && (
            <div style={{
              height: '100%',
              width: `${Math.round(planProgress.progress * 100)}%`,
              background: '#4A6580',
              borderRadius: 3, transition: 'width 0.3s',
            }} />
          )}
        </div>
      </div>

    </div>
  );
}
