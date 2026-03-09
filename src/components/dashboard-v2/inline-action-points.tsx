'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react';

export interface InlineActionPoint {
  id: string;
  text: string;
  completed: boolean;
  category: 'SET UP' | 'ONGOING' | 'HEALTH CHECK';
}

interface InlineActionPointsProps {
  channelType: string;
  clientId: string;
  maxVisible?: number;
  onToggleComplete?: (id: string, completed: boolean) => void;
}

export default function InlineActionPoints({
  channelType,
  clientId,
  maxVisible = 3,
  onToggleComplete,
}: InlineActionPointsProps) {
  const [actionPoints, setActionPoints] = useState<InlineActionPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllSetup, setShowAllSetup] = useState(false);
  const [showAllOngoing, setShowAllOngoing] = useState(false);
  const [completedSetupOpen, setCompletedSetupOpen] = useState(false);
  const [completedOngoingOpen, setCompletedOngoingOpen] = useState(false);

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
            setActionPoints(data.map((ap: any) => ({
              id: ap.id,
              text: ap.text,
              completed: ap.completed || false,
              // Map 'HEALTH CHECK' to 'ONGOING' for consistency
              category: ap.category === 'HEALTH CHECK' ? 'ONGOING' : (ap.category === 'SET UP' ? 'SET UP' : 'ONGOING'),
            })));
          }
        }
      } catch (error) {
        console.error('Error fetching action points:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchActionPoints();
  }, [channelType, clientId]);

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

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-400">Loading action points...</p>
      </div>
    );
  }

  // Separate action points by category
  const setupItems = actionPoints.filter(ap => ap.category === 'SET UP');
  const ongoingItems = actionPoints.filter(ap => ap.category === 'ONGOING' || ap.category === 'HEALTH CHECK');

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

  if (actionPoints.length === 0) {
    return null;
  }

  const renderActionList = (items: InlineActionPoint[]) => {
    if (items.length === 0) return null;

    return (
      <div className="space-y-1.5">
        {items.map((ap) => (
          <div
            key={ap.id}
            className="flex items-start gap-2 group hover:bg-gray-50 rounded px-1.5 py-1 transition-colors"
          >
            <button
              type="button"
              onClick={() => handleToggle(ap.id, !ap.completed)}
              className="flex-shrink-0 mt-0.5 cursor-pointer hover:opacity-80 transition-opacity"
              aria-label={ap.completed ? 'Mark as incomplete' : 'Mark as complete'}
            >
              {ap.completed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-gray-300" />
              )}
            </button>
            <span
              className={`flex-1 text-xs leading-snug ${
                ap.completed
                  ? 'line-through text-gray-400'
                  : 'text-gray-700'
              }`}
            >
              {ap.text}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <h4 className="text-xs font-medium text-gray-700 mb-3">Action Points</h4>
      
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

      {/* ONGOING section */}
      {(ongoingIncomplete.length > 0 || ongoingCompleted.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-800">ONGOING</span>
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
          
          {/* Completed ONGOING items */}
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
