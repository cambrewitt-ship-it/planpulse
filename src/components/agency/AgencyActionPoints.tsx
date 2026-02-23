// src/components/agency/AgencyActionPoints.tsx
// Master agency action points list – all outstanding action points across all clients,
// broken out by client then media channel, ordered by due date.

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckSquare,
  Building2,
  ChevronDown,
  ChevronRight,
  Calendar,
  AlertCircle,
  Facebook,
  Search,
  Linkedin,
  Music,
  Radio,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AgencyActionPoint {
  id: string;
  text: string;
  category: 'SET UP' | 'HEALTH CHECK';
  channel_type: string;
  due_date: string | null;
  frequency?: string | null;
}

interface AgencyChannelGroup {
  channelType: string;
  actionPoints: AgencyActionPoint[];
}

interface AgencyClientActionPoints {
  clientId: string;
  clientName: string;
  channels: AgencyChannelGroup[];
  totalOutstanding: number;
}

function getChannelIcon(channelType: string) {
  const lower = channelType.toLowerCase();
  if (lower.includes('facebook') || lower.includes('meta')) {
    return <Facebook className="w-3.5 h-3.5 text-blue-600" />;
  }
  if (lower.includes('google')) {
    return <Search className="w-3.5 h-3.5 text-red-600" />;
  }
  if (lower.includes('linkedin')) {
    return <Linkedin className="w-3.5 h-3.5 text-blue-700" />;
  }
  if (lower.includes('tiktok')) {
    return <Music className="w-3.5 h-3.5 text-black" />;
  }
  return <Radio className="w-3.5 h-3.5 text-gray-500" />;
}

function formatDueDate(dateString: string | null): {
  label: string;
  isOverdue: boolean;
  isDueSoon: boolean;
} | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const label = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return {
    label,
    isOverdue: diffDays < 0,
    isDueSoon: diffDays >= 0 && diffDays <= 7,
  };
}

function ActionPointRow({ ap }: { ap: AgencyActionPoint }) {
  const dueDateInfo = formatDueDate(ap.due_date);

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-muted/40 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-snug">{ap.text}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <Badge
            variant={ap.category === 'SET UP' ? 'secondary' : 'outline'}
            className="text-xs py-0 h-5"
          >
            {ap.category}
          </Badge>
          {ap.frequency && (
            <span className="text-xs text-muted-foreground">{ap.frequency}</span>
          )}
          {dueDateInfo && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                dueDateInfo.isOverdue
                  ? 'text-red-600'
                  : dueDateInfo.isDueSoon
                  ? 'text-amber-600'
                  : 'text-muted-foreground'
              )}
            >
              {dueDateInfo.isOverdue && <AlertCircle className="w-3 h-3" />}
              <Calendar className="w-3 h-3" />
              {dueDateInfo.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ChannelSection({ group }: { group: AgencyChannelGroup }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="ml-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1 w-full text-left"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        {getChannelIcon(group.channelType)}
        <span>{group.channelType}</span>
        <Badge variant="outline" className="ml-1 text-xs py-0 h-4 px-1.5">
          {group.actionPoints.length}
        </Badge>
      </button>

      {open && (
        <div className="ml-4 mt-1 space-y-0.5">
          {group.actionPoints.map((ap) => (
            <ActionPointRow key={ap.id} ap={ap} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientSection({ client }: { client: AgencyClientActionPoints }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="font-semibold text-sm flex-1">{client.clientName}</span>
        <Badge variant="secondary" className="text-xs">
          {client.totalOutstanding} outstanding
        </Badge>
        <button
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/clients/${client.clientId}/new-client-dashboard`);
          }}
          className="text-xs text-blue-600 hover:underline ml-2 flex-shrink-0"
        >
          View
        </button>
      </button>

      {open && (
        <div className="px-2 py-3 space-y-3 bg-background">
          {client.channels.map((group) => (
            <ChannelSection key={group.channelType} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AgencyActionPoints() {
  const [clients, setClients] = useState<AgencyClientActionPoints[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/agency/action-points');
      if (!res.ok) throw new Error('Failed to load action points');
      const data = await res.json();
      setClients(data.clients || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalOutstanding = clients.reduce((s, c) => s + c.totalOutstanding, 0);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-4 flex-shrink-0">
        <CardTitle className="flex items-center gap-2 text-xl">
          <CheckSquare className="h-5 w-5" />
          Action Points
          {!loading && totalOutstanding > 0 && (
            <Badge variant="destructive" className="ml-2">
              {totalOutstanding} outstanding
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto max-h-[600px]">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : clients.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No outstanding action points across any clients
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map((client) => (
              <ClientSection key={client.clientId} client={client} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
