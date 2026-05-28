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
    const COLORS = ['#4A7C59', '#4A6580', '#B07030', '#A0442A', '#F5F0E8', '#D5D0C5'];
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

function dueDateColor(dateStr: string | null | undefined): string {
  if (!dateStr) return '#B5B0A5';
  const diff = daysFromToday(dateStr);
  if (diff <= 2) return '#A0442A';
  if (diff <= 6) return '#B07030';
  return '#8A8578';
}

const sansFont = "'DM Sans', system-ui, sans-serif";

type Column = { label: string; items: ActionPoint[] };

export default function ClientActionPointsList({ actionPoints, onToggle }: Props) {
  const [filterMode, setFilterMode] = useState<'priority' | 'channel'>('priority');
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'gantt'>('gantt');
  const [listCompletedOpen, setListCompletedOpen] = useState(false);

  const incomplete = useMemo(() => actionPoints.filter(ap => !ap.completed), [actionPoints]);

  const columns: Column[] = useMemo(() => {
    const sortByDue = (a: ActionPoint, b: ActionPoint) =>
      daysFromToday(a.due_date) - daysFromToday(b.due_date);

    if (filterMode === 'priority') {
      const buckets: ActionPoint[][] = [[], [], [], []];
      [...actionPoints].sort(sortByDue).forEach(ap => {
        const days = daysFromToday(ap.due_date);
        if (days < 0 && !ap.completed) buckets[0].push(ap);
        else if (days <= 2) buckets[1].push(ap);
        else if (days <= 4) buckets[2].push(ap);
        else buckets[3].push(ap);
      });
      const cols: Column[] = [];
      if (buckets[0].length > 0) cols.push({ label: 'Overdue', items: buckets[0] });
      cols.push(
        { label: '1–2 Days', items: buckets[1] },
        { label: '2–4 Days', items: buckets[2] },
        { label: '5+ Days', items: buckets[3] },
      );
      return cols;
    } else {
      const channels = Array.from(
        new Set(actionPoints.map(ap => ap.channel_type).filter((c): c is string => !!c))
      ).sort();
      const noChannel = actionPoints.filter(ap => !ap.channel_type);
      const cols: Column[] = channels.map(ch => ({
        label: ch,
        items: [
          ...actionPoints.filter(ap => ap.channel_type === ch && !ap.completed).sort(sortByDue),
          ...actionPoints.filter(ap => ap.channel_type === ch && ap.completed),
        ],
      }));
      if (noChannel.length > 0) {
        cols.push({
          label: 'General',
          items: [
            ...noChannel.filter(ap => !ap.completed).sort(sortByDue),
            ...noChannel.filter(ap => ap.completed),
          ],
        });
      }
      return cols;
    }
  }, [actionPoints, filterMode]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      background: '#FDFCF8',
      borderRadius: '0 6px 6px 0',
      border: '0.5px solid #E8E4DC',
      overflow: 'hidden',
      fontFamily: sansFont,
      height: '100%',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 13px 8px', borderBottom: '0.5px solid #E8E4DC', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 400, color: '#B5B0A5', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 0 }}>
            Action Points
            {incomplete.length > 0 && (
              <span style={{ marginLeft: 5, background: '#A0442A', color: '#fff', borderRadius: 99, padding: '1px 5px', fontSize: 8 }}>
                {incomplete.length}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', minWidth: 0, flex: 1, justifyContent: 'flex-end', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', minWidth: 0, overflow: 'hidden' }}>
              {(['priority', 'channel'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  style={{
                    fontSize: 9,
                    padding: '2px 7px',
                    borderRadius: 99,
                    border: '0.5px solid',
                    borderColor: filterMode === mode ? '#1C1917' : '#D5D0C5',
                    background: filterMode === mode ? '#1C1917' : 'transparent',
                    color: filterMode === mode ? '#fff' : '#8A8578',
                    cursor: 'pointer',
                    fontFamily: sansFont,
                    lineHeight: 1.5,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {mode === 'priority' ? 'Priority' : 'Channel'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 3, marginLeft: 6, paddingLeft: 6, borderLeft: '0.5px solid #E8E4DC', flexWrap: 'wrap', minWidth: 0, flexShrink: 0 }}>
              {(['kanban', 'list', 'gantt'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    fontSize: 9,
                    padding: '2px 7px',
                    borderRadius: 99,
                    border: '0.5px solid',
                    borderColor: viewMode === mode ? '#1C1917' : '#D5D0C5',
                    background: viewMode === mode ? '#1C1917' : 'transparent',
                    color: viewMode === mode ? '#fff' : '#8A8578',
                    cursor: 'pointer',
                    fontFamily: sansFont,
                    lineHeight: 1.5,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {mode === 'kanban' ? 'Kanban' : mode === 'list' ? 'List' : 'Gantt'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Horizontally scrollable kanban */}
      {viewMode === 'kanban' ? (
      <div style={{
        flex: 1,
        overflowX: 'auto',
        overflowY: 'hidden',
        display: 'flex',
        alignItems: 'stretch',
        padding: '8px',
        gap: 6,
        scrollbarWidth: 'none',
      }}>
        {columns.map(col => {
          const colIncomplete = col.items.filter(i => !i.completed);
          const colCompleted = col.items.filter(i => i.completed);
          return (
            <div
              key={col.label}
              style={{
                // ~32% width so more columns are visible, hinting scroll
                flexShrink: 0,
                width: '32%',
                display: 'flex',
                flexDirection: 'column',
                background: '#F5F2EB',
                borderRadius: 5,
                border: '0.5px solid #E8E4DC',
                overflow: 'hidden',
              }}
            >
              {/* Column header */}
              <div style={{
                padding: '6px 10px',
                borderBottom: '0.5px solid #E8E4DC',
                fontSize: 9,
                fontWeight: 600,
                color: col.label === 'Overdue' ? '#fff' : '#8A8578',
                background: col.label === 'Overdue' ? '#7F1D1D' : 'transparent',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}>
                {col.label}
                {colIncomplete.length > 0 && (
                  <span style={{
                    background: col.label === 'Overdue' ? 'rgba(255,255,255,0.25)' : '#E8E4DC',
                    color: col.label === 'Overdue' ? '#fff' : '#8A8578',
                    borderRadius: 99,
                    padding: '0px 5px',
                    fontSize: 8,
                  }}>
                    {colIncomplete.length}
                  </span>
                )}
              </div>

              {/* Column items — vertically scrollable */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {col.items.length === 0 ? (
                  <div style={{ padding: '12px 10px', fontSize: 10, color: '#C5C0B8', fontStyle: 'italic', textAlign: 'center' }}>
                    Nothing here
                  </div>
                ) : (
                  <>
                    {colIncomplete.map((item, idx) => (
                      <KanbanCard
                        key={item.id}
                        item={item}
                        onToggle={onToggle}
                        isLast={idx === colIncomplete.length - 1 && colCompleted.length === 0}
                      />
                    ))}
                    {colCompleted.length > 0 && (
                      <>
                        <div style={{
                          padding: '4px 10px 3px',
                          fontSize: 8,
                          color: '#C5C0B8',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          borderTop: colIncomplete.length > 0 ? '0.5px solid #E8E4DC' : 'none',
                          marginTop: colIncomplete.length > 0 ? 4 : 0,
                        }}>
                          Done
                        </div>
                        {colCompleted.map((item, idx) => (
                          <KanbanCard
                            key={item.id}
                            item={item}
                            onToggle={onToggle}
                            isLast={idx === colCompleted.length - 1}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      ) : viewMode === 'list' ? (
        /* List View */
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {actionPoints.length === 0 ? (
            <div style={{ padding: '12px 10px', fontSize: 10, color: '#C5C0B8', fontStyle: 'italic', textAlign: 'center' }}>
              No action points
            </div>
          ) : (() => {
            const sortByDue = (a: ActionPoint, b: ActionPoint) => daysFromToday(a.due_date) - daysFromToday(b.due_date);
            const listIncomplete = [...actionPoints.filter(ap => !ap.completed)].sort(sortByDue);
            const listCompleted = [...actionPoints.filter(ap => ap.completed)].sort(sortByDue);
            return (
              <>
                {listIncomplete.length === 0 && (
                  <div style={{ padding: '12px 10px', fontSize: 10, color: '#C5C0B8', fontStyle: 'italic', textAlign: 'center' }}>
                    All done!
                  </div>
                )}
                {listIncomplete.map((item) => (
                  <ListActionPointRow key={item.id} item={item} onToggle={onToggle} />
                ))}
                {listCompleted.length > 0 && (
                  <div style={{ marginTop: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => setListCompletedOpen(v => !v)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 9, color: '#B5B0A5', background: 'none', border: 'none',
                        cursor: 'pointer', padding: '4px 2px', width: '100%', textAlign: 'left',
                        textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: sansFont,
                      }}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" style={{ transform: listCompletedOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}>
                        <path d="M2 1.5L5.5 4 2 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                      Completed ({listCompleted.length})
                    </button>
                    {listCompletedOpen && listCompleted.map((item) => (
                      <div key={item.id} style={{ marginTop: 4 }}>
                        <ListActionPointRow item={item} onToggle={onToggle} />
                      </div>
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

function ListActionPointRow({ item, onToggle }: { item: ActionPoint; onToggle: (id: string, c: boolean) => void }) {
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
      background: '#F5F2EB',
      border: '0.5px solid #E8E4DC',
      borderRadius: 5,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      padding: '8px 10px',
      opacity: effectiveCompleted || isCompleting ? 0.5 : 1,
      transition: 'opacity 0.4s',
      flexShrink: 0,
    }}>
      {/* Circle checkbox */}
      <div
        onClick={handleClick}
        style={{
          marginTop: 3,
          width: 13,
          height: 13,
          borderRadius: '50%',
          flexShrink: 0,
          border: effectiveCompleted || isCompleting ? '0.5px solid #4A7C59' : '0.5px solid #D5D0C5',
          background: effectiveCompleted || isCompleting ? '#4A7C59' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {(effectiveCompleted || isCompleting) && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Text + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11,
          lineHeight: 1.4,
          color: effectiveCompleted || isCompleting ? '#B5B0A5' : '#1C1917',
          textDecoration: effectiveCompleted ? 'line-through' : 'none',
          wordBreak: 'break-word',
        }}>
          {item.text}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
          {item.channel_type && (
            <span style={{
              fontSize: 8, padding: '1px 5px', borderRadius: 99,
              background: '#EDE9E0', color: '#8A8578', fontWeight: 500,
            }}>
              {item.channel_type}
            </span>
          )}
          <span style={{
            fontSize: 8, padding: '1px 5px', borderRadius: 99,
            background: '#EDE9E0', color: '#8A8578',
          }}>
            {item.category}
          </span>
          {item.due_date && (
            <span style={{
              fontSize: 8,
              color: dueDateColor(item.due_date),
              fontWeight: 500,
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
    <div style={{ flex: 1, overflow: 'hidden', fontFamily: sansFont, display: 'flex', flexDirection: 'column' }}>
      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
        <div style={{ minWidth: totalW }}>
          {/* Month row */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3, background: '#FDFCF8' }}>
            {monthSpans.map((span, i) => (
              <div key={i} style={{
                width: span.count * DAY_W, flexShrink: 0,
                padding: '4px 6px', fontSize: 8, fontWeight: 600,
                color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.08em',
                borderLeft: i === 0 ? 'none' : '0.5px solid #E8E4DC',
                borderBottom: '0.5px solid #E8E4DC',
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                {span.label}
              </div>
            ))}
          </div>

          {/* Day labels row */}
          <div style={{ display: 'flex', position: 'sticky', top: 20, zIndex: 2, background: '#FDFCF8', borderBottom: '0.5px solid #E8E4DC' }}>
            {Array.from({ length: dayCount }, (_, i) => {
              const offset = startDay + i;
              const d = new Date(todayMs + offset * 86400000);
              const isToday = offset === 0;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={i} style={{
                  width: DAY_W, flexShrink: 0, textAlign: 'center', padding: '3px 0',
                  fontSize: 8, fontWeight: isToday ? 600 : 400,
                  color: isToday ? '#A0442A' : isWeekend ? '#D5D0C5' : '#8A8578',
                  background: isToday ? 'rgba(160,68,42,0.05)' : 'transparent',
                  borderLeft: isToday ? '0.5px solid rgba(160,68,42,0.3)' : '0.5px solid #F0EDE8',
                }}>
                  {isToday ? '▼' : `${d.getDate()}`}
                </div>
              );
            })}
          </div>

          {/* Items with due dates */}
          {withDue.map(card => {
            const dotX = (card.daysUntil - startDay) * DAY_W;
            const dotColor = card.due_date ? (daysFromToday(card.due_date) < 0 ? '#A0442A' : daysFromToday(card.due_date) <= 2 ? '#A0442A' : daysFromToday(card.due_date) <= 4 ? '#B07030' : '#4A6580') : '#B5B0A5';
            
            return (
              <div key={card.id} style={{ position: 'relative', height: ROW_H, borderBottom: '0.5px solid #F0EDE8' }}>
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
                        background: isToday ? 'rgba(160,68,42,0.04)' : isWeekend ? 'rgba(0,0,0,0.01)' : 'transparent',
                        borderLeft: isToday ? '0.5px solid rgba(160,68,42,0.2)' : '0.5px solid #F5F3EF',
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
                      <div style={{ fontSize: 11, lineHeight: 1.3, color: '#1C1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
                        {card.text}
                      </div>
                      {card.channel_type && (
                        <div style={{ fontSize: 9, color: '#B5B0A5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                          {card.channel_type}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* No-due-date items */}
          {noDue.length > 0 && (
            <>
              <div style={{ padding: '6px 8px', borderTop: '0.5px solid #E8E4DC', background: '#F5F2EB' }}>
                <div style={{ fontSize: 8, color: '#B5B0A5', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                  No due date
                </div>
              </div>
              {noDue.map(card => (
                <div key={card.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 8px', borderBottom: '0.5px solid #F0EDE8', background: '#F5F2EB' }}>
                  <GanttItemCheckbox item={card} onToggle={onToggle} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, lineHeight: 1.3, color: '#1C1917', fontWeight: 500 }}>
                      {card.text}
                    </div>
                    {card.channel_type && (
                      <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 99, background: '#EDE9E0', color: '#8A8578', fontWeight: 500, display: 'inline-block', marginTop: 2 }}>
                        {card.channel_type}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {actionPoints.length === 0 && (
        <div style={{ padding: '12px', fontSize: 10, color: '#C5C0B8', fontStyle: 'italic', textAlign: 'center' }}>
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
        width: 12,
        height: 12,
        borderRadius: '50%',
        flexShrink: 0,
        border: effectiveCompleted || isCompleting ? '0.5px solid #4A7C59' : '0.5px solid #D5D0C5',
        background: effectiveCompleted || isCompleting ? '#4A7C59' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {(effectiveCompleted || isCompleting) && (
        <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
          <path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function KanbanCard({
  item,
  onToggle,
  isLast,
}: {
  item: ActionPoint;
  onToggle: (id: string, c: boolean) => void;
  isLast: boolean;
}) {
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
    <>
      <style>{`@keyframes strike { from { width: 0% } to { width: 100% } }`}</style>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 7,
        padding: '7px 10px',
        borderBottom: isLast ? 'none' : '0.5px solid #E8E4DC',
        opacity: effectiveCompleted || isCompleting ? 0.5 : 1,
        transition: 'opacity 0.4s',
      }}>
      {/* Circle checkbox */}
      <div
        onClick={handleClick}
        style={{
          marginTop: 2,
          width: 13,
          height: 13,
          borderRadius: '50%',
          flexShrink: 0,
          border: effectiveCompleted || isCompleting ? '0.5px solid #4A7C59' : '0.5px solid #D5D0C5',
          background: effectiveCompleted || isCompleting ? '#4A7C59' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {(effectiveCompleted || isCompleting) && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Text + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11,
          lineHeight: 1.4,
          color: effectiveCompleted || isCompleting ? '#B5B0A5' : '#1C1917',
          textDecoration: effectiveCompleted ? 'line-through' : 'none',
          wordBreak: 'break-word',
          position: 'relative',
          transition: 'color 0.2s',
        }}>
          {item.text}
          {isCompleting && (
            <span style={{ position: 'absolute', left: 0, top: '50%', height: '1.5px', background: '#6B7280', width: 0, animation: 'strike 0.35s ease forwards' }} />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
          {item.channel_type && (
            <span style={{
              fontSize: 8, padding: '1px 5px', borderRadius: 99,
              background: '#EDE9E0', color: '#8A8578', fontWeight: 500,
            }}>
              {item.channel_type}
            </span>
          )}
          <span style={{
            fontSize: 8, padding: '1px 5px', borderRadius: 99,
            background: '#EDE9E0', color: '#8A8578',
          }}>
            {item.category}
          </span>
          {item.due_date && (
            <span style={{
              fontSize: 8,
              color: dueDateColor(item.due_date),
              fontWeight: 500,
            }}>
              {formatDueDate(item.due_date)}
            </span>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
