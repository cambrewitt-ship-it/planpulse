'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';
import { ListTodo, CheckCircle2, Circle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { format, parseISO } from 'date-fns';

interface ActionPoint {
  id: string;
  text: string;
  completed: boolean;
  category: 'SET UP' | 'HEALTH CHECK';
  channel_type: string;
  frequency?: string | null;
  due_date?: string | null;
}

interface TodoSectionProps {
  mediaPlanBuilderChannels: MediaPlanChannel[];
  clientId?: string;
  embedded?: boolean;
  onStatsUpdate?: (stats: { totalAll: number; completedAll: number; trafficLightColor: string; loading: boolean }) => void;
  onActionPointsChange?: () => void;
  actionPointsRefetchTrigger?: number;
  totalActualSpend?: number;
  plannedBudget?: number;
}

type TabType = 'SET UP' | 'HEALTH CHECK';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const sortByDueDate = (a: ActionPoint, b: ActionPoint) => {
  // Items with due dates come first, sorted soonest first
  if (a.due_date && b.due_date) {
    return a.due_date.localeCompare(b.due_date);
  }
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return 0;
};

const DueBadge = ({ dueDate }: { dueDate: string }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const parsed = parseISO(dueDate);
  const dayNum = parseInt(format(parsed, 'd'), 10);
  const dateStr = `Due ${ordinal(dayNum)} ${format(parsed, 'MMM')}`;

  let label: string;
  let className: string;

  if (daysUntil < 0) {
    label = 'Overdue';
    className = 'text-red-600 border-red-600';
  } else if (daysUntil === 0) {
    label = 'Due today';
    className = 'text-orange-600 border-orange-600';
  } else if (daysUntil <= 3) {
    label = `${dateStr} | ${daysUntil} Day${daysUntil === 1 ? '' : 's'}`;
    className = 'text-yellow-600 border-yellow-600';
  } else {
    label = dateStr;
    className = '';
  }

  return (
    <Badge variant="outline" className={`text-xs shrink-0 ${className}`}>
      {label}
    </Badge>
  );
};

const ActionRow = ({
  ap,
  activeTab,
  onToggle,
  onDelete,
}: {
  ap: ActionPoint;
  activeTab: TabType;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}) => (
  <li className="group flex items-center gap-3 p-3 rounded-lg hover:bg-[#f8fafc] transition-colors border border-transparent hover:border-[#e2e8f0]">
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(ap.id, ap.completed);
      }}
      className="flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
      aria-label={ap.completed ? 'Mark as incomplete' : 'Mark as complete'}
    >
      {ap.completed ? (
        <CheckCircle2 className="w-5 h-5 text-green-500" />
      ) : (
        <Circle className="w-5 h-5 text-[#94a3b8]" />
      )}
    </button>
    <span className={`flex-1 text-sm ${ap.completed ? 'line-through text-[#94a3b8]' : 'text-[#0f172a]'}`}>
      {ap.text}
    </span>
    <div className="flex items-center gap-2 shrink-0">
      {ap.channel_type && (
        <Badge variant="outline" className="text-xs text-[#64748b]">
          {ap.channel_type}
        </Badge>
      )}
      {activeTab === 'SET UP' && ap.due_date && (
        <DueBadge dueDate={ap.due_date} />
      )}
      {activeTab === 'HEALTH CHECK' && ap.frequency && (
        <Badge variant="outline" className="text-xs">
          {ap.frequency}
        </Badge>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(ap.id);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-[#94a3b8] hover:text-red-500"
        aria-label="Delete action point"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  </li>
);

const getTrafficLight = (total: number, completed: number) => {
  const outstanding = total - completed;
  if (outstanding === 0) return { color: 'bg-green-500', label: 'green' };
  if (outstanding <= 3) return { color: 'bg-amber-400', label: 'amber' };
  return { color: 'bg-red-500', label: 'red' };
};

export default function TodoSection({ mediaPlanBuilderChannels, clientId, embedded = false, onStatsUpdate, onActionPointsChange, actionPointsRefetchTrigger = 0, totalActualSpend = 0, plannedBudget = 0 }: TodoSectionProps) {
  const [allActionPoints, setAllActionPoints] = useState<ActionPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('SET UP');
  const [showCompleted, setShowCompleted] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      // Get unique channel types from the media plan builder channels
      // Normalize to proper case for matching with action_points channel_type
      const channelTypes = new Set<string>();
      mediaPlanBuilderChannels.forEach(channel => {
        if (channel.channelName) {
          // Convert from "META ADS" to "Meta Ads" format
          const normalizedName = channel.channelName
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          channelTypes.add(normalizedName);
        }
      });

      // If no channels in media plan builder, don't fetch anything
      if (channelTypes.size === 0) {
        setAllActionPoints([]);
        setLoading(false);
        return;
      }

      // Fetch action points for each channel type, with per-client completions if clientId provided
      const allPoints: ActionPoint[] = [];
      for (const channelType of channelTypes) {
        const params = new URLSearchParams({ channel_type: channelType });
        if (clientId) params.set('client_id', clientId);
        const response = await fetch(`/api/action-points?${params.toString()}`);
        if (response.ok) {
          const { data } = await response.json();
          if (data && Array.isArray(data)) {
            allPoints.push(...data);
          }
        }
      }

      setAllActionPoints(allPoints);
    } catch (error) {
      console.error('Error fetching action points:', error);
    } finally {
      setLoading(false);
    }
  };

  // Track the channel types we last fetched for, so we only re-fetch when channels genuinely change
  const lastChannelKeyRef = useRef<string>('');
  // Suppress refetch when this component itself triggered the actionPointsRefetchTrigger
  const suppressNextRefetchRef = useRef(false);

  useEffect(() => {
    const key = mediaPlanBuilderChannels.map(c => c.channelName).sort().join(',');
    if (key === lastChannelKeyRef.current) return; // same channels, skip
    lastChannelKeyRef.current = key;
    fetchAll();
  }, [mediaPlanBuilderChannels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when actionPointsRefetchTrigger changes (triggered by other components e.g. MediaChannelCard add/delete)
  useEffect(() => {
    if (actionPointsRefetchTrigger === 0) return;
    if (suppressNextRefetchRef.current) {
      suppressNextRefetchRef.current = false;
      return;
    }
    fetchAll();
  }, [actionPointsRefetchTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async (id: string, completed: boolean) => {
    const newCompleted = !completed;

    // Optimistically update local state
    setAllActionPoints(prev =>
      prev.map(ap => ap.id === id ? { ...ap, completed: newCompleted } : ap)
    );

    try {
      const payload: any = { id, completed: newCompleted };
      if (clientId) payload.client_id = clientId;
      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        console.error('Failed to update action point:', {
          status: response.status,
          statusText: response.statusText,
          error: errBody,
          payload: { id, completed: newCompleted, client_id: clientId }
        });
        // Revert on error
        setAllActionPoints(prev =>
          prev.map(ap => ap.id === id ? { ...ap, completed } : ap)
        );
        // Show user-friendly error
        alert(`Failed to update action point: ${errBody.error || errBody.details || 'Unknown error'}`);
      } else {
        // Notify MediaChannelCards to sync — suppress our own refetch since optimistic update already applied
        suppressNextRefetchRef.current = true;
        onActionPointsChange?.();
      }
    } catch (error) {
      console.error('Error updating action point:', error);
      // Revert on error
      setAllActionPoints(prev =>
        prev.map(ap => ap.id === id ? { ...ap, completed } : ap)
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this action point? This will remove it from all channels.')) return;

    // Optimistically remove from local state
    const previous = allActionPoints;
    setAllActionPoints(prev => prev.filter(ap => ap.id !== id));

    try {
      const response = await fetch(`/api/action-points?id=${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        setAllActionPoints(previous);
      } else {
        onActionPointsChange?.();
      }
    } catch (error) {
      console.error('Error deleting action point:', error);
      setAllActionPoints(previous);
    }
  };

  const setupPoints = allActionPoints
    .filter(ap => ap.category === 'SET UP')
    .sort(sortByDueDate);

  const healthCheckPoints = allActionPoints
    .filter(ap => ap.category === 'HEALTH CHECK')
    .sort(sortByDueDate);

  const allActivePoints = activeTab === 'SET UP' ? setupPoints : healthCheckPoints;
  const activePoints = allActivePoints.filter(ap => !ap.completed);
  const completedPoints = allActivePoints.filter(ap => ap.completed);

  const setupCompleted = setupPoints.filter(ap => ap.completed).length;
  const healthCompleted = healthCheckPoints.filter(ap => ap.completed).length;

  // Traffic light — calculated across all action points
  const totalAll = allActionPoints.length;
  const completedAll = allActionPoints.filter(ap => ap.completed).length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const hasOverdue = allActionPoints.some(ap => {
    if (ap.completed || !ap.due_date) return false;
    const due = new Date(ap.due_date);
    due.setHours(0, 0, 0, 0);
    return due < today;
  });

  const trafficLight = getTrafficLight(totalAll, completedAll);

  // Update parent component with stats
  useEffect(() => {
    if (onStatsUpdate) {
      onStatsUpdate({
        totalAll,
        completedAll,
        trafficLightColor: trafficLight.color,
        loading
      });
    }
  }, [totalAll, completedAll, trafficLight.color, loading, onStatsUpdate]);

  // Urgent label — incomplete tasks due within 3 days (including today & overdue)
  const urgentPoints = allActionPoints.filter(ap => {
    if (ap.completed || !ap.due_date) return false;
    const due = new Date(ap.due_date);
    due.setHours(0, 0, 0, 0);
    const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil <= 3;
  });

  // Find the soonest due date among urgent points for the label
  const soonestDaysUntil = urgentPoints.length > 0
    ? Math.min(...urgentPoints.map(ap => {
        const due = new Date(ap.due_date!);
        due.setHours(0, 0, 0, 0);
        return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }))
    : null;

  const urgentLabel = urgentPoints.length > 0
    ? soonestDaysUntil !== null && soonestDaysUntil < 0
      ? `${urgentPoints.length} TASK${urgentPoints.length === 1 ? '' : 'S'} OVERDUE`
      : soonestDaysUntil === 0
      ? `${urgentPoints.length} TASK${urgentPoints.length === 1 ? '' : 'S'} DUE TODAY`
      : `${urgentPoints.length} TASK${urgentPoints.length === 1 ? '' : 'S'} DUE IN ${soonestDaysUntil} DAY${soonestDaysUntil === 1 ? '' : 'S'}`
    : null;

  const content = (
    <>
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ListTodo className="w-6 h-6 text-[#0f172a]" />
            <h2 className="text-2xl font-bold text-[#0f172a]">Action Points</h2>
            {/* Traffic light + tally */}
            {!loading && totalAll > 0 && (
              <div className="flex items-center gap-2 ml-1">
                <span className={`inline-block w-3 h-3 rounded-full ${trafficLight.color}`} />
                <span className="text-sm text-[#64748b]">
                  {completedAll}/{totalAll} completed
                </span>
              </div>
            )}
          </div>
          {/* Urgent label */}
          {!loading && urgentLabel && (
            <span className="text-xs font-bold uppercase tracking-wide bg-red-100 text-red-700 border border-red-300 rounded px-2.5 py-1">
              {urgentLabel}
            </span>
          )}
        </div>
      )}

      {/* Spend Pacing Section */}
      <div className="mb-6 p-4 bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[#64748b] mb-1">Spend Pacing</p>
            <p className="text-2xl font-bold text-[#0f172a]">
              ${totalActualSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {plannedBudget > 0 && (
                <span className="text-[#94a3b8]">
                  {' / '}
                  ${plannedBudget.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              )}
            </p>
            <p className="text-xs text-[#64748b] mt-1">
              {plannedBudget > 0 ? 'Actual vs Planned Monthly Spend' : 'Total Actual Spend (sum of all media channels)'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[#e2e8f0]">
        {(['SET UP', 'HEALTH CHECK'] as TabType[]).map((tab) => {
          const count = tab === 'SET UP' ? setupPoints.length : healthCheckPoints.length;
          const completed = tab === 'SET UP' ? setupCompleted : healthCompleted;
          const outstanding = count - completed;
          const tallyColor = outstanding === 0 ? 'text-green-600' : outstanding <= 3 ? 'text-amber-500' : 'text-red-600';
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setShowCompleted(false); }}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-[#0f172a] text-[#0f172a]'
                  : 'border-transparent text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              {tab}
              {count > 0 && (
                <span className={`ml-2 text-xs font-normal ${tallyColor}`}>
                  {completed}/{count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-[#64748b] text-center py-8">Loading action points...</p>
      ) : allActivePoints.length === 0 ? (
        <p className="text-sm text-[#64748b] text-center py-8">
          No {activeTab.toLowerCase()} action points yet.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Outstanding */}
          {activePoints.length === 0 ? (
            <p className="text-sm text-[#64748b] text-center py-4">All tasks completed.</p>
          ) : (
            <ul className="space-y-2">
              {activePoints.map((ap) => (
                <ActionRow
                  key={ap.id}
                  ap={ap}
                  activeTab={activeTab}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}

          {/* Completed collapsible */}
          {completedPoints.length > 0 && (
            <div className="border-t border-[#e2e8f0] pt-3">
              <button
                onClick={() => setShowCompleted(prev => !prev)}
                className="flex items-center gap-2 text-sm font-medium text-[#64748b] hover:text-[#0f172a] transition-colors w-full text-left"
              >
                {showCompleted ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                Completed Tasks
                <span className="text-xs font-normal ml-1">({completedPoints.length})</span>
              </button>
              {showCompleted && (
                <ul className="space-y-2 mt-2">
                  {completedPoints.map((ap) => (
                    <ActionRow
                      key={ap.id}
                      ap={ap}
                      activeTab={activeTab}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );

  // If embedded, just return the content without Card wrapper
  if (embedded) {
    return content;
  }

  // Otherwise, wrap in section and Card
  return (
    <section className="mt-8" aria-label="Action points">
      <Card className="bg-white shadow-md">
        <CardContent className="p-6">
          {content}
        </CardContent>
      </Card>
    </section>
  );
}
