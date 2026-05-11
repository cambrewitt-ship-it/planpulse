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
      height: '100%',
      background: '#FDFCF8',
      borderRadius: 6,
      border: '0.5px solid #E8E4DC',
      overflow: 'hidden',
      fontFamily: sansFont,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 13px 8px', borderBottom: '0.5px solid #E8E4DC', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 9, fontWeight: 400, color: '#B5B0A5', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Action Points
            {incomplete.length > 0 && (
              <span style={{ marginLeft: 5, background: '#A0442A', color: '#fff', borderRadius: 99, padding: '1px 5px', fontSize: 8 }}>
                {incomplete.length}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
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
                }}
              >
                {mode === 'priority' ? 'Priority' : 'Channel'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Horizontally scrollable kanban */}
      <div style={{
        flex: 1,
        overflowX: 'auto',
        overflowY: 'hidden',
        display: 'flex',
        alignItems: 'stretch',
        padding: '8px',
        gap: 6,
        // Hide scrollbar visually but keep it functional
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
