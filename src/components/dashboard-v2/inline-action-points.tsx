'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Edit2, X, Check, Plus } from 'lucide-react';
import { format, addDays, differenceInDays } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Returns the next health check occurrence to display:
// - If overdue (past occurrence not completed): returns the past occurrence date
// - Otherwise: returns the next future occurrence
function getHealthCheckDisplayDate(
  channelStart: Date,
  frequency: string,
  isCompletedForCurrentPeriod: boolean
): Date | null {
  const intervalDays =
    frequency === 'weekly' ? 7 :
    frequency === 'fortnightly' ? 14 :
    frequency === 'monthly' ? 30 : 0;
  if (!intervalDays) return null;

  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
  const startMs = channelStart.getTime();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const capMs = todayMs + 2 * 365 * 24 * 60 * 60 * 1000;

  let lastPastOcc: Date | null = null;
  let nextFutureOcc: Date | null = null;

  for (let n = 1; ; n++) {
    const occMs = startMs + n * intervalMs;
    if (occMs > capMs) break;
    const occ = new Date(occMs); occ.setHours(0, 0, 0, 0);
    if (occ.getTime() <= todayMs) {
      lastPastOcc = occ;
    } else if (!nextFutureOcc) {
      nextFutureOcc = occ;
      break;
    }
  }

  if (!isCompletedForCurrentPeriod && lastPastOcc) return lastPastOcc; // overdue
  return nextFutureOcc;
}

