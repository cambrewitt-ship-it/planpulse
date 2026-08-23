'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { COLOR, FONT_BODY, cardStyle, sectionTitleStyle, fmtDate } from './tokens';
import { CpaTrendGearButton, CpaTrendModal } from './cpa-trend-editor';
import { DEFAULT_CPA_TREND_WIDGET, type CpaTrendConfig } from '@/lib/client-hub/cpa-trend-widget';

export interface CpaTrendSectionProps {
  clientId: string;
  token?: string;
  editable: boolean;
}

interface SeriesPoint {
  date: string;
  value: number;
}

function fmtY(v: number): string {
  return v >= 100 ? `$${Math.round(v)}` : `$${v.toFixed(1)}`;
}

// Builds separate area paths for the above-target and below-target regions of
// the line, each extended down to the chart bottom. Inserting crossing points
// at every target-line transition keeps the two fills from bleeding into
// each other's columns when the line crosses back and forth over the target.
function buildSplitAreaPaths(
  pts: { x: number; y: number }[],
  targetY: number,
  bottom: number,
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

function CpaChart({ series, target }: { series: SeriesPoint[]; target: number | null }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 400, H = 130;
  const PL = 56, PR = 12, PT = 6, PB = 20;
  const pw = W - PL - PR;
  const ph = H - PT - PB;
  const bottom = PT + ph;

  const values = series.map(s => s.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);

  let chartMin: number, chartMax: number;
  if (target != null) {
    chartMax = target * 1.5;
    chartMin = Math.max(0, target * 0.5);
  } else {
    const r = (dataMax - dataMin) || Math.abs(dataMax) * 0.1 || 1;
    chartMin = Math.max(0, dataMin - r * 0.15);
    chartMax = dataMax + r * 0.15;
  }
  const span = chartMax - chartMin || 1;

  const toX = (i: number) => PL + (series.length === 1 ? pw / 2 : (i / (series.length - 1)) * pw);
  const toY = (v: number) => {
    const ratio = (chartMax - v) / span;
    return PT + Math.max(0, Math.min(1, ratio)) * ph;
  };

  const pts = values.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const polyPts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const targetY = target != null ? toY(target) : null;
  const hasSplit = targetY !== null;

  // Lower CPA is better: below target fills green, above target fills red.
  const aboveColor = COLOR.accent;
  const belowColor = COLOR.good;

  const areaPath = [
    `M ${pts[0].x.toFixed(1)} ${bottom}`,
    `L ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`,
    ...pts.slice(1).map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${pts[pts.length - 1].x.toFixed(1)} ${bottom}`,
    'Z',
  ].join(' ');

  const yTicks = [
    { y: PT, label: fmtY(chartMax) },
    { y: PT + ph, label: fmtY(chartMin) },
  ];

  const gradId = 'cpaGrad';
  const clipId = 'cpaClip';

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0, minDist = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - svgX);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    setHoverIdx(nearest);
  };

  return (
    <svg
      ref={svgRef}
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <defs>
        {hasSplit ? (
          <>
            <linearGradient id={`${gradId}_a`} x1="0" y1={PT} x2="0" y2={bottom} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={aboveColor} stopOpacity={0.22} />
              <stop offset="100%" stopColor={aboveColor} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={`${gradId}_b`} x1="0" y1={PT} x2="0" y2={bottom} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={belowColor} stopOpacity={0.22} />
              <stop offset="100%" stopColor={belowColor} stopOpacity={0.02} />
            </linearGradient>
            <clipPath id={clipId}><rect x={PL} y={PT} width={pw} height={ph} /></clipPath>
            <clipPath id={`${clipId}_a`}><rect x={PL} y={PT} width={pw} height={targetY! - PT} /></clipPath>
            <clipPath id={`${clipId}_b`}><rect x={PL} y={targetY!} width={pw} height={bottom - targetY!} /></clipPath>
          </>
        ) : (
          <>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR.accent} stopOpacity={0.18} />
              <stop offset="100%" stopColor={COLOR.accent} stopOpacity={0.01} />
            </linearGradient>
            <clipPath id={clipId}><rect x={PL} y={PT} width={pw} height={ph} /></clipPath>
          </>
        )}
      </defs>

      <line x1={PL} y1={PT} x2={PL} y2={bottom} stroke={COLOR.cardBorder} strokeWidth={0.75} />
      <line x1={PL} y1={bottom} x2={PL + pw} y2={bottom} stroke={COLOR.cardBorder} strokeWidth={0.75} />

      {yTicks.map(({ y, label }, i) => (
        <g key={i}>
          <line x1={PL - 3} y1={y} x2={PL} y2={y} stroke={COLOR.cardBorder} strokeWidth={0.75} />
          <text x={PL - 5} y={y + 4} textAnchor="end" fontSize={9.5} fill={COLOR.muted} fontFamily={FONT_BODY}>{label}</text>
        </g>
      ))}

      {[PT, PT + ph / 2, bottom].map((y, i) => (
        <line key={i} x1={PL} y1={y} x2={PL + pw} y2={y} stroke={COLOR.divider} strokeWidth={0.5} />
      ))}

      {targetY !== null && (
        <g>
          <line x1={PL} y1={targetY} x2={PL + pw} y2={targetY} stroke={COLOR.mutedSecondary} strokeWidth={1} strokeDasharray="3 3" />
          <line x1={PL - 3} y1={targetY} x2={PL} y2={targetY} stroke={COLOR.cardBorder} strokeWidth={0.75} />
          <text x={PL - 5} y={targetY + 3.5} textAnchor="end" fontSize={9.5} fontWeight={600} fill={COLOR.mutedSecondary} fontFamily={FONT_BODY}>
            Target {fmtY(target!)}
          </text>
        </g>
      )}

      {series.map((s, i) => {
        const x = toX(i);
        const showLabel = i === 0 || i === series.length - 1 || i % 5 === 0;
        return (
          <g key={i}>
            <line x1={x} y1={bottom} x2={x} y2={bottom + 3} stroke={COLOR.cardBorder} strokeWidth={0.75} />
            {showLabel && (
              <text x={x} y={bottom + 14} textAnchor="middle" fontSize={9} fill={COLOR.muted} fontFamily={FONT_BODY}>
                {fmtDate(s.date).split(' ').slice(0, 2).join(' ')}
              </text>
            )}
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
          <polyline points={polyPts} fill="none" stroke={aboveColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId}_a)`} />
          <polyline points={polyPts} fill="none" stroke={belowColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId}_b)`} />
        </>
      ) : (
        <polyline points={polyPts} fill="none" stroke={COLOR.accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId})`} />
      )}

      {(() => {
        const lp = pts[pts.length - 1];
        const dotColor = hasSplit && targetY !== null ? (lp.y < targetY ? aboveColor : belowColor) : COLOR.accent;
        return <circle cx={lp.x} cy={lp.y} r={3} fill={dotColor} />;
      })()}

      {hoverIdx !== null && (() => {
        const hp = pts[hoverIdx];
        const hs = series[hoverIdx];
        const hv = values[hoverIdx];
        const valLabel = fmtY(hv);
        const dateLabel = fmtDate(hs.date);
        const tipW = 60, tipH = 30, tipPad = 6;
        const tipX = hp.x + tipPad + tipW > PL + pw ? hp.x - tipW - tipPad : hp.x + tipPad;
        const tipY = Math.max(PT, Math.min(hp.y - tipH / 2, bottom - tipH));
        const hoverColor = hasSplit && targetY !== null ? (hp.y < targetY ? aboveColor : belowColor) : COLOR.accent;
        return (
          <g>
            <line x1={hp.x} y1={PT} x2={hp.x} y2={bottom} stroke={COLOR.mutedSecondary} strokeWidth={0.75} strokeDasharray="3 2" />
            <circle cx={hp.x} cy={hp.y} r={3.5} fill={COLOR.card} stroke={hoverColor} strokeWidth={1.5} />
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={4} fill={COLOR.ink} opacity={0.9} />
            <text x={tipX + tipW / 2} y={tipY + 13} textAnchor="middle" fontSize={10} fontWeight={700} fill={COLOR.bg} fontFamily={FONT_BODY}>{valLabel}</text>
            <text x={tipX + tipW / 2} y={tipY + 24} textAnchor="middle" fontSize={8.5} fill={COLOR.sidebarMuted} fontFamily={FONT_BODY}>{dateLabel}</text>
          </g>
        );
      })()}
    </svg>
  );
}

