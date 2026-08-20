'use client';

import type {
  HubMetric, HubTrendPoint, HubChannelActual, HubPacing, HubGoal, HubBrief, HubNote, HubDocument, HubSpendRow,
} from '@/lib/client-hub/get-hub-data';
import { COLOR, FONT_HEAD, cardStyle, sectionTitleStyle, channelColor, fmtMoney, fmtCompact, fmtPct, fmtDate, clampPct } from './tokens';

// ── Metrics snapshot ────────────────────────────────────────────────────────

function formatMetricValue(m: HubMetric): string {
  switch (m.format) {
    case 'currency': return fmtMoney(m.value);
    case 'percent': return fmtPct(m.value);
    case 'compact': return fmtCompact(m.value);
    default: return Math.round(m.value).toLocaleString('en-US');
  }
}

export function MetricsSnapshot({ metrics }: { metrics: HubMetric[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {metrics.map(m => (
        <div key={m.key} style={{ ...cardStyle, padding: '16px 16px 14px' }}>
          <div style={{ fontSize: 12, color: COLOR.muted, marginBottom: 8 }}>{m.label}</div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 26, lineHeight: 1 }}>{formatMetricValue(m)}</div>
          <div style={{ fontSize: 11.5, color: COLOR.muted, marginTop: 8 }}>{m.sub}</div>
          {m.deltaPct != null && (
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: m.deltaPct >= 0 ? COLOR.good : COLOR.accent }}>
              {m.deltaPct >= 0 ? '+' : ''}{m.deltaPct.toFixed(1)}% vs prior period
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Performance charts ───────────────────────────────────────────────────────

export function PerformanceCharts({ monthlyTrend, channelActuals }: { monthlyTrend: HubTrendPoint[]; channelActuals: HubChannelActual[] }) {
  const maxSpend = Math.max(1, ...monthlyTrend.map(t => t.spend));
  const maxLeads = Math.max(1, ...monthlyTrend.map(t => t.leads));
  const n = monthlyTrend.length || 1;
  const dots = monthlyTrend.map((t, i) => ({
    x: (i + 0.5) * (100 / n),
    y: 100 - (t.leads / maxLeads) * 88 - 4,
  }));
  const linePoints = dots.map(d => `${d.x.toFixed(2)},${d.y.toFixed(2)}`).join(' ');

  const totalSpend = channelActuals.reduce((s, c) => s + c.spend, 0);
  let cum = 0;
  const donutStops = channelActuals.map(c => {
    const color = channelColor(c.platform);
    const start = totalSpend > 0 ? (cum / totalSpend) * 100 : 0;
    cum += c.spend;
    const end = totalSpend > 0 ? (cum / totalSpend) * 100 : 0;
    return `${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });
  const donutGradient = donutStops.length ? `conic-gradient(${donutStops.join(', ')})` : COLOR.divider;

  const maxCtr = Math.max(0.01, ...channelActuals.map(c => c.ctr ?? 0));

  return (
    <div>
      <h2 style={sectionTitleStyle}>Spend &amp; leads trend</h2>
      <div style={{ ...cardStyle, padding: '22px 24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLOR.mutedSecondary }}>
            <span style={{ width: 10, height: 10, background: '#D9CBBB', display: 'inline-block', borderRadius: 2 }} />Spend
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLOR.mutedSecondary }}>
            <span style={{ width: 14, height: 2, background: COLOR.accent, display: 'inline-block' }} />Leads
          </div>
        </div>
        {monthlyTrend.length === 0 ? (
          <div style={{ fontSize: 13, color: COLOR.muted, padding: '40px 0', textAlign: 'center' }}>No performance data yet for this period.</div>
        ) : (
          <>
            <div style={{ position: 'relative', height: 180 }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
                <polyline points={linePoints} fill="none" stroke={COLOR.accent} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
                {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={1.6} fill={COLOR.accent} />)}
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 10 }}>
                {monthlyTrend.map((t, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
                    <div style={{ width: '100%', maxWidth: 46, background: '#D9CBBB', borderRadius: '3px 3px 0 0', height: Math.round((t.spend / maxSpend) * 160) }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 8 }}>
              {monthlyTrend.map((t, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: COLOR.muted }}>{t.month}</div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
        <div style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>Spend by channel</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{ width: 150, height: 150, borderRadius: '50%', position: 'relative', background: donutGradient }}>
              <div style={{ position: 'absolute', inset: 26, borderRadius: '50%', background: COLOR.card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: FONT_HEAD, fontSize: 19 }}>{fmtMoney(totalSpend)}</div>
                <div style={{ fontSize: 10.5, color: COLOR.muted }}>Period spend</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {channelActuals.map(c => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: channelColor(c.platform), display: 'inline-block' }} />{c.name}
                </div>
                <span style={{ color: COLOR.mutedSecondary }}>{totalSpend > 0 ? Math.round((c.spend / totalSpend) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>CTR by channel</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {channelActuals.filter(c => c.ctr != null).map(c => (
              <div key={c.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                  <span>{c.name}</span><span style={{ fontWeight: 600 }}>{(c.ctr ?? 0).toFixed(2)}%</span>
                </div>
                <div style={{ height: 8, background: COLOR.divider, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${((c.ctr ?? 0) / maxCtr) * 100}%`, background: channelColor(c.platform), borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pacing ───────────────────────────────────────────────────────────────────

export function Pacing({ pacing }: { pacing: HubPacing }) {
  return (
    <div>
      <h2 style={sectionTitleStyle}>Pacing status</h2>
      <div style={{ ...cardStyle, padding: '22px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 7 }}>
            <span style={{ color: COLOR.mutedSecondary }}>Month elapsed</span>
            <span style={{ fontWeight: 600 }}>Day {pacing.dayOfMonth} of {pacing.daysInMonth}</span>
          </div>
          <div style={{ height: 10, background: COLOR.divider, borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pacing.monthElapsedPct}%`, background: COLOR.ink, borderRadius: 5 }} />
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 7 }}>
            <span style={{ color: COLOR.mutedSecondary }}>Budget spent</span>
            <span style={{ fontWeight: 600 }}>{fmtMoney(pacing.mtdActual)} of {fmtMoney(pacing.monthlyBudget)}</span>
          </div>
          <div style={{ height: 10, background: COLOR.divider, borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pacing.budgetSpentPct}%`, background: COLOR.goodBright, borderRadius: 5 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Goals ────────────────────────────────────────────────────────────────────

function goalLabel(unit: string, v: number | null): string {
  if (v == null) return '—';
  if (unit === '$') return fmtMoney(v);
  if (unit === '%') return v.toFixed(1) + '%';
  return Math.round(v).toString();
}

export function Goals({ goals }: { goals: HubGoal[] }) {
  if (goals.length === 0) return null;
  return (
    <div>
      <h2 style={sectionTitleStyle}>Campaign goals</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {goals.map(g => {
          const values = [g.floor, g.target, g.stretch, g.current].filter((v): v is number => v != null);
          const min = values.length ? Math.min(...values) * 0.9 : 0;
          const max = values.length ? Math.max(...values) * 1.1 : 1;
          const floorPct = g.floor != null ? clampPct(g.floor, min, max) : null;
          const targetPct = g.target != null ? clampPct(g.target, min, max) : null;
          const stretchPct = g.stretch != null ? clampPct(g.stretch, min, max) : null;
          const currentPct = g.current != null ? clampPct(g.current, min, max) : null;
          return (
            <div key={g.id} style={{ ...cardStyle, padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <div style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 14.5 }}>{g.name}</span>
                  {g.direction && <span style={{ fontSize: 12, color: COLOR.muted, marginLeft: 8 }}>{g.direction === 'higher_is_better' ? '(higher is better)' : '(lower is better)'}</span>}
                </div>
                <div><span style={{ fontFamily: FONT_HEAD, fontSize: 19 }}>{goalLabel(g.unit, g.current)}</span><span style={{ fontSize: 12, color: COLOR.muted }}> current</span></div>
              </div>
              <div style={{ position: 'relative', height: 6, background: 'linear-gradient(90deg,#EAD9C9,#EAE6DC,#D8E5D6)', borderRadius: 3, margin: '0 8px 26px' }}>
                {floorPct != null && <>
                  <div style={{ position: 'absolute', top: -7, left: `calc(${floorPct}% - 1px)`, width: 2, height: 20, background: COLOR.accent }} />
                  <div style={{ position: 'absolute', top: 16, left: `calc(${floorPct}% - 20px)`, width: 44, textAlign: 'center', fontSize: 10.5, color: COLOR.accent }}>Floor<br />{goalLabel(g.unit, g.floor)}</div>
                </>}
                {targetPct != null && <>
                  <div style={{ position: 'absolute', top: -7, left: `calc(${targetPct}% - 1px)`, width: 2, height: 20, background: COLOR.ink }} />
                  <div style={{ position: 'absolute', top: 16, left: `calc(${targetPct}% - 20px)`, width: 44, textAlign: 'center', fontSize: 10.5, color: COLOR.ink }}>Target<br />{goalLabel(g.unit, g.target)}</div>
                </>}
                {stretchPct != null && <>
                  <div style={{ position: 'absolute', top: -7, left: `calc(${stretchPct}% - 1px)`, width: 2, height: 20, background: COLOR.good }} />
                  <div style={{ position: 'absolute', top: 16, left: `calc(${stretchPct}% - 20px)`, width: 44, textAlign: 'center', fontSize: 10.5, color: COLOR.good }}>Stretch<br />{goalLabel(g.unit, g.stretch)}</div>
                </>}
                {currentPct != null && (
                  <div style={{ position: 'absolute', top: -6, left: `calc(${currentPct}% - 8px)`, width: 16, height: 16, borderRadius: '50%', background: COLOR.bg, border: `3px solid ${COLOR.ink}` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Brief ────────────────────────────────────────────────────────────────────

export function Brief({ brief }: { brief: HubBrief }) {
  const fieldStyle: React.CSSProperties = { fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: COLOR.muted, marginBottom: 6 };
  const valueStyle: React.CSSProperties = { fontSize: 14.5, lineHeight: 1.6 };
  return (
    <div>
      <h2 style={sectionTitleStyle}>Brief</h2>
      <div style={{ ...cardStyle, padding: '26px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px 32px' }}>
        {brief.objectives && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={fieldStyle}>Objectives</div>
            <div style={valueStyle}>{brief.objectives}</div>
          </div>
        )}
        {brief.kpis && (
          <div><div style={fieldStyle}>KPIs</div><div style={valueStyle}>{brief.kpis}</div></div>
        )}
        {brief.target_audience && (
          <div><div style={fieldStyle}>Target audience</div><div style={valueStyle}>{brief.target_audience}</div></div>
        )}
        {brief.budget != null && (
          <div><div style={fieldStyle}>Budget</div><div style={valueStyle}>{fmtMoney(brief.budget)} / month</div></div>
        )}
        {(brief.start_date || brief.end_date) && (
          <div>
            <div style={fieldStyle}>Campaign dates</div>
            <div style={valueStyle}>{brief.start_date ? fmtDate(brief.start_date) : '—'} &ndash; {brief.end_date ? fmtDate(brief.end_date) : '—'}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Notes ────────────────────────────────────────────────────────────────────

const NOTE_TAGS: Record<string, { label: string; color: string; bg: string }> = {
  handover: { label: 'Handover', color: COLOR.accent, bg: '#F3E3DA' },
  client_intel: { label: 'Client intel', color: '#5B6B4E', bg: '#E6EBDE' },
  general: { label: 'General', color: COLOR.mutedSecondary, bg: COLOR.divider },
};

export function Notes({ notes }: { notes: HubNote[] }) {
  return (
    <div>
      <h2 style={sectionTitleStyle}>Notes</h2>
      {notes.length === 0 ? (
        <div style={{ ...cardStyle, padding: '20px 24px', fontSize: 13.5, color: COLOR.muted }}>No notes yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: COLOR.divider, border: `1px solid ${COLOR.divider}`, borderRadius: 6, overflow: 'hidden' }}>
          {notes.map(n => {
            const tag = NOTE_TAGS[n.note_type] ?? NOTE_TAGS.general;
            return (
              <div key={n.id} style={{ background: COLOR.card, padding: '16px 20px', display: 'flex', gap: 14 }}>
                <div style={{ width: 16, flexShrink: 0, paddingTop: 2 }}>{n.is_pinned && <span style={{ color: COLOR.accent, fontSize: 14 }}>📌</span>}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: tag.color, background: tag.bg, padding: '3px 8px', borderRadius: 3 }}>{tag.label}</span>
                    <span style={{ fontSize: 12, color: COLOR.muted }}>{fmtDate(n.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.55 }}>{n.note_body}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Documents ────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: 'Contract', brief: 'Brief', rate_card: 'Rate card', brand_guidelines: 'Brand guidelines',
  media_schedule: 'Media schedule', biz_info: 'Business info', tov: 'Tone of voice', handover_notes: 'Handover notes', other: 'Other',
};

export function Documents({ documents }: { documents: HubDocument[] }) {
  if (documents.length === 0) return null;
  const groups = new Map<string, HubDocument[]>();
  for (const d of documents) {
    const key = d.file_type ?? 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  return (
    <div>
      <h2 style={sectionTitleStyle}>Documents</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[...groups.entries()].map(([type, docs]) => (
          <div key={type} style={{ ...cardStyle, padding: '16px 18px' }}>
            <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLOR.muted, marginBottom: 10 }}>{DOC_TYPE_LABELS[type] ?? type}</div>
            {docs.map(d => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${COLOR.divider}` }}>
                <span style={{ fontSize: 13.5 }}>{d.file_name}</span>
                <span style={{ fontSize: 11.5, color: COLOR.muted }}>{fmtDate(d.uploaded_at)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Planned vs actual spend ───────────────────────────────────────────────────

export function SpendTable({ rows }: { rows: HubSpendRow[] }) {
  if (rows.length === 0) return null;
  const maxRow = Math.max(1, ...rows.map(r => Math.max(r.planned, r.actual))) * 1.1;
  return (
    <div>
      <h2 style={sectionTitleStyle}>Planned vs. actual spend by channel</h2>
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.6fr 1.4fr', padding: '12px 20px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLOR.muted, borderBottom: `1px solid ${COLOR.cardBorder}` }}>
          <div>Channel</div><div>Planned</div><div>Actual</div><div>Planned vs actual</div><div>Vs. benchmark</div>
        </div>
        {rows.map(r => (
          <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.6fr 1.4fr', padding: '14px 20px', alignItems: 'center', borderBottom: `1px solid ${COLOR.divider}`, fontSize: 13.5 }}>
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div style={{ color: COLOR.mutedSecondary }}>{fmtMoney(r.planned)}</div>
            <div style={{ color: COLOR.mutedSecondary }}>{fmtMoney(r.actual)}</div>
            <div>
              <div style={{ position: 'relative', height: 8, background: COLOR.divider, borderRadius: 4 }}>
                <div style={{ position: 'absolute', top: -3, left: `${(r.planned / maxRow) * 100}%`, width: 2, height: 14, background: COLOR.ink }} />
                <div style={{ height: '100%', width: `${(r.actual / maxRow) * 100}%`, background: COLOR.accent, borderRadius: 4 }} />
              </div>
            </div>
            <div style={{ fontWeight: 600, color: r.benchmarkGood === false ? COLOR.accent : COLOR.good, fontSize: 12.5 }}>
              {r.benchmarkLabel ? `${r.benchmarkGood === false ? '⚠ ' : '✓ '}${r.benchmarkLabel}` : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
