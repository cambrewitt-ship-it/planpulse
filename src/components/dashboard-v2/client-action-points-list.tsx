'use client';

import { useState, useMemo } from 'react';

function fireConfetti(originX: number, originY: number) {
  try {
    if (typeof window === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
    document.body.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); return; }
    const COLORS = ['#A0442A', '#5C5450', '#8A8578', '#FDFCF8', '#D5D0C5', '#4A7C59'];
    const pieces = Array.from({ length: 60 }, () => ({
      x: originX, y: originY,
      vx: (Math.random() - 0.5) * 10,
      vy: -(Math.random() * 8 + 3),
      gravity: 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      w: Math.random() * 7 + 4, h: Math.random() * 4 + 3,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.25,
      opacity: 1,
    }));
    let frame = 0;
    function animate() {
      ctx!.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of pieces) {
        p.vy += p.gravity; p.x += p.vx; p.y += p.vy; p.angle += p.spin;
        if (frame > 30) p.opacity -= 0.025;
        if (p.opacity > 0 && p.y < canvas.height + 20) {
          alive = true;
          ctx!.save(); ctx!.globalAlpha = Math.max(0, p.opacity);
          ctx!.translate(p.x, p.y); ctx!.rotate(p.angle);
          ctx!.fillStyle = p.color; ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx!.restore();
        }
      }
      frame++;
      if (alive) requestAnimationFrame(animate); else canvas.remove();
    }
    requestAnimationFrame(animate);
  } catch { /* never block completion */ }
}

interface ActionPoint {
  id: string;
  text: string;
  completed: boolean;
  category: 'SET UP' | 'HEALTH CHECK' | 'TODO';
  channel_type?: string;
  due_date?: string | null;
}

interface Props {
  actionPoints: ActionPoint[];
  onToggle: (id: string, completed: boolean) => void;
}

// ---------------------------------------------------------------------------
// Design tokens — mirrors the agency "To Do" panel (src/components/agency/KanbanBoard.tsx)
// ---------------------------------------------------------------------------
const INK = '#1C1917';
const MUTED = '#8A8578';
const FAINT = '#B5B0A5';
const BORDER = '#E8E4DC';
const BORDER_SOFT = '#F0EDE6';
const CARD_BG = '#FDFCF8';
const HOVER_BG = '#F5F3EF';
const RED = '#A0442A';
const GREEN = '#4A7C59';

const sansFont = "'DM Sans', system-ui, sans-serif";
const headingFont = "'Inter', system-ui, sans-serif";

function daysUntilDue(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

// Row anatomy due-label/colour rules — matches KanbanBoard.tsx's dueMeta().
function dueMeta(days: number | null): { label: string; color: string; weight: number } {
  if (days === null) return { label: 'No date', color: FAINT, weight: 400 };
  if (days < 0) return { label: `${-days}d overdue`, color: RED, weight: 500 };
  if (days === 0) return { label: 'Today', color: '#B07030', weight: 500 };
  if (days === 1) return { label: 'Tomorrow', color: '#5F5A50', weight: 400 };
  if (days <= 2) return { label: `${days}d`, color: '#5F5A50', weight: 400 };
  return { label: `${days}d`, color: MUTED, weight: 400 };
}

function categoryColor(category: ActionPoint['category']): string {
  if (category === 'SET UP') return '#B07030';
  if (category === 'HEALTH CHECK') return GREEN;
  return '#7A5C8A';
}

interface DueSection {
  key: string;
  label: string;
  color: string;
  items: ActionPoint[];
}

function buildDueSections(items: ActionPoint[]): DueSection[] {
  const sortByDue = (a: ActionPoint, b: ActionPoint) => {
    const da = daysUntilDue(a.due_date);
    const db = daysUntilDue(b.due_date);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  };
  const defs: { key: string; label: string; color: string; test: (d: number | null) => boolean }[] = [
    { key: 'overdue', label: 'Overdue', color: RED, test: d => d !== null && d < 0 },
    { key: 'today', label: 'Today', color: '#B07030', test: d => d === 0 },
    { key: 'week', label: 'Next 7 days', color: '#4A6580', test: d => d !== null && d > 0 && d <= 7 },
    { key: 'later', label: 'Later', color: '#C7C2B7', test: d => d !== null && d > 7 },
    { key: 'none', label: 'No date', color: '#C7C2B7', test: d => d === null },
  ];
  return defs
    .map(d => ({ key: d.key, label: d.label, color: d.color, items: items.filter(it => d.test(daysUntilDue(it.due_date))).sort(sortByDue) }))
    .filter(s => s.items.length > 0);
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10.5,
      padding: '1px 6px',
      borderRadius: 99,
      border: `1px solid ${BORDER}`,
      color: MUTED,
      fontFamily: sansFont,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {children}
    </span>
  );
}

