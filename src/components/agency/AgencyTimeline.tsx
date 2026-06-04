// src/components/agency/AgencyTimeline.tsx
// Compact inline Gantt timeline for the agency card panel.
// One thick bar per client (campaign duration) with action point dots.
// Zoom in/out controls change pixels-per-day and the visible window.

'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Radio } from 'lucide-react';
import { getChannelLogo } from '@/lib/utils/channel-icons';
import type { GanttClient, GanttChannel } from './GanttCalendar';
import type { GanttAPMarker } from './FullscreenGanttView';

// ── Logo color extraction ─────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

function isTooLight(r: number, g: number, b: number): boolean {
  // luminance > 0.85 — skip near-white pixels
  return (0.299 * r + 0.587 * g + 0.114 * b) > 220;
}

function extractTwoDominantColors(imgEl: HTMLImageElement): [string, string] | null {
  try {
    const canvas = document.createElement('canvas');
    const size = 32;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(imgEl, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    // Two passes: one excluding near-white (to find the primary), one including all opaque pixels (to find secondary)
    const freqColored = new Map<string, { count: number; r: number; g: number; b: number }>();
    const freqAll     = new Map<string, { count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i+1], data[i+2], data[i+3]];
      if (a < 128) continue;
      const key = `${r >> 4},${g >> 4},${b >> 4}`;
      const addTo = (map: typeof freqAll) => {
        const entry = map.get(key);
        if (entry) { entry.count++; entry.r += r; entry.g += g; entry.b += b; }
        else map.set(key, { count: 1, r, g, b });
      };
      addTo(freqAll);
      if (!isTooLight(r, g, b)) addTo(freqColored);
    }

    if (freqColored.size === 0) return null;

    const toRgb = (map: typeof freqAll) =>
      [...map.values()]
        .sort((a, b) => b.count - a.count)
        .map(e => [Math.round(e.r / e.count), Math.round(e.g / e.count), Math.round(e.b / e.count)] as [number, number, number]);

    const c1 = toRgb(freqColored)[0];
    // Secondary: most frequent pixel (from all pixels) that contrasts sufficiently with primary
    const c2 = toRgb(freqAll).find(c => colorDistance(c, c1) > 60) ?? null;
    if (!c2) return null;
    return [rgbToHex(...c1), rgbToHex(...c2)];
  } catch {
    return null;
  }
}