export function CpaTrendSection({ clientId, token, editable }: CpaTrendSectionProps) {
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<CpaTrendConfig>(DEFAULT_CPA_TREND_WIDGET);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = token ? `/api/hub/${token}/cpa-trend` : `/api/clients/${clientId}/hub/cpa-trend`;
      const res = await fetch(url);
      const data = res.ok ? await res.json() : null;
      if (data) {
        setSeries(Array.isArray(data.series) ? data.series : []);
        setTarget(data.target ?? null);
      }
    } catch {
      // ignore — section falls back to its empty/loading state
    } finally {
      setLoading(false);
    }
  }, [clientId, token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!editable) return;
    fetch(`/api/clients/${clientId}/hub/cpa-trend-config`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data?.cpaTrendWidget) setConfig(data.cpaTrendWidget); })
      .catch(() => {});
  }, [clientId, editable]);

  const handleConfigSave = useCallback(async (patch: Partial<CpaTrendConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    try {
      const res = await fetch(`/api/clients/${clientId}/hub/cpa-trend-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.cpaTrendWidget);
      }
    } catch { /* keep optimistic local value */ }
    await load();
  }, [clientId, config, load]);

  if (!editable && !loading && series.length === 0) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>CPA trend</h2>
        {editable && <CpaTrendGearButton onClick={() => setSettingsOpen(true)} />}
      </div>
      <div style={{ ...cardStyle, padding: '22px 24px' }}>
        <div style={{ fontSize: 11.5, color: COLOR.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          7-day rolling average · last 30 days
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: COLOR.muted, padding: '40px 0', textAlign: 'center' }}>Loading…</div>
        ) : series.length === 0 ? (
          <div style={{ fontSize: 13, color: COLOR.muted, padding: '40px 0', textAlign: 'center' }}>No CPA data yet for this period.</div>
        ) : (
          <div style={{ maxWidth: 840, margin: '0 auto' }}>
            <CpaChart series={series} target={target} />
          </div>
        )}
      </div>

      {settingsOpen && (
        <CpaTrendModal
          clientId={clientId}
          config={config}
          onSave={handleConfigSave}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