export default function ClientActionPointsList({ actionPoints, onToggle }: Props) {
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [completedOpen, setCompletedOpen] = useState(false);

  const incomplete = useMemo(() => actionPoints.filter(ap => !ap.completed), [actionPoints]);
  const completed = useMemo(() => actionPoints.filter(ap => ap.completed), [actionPoints]);

  const overdueCount = useMemo(() => incomplete.filter(ap => {
    const d = daysUntilDue(ap.due_date);
    return d !== null && d < 0;
  }).length, [incomplete]);
  const todayCount = useMemo(() => incomplete.filter(ap => daysUntilDue(ap.due_date) === 0).length, [incomplete]);

  const viewTab = (v: 'list' | 'timeline', label: string) => (
    <button
      key={v}
      type="button"
      onClick={() => setView(v)}
      style={{
        border: 'none', background: 'transparent', cursor: 'pointer',
        padding: '6px 12px', fontSize: 13, fontFamily: sansFont,
        color: view === v ? INK : MUTED,
        borderBottom: `2px solid ${view === v ? INK : 'transparent'}`,
        marginBottom: -1,
      }}
    >{label}</button>
  );

  return (
    <>
    <style>{`
      @keyframes cap-strike { from { width: 0%; } to { width: 100%; } }
      .cap-row:hover { background: ${HOVER_BG}; }
    `}</style>
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      background: CARD_BG,
      borderRadius: '0 22px 22px 0',
      border: '0.5px solid #D8D4CE',
      boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
      overflow: 'hidden',
      fontFamily: sansFont,
      height: '100%',
      position: 'relative',
    }}>
      {/* Margin rule — thin red notebook-page margin, inset from the left edge; the flip-card
          wrapper (dashboard page.tsx) shows this through its 32px "peek" gap, so it stays. */}
      <div style={{ position: 'absolute', left: 27, top: 0, bottom: 0, width: 1.5, background: RED, opacity: 0.45, zIndex: 1, pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ padding: '13px 16px 8px 40px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
            <div style={{ fontFamily: headingFont, fontWeight: 700, fontSize: 16, color: INK }}>To Do</div>
            <div style={{ fontSize: 11, color: MUTED, whiteSpace: 'nowrap' }}>{overdueCount} overdue · {todayCount} today</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {viewTab('list', 'List')}
            {viewTab('timeline', 'Timeline')}
          </div>
        </div>
      </div>

      {view === 'list' ? (
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 16px 10px 40px', display: 'flex', flexDirection: 'column' }}>
          {actionPoints.length === 0 ? (
            <div style={{ padding: '14px 10px', fontSize: 13, color: MUTED, fontFamily: sansFont, textAlign: 'center' }}>
              No action points
            </div>
          ) : (
            <>
              {incomplete.length === 0 ? (
                <div style={{ padding: '14px 10px', fontSize: 13, color: MUTED, fontFamily: sansFont, textAlign: 'center' }}>
                  All done!
                </div>
              ) : buildDueSections(incomplete).map(section => (
                <div key={section.key} style={{ paddingTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBottom: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: section.color, flexShrink: 0 }} />
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: INK, fontFamily: sansFont }}>{section.label}</div>
                    <div style={{ fontSize: 11, color: FAINT, fontFamily: sansFont }}>{section.items.length}</div>
                    <div style={{ flex: 1, height: 1, background: BORDER }} />
                  </div>
                  {section.items.map(item => (
                    <ActionPointRow key={item.id} item={item} onToggle={onToggle} />
                  ))}
                </div>
              ))}

              {completed.length > 0 && (
                <div style={{ marginTop: 10, flexShrink: 0 }}>
                  <button
                    onClick={() => setCompletedOpen(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 11, color: FAINT, background: 'none', border: 'none',
                      cursor: 'pointer', padding: '4px 2px', width: '100%', textAlign: 'left',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: sansFont, fontWeight: 700,
                    }}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" style={{ transform: completedOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>
                      <path d="M2 1.5L5.5 4 2 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                    Completed ({completed.length})
                  </button>
                  {completedOpen && completed.map(item => (
                    <ActionPointRow key={item.id} item={item} onToggle={onToggle} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : incomplete.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: MUTED, fontFamily: sansFont, textAlign: 'center', padding: '0 24px' }}>
          {actionPoints.length === 0 ? 'No action points' : 'All done!'}
        </div>
      ) : (
        <TimelineViewActionPoints actionPoints={incomplete} onToggle={onToggle} />
      )}
    </div>
    </>
  );
}

function ActionPointRow({ item, onToggle }: { item: ActionPoint; onToggle: (id: string, c: boolean) => void }) {
  const [isCompleting, setIsCompleting] = useState(false);
  const effectiveCompleted = item.completed || isCompleting;
  const due = dueMeta(daysUntilDue(item.due_date));

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.completed) {
      onToggle(item.id, false);
      return;
    }
    if (isCompleting) return;
    fireConfetti(e.clientX, e.clientY);
    setIsCompleting(true);
    setTimeout(() => onToggle(item.id, true), 900);
  };

  return (
    <div style={{ display: 'grid', gridTemplateRows: isCompleting ? '0fr' : '1fr', transition: 'grid-template-rows 0.45s ease 0.35s', overflow: 'hidden' }}>
    <div style={{ overflow: 'hidden' }}>
    <div className="cap-row" style={{
      display: 'flex', alignItems: 'center', gap: 9, height: 38, borderRadius: 4,
      opacity: isCompleting ? 0.4 : 1, transition: 'opacity 0.3s ease',
    }}>
      <button
        type="button"
        onClick={handleClick}
        title={effectiveCompleted ? 'Mark incomplete' : 'Mark complete'}
        style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0, padding: 0,
          border: effectiveCompleted ? `1.5px solid ${GREEN}` : '1.5px solid #C7C2B7',
          background: effectiveCompleted ? GREEN : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {effectiveCompleted && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1, fontWeight: 700 }}>✓</span>}
      </button>

      <div style={{
        flex: 1, minWidth: 0, position: 'relative',
        fontSize: 14, lineHeight: 1.4, color: effectiveCompleted ? FAINT : INK,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        fontFamily: sansFont,
      }}>
        {item.text}
        {isCompleting && <span style={{ position: 'absolute', left: 0, top: '50%', height: '1.5px', background: '#6B7280', width: 0, animation: 'cap-strike 0.35s ease forwards' }} />}
      </div>

      {item.channel_type && <Tag>{item.channel_type}</Tag>}

      <div style={{
        width: 86, flexShrink: 0, textAlign: 'right',
        fontSize: 12, color: effectiveCompleted ? FAINT : due.color, fontWeight: effectiveCompleted ? 400 : due.weight,
        fontFamily: sansFont,
      }}>{due.label}</div>
    </div>
    </div>
    </div>
  );
}