function useLogoColors(logoUrl: string | null | undefined): [string, string] | null {
  const [colors, setColors] = useState<[string, string] | null>(null);

  useEffect(() => {
    if (!logoUrl) { setColors(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const result = extractTwoDominantColors(img);
      setColors(result);
    };
    img.onerror = () => setColors(null);
    img.src = logoUrl;
  }, [logoUrl]);

  return colors;
}

function stripeBackground(primary: string, secondary: string): string {
  // 3 thin secondary lines centered at 14px, 28px (halfway), 42px within the 56px bar height
  return [
    `linear-gradient(`,
    `  0deg,`,
    `  ${primary}   0px,  ${primary}  12px,`,
    `  ${secondary} 12px, ${secondary} 16px,`,
    `  ${primary}  16px,  ${primary}  26px,`,
    `  ${secondary} 26px, ${secondary} 30px,`,
    `  ${primary}  30px,  ${primary}  40px,`,
    `  ${secondary} 40px, ${secondary} 44px,`,
    `  ${primary}  44px,  ${primary}  56px`,
    `)`,
  ].join('');
}

const DAY_MS    = 86400000;
const LABEL_W = 180;
const ROW_H   = 120;
const RULER_H   = 48;

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Each zoom level: pixels per day + window span. Label shown in the % chip.
const ZOOM_LEVELS = [
  { dayW: 2,  windowDays: 730, label: '25%'  },  // 0 — 2 years
  { dayW: 3,  windowDays: 548, label: '33%'  },  // 1 — 18 months
  { dayW: 4,  windowDays: 365, label: '50%'  },  // 2 — 1 year
  { dayW: 7,  windowDays: 180, label: '75%'  },  // 3 — 6 months
  { dayW: 14, windowDays: 90,  label: '100%' },  // 4 — 3 months (default)
  { dayW: 22, windowDays: 56,  label: '150%' },  // 5 — 8 weeks
  { dayW: 36, windowDays: 35,  label: '200%' },  // 6 — 5 weeks
];
const DEFAULT_ZOOM = 4;

// Fallback stripe pairs: alternating light/dark grey + mid-tone accent
const FALLBACK_STRIPE_PAIRS: [string, string][] = [
  ['#E8E4DC', '#4A7AB5'], // light grey + blue
  ['#3A3A3A', '#4A7AB5'], // dark grey  + blue
  ['#E8E4DC', '#B54A4A'], // light grey + red
  ['#3A3A3A', '#B54A4A'], // dark grey  + red
  ['#E8E4DC', '#A06B20'], // light grey + gold
  ['#3A3A3A', '#A06B20'], // dark grey  + gold
  ['#E8E4DC', '#3D8A52'], // light grey + green
  ['#3A3A3A', '#3D8A52'], // dark grey  + green
  ['#E8E4DC', '#7A4AAA'], // light grey + purple
  ['#3A3A3A', '#7A4AAA'], // dark grey  + purple
  ['#E8E4DC', '#C07030'], // light grey + amber
  ['#3A3A3A', '#C07030'], // dark grey  + amber
  ['#E8E4DC', '#2E8A8A'], // light grey + teal
  ['#3A3A3A', '#2E8A8A'], // dark grey  + teal
  ['#E8E4DC', '#9A3A6A'], // light grey + burgundy
  ['#3A3A3A', '#9A3A6A'], // dark grey  + burgundy
];

function clientFallbackStripe(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return FALLBACK_STRIPE_PAIRS[Math.abs(hash) % FALLBACK_STRIPE_PAIRS.length];
}

// Keep for initials avatar accent color
function clientMutedColor(id: string): string {
  const [, dark] = clientFallbackStripe(id);
  return dark;
}

function dateToMs(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function msToLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function apDotColor(category: string, overdue: boolean): { fill: string; border: string } {
  if (overdue)                     return { fill: '#7A3A2E', border: '#5C2B22' };
  if (category === 'SET UP')       return { fill: '#9B5E4E', border: '#7A4438' };
  if (category === 'HEALTH CHECK') return { fill: '#9B8A3E', border: '#7A6C30' };
  return                                  { fill: '#5B7A8A', border: '#3E5C6B' };
}

function dueSummary(due: string | null, todayStr: string): { text: string; color: string } {
  if (!due) return { text: 'No due date', color: '#B5B0A5' };
  const diff = Math.round((dateToMs(due) - dateToMs(todayStr)) / DAY_MS);
  if (diff < -1)   return { text: `Overdue ${Math.abs(diff)}d`,         color: '#A0442A' };
  if (diff === -1) return { text: 'Due yesterday',                       color: '#A0442A' };
  if (diff === 0)  return { text: 'Due today',                           color: '#B07030' };
  if (diff === 1)  return { text: 'Due tomorrow',                        color: '#B07030' };
  if (diff < 7)    return { text: `Due in ${diff}d`,                     color: '#4A7C59' };
  if (diff < 30)   return { text: `Due in ${Math.round(diff / 7)}w`,     color: '#4A7C59' };
  return                  { text: `Due in ${Math.round(diff / 30)}mo`,   color: '#4A7C59' };
}

function channelBarColor(label: string, type: 'paid' | 'organic'): string {
  const l = label.toLowerCase();
  if (l.includes('meta') || l.includes('facebook'))  return '#1877F2';
  if (l.includes('google'))                           return '#F59E0B';
  if (l.includes('linkedin'))                         return '#0A66C2';
  if (l.includes('tiktok'))                           return '#0D9488';
  if (l.includes('instagram'))                        return '#C13584';
  if (l.includes('youtube'))                          return '#EF4444';
  if (l.includes('pinterest'))                        return '#E60023';
  if (l.includes('snapchat'))                         return '#CA8A04';
  if (l.includes('twitter') || l.includes('x ads'))  return '#1DA1F2';
  if (l.includes('bing') || l.includes('microsoft')) return '#5C6BC0';
  if (l.includes('programmatic') || l.includes('display') || l.includes('dv360')) return '#4F46E5';
  if (l.includes('linear tv') || l.includes('tv'))   return '#7C3AED';
  if (l.includes('svod'))                             return '#9333EA';
  if (l.includes('bvod'))                             return '#A855F7';
  if (l.includes('radio'))                            return '#B45309';
  if (l.includes('ooh'))                              return '#D97706';
  if (type === 'organic')                             return '#16A34A';
  return '#64748B';
}

interface TooltipState {
  clientX: number;
  clientY: number;
  marker: GanttAPMarker;
}

interface ClientTimelineRowProps {
  client: GanttClient;
  clientAPs: GanttAPMarker[];
  clientChannels: GanttChannel[];
  barStartMs: number | null;
  barEndMs: number | null;
  totalW: number;
  days: { ms: number; isWeekStart: boolean }[];
  xForMs: (ms: number) => number;
  todayX: number;
  dayW: number;
  windowStart: number;
  windowEnd: number;
  todayStr: string;
  setTooltip: (t: TooltipState | null) => void;
}

function ClientTimelineRow({
  client, clientAPs, clientChannels, barStartMs, barEndMs,
  totalW, days, xForMs, todayX, dayW,
  windowStart, windowEnd, todayStr, setTooltip,
}: ClientTimelineRowProps) {
  const [hovered, setHovered] = useState(false);
  const logoColors = useLogoColors(client.logo_url);
  const fallbackStripe = clientFallbackStripe(client.id);
  const fallbackColor  = clientMutedColor(client.id);

  const clampedStart = barStartMs !== null ? Math.max(barStartMs, windowStart) : null;
  const clampedEnd   = barEndMs   !== null ? Math.min(barEndMs,   windowEnd)   : null;
  const barX = clampedStart !== null ? xForMs(clampedStart) : null;
  const barW = clampedStart !== null && clampedEnd !== null
    ? Math.max(xForMs(clampedEnd) - xForMs(clampedStart), 4)
    : null;

  const activeColors = logoColors ?? fallbackStripe;
  const barBackground = stripeBackground(activeColors[0], activeColors[1]);

  // Visible channels: only those with at least one date in window
  const visibleChannels = clientChannels.filter(ch => {
    const s = ch.start_date ? dateToMs(ch.start_date) : null;
    const e = ch.end_date   ? dateToMs(ch.end_date)   : null;
    if (s === null && e === null) return false;
    const lo = s ?? e!;
    const hi = e ?? s!;
    return hi >= windowStart && lo <= windowEnd;
  });

  const chCount = visibleChannels.length;
  // Allocate vertical space per channel when hovered
  const CH_BAR_H = 12;

  return (
    <div
      style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid #F0EDE8' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Sticky label */}
      <div style={{
        width: LABEL_W, flexShrink: 0,
        borderRight: '1px solid #E8E4DC',
        display: 'flex', alignItems: 'center',
        padding: '0 8px', gap: 6,
        background: hovered ? '#F0EDE8' : '#FDFCF8',
        position: 'sticky', left: 0, zIndex: 5,
        transition: 'background 0.15s',
      }}>
        {client.logo_url ? (
          <img
            src={client.logo_url}
            alt=""
            style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'contain', flexShrink: 0, background: '#F0EDE8' }}
          />
        ) : (
          <div style={{
            width: 52, height: 52, borderRadius: 8, flexShrink: 0,
            background: fallbackColor + '33',
            border: `1px solid ${fallbackColor}66`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: fallbackColor, letterSpacing: '-0.02em' }}>
              {client.initials}
            </span>
          </div>
        )}
        <span style={{
          fontSize: 17, fontWeight: 600, color: '#1C1917',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          {client.name}
        </span>
      </div>

      {/* Timeline lane */}
      <div style={{
        position: 'relative', width: totalW, overflow: 'visible',
        background: hovered ? '#F7F5F0' : 'transparent',
        transition: 'background 0.15s',
      }}>
        {/* Week grid lines */}
        {days.filter(d => d.isWeekStart).map(d => (
          <div
            key={d.ms}
            style={{ position: 'absolute', left: xForMs(d.ms), top: 0, bottom: 0, width: 1, background: '#ECEAE4' }}
          />
        ))}

        {/* Today line */}
        <div style={{
          position: 'absolute', left: todayX + dayW / 2,
          top: 0, bottom: 0, width: 1.5,
          background: '#4A6580', opacity: 0.3, zIndex: 1,
        }} />

        {/* ── Default view: composite bar ── */}
        {barX !== null && barW !== null && (
          <div style={{
            position: 'absolute',
            left: barX, top: '50%', transform: 'translateY(-50%)',
            width: barW, height: 56,
            background: barBackground,
            borderRadius: 12,
            zIndex: 2,
            opacity: hovered ? 0 : 1,
            transition: 'opacity 0.15s',
            pointerEvents: hovered ? 'none' : 'auto',
          }} />
        )}

        {/* ── Hover view: individual channel bars + sticky pills ── */}
        <div style={{
          position: 'absolute', inset: 0,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s',
          pointerEvents: hovered ? 'auto' : 'none',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center',
          gap: 2,
          padding: '4px 0',
        }}>
          {visibleChannels.map((ch) => {
            const sMs = ch.start_date ? Math.max(dateToMs(ch.start_date), windowStart) : windowStart;
            const eMs = ch.end_date   ? Math.min(dateToMs(ch.end_date),   windowEnd)   : windowEnd;
            const chX = xForMs(sMs);
            const chW = Math.max(xForMs(eMs) - chX, 4);
            const color = channelBarColor(ch.label, ch.type);
            const isFuture  = ch.start_date ? ch.start_date > todayStr : false;
            const isPast    = ch.end_date   ? ch.end_date   < todayStr : false;
            const barOpacity = isFuture ? 0.55 : isPast ? 0.65 : 1;
            const isOrganic  = ch.type === 'organic';
            return (
              <div key={ch.id} style={{ position: 'relative', height: CH_BAR_H, flexShrink: 0 }}>
                {/* Bar */}
                <div style={{
                  position: 'absolute',
                  left: chX, width: chW, height: CH_BAR_H,
                  background: color,
                  borderRadius: 3,
                  opacity: barOpacity,
                }} />
                {/* Sticky pill — sits at the left edge of the visible timeline area */}
                <div style={{
                  position: 'sticky',
                  left: LABEL_W + 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  height: 18,
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  background: 'rgba(255,255,255,0.95)',
                  border: `1px solid ${color}55`,
                  borderRadius: 5,
                  padding: '0 5px 0 2px',
                  pointerEvents: 'none',
                  zIndex: 6,
                  maxWidth: 150,
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
                }}>
                  <span style={{
                    width: 10, height: 10, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isOrganic
                      ? <Radio size={9} strokeWidth={1.5} color={color} />
                      : getChannelLogo(ch.label, 'w-[9px] h-[9px]')
                    }
                  </span>
                  <span style={{
                    fontSize: 7.5, fontWeight: 700, color: '#1C1917',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}>
                    {ch.label}
                  </span>
                </div>
              </div>
            );
          })}
          {chCount === 0 && (
            <span style={{
              fontSize: 10, color: '#B5B0A5',
              fontFamily: "'DM Sans', system-ui, sans-serif",
              paddingLeft: 8,
            }}>No channels in view</span>
          )}
        </div>

        {/* Action point dots + always-visible bubble labels (non-overlapping) */}
        {(() => {
          // Layout: compute a stacking level for each visible AP so bubbles never overlap.
          const BUBBLE_H   = 18; // px — approximate bubble height
          const BUBBLE_GAP = 4;  // px gap between stacked bubbles
          const DOT_H      = 16;
          const DOT_GAP    = 3;  // gap between bubble bottom and dot top
          // Dot centre Y within the row (the timeline lane has no explicit height, row is ROW_H)
          const dotCenterY = ROW_H / 2;
          // Estimate bubble width: icon(13) + padding(8) + ~5px/char
          const estimateBubbleW = (text: string) => 13 + 8 + text.length * 5.2;

          // Collect visible APs with cx
          const visible = clientAPs
            .filter(ap => ap.due_date && dateToMs(ap.due_date) >= windowStart && dateToMs(ap.due_date) <= windowEnd)
            .map((ap, i) => ({
              ap, i,
              cx: xForMs(dateToMs(ap.due_date!)) + dayW / 2,
              bw: estimateBubbleW(ap.category === 'SET UP' ? 'Set Up' : 'Check'),
            }))
            .sort((a, b) => a.cx - b.cx);

          // Horizontal sweep: place each bubble as close to its natural cx as possible,
          // pushing right to clear any overlap with the previous bubble.
          const BUBBLE_SEP = 4; // min gap between adjacent bubbles
          const bubbleLefts: number[] = [];
          let prevRight = -Infinity;
          for (const { cx, bw } of visible) {
            const natural = cx - bw / 2;
            const left = Math.max(natural, prevRight + BUBBLE_SEP);
            bubbleLefts.push(left);
            prevRight = left + bw;
          }

          return visible.map(({ ap, i, cx, bw }, idx) => {
            const isOverdue  = ap.due_date! < todayStr;
            const dot        = apDotColor(ap.category, isOverdue);
            const isSetUp    = ap.category === 'SET UP';
            const bubbleBg   = isSetUp ? '#C0392B' : '#D4860A';
            const bubbleText = isSetUp ? 'Set Up' : 'Check';
            const isOrganic  = /organic|social|seo|email|edm|content/i.test(ap.channel_label);

            const dotTop    = dotCenterY - DOT_H / 2;
            const bubbleTop = dotTop - DOT_GAP - BUBBLE_H;
            const bubbleLeft = bubbleLefts[idx];

            return (
              <div
                key={ap.id ?? i}
                style={{ position: 'absolute', left: 0, top: 0, zIndex: 4, cursor: 'pointer' }}
                onMouseEnter={(e) => setTooltip({ clientX: e.clientX, clientY: e.clientY, marker: ap })}
                onMouseMove={(e)  => setTooltip({ clientX: e.clientX, clientY: e.clientY, marker: ap })}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Bubble */}
                <div style={{
                  position: 'absolute',
                  left: bubbleLeft,
                  top: bubbleTop,
                  display: 'flex', alignItems: 'center', gap: 3,
                  background: bubbleBg,
                  borderRadius: 5,
                  padding: '2px 5px 2px 3px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                  pointerEvents: 'none',
                  height: BUBBLE_H,
                }}>
                  <span style={{
                    width: 11, height: 11, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    filter: 'brightness(0) invert(1)',
                  }}>
                    {isOrganic
                      ? <Radio size={9} strokeWidth={2} color="#fff" />
                      : getChannelLogo(ap.channel_label, 'w-[9px] h-[9px]')
                    }
                  </span>
                  <span style={{
                    fontSize: 8, fontWeight: 700, color: '#fff',
                    letterSpacing: '0.03em',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}>
                    {bubbleText}
                  </span>
                </div>
                {/* Dot */}
                <div style={{
                  position: 'absolute',
                  left: cx - DOT_H / 2,
                  top: dotTop,
                  width: DOT_H, height: DOT_H, borderRadius: '50%',
                  background: dot.fill,
                  border: `1.5px solid ${dot.border}`,
                }} />
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

export { ZOOM_LEVELS, DEFAULT_ZOOM };

export interface AgencyTimelineProps {
  clients: GanttClient[];
  channels: GanttChannel[];
  actionPointMarkers: GanttAPMarker[];
  zoomIdx?: number;
  onZoomChange?: (idx: number) => void;
}

export function AgencyTimeline({ clients, channels, actionPointMarkers, zoomIdx: zoomIdxProp, onZoomChange }: AgencyTimelineProps) {
  const scrollRef    = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomIdxInternal, setZoomIdxInternal] = useState(DEFAULT_ZOOM);
  const zoomIdx    = zoomIdxProp ?? zoomIdxInternal;
  const setZoomIdx = onZoomChange ?? setZoomIdxInternal;
  const [tooltip, setTooltip]       = useState<TooltipState | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const { dayW, windowDays } = ZOOM_LEVELS[zoomIdx];

  const todayMs = useMemo(() => {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const todayStr = useMemo(() => {
    const d = new Date(todayMs);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }, [todayMs]);

  // Window: centre on today, extend by half the window on each side
  const halfDays   = Math.floor(windowDays / 2);
  const windowStart = todayMs - halfDays * DAY_MS;
  const windowEnd   = todayMs + (windowDays - halfDays) * DAY_MS;
  const totalDays   = windowDays;
  const totalW      = totalDays * dayW;

  const xForMs = useCallback(
    (ms: number) => ((ms - windowStart) / DAY_MS) * dayW,
    [windowStart, dayW]
  );
  const todayX = xForMs(todayMs);

  // Scroll to keep today visible after zoom changes
  useEffect(() => {
    if (!scrollRef.current) return;
    // Position today ~¼ of the way from the left of the scroll container
    const containerW = scrollRef.current.clientWidth - LABEL_W;
    const scrollTo = Math.max(0, todayX - containerW * 0.25);
    scrollRef.current.scrollLeft = scrollTo;
  }, [todayX, zoomIdx]);

  // Group channels and APs per client
  const clientRows = useMemo(() =>
    clients.map(client => {
      const clientChannels = channels.filter(ch => ch.client_id === client.id);
      const clientAPs      = actionPointMarkers.filter(ap => ap.client_id === client.id);

      let barStartMs: number | null = null;
      let barEndMs:   number | null = null;
      for (const ch of clientChannels) {
        if (ch.start_date) { const ms = dateToMs(ch.start_date); if (barStartMs === null || ms < barStartMs) barStartMs = ms; }
        if (ch.end_date)   { const ms = dateToMs(ch.end_date);   if (barEndMs   === null || ms > barEndMs)   barEndMs   = ms; }
      }

      return { client, clientAPs, clientChannels, barStartMs, barEndMs };
    }),
    [clients, channels, actionPointMarkers]
  );

  // Build ruler day list — density adapts to zoom level
  const days = useMemo(() => {
    const result: { ms: number; dom: number; isMonthStart: boolean; monthLabel: string; isWeekStart: boolean }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const ms  = windowStart + i * DAY_MS;
      const d   = new Date(ms);
      const dom = d.getUTCDate();
      result.push({
        ms,
        dom,
        isMonthStart: dom === 1,
        monthLabel:   `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
        isWeekStart:  d.getUTCDay() === 1,
      });
    }
    return result;
  }, [windowStart, totalDays]);

  // Compute tooltip position relative to container
  useEffect(() => {
    if (!tooltip || !containerRef.current) { setTooltipPos(null); return; }
    const rect = containerRef.current.getBoundingClientRect();
    let x = tooltip.clientX - rect.left + 12;
    let y = tooltip.clientY - rect.top - 8;
    if (x + 200 > rect.width) x = rect.width - 210;
    if (y < 50) y = 50;
    setTooltipPos({ x, y });
  }, [tooltip]);

  if (clients.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 120, color: '#B5B0A5', fontSize: 13,
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}>
        No clients to display
      </div>
    );
  }

  // Ruler: show day numbers only when zoomed in enough (dayW ≥ 14)
  const showDayNumbers = dayW >= 14;
  // Show every-other day when dayW is 14, every day above that
  const dayStep = dayW >= 22 ? 1 : 2;

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      onMouseLeave={() => { setTooltip(null); setTooltipPos(null); }}
    >
      <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', minHeight: 0 }}>
        <div style={{ position: 'relative', width: LABEL_W + totalW }}>

          {/* ── Ruler ── */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 10,
            display: 'flex', height: RULER_H,
            background: '#F7F5F0', borderBottom: '1px solid #E8E4DC',
          }}>
            {/* Corner — client label only */}
            <div style={{
              width: LABEL_W, flexShrink: 0,
              borderRight: '1px solid #E8E4DC',
              display: 'flex', alignItems: 'center',
              padding: '0 8px',
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#B5B0A5', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Client
              </span>
            </div>

            {/* Date ruler */}
            <div style={{ position: 'relative', width: totalW, flexShrink: 0, overflow: 'hidden' }}>
              {/* Month labels — always shown */}
              {days.filter(d => d.isMonthStart).map(d => (
                <span
                  key={d.ms}
                  style={{
                    position: 'absolute',
                    left: xForMs(d.ms) + 3,
                    top: showDayNumbers ? 5 : 14,
                    fontSize: 10, fontWeight: 700, color: '#6B6560', whiteSpace: 'nowrap',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  {d.monthLabel}
                </span>
              ))}

              {/* Week tick marks when not showing day numbers */}
              {!showDayNumbers && days.filter(d => d.isWeekStart).map(d => (
                <div
                  key={d.ms}
                  style={{
                    position: 'absolute',
                    left: xForMs(d.ms) + dayW / 2,
                    top: 30, width: 1, height: 6,
                    background: '#C0BBB4',
                  }}
                />
              ))}

              {/* Day numbers — only when zoomed in */}
              {showDayNumbers && days.filter(d => d.dom % dayStep === 1 || d.isMonthStart).map(d => {
                const isToday = d.ms === todayMs;
                return (
                  <span
                    key={d.ms}
                    style={{
                      position: 'absolute',
                      left: xForMs(d.ms),
                      top: 26,
                      width: dayW,
                      textAlign: 'center',
                      fontSize: 9,
                      fontWeight: isToday ? 800 : 400,
                      color: isToday ? '#4A6580' : '#C0BBB4',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}
                  >
                    {d.dom}
                  </span>
                );
              })}

              {/* Today indicator tick */}
              <div style={{
                position: 'absolute',
                left: xForMs(todayMs) + dayW / 2 - 1,
                top: 38, width: 2, height: 10,
                background: '#4A6580', borderRadius: 1,
              }} />
            </div>
          </div>

          {/* ── Client rows ── */}
          {clientRows.map(({ client, clientAPs, clientChannels, barStartMs, barEndMs }) => (
            <ClientTimelineRow
              key={client.id}
              client={client}
              clientAPs={clientAPs}
              clientChannels={clientChannels}
              barStartMs={barStartMs}
              barEndMs={barEndMs}
              totalW={totalW}
              days={days}
              xForMs={xForMs}
              todayX={todayX}
              dayW={dayW}
              windowStart={windowStart}
              windowEnd={windowEnd}
              todayStr={todayStr}
              setTooltip={setTooltip}
            />
          ))}
        </div>
      </div>

      {/* ── Tooltip ── */}
      {tooltip && tooltipPos && (() => {
        const { text, color } = dueSummary(tooltip.marker.due_date, todayStr);
        return (
          <div style={{
            position: 'absolute',
            left: tooltipPos.x, top: tooltipPos.y,
            transform: 'translateY(-100%)',
            background: '#1C1917', color: '#FDFCF8',
            borderRadius: 8, padding: '8px 10px',
            fontSize: 11, maxWidth: 200,
            zIndex: 50, pointerEvents: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            <div style={{ fontWeight: 600, marginBottom: 3, lineHeight: 1.35 }}>
              {tooltip.marker.text}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                background: 'rgba(255,255,255,0.12)', borderRadius: 4,
                padding: '1px 5px', color: '#FDFCF8',
              }}>
                {tooltip.marker.category}
              </span>
              <span style={{ fontSize: 10, color }}>{text}</span>
            </div>
            {tooltip.marker.channel_label && (
              <div style={{ fontSize: 10, color: '#B5B0A5' }}>
                {tooltip.marker.channel_label}
              </div>
            )}
            {tooltip.marker.due_date && (
              <div style={{ fontSize: 10, color: '#B5B0A5', marginTop: 1 }}>
                {msToLabel(dateToMs(tooltip.marker.due_date))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
