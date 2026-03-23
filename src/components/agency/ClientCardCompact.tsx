// src/components/agency/ClientCardCompact.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientCardData } from '@/app/api/agency/clients/route';

interface AccountManager {
  id: string;
  name: string;
  email: string | null;
}

const COLORS = ['#4A6580', '#B07030', '#4A7C59', '#A0442A', '#4A6580', '#8A8578', '#4A7C59', '#A0442A'];

function clientColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function clientInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function scoreColor(score: number): string {
  if (score >= 70) return '#4A7C59';
  if (score >= 40) return '#B07030';
  return '#A0442A';
}

function calcBudgetPacingScore(pacingRatio: number): number {
  const pct = pacingRatio * 100;
  if (pct >= 95 && pct <= 105) return 100;
  if ((pct >= 85 && pct < 95) || (pct > 105 && pct <= 115)) return 80;
  if ((pct >= 75 && pct < 85) || (pct > 115 && pct <= 125)) return 60;
  if ((pct >= 65 && pct < 75) || (pct > 125 && pct <= 135)) return 40;
  return 20;
}

function calcActionScore(completionRate: number): number {
  const pct = completionRate * 100;
  if (pct >= 100) return 100;
  if (pct >= 75) return 80;
  if (pct >= 50) return 60;
  if (pct >= 25) return 40;
  return 20;
}

function calcCompositeHealthScore(
  spendVariancePct: number | null,
  completedActions: number,
  totalActions: number,
  healthStatus: string | undefined
): number {
  const pacingRatio = spendVariancePct != null ? 1 + spendVariancePct / 100 : 1.0;
  const budgetPacingScore = calcBudgetPacingScore(pacingRatio);
  const completionRate = totalActions > 0 ? completedActions / totalActions : 1.0;
  const actionScore = calcActionScore(completionRate);
  const perfScore = healthStatus === 'green' ? 85 : healthStatus === 'amber' ? 50 : 20;
  return Math.round(budgetPacingScore * (4 / 9) + actionScore * (2.5 / 9) + perfScore * (2.5 / 9));
}

function formatCurrency(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

interface HealthRingProps {
  score: number;
  color: string;
}

function HealthRing({ score, color }: HealthRingProps) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, score)) / 100);
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="#E8E4DC" strokeWidth="2" />
      <circle
        cx="18" cy="18" r={r} fill="none"
        stroke={color} strokeWidth="2"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="22" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1C1917"
        fontFamily="'Inter', system-ui, sans-serif">
        {Math.round(score)}
      </text>
    </svg>
  );
}

interface ClientCardCompactProps {
  client: ClientCardData;
  selected: boolean;
  onClick: () => void;
  index?: number;
  onAccountManagerChange?: (clientId: string, am: string | null) => void;
  accountManagers?: AccountManager[];
}

