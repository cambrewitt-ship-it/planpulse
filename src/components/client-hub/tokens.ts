/**
 * Design tokens for the Client Hub — lifted verbatim from Client-Hub-design.html
 * so the rebuild stays pixel-close to the reference.
 */

export const COLOR = {
  bg: '#F5F3EF',
  sidebar: '#1C1917',
  sidebarPanel: '#2A2622',
  sidebarBorder: '#423C35',
  sidebarMuted: '#A99F91',
  sidebarText: '#EDE9E2',
  card: '#FBFAF7',
  cardBorder: '#E4DFD5',
  divider: '#EAE6DC',
  ink: '#1C1917',
  muted: '#8A8377',
  mutedSecondary: '#6B645C',
  accent: 'oklch(0.58 0.19 35)',
  accentHover: 'oklch(0.46 0.2 35)',
  good: 'oklch(0.5 0.2 145)',
  goodBright: 'oklch(0.62 0.2 145)',
  caution: 'oklch(0.68 0.19 80)',
  hiddenOutline: '#C9BEA9',
} as const;

export const CHANNEL_HUES: Record<string, number> = {
  'meta-ads': 200,
  'google-ads': 35,
  'linkedin-ads': 280,
  'tiktok-ads': 30,
  'organic-social': 145,
  edm: 80,
  ooh: 260,
};

export function channelColor(platform: string): string {
  const hue = CHANNEL_HUES[platform] ?? 200;
  return `oklch(0.58 0.19 ${hue})`;
}

export const FONT_HEAD = "'Plus Jakarta Sans', system-ui, sans-serif";
export const FONT_BODY = "'DM Sans', system-ui, sans-serif";

export const cardStyle: React.CSSProperties = {
  background: COLOR.card,
  border: `1px solid ${COLOR.cardBorder}`,
  borderRadius: 6,
};

export const sectionTitleStyle: React.CSSProperties = {
  fontFamily: FONT_HEAD,
  fontSize: 22,
  fontWeight: 400,
  margin: '0 0 16px',
  color: COLOR.ink,
};

export const SECTION_META: Array<{ key: string; label: string }> = [
  { key: 'snapshot', label: 'Overview' },
  { key: 'charts', label: 'Performance' },
  { key: 'pacing', label: 'Pacing' },
  { key: 'goals', label: 'Goals' },
  { key: 'brief', label: 'Brief' },
  { key: 'notes', label: 'Notes' },
  { key: 'documents', label: 'Documents' },
  { key: 'spend', label: 'Spend by channel' },
];

export function fmtMoney(v: number): string {
  return '$' + Math.round(v).toLocaleString('en-US');
}

export function fmtCompact(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.round(v).toLocaleString('en-US');
}

export function fmtPct(v: number): string {
  return v.toFixed(2) + '%';
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function clampPct(v: number, min: number, max: number): number {
  if (max === min) return 50;
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
}
