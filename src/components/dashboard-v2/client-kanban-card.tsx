'use client';

import { useCallback, useEffect, useState } from 'react';
import { KanbanBoard } from '@/components/agency/KanbanBoard';
import type { AgencyClientActionPoints } from '@/app/api/agency/action-points/route';

interface ClientKanbanCardProps {
  clientId: string;
  onActionPointCompleted?: () => void;
}

export function ClientKanbanCard({ clientId, onActionPointCompleted }: ClientKanbanCardProps) {
  const [clientActionPoints, setClientActionPoints] = useState<AgencyClientActionPoints | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agency/action-points');
      if (!res.ok) {
        throw new Error('Failed to load action points');
      }
      const data = await res.json();
      const clients: AgencyClientActionPoints[] = data.clients || [];
      const match = clients.find(c => c.clientId === clientId) ?? null;
      setClientActionPoints(match);
    } catch (err: any) {
      console.error('Error loading client kanban data:', err);
      setError(err.message || 'Failed to load action points');
      setClientActionPoints(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCompleted = useCallback(() => {
    void load();
    onActionPointCompleted?.();
  }, [load, onActionPointCompleted]);

  const totalOutstanding = clientActionPoints?.totalOutstanding ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>Action Points Kanban</span>
          {totalOutstanding > 0 && (
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {totalOutstanding} open
            </span>
          )}
        </div>
        {loading && (
          <span className="text-xs text-gray-400">Loading…</span>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 mb-2">
          {error}
        </p>
      )}

      {!loading && !clientActionPoints && !error && (
        <p className="text-sm text-gray-400">
          No outstanding action points for this client.
        </p>
      )}

      {clientActionPoints && (
        <div className="mt-2">
          <KanbanBoard
            actionPointClients={[clientActionPoints]}
            amFilter="All"
            onActionPointCompleted={handleCompleted}
          />
        </div>
      )}
    </div>
  );
}

