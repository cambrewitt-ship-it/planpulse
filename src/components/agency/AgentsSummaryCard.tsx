// src/components/agency/AgentsSummaryCard.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ReceiptText, BarChart2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserAgent } from '@/types/database';

const AGENT_ICON_COLOR = '#7B1F2C';

const SUMMARY_TEMPLATES: { slug: string; name: string; icon: LucideIcon }[] = [
  { slug: 'invoice_generator', name: 'Invoice Generator', icon: ReceiptText },
  { slug: 'performance_analyst', name: 'Performance Analyst', icon: BarChart2 },
];

export function AgentsSummaryCard() {
  const [agents, setAgents] = useState<UserAgent[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/agents')
      .then(res => (res.ok ? res.json() : { agents: [] }))
      .then(({ agents }) => { if (!cancelled) setAgents(agents ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const sansFont = "'DM Sans', system-ui, sans-serif";

  return (
    <div style={{
      width: '100%',
      background: '#FDFCF8',
      borderRadius: 18,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: sansFont,
      border: '0.5px solid #E8E4DC',
    }}>
      <span style={{ fontSize: 12, color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
        Agents
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SUMMARY_TEMPLATES.map(({ slug, name, icon: Icon }) => {
          const agent = agents.find(a => a.template_slug === slug);
          const enabled = agent ? agent.is_enabled : true;
          return (
            <div key={slug} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: '#FBF0F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={13} style={{ color: AGENT_ICON_COLOR }} />
              </div>
              <span style={{ fontSize: 13, color: '#1C1917', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {agent?.name ?? name}
              </span>
              <span
                title={enabled ? 'Enabled' : 'Disabled'}
                style={{ width: 6, height: 6, borderRadius: '50%', background: enabled ? '#4A7C59' : '#D1D5DB', flexShrink: 0 }}
              />
            </div>
          );
        })}
      </div>

      <Link
        href="/agents"
        style={{
          marginTop: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '7px 10px', borderRadius: 10,
          border: '0.5px solid #E8E4DC', background: '#FFFFFF',
          fontSize: 12.5, fontWeight: 600, color: '#1C1917',
          textDecoration: 'none', fontFamily: sansFont,
        }}
      >
        <Plus size={13} />
        Manage Agents
      </Link>
    </div>
  );
}
