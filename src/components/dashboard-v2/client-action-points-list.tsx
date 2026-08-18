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
    const COLORS = ['#7A2E22', '#5C5450', '#8A8578', '#F5F0E8', '#D5D0C5', '#A0442A'];
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
  category: 'SET UP' | 'HEALTH CHECK';
  channel_type?: string;
  due_date?: string | null;
}

interface Props {
  actionPoints: ActionPoint[];
  onToggle: (id: string, completed: boolean) => void;
}

function daysFromToday(dateStr: string | null | undefined): number {
  if (!dateStr) return Infinity;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDueDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = daysFromToday(dateStr);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return `${diff}d`;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// Single accent (Moleskine red) reserved for urgency; everything else steps through graphite neutrals.
function dueDateColor(dateStr: string | null | undefined): string {
  if (!dateStr) return FAINT;
  const diff = daysFromToday(dateStr);
  if (diff <= 2) return RED;
  if (diff <= 6) return GRAPHITE;
  return MUTED;
}

// ---------------------------------------------------------------------------
// Apple × Moleskine design tokens
// ---------------------------------------------------------------------------
const RED = 'oklch(42% 0.16 25)';
const CARD_BG = 'oklch(98% 0.006 75)';
const PAPER_BG = 'oklch(96% 0.009 75)';
const INK = '#1C1917';
const GRAPHITE = '#5C5450';
const MUTED = '#8A8578';
const FAINT = '#B5B0A5';
const BORDER = 'oklch(89% 0.011 75)';
const BORDER_SOFT = 'oklch(92% 0.009 75)';
const WEEKEND = 'oklch(86% 0.011 75)';

const serifFont = "'Source Serif 4', Georgia, serif";
const sansFont = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
const monoFont = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const dotGrid: React.CSSProperties = {
  backgroundImage: 'radial-gradient(circle, oklch(55% 0.02 75 / 0.14) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

function Tag({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span style={{
      fontSize: 10.5,
      padding: '1px 6px',
      borderRadius: 99,
      border: `1px solid ${accent ? RED : BORDER}`,
      color: accent ? RED : GRAPHITE,
      background: 'transparent',
      fontFamily: monoFont,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function CountBadge({ n, accent }: { n: number; accent?: boolean }) {
  return (
    <span style={{
      marginLeft: 5,
      background: accent ? RED : BORDER_SOFT,
      color: accent ? CARD_BG : GRAPHITE,
      borderRadius: 99,
      padding: '1px 6px',
      fontSize: 10.5,
      fontFamily: monoFont,
    }}>
      {n}
    </span>
  );
}

export default function ClientActionPointsList({ actionPoints, onToggle }: Props) {
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('list');
  const [listCompletedOpen, setListCompletedOpen] = useState(false);

  const incomplete = useMemo(() => actionPoints.filter(ap => !ap.completed), [actionPoints]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      background: CARD_BG,
      ...dotGrid,
      borderRadius: '0 22px 22px 0',
      border: `1px solid ${BORDER}`,
      boxShadow: '0 10px 26px -14px oklch(45% 0.03 75 / 0.4)',
      overflow: 'hidden',
      fontFamily: sansFont,
      height: '100%',
      position: 'relative',
    }}>
      {/* Margin rule — thin red notebook-page margin, inset from the left edge */}
      <div style={{ position: 'absolute', left: 27, top: 0, bottom: 0, width: 1.5, background: RED, opacity: 0.5, zIndex: 1, pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ padding: '13px 16px 10px 40px', borderBottom: `1px solid ${BORDER_SOFT}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: INK, fontFamily: serifFont, minWidth: 0, display: 'flex', alignItems: 'baseline' }}>
            Action Points
            {incomplete.length > 0 && <CountBadge n={incomplete.length} accent />}
          </div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', minWidth: 0, flex: 1, justifyContent: 'flex-end', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', minWidth: 0, flexShrink: 0 }}>
              {(['list', 'gantt'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    fontSize: 12,
                    padding: '2px 7px',
                    borderRadius: 99,
                    border: '1px solid',
                    borderColor: viewMode === mode ? INK : BORDER,
                    background: viewMode === mode ? INK : 'transparent',
                    color: viewMode === mode ? CARD_BG : MUTED,
                    cursor: 'pointer',
                    fontFamily: sansFont,
                    lineHeight: 1.5,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {mode === 'list' ? 'List' : 'Gantt'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'list' ? (
        /* List View */
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 16px 8px 40px', display: 'flex', flexDirection: 'column' }}>
          {actionPoints.length === 0 ? (
            <div style={{ padding: '12px 10px', fontSize: 13, color: FAINT, fontFamily: serifFont, fontStyle: 'italic', textAlign: 'center' }}>
              No action points
            </div>
          ) : (() => {
            const sortByDue = (a: ActionPoint, b: ActionPoint) => daysFromToday(a.due_date) - daysFromToday(b.due_date);
            const listIncomplete = [...actionPoints.filter(ap => !ap.completed)].sort(sortByDue);
            const listCompleted = [...actionPoints.filter(ap => ap.completed)].sort(sortByDue);
            return (
              <>
                {listIncomplete.length === 0 && (
                  <div style={{ padding: '12px 10px', fontSize: 13, color: FAINT, fontFamily: serifFont, fontStyle: 'italic', textAlign: 'center' }}>
                    All done!
                  </div>
                )}
                {listIncomplete.map((item, idx) => (
                  <ListActionPointRow key={item.id} item={item} onToggle={onToggle} isLast={idx === listIncomplete.length - 1 && listCompleted.length === 0} />
                ))}
                {listCompleted.length > 0 && (
                  <div style={{ marginTop: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => setListCompletedOpen(v => !v)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 12, color: FAINT, background: 'none', border: 'none',
                        cursor: 'pointer', padding: '4px 2px', width: '100%', textAlign: 'left',
                        textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: sansFont,
                      }}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" style={{ transform: listCompletedOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>
                        <path d="M2 1.5L5.5 4 2 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                      Completed ({listCompleted.length})
                    </button>
                    {listCompletedOpen && listCompleted.map((item, idx) => (
                      <ListActionPointRow key={item.id} item={item} onToggle={onToggle} isLast={idx === listCompleted.length - 1} />
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        /* Gantt View */
        <GanttViewActionPoints actionPoints={actionPoints} onToggle={onToggle} />
      )}
    </div>
  );
}

function ListActionPointRow({ item, onToggle, isLast }: { item: ActionPoint; onToggle: (id: string, c: boolean) => void; isLast?: boolean }) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [localCompleted, setLocalCompleted] = useState(false);
  const effectiveCompleted = item.completed || localCompleted;

  const handleClick = (e: React.MouseEvent) => {
    if (!effectiveCompleted && !isCompleting) {
      fireConfetti(e.clientX, e.clientY);
      setIsCompleting(true);
      setTimeout(() => {
        setIsCompleting(false);
        setLocalCompleted(true);
        onToggle(item.id, true);
      }, 400);
    } else if (effectiveCompleted) {
      setLocalCompleted(false);
      onToggle(item.id, false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '11px 2px',
      borderBottom: isLast ? 'none' : `1px solid ${BORDER_SOFT}`,
      opacity: effectiveCompleted || isCompleting ? 0.5 : 1,
      transition: 'opacity 0.4s',
      flexShrink: 0,
    }}>
      {/* Ring checkbox — fills red with white check when complete */}
      <div
        onClick={handleClick}
        style={{
          marginTop: 3,
          width: 14,
          height: 14,
          borderRadius: '50%',
          flexShrink: 0,
          border: `1.5px solid ${effectiveCompleted || isCompleting ? RED : BORDER}`,
          background: effectiveCompleted || isCompleting ? RED : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {(effectiveCompleted || isCompleting) && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4L3 5.5L6.5 2" stroke={CARD_BG} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Text + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          lineHeight: 1.4,
          color: effectiveCompleted || isCompleting ? FAINT : INK,
          textDecoration: effectiveCompleted ? 'line-through' : 'none',
          wordBreak: 'break-word',
          fontFamily: sansFont,
        }}>
          {item.text}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
          {item.channel_type && <Tag>{item.channel_type}</Tag>}
          <Tag accent={item.category === 'HEALTH CHECK'}>{item.category}</Tag>
          {item.due_date && (
            <span style={{
              fontSize: 11,
              color: dueDateColor(item.due_date),
              fontWeight: 500,
              fontFamily: monoFont,
            }}>
              {formatDueDate(item.due_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function GanttViewActionPoints({ actionPoints, onToggle }: { actionPoints: ActionPoint[]; onToggle: (id: string, c: boolean) => void }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // Calculate day range
  const dueDays = actionPoints
    .filter(ap => ap.due_date)
    .map(ap => {
      const [y, m, d] = (ap.due_date || '').split('-').map(Number);
      const date = new Date(y, m - 1, d);
      date.setHours(0, 0, 0, 0);
      return Math.round((date.getTime() - todayMs) / 86400000);
    });

  const startDay = dueDays.length ? Math.min(-2, Math.min(...dueDays)) : -2;
  const endDay = dueDays.length ? Math.max(14, Math.max(...dueDays) + 3) : 14;
  const dayCount = endDay - startDay + 1;
  const DAY_W = 28;
  const ROW_H = 48;
  const totalW = dayCount * DAY_W;

  // Group items by due date
  const withDue = useMemo(() => {
    return actionPoints
      .filter(ap => ap.due_date)
      .sort((a, b) => daysFromToday(a.due_date) - daysFromToday(b.due_date))
      .map(ap => {
        const [y, m, d] = (ap.due_date || '').split('-').map(Number);
        const date = new Date(y, m - 1, d);
        date.setHours(0, 0, 0, 0);
        const daysUntil = Math.round((date.getTime() - todayMs) / 86400000);
        return { ...ap, daysUntil };
      });
  }, [actionPoints]);

  const noDue = useMemo(() => actionPoints.filter(ap => !ap.due_date), [actionPoints]);

  // Compute month spans
  const monthSpans = useMemo(() => {
    const spans: Array<{ label: string; count: number }> = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(todayMs + (startDay + i) * 86400000);
      const label = d.toLocaleDateString('en-NZ', { month: 'short', year: '2-digit' });
      if (!spans.length || spans[spans.length - 1].label !== label) {
        spans.push({ label, count: 1 });
      } else {
        spans[spans.length - 1].count++;
      }
    }
    return spans;
  }, [dayCount, startDay]);

  return (
    <div style={{ flex: 1, overflow: 'hidden', fontFamily: sansFont, display: 'flex', flexDirection: 'column', paddingLeft: 32 }}>
      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
        <div style={{ minWidth: totalW }}>
          {/* Month row */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3, background: CARD_BG }}>
            {monthSpans.map((span, i) => (
              <div key={i} style={{
                width: span.count * DAY_W, flexShrink: 0,
                padding: '4px 6px', fontSize: 11, fontWeight: 600,
                color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em',
                borderLeft: i === 0 ? 'none' : `1px solid ${BORDER_SOFT}`,
                borderBottom: `1px solid ${BORDER_SOFT}`,
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                {span.label}
              </div>
            ))}
          </div>

          {/* Day labels row */}
          <div style={{ display: 'flex', position: 'sticky', top: 20, zIndex: 2, background: CARD_BG, borderBottom: `1px solid ${BORDER_SOFT}` }}>
            {Array.from({ length: dayCount }, (_, i) => {
              const offset = startDay + i;
              const d = new Date(todayMs + offset * 86400000);
              const isToday = offset === 0;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={i} style={{
                  width: DAY_W, flexShrink: 0, textAlign: 'center', padding: '3px 0',
                  fontSize: 11, fontWeight: isToday ? 600 : 400,
                  color: isToday ? RED : isWeekend ? WEEKEND : MUTED,
                  background: isToday ? 'oklch(42% 0.16 25 / 0.06)' : 'transparent',
                  borderLeft: isToday ? '1px solid oklch(42% 0.16 25 / 0.3)' : `1px solid ${BORDER_SOFT}`,
                  fontFamily: monoFont,
                }}>
                  {isToday ? '▼' : `${d.getDate()}`}
                </div>
              );
            })}
          </div>

          {/* Items with due dates */}
          {withDue.map(card => {
            const dotX = (card.daysUntil - startDay) * DAY_W;
            const dotColor = card.due_date ? dueDateColor(card.due_date) : FAINT;

            return (
              <div key={card.id} style={{ position: 'relative', height: ROW_H, borderBottom: `1px solid ${BORDER_SOFT}` }}>
                {/* Grid columns */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', pointerEvents: 'none' }}>
                  {Array.from({ length: dayCount }, (_, i) => {
                    const offset = startDay + i;
                    const d = new Date(todayMs + offset * 86400000);
                    const isToday = offset === 0;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div key={i} style={{
                        width: DAY_W, height: '100%', flexShrink: 0,
                        background: isToday ? 'oklch(42% 0.16 25 / 0.05)' : isWeekend ? 'oklch(50% 0.01 75 / 0.03)' : 'transparent',
                        borderLeft: isToday ? '1px solid oklch(42% 0.16 25 / 0.2)' : `1px solid ${BORDER_SOFT}`,
                      }} />
                    );
                  })}
                </div>

                {/* Item */}
                <div style={{
                  position: 'absolute', left: dotX, top: '50%', transform: 'translateY(-50%)',
                  display: 'flex', alignItems: 'center', gap: 3, zIndex: 1, pointerEvents: 'auto',
                }}>
                  {/* Checkbox */}
                  <GanttItemCheckbox item={card} onToggle={onToggle} />
                  {/* Dot + text */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', maxWidth: 220, paddingRight: 4 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: dotColor, boxShadow: `0 0 0 3px ${dotColor}22`,
                    }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, lineHeight: 1.3, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
                        {card.text}
                      </div>
                      {card.channel_type && (
                        <div style={{ fontSize: 12, color: FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                          {card.channel_type}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* No-due-date items — rendered outside the horizontally-scrolling day-grid so
          text isn't clamped to the (often much narrower) date-range width. */}
      {noDue.length > 0 && (
        <div style={{ flexShrink: 0, maxHeight: '40%', overflowY: 'auto' }}>
          <div style={{ padding: '6px 8px', borderTop: `1px solid ${BORDER_SOFT}`, background: PAPER_BG }}>
            <div style={{ fontSize: 11, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              No due date
            </div>
          </div>
          {noDue.map(card => (
            <div key={card.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 8px', borderBottom: `1px solid ${BORDER_SOFT}`, background: PAPER_BG }}>
              <GanttItemCheckbox item={card} onToggle={onToggle} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, lineHeight: 1.3, color: INK, fontWeight: 500, wordBreak: 'break-word' }}>
                  {card.text}
                </div>
                {card.channel_type && (
                  <span style={{ marginTop: 2, display: 'inline-block' }}><Tag>{card.channel_type}</Tag></span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {actionPoints.length === 0 && (
        <div style={{ padding: '12px', fontSize: 13, color: FAINT, fontFamily: serifFont, fontStyle: 'italic', textAlign: 'center' }}>
          No action points
        </div>
      )}
    </div>
  );
}

function GanttItemCheckbox({ item, onToggle }: { item: ActionPoint; onToggle: (id: string, c: boolean) => void }) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [localCompleted, setLocalCompleted] = useState(false);
  const effectiveCompleted = item.completed || localCompleted;

  const handleClick = (e: React.MouseEvent) => {
    if (!effectiveCompleted && !isCompleting) {
      fireConfetti(e.clientX, e.clientY);
      setIsCompleting(true);
      setTimeout(() => {
        setIsCompleting(false);
        setLocalCompleted(true);
        onToggle(item.id, true);
      }, 400);
    } else if (effectiveCompleted) {
      setLocalCompleted(false);
      onToggle(item.id, false);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        marginTop: 1,
        width: 13,
        height: 13,
        borderRadius: '50%',
        flexShrink: 0,
        border: `1.5px solid ${effectiveCompleted || isCompleting ? RED : BORDER}`,
        background: effectiveCompleted || isCompleting ? RED : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {(effectiveCompleted || isCompleting) && (
        <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
          <path d="M1.5 4L3 5.5L6.5 2" stroke={CARD_BG} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}