export function ClientCardCompact({ client, selected, onClick, index = 0, onAccountManagerChange, accountManagers = [] }: ClientCardCompactProps) {
  const router = useRouter();
  const color = clientColor(client.id);
  const initials = clientInitials(client.name);
  const health = client.health;
  const [showAmMenu, setShowAmMenu] = useState(false);
  const [currentAm, setCurrentAm] = useState<string | null>(client.account_manager ?? null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync if parent updates the client prop
  useEffect(() => {
    setCurrentAm(client.account_manager ?? null);
  }, [client.account_manager]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showAmMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAmMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAmMenu]);

  async function assignAm(am: string | null) {
    setShowAmMenu(false);
    setCurrentAm(am);
    try {
      await fetch(`/api/agency/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_manager: am }),
      });
      onAccountManagerChange?.(client.id, am);
    } catch (err) {
      console.error('Failed to update account manager:', err);
      setCurrentAm(client.account_manager ?? null);
    }
  }

  // Composite health score 0-100 (mirrors dashboard-v2 calculateHealthScore logic)
  const healthScore = calcCompositeHealthScore(
    client.spendVariancePct,
    client.completedActionPoints,
    client.totalActionPoints,
    health?.status
  );

  const healthLabel = health?.status === 'green' ? 'Healthy' : health?.status === 'amber' ? 'At Risk' : 'Critical';
  const healthColor = health?.status === 'red' ? '#A0442A' : health?.status === 'amber' ? '#B07030' : '#4A7C59';
  const healthTextColor = health?.status === 'red' ? '#A0442A' : health?.status === 'amber' ? '#B07030' : '#4A7C59';

  // Sub-scores (0-100)
  const pacing = Math.max(0, Math.min(100, 100 - Math.abs(client.spendVariancePct ?? 0) * 2));
  const actions = client.totalActionPoints > 0
    ? (client.completedActionPoints / client.totalActionPoints) * 100
    : 100;
  const perf = health?.status === 'green' ? 85 : health?.status === 'amber' ? 50 : 20;

  const actionPointsOutstanding = client.totalActionPoints - client.completedActionPoints;

  // Spend row
  const hasSpend = client.plannedBudget > 0;
  const budgetPct = hasSpend ? Math.min(200, (client.actualSpend / client.plannedBudget) * 100) : 0;

  const isAlt = index % 2 === 1;
  const cardStyle: React.CSSProperties = {
    background: isAlt ? '#F2EDE6' : '#FDFCF8',
    border: selected ? '1.5px solid rgba(74,101,128,0.5)' : '1px solid #B8B4AE',
    borderRadius: 6,
    padding: '14px',
    marginBottom: 6,
    cursor: 'pointer',
    fontFamily: "'DM Sans', system-ui, sans-serif",
  };
  const subTextColor = isAlt ? '#6A6560' : '#8A8578';

  const scores = [
    {
      label: 'P',
      fullLabel: 'Pacing',
      value: pacing,
      detail: client.spendVariancePct != null
        ? `${client.spendVariancePct > 0 ? '+' : ''}${Math.round(client.spendVariancePct)}%`
        : 'N/A'
    },
    {
      label: 'A',
      fullLabel: 'Actions',
      value: actions,
      detail: client.totalActionPoints > 0
        ? `${client.completedActionPoints}/${client.totalActionPoints}`
        : '0/0'
    },
    {
      label: 'Pf',
      fullLabel: 'Performance',
      value: perf,
      detail: health?.status === 'green' ? 'Healthy' : health?.status === 'amber' ? 'At Risk' : 'Critical'
    },
  ];

  return (
    <div style={cardStyle} onClick={() => { onClick(); router.push(`/clients/${client.id}/dashboard-v2`); }}>
      {/* Row 1: Avatar + Name + Health ring */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 5,
          background: '#E8E5DE', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ color: '#8A8578', fontWeight: 500, fontSize: 13 }}>{initials}</span>
        </div>
        <span style={{
          flex: 1, fontWeight: 500, fontSize: 15, color: '#1C1917',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{client.name}</span>
        <HealthRing score={healthScore} color={healthColor} />
      </div>

      {/* Row 2: Health label + action points count + AM tag */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 500, color: healthTextColor,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>{healthLabel}</span>
        {actionPointsOutstanding > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 400, color: '#A0442A',
          }}>{actionPointsOutstanding} open</span>
        )}
        <span style={{ flex: 1 }} />
        {/* AM tag — click to assign */}
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowAmMenu(v => !v); }}
            title="Assign account manager"
            style={{
              fontSize: 10, fontWeight: 500,
              padding: '2px 6px',
              borderRadius: 3,
              border: currentAm ? '0.5px solid rgba(74,101,128,0.3)' : '0.5px dashed #D5D0C5',
              background: currentAm ? 'rgba(74,101,128,0.08)' : 'transparent',
              color: currentAm ? '#4A6580' : '#B5B0A5',
              cursor: 'pointer',
              fontFamily: "'DM Sans', system-ui, sans-serif",
              letterSpacing: '0.04em',
            }}
          >
            {currentAm ?? 'AM'}
          </button>
          {showAmMenu && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 4,
              background: '#FDFCF8',
              border: '0.5px solid #E8E4DC',
              borderRadius: 5,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              zIndex: 50,
              minWidth: 90,
              overflow: 'hidden',
            }}>
              {accountManagers.map(am => (
                <button
                  key={am.id}
                  onClick={(e) => { e.stopPropagation(); void assignAm(am.name); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 12px',
                    fontSize: 12,
                    color: currentAm === am.name ? '#4A6580' : '#1C1917',
                    fontWeight: currentAm === am.name ? 600 : 400,
                    background: currentAm === am.name ? 'rgba(74,101,128,0.06)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >{am.name}</button>
              ))}
              {currentAm && (
                <button
                  onClick={(e) => { e.stopPropagation(); void assignAm(null); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 12px',
                    fontSize: 11,
                    color: '#B5B0A5',
                    background: 'transparent',
                    border: 'none',
                    borderTop: '0.5px solid #E8E4DC',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >Unassign</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Score strip with detail */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {scores.map(({ label, fullLabel, value, detail }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: subTextColor, fontWeight: 500 }}>{fullLabel}</span>
            <div style={{
              width: '100%', height: 3, borderRadius: 1,
              background: scoreColor(value),
            }} />
            <span style={{ fontSize: 10, color: subTextColor, fontWeight: 400, lineHeight: 1.3 }}>
              {detail}
            </span>
          </div>
        ))}
      </div>

      {/* Row 4: Spend row (only if planned budget exists) */}
      {hasSpend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1C1917', whiteSpace: 'nowrap' }}>
            {formatCurrency(client.actualSpend)}
            <span style={{ fontWeight: 400, color: '#B5B0A5', fontSize: 13 }}>
              {' '}/ {formatCurrency(client.plannedBudget)}
            </span>
          </span>
          <div style={{ flex: 1, height: 4, background: '#E8E4DC', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.min(100, budgetPct)}%`,
              background: healthColor, borderRadius: 2,
            }} />
          </div>
          <span style={{ fontSize: 11, color: '#B5B0A5', whiteSpace: 'nowrap' }}>
            {Math.round(budgetPct)}%
          </span>
        </div>
      )}
    </div>
  );
}