// Checks whether a health check completion is still valid for the current period.
// A period resets when a new occurrence date arrives (completedAt < currentPeriodStart).
function isHealthCheckCompletedForCurrentPeriod(
  channelStart: Date,
  frequency: string,
  completedAt: string | null
): boolean {
  if (!completedAt) return false;

  const intervalDays =
    frequency === 'weekly' ? 7 :
    frequency === 'fortnightly' ? 14 :
    frequency === 'monthly' ? 30 : 0;
  if (!intervalDays) return false;

  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
  const startMs = channelStart.getTime();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const capMs = todayMs + 2 * 365 * 24 * 60 * 60 * 1000;

  let lastPastOccStr: string | null = null;
  for (let n = 1; ; n++) {
    const occMs = startMs + n * intervalMs;
    if (occMs > capMs) break;
    if (occMs <= todayMs) {
      const d = new Date(occMs);
      lastPastOccStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else {
      break;
    }
  }

  if (!lastPastOccStr) return false; // No occurrence yet, nothing to compare
  return completedAt.slice(0, 10) >= lastPastOccStr;
}

export interface InlineActionPoint {
  id: string;
  text: string;
  completed: boolean;
  category: 'SET UP' | 'ONGOING' | 'HEALTH CHECK';
  days_before_live_due?: number | null;
  frequency?: 'daily' | 'weekly' | 'fortnightly' | 'monthly' | null;
  completed_at?: string | null;
}

interface InlineActionPointsProps {
  channelType: string;
  clientId: string;
  channelStartDate?: Date | null;
  maxVisible?: number;
  onToggleComplete?: (id: string, completed: boolean) => void;
  showBorder?: boolean;
  showTitle?: boolean;
  refetchTrigger?: number;
}

export default function InlineActionPoints({
  channelType,
  clientId,
  channelStartDate,
  maxVisible = 3,
  onToggleComplete,
  showBorder = true,
  showTitle = true,
  refetchTrigger,
}: InlineActionPointsProps) {
  const [actionPoints, setActionPoints] = useState<InlineActionPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllSetup, setShowAllSetup] = useState(false);
  const [showAllOngoing, setShowAllOngoing] = useState(false);
  const [completedSetupOpen, setCompletedSetupOpen] = useState(false);
  const [completedOngoingOpen, setCompletedOngoingOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingDaysBefore, setEditingDaysBefore] = useState<number | null>(null);
  const [editingFrequency, setEditingFrequency] = useState<'daily' | 'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newActionPointText, setNewActionPointText] = useState('');
  const [newActionPointCategory, setNewActionPointCategory] = useState<'SET UP' | 'HEALTH CHECK'>('SET UP');
  const [newActionPointDaysBefore, setNewActionPointDaysBefore] = useState<number | ''>('');
  const [newActionPointFrequency, setNewActionPointFrequency] = useState<'daily' | 'weekly' | 'fortnightly' | 'monthly'>('weekly');

  useEffect(() => {
    const fetchActionPoints = async () => {
      if (!channelType || !clientId) return;
      
      setLoading(true);
      try {
        const params = new URLSearchParams({
          channel_type: channelType,
          client_id: clientId,
        });
        const response = await fetch(`/api/action-points?${params.toString()}`);
        if (response.ok) {
          const { data } = await response.json();
          if (data && Array.isArray(data)) {
            setActionPoints(data.map((ap: any) => {
              const completedAt: string | null = ap.completed_at || null;
              let effectiveCompleted = ap.completed || false;

              // For HEALTH CHECK: reset completed if a new period has started
              if (
                (ap.category === 'HEALTH CHECK') &&
                ap.frequency &&
                channelStartDate &&
                effectiveCompleted
              ) {
                effectiveCompleted = isHealthCheckCompletedForCurrentPeriod(
                  channelStartDate,
                  ap.frequency,
                  completedAt
                );
              }

              return {
                id: ap.id,
                text: ap.text,
                completed: effectiveCompleted,
                category: ap.category === 'HEALTH CHECK' ? 'HEALTH CHECK' : (ap.category === 'SET UP' ? 'SET UP' : 'HEALTH CHECK'),
                days_before_live_due: ap.days_before_live_due ?? null,
                frequency: ap.frequency ?? null,
                completed_at: completedAt,
              };
            }));
          }
        }
      } catch (error) {
        console.error('Error fetching action points:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchActionPoints();
  }, [channelType, clientId, refetchTrigger]);

  const handleToggle = async (id: string, completed: boolean) => {
    try {
      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completed, client_id: clientId }),
      });
      
      if (response.ok) {
        setActionPoints(prev =>
          prev.map(ap => (ap.id === id ? { ...ap, completed } : ap))
        );
        onToggleComplete?.(id, completed);
      }
    } catch (error) {
      console.error('Error toggling action point:', error);
    }
  };

  const handleStartEdit = (ap: InlineActionPoint) => {
    setEditingId(ap.id);
    setEditingText(ap.text);
    setEditingDaysBefore(ap.days_before_live_due ?? null);
    setEditingFrequency(ap.frequency || 'weekly');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingText('');
    setEditingDaysBefore(null);
    setEditingFrequency('weekly');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this action point template? This will remove it from all clients.')) return;

    try {
      setIsSaving(true);
      const response = await fetch(`/api/action-points?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete action point');
      }

      setActionPoints((prev) => prev.filter((ap) => ap.id !== id));
    } catch (error) {
      console.error('Error deleting action point:', error);
      alert('Failed to delete action point. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingText.trim()) return;

    const actionPoint = actionPoints.find(ap => ap.id === editingId);
    if (!actionPoint) return;

    try {
      setIsSaving(true);
      const updateBody: any = {
        id: editingId,
        text: editingText.trim(),
      };

      // Add days_before_live_due for SET UP items
      if (actionPoint.category === 'SET UP') {
        updateBody.days_before_live_due = editingDaysBefore;
      }

      // Add frequency for HEALTH CHECK items
      if (actionPoint.category === 'HEALTH CHECK' || actionPoint.category === 'ONGOING') {
        updateBody.frequency = editingFrequency;
      }

      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateBody),
      });

      if (!response.ok) {
        throw new Error('Failed to update action point');
      }

      // Reload action points
      const params = new URLSearchParams({
        channel_type: channelType,
        client_id: clientId,
      });
      const refreshResponse = await fetch(`/api/action-points?${params.toString()}`);
      if (refreshResponse.ok) {
        const { data } = await refreshResponse.json();
        if (data && Array.isArray(data)) {
          setActionPoints(data.map((ap: any) => {
            const completedAt: string | null = ap.completed_at || null;
            let effectiveCompleted = ap.completed || false;
            if ((ap.category === 'HEALTH CHECK') && ap.frequency && channelStartDate && effectiveCompleted) {
              effectiveCompleted = isHealthCheckCompletedForCurrentPeriod(channelStartDate, ap.frequency, completedAt);
            }
            return {
              id: ap.id,
              text: ap.text,
              completed: effectiveCompleted,
              category: ap.category === 'HEALTH CHECK' ? 'HEALTH CHECK' : (ap.category === 'SET UP' ? 'SET UP' : 'HEALTH CHECK'),
              days_before_live_due: ap.days_before_live_due ?? null,
              frequency: ap.frequency ?? null,
              completed_at: completedAt,
            };
          }));
        }
      }

      handleCancelEdit();
    } catch (error) {
      console.error('Error updating action point:', error);
      alert('Failed to update action point. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartAdd = () => {
    setIsAdding(true);
    setNewActionPointText('');
    setNewActionPointCategory('SET UP');
    setNewActionPointDaysBefore('');
    setNewActionPointFrequency('weekly');
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewActionPointText('');
    setNewActionPointCategory('SET UP');
    setNewActionPointDaysBefore('');
    setNewActionPointFrequency('weekly');
  };

  const handleSaveAdd = async () => {
    if (!newActionPointText.trim()) {
      alert('Please enter action point text');
      return;
    }

    if (newActionPointCategory === 'SET UP' && (newActionPointDaysBefore === '' || newActionPointDaysBefore < 0)) {
      alert('Please enter a non-negative number of days before go-live for SET UP action points');
      return;
    }

    if (newActionPointCategory === 'HEALTH CHECK' && !newActionPointFrequency) {
      alert('Please select a frequency for HEALTH CHECK action points');
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch('/api/action-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_type: channelType,
          text: newActionPointText.trim(),
          category: newActionPointCategory,
          frequency: newActionPointCategory === 'HEALTH CHECK' ? newActionPointFrequency : null,
          days_before_live_due:
            newActionPointCategory === 'SET UP' && newActionPointDaysBefore !== ''
              ? Number(newActionPointDaysBefore)
              : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create action point');
      }

      // Reload action points
      const params = new URLSearchParams({
        channel_type: channelType,
        client_id: clientId,
      });
      const refreshResponse = await fetch(`/api/action-points?${params.toString()}`);
      if (refreshResponse.ok) {
        const { data } = await refreshResponse.json();
        if (data && Array.isArray(data)) {
          setActionPoints(data.map((ap: any) => {
            const completedAt: string | null = ap.completed_at || null;
            let effectiveCompleted = ap.completed || false;
            if ((ap.category === 'HEALTH CHECK') && ap.frequency && channelStartDate && effectiveCompleted) {
              effectiveCompleted = isHealthCheckCompletedForCurrentPeriod(channelStartDate, ap.frequency, completedAt);
            }
            return {
              id: ap.id,
              text: ap.text,
              completed: effectiveCompleted,
              category: ap.category === 'HEALTH CHECK' ? 'HEALTH CHECK' : (ap.category === 'SET UP' ? 'SET UP' : 'HEALTH CHECK'),
              days_before_live_due: ap.days_before_live_due ?? null,
              frequency: ap.frequency ?? null,
              completed_at: completedAt,
            };
          }));
        }
      }

      handleCancelAdd();
    } catch (error: any) {
      console.error('Error creating action point:', error);
      alert(error.message || 'Failed to create action point. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-400">Loading action points...</p>
      </div>
    );
  }

  // Separate action points by category
  const setupItems = actionPoints.filter(ap => ap.category === 'SET UP');
  const ongoingItems = actionPoints.filter(ap => ap.category === 'HEALTH CHECK' || ap.category === 'ONGOING');

  // Separate incomplete and completed items
  const setupIncomplete = setupItems.filter(ap => !ap.completed);
  const setupCompleted = setupItems.filter(ap => ap.completed);
  const ongoingIncomplete = ongoingItems.filter(ap => !ap.completed);
  const ongoingCompleted = ongoingItems.filter(ap => ap.completed);

  // Show incomplete items (up to maxVisible, or all if showAll is true)
  const visibleSetupIncomplete = showAllSetup 
    ? setupIncomplete 
    : setupIncomplete.slice(0, maxVisible);
  const visibleOngoingIncomplete = showAllOngoing 
    ? ongoingIncomplete 
    : ongoingIncomplete.slice(0, maxVisible);

  const hasMoreSetup = setupIncomplete.length > maxVisible;
  const hasMoreOngoing = ongoingIncomplete.length > maxVisible;

  const calculateDueDate = (daysBeforeLive: number | null | undefined): Date | null => {
    if (!channelStartDate || !daysBeforeLive || daysBeforeLive < 0) return null;
    return addDays(channelStartDate, -daysBeforeLive);
  };

  const formatDueDate = (dueDate: Date | null): string | null => {
    if (!dueDate) return null;
    const now = new Date();
    const daysUntilDue = differenceInDays(dueDate, now);
    
    if (daysUntilDue < 0) {
      return `Overdue (${Math.abs(daysUntilDue)} days)`;
    } else if (daysUntilDue === 0) {
      return 'Due today';
    } else if (daysUntilDue === 1) {
      return 'Due tomorrow';
    } else if (daysUntilDue <= 7) {
      return `Due in ${daysUntilDue} days`;
    } else {
      return format(dueDate, 'MMM d, yyyy');
    }
  };

  const renderActionList = (items: InlineActionPoint[]) => {
    if (items.length === 0) return null;

    return (
      <div className="space-y-1.5">
        {items.map((ap) => {
          const dueDate = ap.category === 'SET UP' && ap.days_before_live_due 
            ? calculateDueDate(ap.days_before_live_due) 
            : null;
          const dueDateText = formatDueDate(dueDate);
          const isOverdue = dueDate && differenceInDays(dueDate, new Date()) < 0;
          const isEditing = editingId === ap.id;

          return (
            <div
              key={ap.id}
              className="flex items-start gap-2 group rounded-md px-2 py-1.5 transition-colors border border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white"
            >
              <button
                type="button"
                onClick={() => handleToggle(ap.id, !ap.completed)}
                className="flex-shrink-0 mt-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                aria-label={ap.completed ? 'Mark as incomplete' : 'Mark as complete'}
                disabled={isEditing}
              >
                {ap.completed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-gray-300" />
                )}
              </button>
              {isEditing ? (
                <div className="flex-1 min-w-0 space-y-2">
                  <Input
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    className="text-xs h-7"
                    placeholder="Action point text"
                  />
                  {ap.category === 'SET UP' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 whitespace-nowrap">Days before:</label>
                      <Input
                        type="number"
                        value={editingDaysBefore ?? ''}
                        onChange={(e) => setEditingDaysBefore(e.target.value ? parseInt(e.target.value, 10) : null)}
                        className="text-xs h-7 w-20"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                  )}
                  {(ap.category === 'HEALTH CHECK' || ap.category === 'ONGOING') && (
                    <Select
                      value={editingFrequency}
                      onValueChange={(value: 'daily' | 'weekly' | 'fortnightly' | 'monthly') => setEditingFrequency(value)}
                    >
                      <SelectTrigger className="text-xs h-7">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="fortnightly">Fortnightly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={isSaving || !editingText.trim()}
                      className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                      aria-label="Save"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                      aria-label="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-xs leading-snug ${
                        ap.completed
                          ? 'line-through text-gray-400'
                          : 'text-gray-700'
                      }`}
                    >
                      {ap.text}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(ap)}
                        className="p-0.5 text-gray-400 hover:text-gray-600"
                        aria-label="Edit action point"
                        disabled={isSaving}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(ap.id)}
                        className="p-0.5 text-red-500 hover:text-red-700"
                        aria-label="Delete action point"
                        disabled={isSaving}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {ap.category === 'SET UP' && (
                      <>
                        {dueDateText && (
                          <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            {dueDateText}
                          </span>
                        )}
                        {ap.days_before_live_due !== null && (
                          <span className="text-xs text-gray-400">
                            ({ap.days_before_live_due} days before)
                          </span>
                        )}
                      </>
                    )}
                    {(ap.category === 'HEALTH CHECK' || ap.category === 'ONGOING') && ap.frequency && (
                      <>
                        <span className="text-xs text-gray-400">{ap.frequency}</span>
                        {channelStartDate && (() => {
                          const nextOcc = getHealthCheckDisplayDate(channelStartDate, ap.frequency, ap.completed);
                          if (!nextOcc) return null;
                          const dueDateText = formatDueDate(nextOcc);
                          const isOverdue = differenceInDays(nextOcc, new Date()) < 0;
                          return (
                            <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {dueDateText}
                            </span>
                          );
                        })()}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderAddForm = () => {
    if (!isAdding) return null;

    return (
      <div className="space-y-2 p-2 bg-gray-50 rounded border border-gray-200 mb-2">
        <Input
          value={newActionPointText}
          onChange={(e) => setNewActionPointText(e.target.value)}
          className="text-xs h-7"
          placeholder="Action point text"
          autoFocus
        />
        <div className="flex items-center gap-2">
          <Select
            value={newActionPointCategory}
            onValueChange={(value: 'SET UP' | 'HEALTH CHECK') => {
              setNewActionPointCategory(value);
              if (value === 'SET UP') {
                setNewActionPointFrequency('weekly');
              } else {
                setNewActionPointDaysBefore('');
              }
            }}
          >
            <SelectTrigger className="text-xs h-7 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SET UP">SET UP</SelectItem>
              <SelectItem value="HEALTH CHECK">HEALTH CHECK</SelectItem>
            </SelectContent>
          </Select>
          {newActionPointCategory === 'SET UP' && (
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-600 whitespace-nowrap">Days before:</label>
              <Input
                type="number"
                value={newActionPointDaysBefore}
                onChange={(e) => setNewActionPointDaysBefore(e.target.value === '' ? '' : Number(e.target.value))}
                className="text-xs h-7 w-20"
                placeholder="0"
                min="0"
              />
            </div>
          )}
          {(newActionPointCategory === 'HEALTH CHECK') && (
            <Select
              value={newActionPointFrequency}
              onValueChange={(value: 'daily' | 'weekly' | 'fortnightly' | 'monthly') => setNewActionPointFrequency(value)}
            >
              <SelectTrigger className="text-xs h-7 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="fortnightly">Fortnightly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSaveAdd}
            disabled={isSaving || !newActionPointText.trim()}
            className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
            aria-label="Save"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCancelAdd}
            disabled={isSaving}
            className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
            aria-label="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={showBorder ? 'mt-3 pt-3 border-t border-gray-100' : ''}>
      <div className="flex items-center justify-between mb-3">
        {showTitle && <h4 className="text-xs font-medium text-gray-700" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>Action Points</h4>}
        {!isAdding && (
          <button
            type="button"
            onClick={handleStartAdd}
            disabled={isSaving}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
            aria-label="Add action point"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        )}
      </div>

      {renderAddForm()}
      
      {actionPoints.length === 0 && !isAdding && (
        <p className="text-xs text-gray-500 mb-2">No action points yet. Click "Add" to create one.</p>
      )}
      
      {/* SET UP section */}
      {(setupIncomplete.length > 0 || setupCompleted.length > 0) && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-800">SET UP</span>
            {hasMoreSetup && (
              <button
                onClick={() => setShowAllSetup(!showAllSetup)}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                {showAllSetup ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    View all ({setupIncomplete.length})
                  </>
                )}
              </button>
            )}
          </div>
          {renderActionList(visibleSetupIncomplete)}
          
          {/* Completed SET UP items */}
          {setupCompleted.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setCompletedSetupOpen(!completedSetupOpen)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors py-1 w-full text-left"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${completedSetupOpen ? '' : '-rotate-90'}`} />
                Completed ({setupCompleted.length})
              </button>
              {completedSetupOpen && (
                <div className="mt-1">
                  {renderActionList(setupCompleted)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* HEALTH CHECK section */}
      {(ongoingIncomplete.length > 0 || ongoingCompleted.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-800">HEALTH CHECK</span>
            {hasMoreOngoing && (
              <button
                onClick={() => setShowAllOngoing(!showAllOngoing)}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                {showAllOngoing ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    View all ({ongoingIncomplete.length})
                  </>
                )}
              </button>
            )}
          </div>
          {renderActionList(visibleOngoingIncomplete)}
          
          {/* Completed HEALTH CHECK items */}
          {ongoingCompleted.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setCompletedOngoingOpen(!completedOngoingOpen)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors py-1 w-full text-left"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${completedOngoingOpen ? '' : '-rotate-90'}`} />
                Completed ({ongoingCompleted.length})
              </button>
              {completedOngoingOpen && (
                <div className="mt-1">
                  {renderActionList(ongoingCompleted)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
