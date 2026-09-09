// src/components/agency/AlertsPanel.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgencyAlert } from '@/app/api/agency/alerts/route';

const SEVERITY_COLORS: Record<AgencyAlert['severity'], string> = {
  critical: '#A0442A',
  warning: '#B07030',
};
const CLEAN_COLOR = '#4A7C59';
const sansFont = "'DM Sans', system-ui, sans-serif";

interface AlertsPanelProps {
  alerts: AgencyAlert[];
  loading?: boolean;
}

export function AlertsPanel({ alerts, loading = false }: AlertsPanelProps) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const visibleAlerts = alerts.filter(a => !hiddenIds.has(a.id));

  const handleResolve = async (alert: AgencyAlert) => {
    setHiddenIds(prev => new Set(prev).add(alert.id));
    try {
      const res = await fetch('/api/agency/alerts/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alert.id, type: alert.type }),
      });
      if (!res.ok) throw new Error('Failed to resolve');
    } catch (err) {
      console.error('Error resolving alert:', err);
      // Request failed — the alert is still actually open, so bring it back.
      setHiddenIds(prev => {
        const next = new Set(prev);
        next.delete(alert.id);
        return next;
      });
    }
  };

  // Preserve the incoming severity-first sort, just group by client for display.
  const groups: { clientId: string; clientName: string; alerts: AgencyAlert[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const alert of visibleAlerts) {
    let idx = groupIndex.get(alert.clientId);
    if (idx === undefined) {
      idx = groups.length;
      groupIndex.set(alert.clientId, idx);
      groups.push({ clientId: alert.clientId, clientName: alert.clientName, alerts: [] });
    }
    groups[idx].alerts.push(alert);
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#FFFFFF',
      borderRadius: 18,
      border: '0.5px solid #D8D4CE',
      boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
      overflow: 'hidden',
      fontFamily: sansFont,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 13px 8px',
        borderBottom: '1.5px solid #E0E8F4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Alerts
        </span>
        {!loading && visibleAlerts.length > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#FFFFFF',
            background: visibleAlerts.some(a => a.severity === 'critical') ? SEVERITY_COLORS.critical : SEVERITY_COLORS.warning,
            borderRadius: 10, padding: '2px 8px',
          }}>
            {visibleAlerts.length}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 13px' }}>
        {loading ? (
          <span style={{ fontSize: 13, color: '#B5B0A5' }}>Loading…</span>
        ) : groups.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, paddingTop: 24 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: CLEAN_COLOR }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: CLEAN_COLOR }}>All clear</span>
            <span style={{ fontSize: 11, color: '#B5B0A5', textAlign: 'center' }}>No spend or setup issues right now</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {groups.map(group => (
              <div key={group.clientId}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1C1917', marginBottom: 6 }}>
                  {group.clientName}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.alerts.map(alert => (
                    <div
                      key={alert.id}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}
                    >
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                        background: SEVERITY_COLORS[alert.severity],
                      }} />
                      <button
                        onClick={() => router.push(`/clients/${alert.clientId}/dashboard`)}
                        style={{
                          flex: 1, minWidth: 0, textAlign: 'left',
                          background: 'transparent', border: 'none', padding: 0,
                          cursor: 'pointer', fontFamily: sansFont,
                        }}
                      >
                        <div style={{ fontSize: 13, color: '#1C1917', fontWeight: 500, lineHeight: 1.3 }}>
                          {alert.message}
                        </div>
                        {alert.detail && (
                          <div style={{ fontSize: 11, color: '#8A8578', marginTop: 2, lineHeight: 1.3 }}>
                            {alert.detail}
                          </div>
                        )}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); void handleResolve(alert); }}
                        style={{
                          flexShrink: 0, fontSize: 10, fontWeight: 600,
                          color: '#8A8578', background: '#F0EDE6',
                          border: '0.5px solid #D8D4CE', borderRadius: 6,
                          padding: '3px 8px', cursor: 'pointer',
                          fontFamily: sansFont, marginTop: 1,
                        }}
                      >
                        Resolved
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
