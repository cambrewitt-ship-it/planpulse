// src/components/agency/TodayCard.tsx
'use client';

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

  const serifFont = "'DM Serif Display', Georgia, serif";
  const sansFont = "'DM Sans', system-ui, sans-serif";

  return (
    <div style={{
      width: 176,
      flexShrink: 0,
      background: '#1C1917',
      borderRadius: 6,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: sansFont,
    }}>
      {/* TODAY label */}
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: sansFont }}>
        TODAY
      </span>

      {/* Date */}
      <span style={{ fontSize: 28, color: 'rgba(255,255,255,0.88)', lineHeight: 1.1, marginTop: 4, fontFamily: serifFont }}>
        {month} {day}
      </span>

      {/* Day of week */}
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2, fontFamily: sansFont }}>
        {dayName}
      </span>

      {/* Divider */}
      <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', margin: '12px 0' }} />

      {/* Live channels label */}
      <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 8, fontFamily: sansFont }}>
        Live Channels
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {activeClients.length === 0 ? (
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: sansFont }}>No active channels today</span>
        ) : (
          activeClients.map(client => (
            <div key={client.id}>
              {/* Client row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: 'rgba(74,124,89,0.6)',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: sansFont }}>
                  {client.name}
                </span>
              </div>
              {/* Channels */}
              {client.liveChannels.map(ch => (
                <div key={ch.channelName} style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 11, marginTop: 3 }}>
                  <div style={{ width: 12, height: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {getChannelLogo(ch.channelName, "w-3 h-3")}
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: sansFont }}>{ch.channelName}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
