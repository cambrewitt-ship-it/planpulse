'use client';

import { useState, useMemo } from 'react';

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
      const buckets: ActionPoint[][] = [[], [], []];
      [...actionPoints].sort(sortByDue).forEach(ap => {
        const days = daysFromToday(ap.due_date);
        if (days <= 2) buckets[0].push(ap);
        else if (days <= 4) buckets[1].push(ap);
        else buckets[2].push(ap);
      });
      return [
        { label: '1–2 Days', items: buckets[0] },
        { label: '2–4 Days', items: buckets[1] },
        { label: '5+ Days', items: buckets[2] },
      ];
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
                // ~45% width so next column is peeking, hinting scroll
                flexShrink: 0,
                width: '45%',
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
                color: '#8A8578',
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
                    background: '#E8E4DC',
                    color: '#8A8578',
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
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 7,
      padding: '7px 10px',
      borderBottom: isLast ? 'none' : '0.5px solid #E8E4DC',
      opacity: item.completed ? 0.5 : 1,
    }}>
      {/* Circle checkbox */}
      <div
        onClick={() => onToggle(item.id, !item.completed)}
        style={{
          marginTop: 2,
          width: 13,
          height: 13,
          borderRadius: '50%',
          flexShrink: 0,
          border: item.completed ? '0.5px solid #4A7C59' : '0.5px solid #D5D0C5',
          background: item.completed ? '#4A7C59' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {item.completed && (
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
          color: item.completed ? '#B5B0A5' : '#1C1917',
          textDecoration: item.completed ? 'line-through' : 'none',
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
