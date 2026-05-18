// src/components/agency/ClientCardCompact.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientCardData } from '@/app/api/agency/clients/route';
import { PerformanceWidget, type PerfData } from './PerformanceWidget';

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
  const today = new Date();
  const startD = new Date(earliest);
  const endD = new Date(latest);
  if (startD >= endD) return null;
  const progress = today < startD ? 0 : today > endD ? 1 : (today.getTime() - startD.getTime()) / (endD.getTime() - startD.getTime());
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return { progress, startLabel: fmt(startD), endLabel: fmt(endD) };
}

// ── Month elapsed % for pacing marker ─────────────────────────────────────

function getMonthElapsed(): number {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.min(1, now.getDate() / daysInMonth);
}

// ── Action points colour ───────────────────────────────────────────────────

function apColor(count: number): string {
  if (count >= 6) return '#A0442A';
  if (count >= 3) return '#B07030';
  return '#B5B0A5';
}

// ── Sparkline: 7-day metric vs target ────────────────────────────────────

function SparkLine({ perf }: { perf: PerfData | null }) {
  const series = perf?.dailySeries ?? [];
  const metric = perf?.metric ?? '';
  const target = perf?.targetValue ?? null;

  // Line colour from 24h trend, falling back to needle colour
  let lineColor = perf?.color ?? '#B5B0A5';
  if (perf?.trend24h) {
    const { pctChange, improving } = perf.trend24h;
    if (Math.abs(pctChange) > 3) lineColor = improving ? '#4A7C59' : '#A0442A';
    else lineColor = '#B07030';
  }

  const label24h = perf?.trend24h
    ? `${perf.trend24h.improving ? '↑' : '↓'} ${Math.abs(perf.trend24h.pctChange).toFixed(1)}% 24h`
    : null;

  // SVG geometry
  const W = 100, H = 26, PAD_X = 1, PAD_Y = 2;
  const lowerBetter = /cpa|cpc|cpm|cpl|cost/.test(metric.toLowerCase());

  let pathD = '';
  let targetY: number | null = null;
  let pts: { x: number; y: number }[] = [];

  if (series.length >= 1) {
    const allVals = target != null ? [...series, target] : series;
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    const range = maxV - minV || 1;

    const toY = (v: number) => {
      const score = lowerBetter ? (maxV - v) / range : (v - minV) / range;
      return H - PAD_Y - score * (H - PAD_Y * 2);
    };

    pts = series.map((v, i) => ({
      x: series.length === 1 ? W / 2 : PAD_X + (i / (series.length - 1)) * (W - PAD_X * 2),
      y: toY(v),
    }));

    if (pts.length >= 2) {
      pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    }
    if (target != null) targetY = toY(target);
  }

  const lastPt = pts[pts.length - 1] ?? null;

  return (
    <div style={{ paddingTop: 3 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 9, fontWeight: 600, color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {metric || 'Performance'}
        </span>
        {label24h ? (
          <span style={{ fontSize: 9, fontWeight: 700, color: lineColor }}>{label24h}</span>
        ) : (
          <span style={{ fontSize: 9, color: '#C5C0B8' }}>7d</span>
        )}
      </div>

      {series.length >= 1 ? (
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
          {/* Target reference line */}
          {targetY != null && (
            <line x1={PAD_X} y1={targetY} x2={W - PAD_X} y2={targetY}
              stroke="#C8C3BB" strokeWidth={0.75} strokeDasharray="2,2" />
          )}
          {/* Series line (only when 2+ points) */}
          {pathD && <path d={pathD} fill="none" stroke={lineColor} strokeWidth={1.5}
            strokeLinecap="round" strokeLinejoin="round" />}
          {/* Latest value dot */}
          {lastPt && <circle cx={lastPt.x} cy={lastPt.y} r={2} fill={lineColor} />}
        </svg>
      ) : (
        <div style={{ height: H, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#C5C0B8' }}>No data</span>
        </div>
      )}
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
  const handleNeedle = useCallback((data: PerfData | null) => setPerf(data), []);

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
          {variant === 'agency' ? (
            /* Agency: hidden widget fetches data, we render pacing line */
            <>
              <PerformanceWidget clientId={client.id} onNeedle={handleNeedle} hideControls hideDisplay />
              <SparkLine perf={perf} />
            </>
          ) : (
            /* Clients: visible widget shows metric + source, pacing line below */
            <div style={{ minWidth: 0 }}>
              <PerformanceWidget clientId={client.id} onNeedle={handleNeedle} hideControls />
              <SparkLine perf={perf} />
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
            {perf?.hasData ? (
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
