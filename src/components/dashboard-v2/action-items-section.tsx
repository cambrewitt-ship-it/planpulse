'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertCircle, Clock, CheckCircle2, Calendar, Tag } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionItem {
  id: string;
  text: string;
  completed: boolean;
  priority: 'urgent' | 'this-week' | 'completed';
  dueDate?: string;
  channelType?: string;
  category: 'SET UP' | 'HEALTH CHECK';
}

export interface ActionItemsSectionProps {
  actionItems: ActionItem[];
  onToggleComplete: (id: string, completed: boolean) => void;
  onActionClick?: (id: string, actionType: string) => void;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRIORITY_CONFIG = {
  urgent: {
    label: 'Urgent',
    icon: AlertCircle,
    dot: 'bg-red-500',
    headerText: 'text-red-700',
    headerBg: 'bg-red-50',
    headerBorder: 'border-red-100',
    itemBorder: 'border-red-100',
    itemHover: 'hover:bg-red-50/50',
    checkboxAccent: 'accent-red-500',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
    actionBtnHover: 'hover:bg-red-100 hover:text-red-700',
  },
  'this-week': {
    label: 'This Week',
    icon: Clock,
    dot: 'bg-amber-500',
    headerText: 'text-amber-700',
    headerBg: 'bg-amber-50',
    headerBorder: 'border-amber-100',
    itemBorder: 'border-amber-100',
    itemHover: 'hover:bg-amber-50/50',
    checkboxAccent: 'accent-amber-500',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-700',
    actionBtnHover: 'hover:bg-amber-100 hover:text-amber-700',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    dot: 'bg-emerald-500',
    headerText: 'text-emerald-700',
    headerBg: 'bg-emerald-50',
    headerBorder: 'border-emerald-100',
    itemBorder: 'border-emerald-100',
    itemHover: 'hover:bg-emerald-50/30',
    checkboxAccent: 'accent-emerald-500',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-700',
    actionBtnHover: 'hover:bg-emerald-100 hover:text-emerald-700',
  },
} as const;

// Derive action button labels from item text heuristics
function inferActionButtons(item: ActionItem): string[] {
  const text = item.text.toLowerCase();
  if (text.includes('investigate') || text.includes('review') || text.includes('check')) return ['Investigate'];
  if (text.includes('upload') || text.includes('attach') || text.includes('add')) return ['Upload'];
  if (text.includes('connect') || text.includes('link') || text.includes('integrate')) return ['Connect'];
  if (text.includes('schedule') || text.includes('book') || text.includes('meeting')) return ['Schedule'];
  if (text.includes('report') || text.includes('export')) return ['View Report'];
  return [];
}

// ---------------------------------------------------------------------------
// Single action item row
// ---------------------------------------------------------------------------

function ActionRow({
  item,
  cfg,
  onToggleComplete,
  onActionClick,
}: {
  item: ActionItem;
  cfg: typeof PRIORITY_CONFIG[keyof typeof PRIORITY_CONFIG];
  onToggleComplete: ActionItemsSectionProps['onToggleComplete'];
  onActionClick?: ActionItemsSectionProps['onActionClick'];
}) {
  const actions = inferActionButtons(item);

  return (
    <li
      className={`group flex items-start gap-3 px-4 py-3 border-b last:border-b-0 ${cfg.itemBorder} ${cfg.itemHover} transition-colors duration-150`}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={item.completed}
        onChange={e => onToggleComplete(item.id, e.target.checked)}
        className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 cursor-pointer ${cfg.checkboxAccent}`}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${item.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {item.text}
        </p>

        {/* Metadata row */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {/* Category badge */}
          <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${cfg.badgeBg} ${cfg.badgeText}`}>
            <Tag className="w-2.5 h-2.5" />
            {item.category}
          </span>

          {/* Channel type */}
          {item.channelType && (
            <span className="text-xs text-gray-400">{item.channelType}</span>
          )}

          {/* Due date */}
          {item.dueDate && !item.completed && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Calendar className="w-2.5 h-2.5" />
              {item.dueDate}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons — visible on hover */}
      {!item.completed && actions.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {actions.map(action => (
            <button
              key={action}
              onClick={() => onActionClick?.(item.id, action)}
              className={`text-xs px-2 py-1 rounded-md text-gray-500 bg-gray-100 transition-colors ${cfg.actionBtnHover}`}
            >
              {action}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Priority section (collapsible)
// ---------------------------------------------------------------------------

const INITIAL_VISIBLE = 3;

function PrioritySection({
  priority,
  items,
  onToggleComplete,
  onActionClick,
  defaultOpen = true,
}: {
  priority: keyof typeof PRIORITY_CONFIG;
  items: ActionItem[];
  onToggleComplete: ActionItemsSectionProps['onToggleComplete'];
  onActionClick?: ActionItemsSectionProps['onActionClick'];
  defaultOpen?: boolean;
}) {
  const [sectionOpen, setSectionOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);

  const cfg = PRIORITY_CONFIG[priority];
  const Icon = cfg.icon;

  if (items.length === 0) return null;

  const visibleItems = showAll ? items : items.slice(0, INITIAL_VISIBLE);
  const hiddenCount = items.length - INITIAL_VISIBLE;

  return (
    <div className={`rounded-xl border overflow-hidden ${cfg.headerBorder}`}>
      {/* Section header */}
      <button
        onClick={() => setSectionOpen(prev => !prev)}
        className={`w-full flex items-center gap-2 px-4 py-3 ${cfg.headerBg} border-b ${cfg.headerBorder} transition-colors`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <Icon className={`w-4 h-4 ${cfg.headerText}`} />
        <span className={`text-sm font-semibold flex-1 text-left ${cfg.headerText}`}>
          {cfg.label}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
          {items.length}
        </span>
        {sectionOpen
          ? <ChevronUp className={`w-4 h-4 ${cfg.headerText}`} />
          : <ChevronDown className={`w-4 h-4 ${cfg.headerText}`} />
        }
      </button>

      {/* Items list */}
      {sectionOpen && (
        <div className="bg-white">
          <ul>
            {visibleItems.map(item => (
              <ActionRow
                key={item.id}
                item={item}
                cfg={cfg}
                onToggleComplete={onToggleComplete}
                onActionClick={onActionClick}
              />
            ))}
          </ul>

          {/* Show more / show less */}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(prev => !prev)}
              className="w-full text-xs text-gray-500 hover:text-gray-700 py-2.5 px-4 border-t border-gray-100 flex items-center justify-center gap-1 hover:bg-gray-50 transition-colors"
            >
              {showAll ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Show {hiddenCount} more
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ActionItemsSection({
  actionItems,
  onToggleComplete,
  onActionClick,
}: ActionItemsSectionProps) {
  const urgent    = actionItems.filter(i => i.priority === 'urgent');
  const thisWeek  = actionItems.filter(i => i.priority === 'this-week');
  const completed = actionItems.filter(i => i.priority === 'completed');

  const totalActive = urgent.length + thisWeek.length;

  return (
    <div className="space-y-3">
      {/* Section heading */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Action Items</h2>
        {totalActive > 0 && (
          <span className="text-xs text-gray-500">
            {totalActive} outstanding
          </span>
        )}
      </div>

      {totalActive === 0 && completed.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No action items yet.</p>
        </div>
      )}

      <PrioritySection
        priority="urgent"
        items={urgent}
        onToggleComplete={onToggleComplete}
        onActionClick={onActionClick}
        defaultOpen={true}
      />

      <PrioritySection
        priority="this-week"
        items={thisWeek}
        onToggleComplete={onToggleComplete}
        onActionClick={onActionClick}
        defaultOpen={true}
      />

      <PrioritySection
        priority="completed"
        items={completed}
        onToggleComplete={onToggleComplete}
        onActionClick={onActionClick}
        defaultOpen={false}
      />
    </div>
  );
}
