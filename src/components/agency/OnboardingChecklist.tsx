'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import type { ClientCardData } from '@/app/api/agency/clients/route';

type ChecklistItemKey = 'viewed_agency_dashboard' | 'visited_demo_dashboard' | 'visited_demo_portal' | 'created_first_client';
type Checklist = Record<ChecklistItemKey, boolean>;

interface OnboardingChecklistProps {
  clients: ClientCardData[];
}

export function OnboardingChecklist({ clients }: OnboardingChecklistProps) {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const markedViewed = useRef(false);
  const markedCreated = useRef(false);

  useEffect(() => {
    fetch('/api/agency/onboarding-checklist')
      .then(r => r.json())
      .then(data => setChecklist(data.checklist))
      .catch(() => {});
  }, []);

  // Landing on the Agency Dashboard with the checklist visible already
  // satisfies "view the Agency Dashboard" — mark it once, on first load.
  useEffect(() => {
    if (!checklist || checklist.viewed_agency_dashboard || markedViewed.current) return;
    markedViewed.current = true;
    fetch('/api/agency/onboarding-checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'viewed_agency_dashboard' }),
    })
      .then(r => r.json())
      .then(data => setChecklist(data.checklist))
      .catch(() => {});
  }, [checklist]);

  // A real (non-demo) client already exists — this covers agencies whose
  // clients predate this checklist, or were created outside the /clients/create
  // flow, and would otherwise never satisfy "created_first_client".
  const hasRealClient = clients.some(c => !c.is_demo);
  useEffect(() => {
    if (!checklist || checklist.created_first_client || markedCreated.current || !hasRealClient) return;
    markedCreated.current = true;
    fetch('/api/agency/onboarding-checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'created_first_client' }),
    })
      .then(r => r.json())
      .then(data => setChecklist(data.checklist))
      .catch(() => {});
  }, [checklist, hasRealClient]);

  if (!checklist) return null;

  const demoClient = clients.find(c => c.is_demo);
  const items: Array<{ key: ChecklistItemKey; label: string; href: string }> = [
    { key: 'viewed_agency_dashboard', label: 'View the Agency Dashboard & see your tasks + portfolio at a glance', href: '/agency' },
    { key: 'visited_demo_dashboard', label: "Check out your Demo Client's Dashboard", href: demoClient ? `/clients/${demoClient.id}/dashboard` : '/agency' },
    { key: 'visited_demo_portal', label: "Visit your Demo Client's Performance Portal", href: demoClient ? `/clients/${demoClient.id}/hub` : '/agency' },
    { key: 'created_first_client', label: 'Import a media plan & create your first client profile', href: '/clients/create' },
  ];

  const allDone = items.every(i => checklist[i.key]);
  if (allDone) return null;

  return (
    <div style={{
      flexShrink: 0, background: '#FDFCF8', borderBottom: '0.5px solid #E8E4DC',
      padding: '10px 18px', fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Getting Started
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {items.map(item => {
            const done = checklist[item.key];
            return (
              <Link
                key={item.key}
                href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 12px', borderRadius: 12,
                  border: `0.5px solid ${done ? 'rgba(74,124,89,0.3)' : '#E0DCD4'}`,
                  background: done ? 'rgba(74,124,89,0.08)' : '#F5F3EF',
                  color: done ? '#4A7C59' : '#1C1917',
                  fontSize: 12.5, fontWeight: 500, textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? '#4A7C59' : 'transparent',
                  border: done ? 'none' : '1.5px solid #D5D0C5',
                }}>
                  {done && <Check size={10} color="#FDFCF8" strokeWidth={3} />}
                </span>
                <span style={{ textDecoration: done ? 'line-through' : 'none' }}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
