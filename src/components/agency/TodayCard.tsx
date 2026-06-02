// src/components/agency/TodayCard.tsx
'use client';

import { useState, useEffect } from 'react';
import type { ClientCardData } from '@/app/api/agency/clients/route';
import { getChannelLogo } from '@/lib/utils/channel-icons';

function clientInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface TodayCardProps {
  clients: ClientCardData[];
  today: Date;
}

export function TodayCard({ clients, today }: TodayCardProps) {
  const todayStr = today.toISOString().split('T')[0];
  const day = today.getDate();
  const month = MONTH_NAMES[today.getMonth()];
  const dayName = DAY_NAMES[today.getDay()];

  // Clients with at least one live channel (startDate <= today && endDate >= today)
  const activeClients = clients
    .map(client => ({
      ...client,
      liveChannels: client.channels.filter(ch => ch.status === 'live'),
    }))
    .filter(c => c.liveChannels.length > 0);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const serifFont = "'DM Serif Display', Georgia, serif";
  const sansFont = "'DM Sans', system-ui, sans-serif";

  return (
    <div style={{
      width: '100%',
      background: '#1C1917',
      borderRadius: 18,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: sansFont,
      boxShadow: '0 4px 20px rgba(0,0,0,0.12), 0 1px 6px rgba(0,0,0,0.08)',
    }}>
      {/* TODAY label */}
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: sansFont }}>
        TODAY
      </span>

      {/* Date */}
      <span style={{ fontSize: 34, color: '#ffffff', lineHeight: 1.1, marginTop: 4, fontFamily: serifFont }}>
        {month} {day}
      </span>

      {/* Day of week + time */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontFamily: sansFont }}>
          {dayName}
        </span>
        <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.9)', fontFamily: sansFont, fontWeight: 500, letterSpacing: '0.02em' }}>
          {timeStr}
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', margin: '12px 0' }} />

      {/* Live channels label */}
      <span style={{ fontSize: 12, textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.1em', marginBottom: 8, fontFamily: sansFont }}>
        Live Channels
      </span>

      {/* Scrollable live-channel list — last item fades out as scroll hint */}
      <div style={{ position: 'relative' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          overflowY: 'auto', maxHeight: 180,
          paddingBottom: 28,
          scrollbarWidth: 'none',
        }}>
          {activeClients.length === 0 ? (
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: sansFont }}>No active channels today</span>
          ) : (
            activeClients.map(client => (
              <div key={client.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'rgba(74,124,89,0.6)', flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', fontFamily: sansFont }}>
                    {client.name}
                  </span>
                </div>
                {client.liveChannels.map(ch => (
                  <div key={ch.channelName} style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 11, marginTop: 4 }}>
                    <div style={{ width: 14, height: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {getChannelLogo(ch.channelName, "w-[14px] h-[14px]")}
                    </div>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: sansFont }}>{ch.channelName}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
        {/* Gradient fade — always visible, paddingBottom ensures last item scrolls above it */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 32,
          background: 'linear-gradient(to bottom, transparent, #1C1917)',
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  );
}
