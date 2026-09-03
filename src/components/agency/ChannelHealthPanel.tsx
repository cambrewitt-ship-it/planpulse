// src/components/agency/ChannelHealthPanel.tsx
'use client';

import { useState } from 'react';
import type { ClientChannelHealth } from '@/app/api/agency/channel-health/route';

// Deterministic hash-based client coloring — same palette/approach as
// KanbanBoard.tsx and ClientCardCompact.tsx (duplicated by existing
// convention rather than exported, see those files).
const COLORS = ['#4A6580', '#B07030', '#4A7C59', '#A0442A', '#4A6580', '#8A8578', '#4A7C59', '#A0442A'];
function clientColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(hash) % COLORS.length];
}

const STATUS_COLORS: Record<'red' | 'amber' | 'green', string> = {
  red: '#A0442A',
  amber: '#B07030',
  green: '#4A7C59',
};

// Same canvas-confetti burst used by KanbanBoard.tsx / inline-action-points.tsx
// / client-action-points-list.tsx (duplicated by existing convention).
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
    const COLORS_CONFETTI = ['#4A7C59', '#4A6580', '#B07030', '#A0442A', '#F5F0E8', '#D5D0C5'];
    const pieces = Array.from({ length: 60 }, () => ({
      x: originX, y: originY,
      vx: (Math.random() - 0.5) * 10,
      vy: -(Math.random() * 8 + 3),
      gravity: 0.3,
      color: COLORS_CONFETTI[Math.floor(Math.random() * COLORS_CONFETTI.length)],
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

interface ChannelHealthPanelProps {
  clients: ClientChannelHealth[];
  onItemToggle: (id: string, completed: boolean, clientId: string) => void | Promise<void>;
}

export function ChannelHealthPanel({ clients, onItemToggle }: ChannelHealthPanelProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (clients.length === 0) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', color: '#8A8578', fontSize: 13, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        No digital ad channels found across your clients yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {clients.map(client => (
        <div key={client.clientId} style={{ padding: '10px 4px', borderBottom: '1px solid #F0EDE6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: clientColor(client.clientId), flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              {client.clientName}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {client.channels.map(channel => {
              const key = `${client.clientId}:${channel.channelType}`;
              const isExpanded = expandedKey === key;
              return (
                <div key={key} style={{ width: isExpanded ? '100%' : undefined }}>
                  <button
                    type="button"
                    onClick={() => setExpandedKey(isExpanded ? null : key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px', borderRadius: 4, border: '1px solid #E0DCD4',
                      background: isExpanded ? '#F5F3EF' : '#FDFCF8', cursor: 'pointer',
                      fontSize: 12.5, fontFamily: "'DM Sans', system-ui, sans-serif", color: '#1C1917',
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLORS[channel.status], flexShrink: 0 }} />
                    {channel.channelType}
                    <span style={{ color: '#8A8578' }}>
                      {channel.setUpTotal > 0 && channel.setUpDone < channel.setUpTotal
                        ? `${channel.setUpDone}/${channel.setUpTotal} set up`
                        : `${channel.healthCheckDone}/${channel.healthCheckTotal} checked`}
                    </span>
                  </button>
                  {isExpanded && (
                    <div style={{ marginTop: 6, padding: 12, background: '#FDFCF8', border: '1px solid #E8E4DC', borderRadius: 6 }}>
                      {channel.items.map(item => (
                        <div
                          key={item.id}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px solid #F0EDE6' }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              if (!item.completed) fireConfetti(e.clientX, e.clientY);
                              onItemToggle(item.id, !item.completed, client.clientId);
                            }}
                            style={{
                              width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                              border: item.completed ? 'none' : '1.5px solid #C7C2B7',
                              background: item.completed ? '#4A7C59' : 'transparent',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                            }}
                            aria-label={item.completed ? 'Mark as unchecked' : 'Mark as checked'}
                          >
                            {item.completed && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, color: '#1C1917', fontWeight: 500, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                              {item.text}
                            </div>
                            {item.description && (
                              <div style={{ fontSize: 11.5, color: '#8A8578', marginTop: 1, lineHeight: 1.4 }}>{item.description}</div>
                            )}
                            {item.category === 'HEALTH CHECK' && item.completed && item.stale && (
                              <div style={{ fontSize: 11, color: '#B07030', marginTop: 2, fontWeight: 500 }}>Needs recheck</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