function TimelineCheckbox({ item, onToggle }: { item: ActionPoint; onToggle: (id: string, c: boolean) => void }) {
  const [isCompleting, setIsCompleting] = useState(false);
  const effectiveCompleted = item.completed || isCompleting;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.completed) {
      onToggle(item.id, false);
      return;
    }
    if (isCompleting) return;
    fireConfetti(e.clientX, e.clientY);
    setIsCompleting(true);
    setTimeout(() => onToggle(item.id, true), 900);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        width: 14, height: 14, borderRadius: '50%', flexShrink: 0, padding: 0,
        border: effectiveCompleted ? `1.5px solid ${GREEN}` : '1.5px solid #C7C2B7',
        background: effectiveCompleted ? GREEN : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {effectiveCompleted && <span style={{ color: '#fff', fontSize: 8, lineHeight: 1, fontWeight: 700 }}>✓</span>}
    </button>
  );
}

function TimelineRow({ item, days, color, overdue, onToggle, rowWidth }: {
  item: ActionPoint & { days: number };
  days: { offset: number; isToday: boolean }[];
  color: string;
  overdue: boolean;
  onToggle: (id: string, c: boolean) => void;
  rowWidth: number;
}) {
  const [isCompleting, setIsCompleting] = useState(false);
  const effectiveCompleted = item.completed || isCompleting;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.completed) {
      onToggle(item.id, false);
      return;
    }
    if (isCompleting) return;
    fireConfetti(e.clientX, e.clientY);
    setIsCompleting(true);
    setTimeout(() => onToggle(item.id, true), 900);
  };

  return (
    <div style={{ display: 'grid', gridTemplateRows: isCompleting ? '0fr' : '1fr', transition: 'grid-template-rows 0.45s ease 0.35s', overflow: 'hidden' }}>
    <div style={{ overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', height: 40, borderBottom: `1px solid ${BORDER_SOFT}`, minWidth: rowWidth, opacity: isCompleting ? 0.4 : 1, transition: 'opacity 0.3s ease' }}>
      <div style={{ width: 230, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12 }}>
        <button
          type="button"
          onClick={handleClick}
          style={{
            width: 14, height: 14, borderRadius: '50%', flexShrink: 0, padding: 0,
            border: effectiveCompleted ? `1.5px solid ${GREEN}` : '1.5px solid #C7C2B7',
            background: effectiveCompleted ? GREEN : 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {effectiveCompleted && <span style={{ color: '#fff', fontSize: 8, lineHeight: 1, fontWeight: 700 }}>✓</span>}
        </button>
        <div style={{ fontSize: 12, color: effectiveCompleted ? FAINT : INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: effectiveCompleted ? 'line-through' : 'none' }}>{item.text}</div>
      </div>
      <div style={{
        width: 64, flexShrink: 0, marginRight: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center', height: 26,
        borderRadius: 3,
        background: overdue ? color : 'transparent',
        color: CARD_BG, fontSize: 11, fontWeight: 500,
      }}>{overdue ? `${-item.days}d` : ''}</div>
      <div style={{ flex: 1, display: 'flex' }}>
        {days.map(d => {
          const hit = !overdue && item.days === d.offset;
          return (
            <div key={d.offset} style={{ flex: 1, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: `1px solid ${d.isToday ? '#D5D0C5' : BORDER_SOFT}` }}>
              {hit && (
                <div style={{ margin: '0 2px', width: '100%', height: '100%', borderRadius: 3, background: color, color: CARD_BG, fontSize: 10, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {item.channel_type || item.category}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </div>
    </div>
  );
}

function TimelineViewActionPoints({ actionPoints, onToggle }: { actionPoints: ActionPoint[]; onToggle: (id: string, c: boolean) => void }) {
  const WINDOW = 8; // today + next 7 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const days = useMemo(() => Array.from({ length: WINDOW }, (_, i) => {
    const d = new Date(todayMs + i * 86400000);
    return {
      offset: i,
      dow: d.toLocaleDateString('en-NZ', { weekday: 'short' }).toUpperCase(),
      num: d.getDate(),
      isToday: i === 0,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    };
  }), [todayMs]);

  const withDue = useMemo(() => actionPoints
    .filter(ap => ap.due_date)
    .map(ap => ({ ...ap, days: daysUntilDue(ap.due_date) as number }))
    .sort((a, b) => a.days - b.days), [actionPoints]);

  const inWindow = withDue.filter(ap => ap.days < WINDOW);
  const noDue = actionPoints.filter(ap => !ap.due_date);
  const rowWidth = 230 + 64 + WINDOW * 60;

  return (
    <div style={{ flex: 1, overflow: 'hidden', fontFamily: sansFont, display: 'flex', flexDirection: 'column' }}>
      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, padding: '4px 16px 10px 40px' }}>
        {/* Day header */}
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${BORDER}`, paddingBottom: 7, minWidth: rowWidth }}>
          <div style={{ width: 230, flexShrink: 0 }} />
          <div style={{ width: 64, flexShrink: 0, marginRight: 4, textAlign: 'center', fontSize: 10, letterSpacing: '0.06em', color: RED, paddingTop: 3 }}>OVERDUE</div>
          <div style={{ flex: 1, display: 'flex' }}>
            {days.map(d => (
              <div key={d.offset} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: d.isToday ? INK : d.isWeekend ? '#C7C2B7' : MUTED, fontWeight: d.isToday ? 700 : 400 }}>
                <div style={{ letterSpacing: '0.06em' }}>{d.dow}</div>
                <div style={{ fontSize: 12, marginTop: 2 }}>{d.num}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        {inWindow.map(item => (
          <TimelineRow
            key={item.id}
            item={item}
            days={days}
            color={categoryColor(item.category)}
            overdue={item.days < 0}
            onToggle={onToggle}
            rowWidth={rowWidth}
          />
        ))}

        {inWindow.length === 0 && noDue.length === 0 && (
          <div style={{ padding: '16px 8px', fontSize: 11, color: FAINT, textAlign: 'center' }}>No action points</div>
        )}
      </div>

      {/* No-due-date items — kept outside the horizontally-scrolling day-grid so text isn't clamped */}
      {noDue.length > 0 && (
        <div style={{ flexShrink: 0, maxHeight: '35%', overflowY: 'auto', padding: '0 16px 8px 40px' }}>
          <div style={{ padding: '8px 0 4px', borderTop: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 11, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>No due date</div>
          </div>
          {noDue.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${BORDER_SOFT}` }}>
              <TimelineCheckbox item={item} onToggle={onToggle} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.text}</div>
              {item.channel_type && <Tag>{item.channel_type}</Tag>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
