'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, GripVertical, Trash2, Check, ChevronsUpDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { FunnelStage, FunnelConfig } from '@/lib/types/funnel';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

interface MediaChannel {
  id: string;
  name: string;
  platform: string;
}

interface FunnelBuilderModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  onOpenChange?: (open: boolean) => void;
  onSave: (config: FunnelConfig) => Promise<void>;
  initialConfig?: FunnelConfig | null;
  availableChannels: MediaChannel[];
  clientId?: string;
}

interface StageConfig extends Omit<FunnelStage, 'value' | 'conversionRate' | 'costPerAction'> {}

const FUNNEL_TEMPLATES = {
  ecommerce: {
    name: 'E-commerce Funnel',
    stages: [
      { name: 'impressions', displayName: 'Impressions', source: 'meta' as const, metricKey: 'impressions' },
      { name: 'clicks', displayName: 'Clicks', source: 'meta' as const, metricKey: 'clicks' },
      { name: 'page_view', displayName: 'Page Views', source: 'ga4' as const, metricKey: 'screenPageViews' },
      { name: 'add_to_cart', displayName: 'Add to Cart', source: 'ga4' as const, metricKey: 'eventCount', eventName: 'add_to_cart' },
      { name: 'purchase', displayName: 'Purchases', source: 'ga4' as const, metricKey: 'eventCount', eventName: 'purchase' },
    ],
  },
  appInstall: {
    name: 'App Install Funnel',
    stages: [
      { name: 'impressions', displayName: 'Impressions', source: 'meta' as const, metricKey: 'impressions' },
      { name: 'clicks', displayName: 'Clicks', source: 'meta' as const, metricKey: 'clicks' },
      { name: 'first_open', displayName: 'App Installs', source: 'ga4' as const, metricKey: 'eventCount', eventName: 'first_open' },
      { name: 'signup', displayName: 'Sign Ups', source: 'ga4' as const, metricKey: 'eventCount', eventName: 'sign_up' },
      { name: 'purchase', displayName: 'Purchases', source: 'ga4' as const, metricKey: 'eventCount', eventName: 'purchase' },
    ],
  },
  leadGen: {
    name: 'Lead Generation Funnel',
    stages: [
      { name: 'impressions', displayName: 'Impressions', source: 'google' as const, metricKey: 'impressions' },
      { name: 'clicks', displayName: 'Clicks', source: 'google' as const, metricKey: 'clicks' },
      { name: 'sessions', displayName: 'Sessions', source: 'ga4' as const, metricKey: 'sessions' },
      { name: 'form_start', displayName: 'Form Starts', source: 'ga4' as const, metricKey: 'eventCount', eventName: 'form_start' },
      { name: 'lead', displayName: 'Leads', source: 'ga4' as const, metricKey: 'conversions' },
    ],
  },
};

const SOURCE_METRICS = {
  meta: [
    { value: 'impressions', label: 'Impressions' },
    { value: 'clicks', label: 'Clicks' },
    { value: 'link_clicks', label: 'Link Clicks' },
    { value: 'conversions', label: 'Conversions' },
    { value: 'spend', label: 'Spend' },
  ],
  google: [
    { value: 'impressions', label: 'Impressions' },
    { value: 'clicks', label: 'Clicks' },
    { value: 'conversions', label: 'Conversions' },
    { value: 'spend', label: 'Spend' },
  ],
  ga4: [
    { value: 'activeUsers', label: 'Active Users' },
    { value: 'totalUsers', label: 'Total Users' },
    { value: 'sessions', label: 'Sessions' },
    { value: 'conversions', label: 'Conversions' },
    { value: 'screenPageViews', label: 'Page Views' },
    { value: 'eventCount', label: 'Custom Event (specify below)' },
  ],
};

function SortableStageRow({
  stage,
  index,
  onUpdate,
  onDelete,
  ga4Events,
  isLoadingEvents,
}: {
  stage: StageConfig;
  index: number;
  onUpdate: (index: number, updated: Partial<StageConfig>) => void;
  onDelete: (index: number) => void;
  ga4Events: Array<{ name: string; count: number }>;
  isLoadingEvents: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [eventSearch, setEventSearch] = useState(stage.eventName || '');
  const [isEventPopoverOpen, setIsEventPopoverOpen] = useState(false);
  
  const filteredEvents = ga4Events.filter(e => 
    e.name.toLowerCase().includes(eventSearch.toLowerCase())
  );

  const selectedEvent = ga4Events.find(e => e.name === stage.eventName);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'p-4 mb-3',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Drag Handle */}
        <button
          className="mt-6 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>

        {/* Stage Configuration */}
        <div className="flex-1 space-y-4">
          <div className="flex flex-col md:flex-row gap-0 md:gap-x-[6px]">
            {/* Data Source */}
            <div className="flex-1">
              <Label htmlFor={`stage-source-${index}`}>Data Source</Label>
              <Select
                value={stage.source}
                onValueChange={(value: 'meta' | 'google' | 'ga4') => {
                  onUpdate(index, {
                    source: value,
                    metricKey: SOURCE_METRICS[value][0].value,
                    eventName: undefined,
                  });
                }}
              >
                <SelectTrigger id={`stage-source-${index}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta">Meta Ads</SelectItem>
                  <SelectItem value="google">Google Ads</SelectItem>
                  <SelectItem value="ga4">GA4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Metric Selection */}
            <div className="flex-1">
              <Label htmlFor={`stage-metric-${index}`}>Metric</Label>
              <Select
                value={stage.metricKey}
                onValueChange={(value) => {
                  onUpdate(index, {
                    metricKey: value,
                    eventName: value === 'eventCount' ? stage.eventName : undefined,
                  });
                }}
              >
                <SelectTrigger id={`stage-metric-${index}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_METRICS[stage.source].map((metric) => (
                    <SelectItem key={metric.value} value={metric.value}>
                      {metric.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* GA4 Event Name (shown when eventCount is selected) */}
          {stage.source === 'ga4' && stage.metricKey === 'eventCount' && (
            <div>
              <Label htmlFor={`stage-event-${index}`}>Event Name</Label>
              <Popover open={isEventPopoverOpen} onOpenChange={setIsEventPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={isEventPopoverOpen}
                    className="w-full justify-between"
                  >
                    {stage.eventName || "Select event or type custom..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search events or type custom..."
                      value={eventSearch}
                      onValueChange={setEventSearch}
                    />
                    <CommandEmpty>
                      <div className="p-2 text-sm">
                        {isLoadingEvents ? (
                          <p className="text-slate-500">Loading events...</p>
                        ) : eventSearch ? (
                          <div>
                            <p className="text-slate-600 mb-2">No matching events found in top 50.</p>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="w-full"
                              onClick={() => {
                                onUpdate(index, { eventName: eventSearch });
                                setIsEventPopoverOpen(false);
                              }}
                            >
                              Use custom event: "{eventSearch}"
                            </Button>
                          </div>
                        ) : (
                          <p className="text-slate-500">Start typing to search or enter custom event</p>
                        )}
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredEvents.slice(0, 50).map((event) => (
                        <CommandItem
                          key={event.name}
                          value={event.name}
                          onSelect={(currentValue) => {
                            onUpdate(index, { eventName: currentValue });
                            setEventSearch(currentValue);
                            setIsEventPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              stage.eventName === event.name ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex-1">
                            <div className="font-medium">{event.name}</div>
                            <div className="text-xs text-slate-500">
                              {event.count.toLocaleString()} events in last 30 days
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Event Preview */}
              {selectedEvent && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-xs text-green-800">
                    ✓ This event occurred <strong>{selectedEvent.count.toLocaleString()}</strong> times in the last 30 days
                  </p>
                </div>
              )}

              {/* Warning for custom events not in list */}
              {!isLoadingEvents && stage.eventName && !selectedEvent && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-xs text-amber-800">
                    ⚠️ Custom event "{stage.eventName}" not found in top 50 events from last 30 days
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    This event may have zero occurrences or didn't rank in top 50
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Stage Name (Optional - at bottom) */}
          <div>
            <Label htmlFor={`stage-name-${index}`}>
              Stage Name <span className="text-xs text-gray-500">(Optional)</span>
            </Label>
            <Input
              id={`stage-name-${index}`}
              value={stage.displayName}
              onChange={(e) => onUpdate(index, { displayName: e.target.value })}
              placeholder={
                stage.source === 'ga4' && stage.metricKey === 'eventCount' && stage.eventName
                  ? stage.eventName
                  : SOURCE_METRICS[stage.source].find(m => m.value === stage.metricKey)?.label || 'Stage name'
              }
            />
          </div>
        </div>

        {/* Delete Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className="mt-6 text-red-500 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

export function FunnelBuilderModal({
  isOpen,
  open,
  onClose,
  onOpenChange,
  onSave,
  initialConfig,
  availableChannels,
}: FunnelBuilderModalProps) {
  const modalOpen = open ?? isOpen;
  const handleOpenChange = onOpenChange ?? ((open: boolean) => !open && onClose());
  console.log('[FunnelBuilderModal] Rendered with availableChannels:', availableChannels);
  
  const [funnelName, setFunnelName] = useState(initialConfig?.name || '');
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>(
    initialConfig?.channelIds || []
  );
  const [startDate, setStartDate] = useState(
    initialConfig?.dateRange.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    initialConfig?.dateRange.endDate || new Date().toISOString().split('T')[0]
  );
  const [stages, setStages] = useState<StageConfig[]>(
    initialConfig?.stages || []
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [ga4Events, setGa4Events] = useState<Array<{ name: string; count: number }>>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Update state when initialConfig changes (for editing mode)
  useEffect(() => {
    if (initialConfig) {
      setFunnelName(initialConfig.name || '');
      setSelectedChannelIds(initialConfig.channelIds || []);
      setStartDate(initialConfig.dateRange?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      setEndDate(initialConfig.dateRange?.endDate || new Date().toISOString().split('T')[0]);
      setStages(initialConfig.stages || []);
    } else {
      // Reset to defaults when creating new funnel
      setFunnelName('');
      setSelectedChannelIds([]);
      setStartDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      setEndDate(new Date().toISOString().split('T')[0]);
      setStages([]);
    }
    setErrors([]);
  }, [initialConfig, isOpen]);

  // Fetch GA4 events for autocomplete
  useEffect(() => {
    if (isOpen) {
      fetchGA4Events();
    }
  }, [isOpen]);

  const fetchGA4Events = async () => {
    setIsLoadingEvents(true);
    try {
      // Fetch top 50 events from last 30 days
      const response = await fetch('/api/ads/google-analytics/list-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Will use all active properties
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.events) {
          setGa4Events(data.events);
          console.log(`Loaded ${data.events.length} GA4 events for autocomplete`);
        }
      } else {
        console.warn('Failed to fetch GA4 events, autocomplete will be limited');
      }
    } catch (error) {
      console.error('Failed to fetch GA4 events:', error);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setStages((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addStage = () => {
    const newStage: StageConfig = {
      id: `stage-${Date.now()}`,
      name: `stage_${stages.length + 1}`,
      displayName: '',
      source: 'meta',
      metricKey: 'impressions',
    };
    setStages([...stages, newStage]);
  };

  const updateStage = (index: number, updates: Partial<StageConfig>) => {
    const updated = [...stages];
    updated[index] = { ...updated[index], ...updates };
    // Auto-generate name from displayName
    if (updates.displayName) {
      updated[index].name = updates.displayName.toLowerCase().replace(/\s+/g, '_');
    }
    setStages(updated);
  };

  const deleteStage = (index: number) => {
    setStages(stages.filter((_, i) => i !== index));
  };

  const applyTemplate = (templateKey: keyof typeof FUNNEL_TEMPLATES) => {
    const template = FUNNEL_TEMPLATES[templateKey];
    setFunnelName(template.name);
    setStages(
      template.stages.map((stage, i) => ({
        ...stage,
        id: `stage-${Date.now()}-${i}`,
      }))
    );
  };

  const validate = (): boolean => {
    const newErrors: string[] = [];
    const warnings: string[] = [];

    if (!funnelName.trim()) {
      newErrors.push('Funnel name is required');
    }

    if (!selectedChannelIds || selectedChannelIds.length === 0) {
      newErrors.push('Please select at least one channel');
    }

    if (stages.length < 2) {
      newErrors.push('At least 2 stages are required');
    }

    stages.forEach((stage, i) => {
      if (stage.source === 'ga4' && stage.metricKey === 'eventCount' && !stage.eventName) {
        newErrors.push(`Stage ${i + 1}: Event name is required for custom events`);
      }
      
      // Check if GA4 event exists in the fetched events list
      if (stage.source === 'ga4' && stage.metricKey === 'eventCount' && stage.eventName) {
        const eventExists = ga4Events.find(e => e.name === stage.eventName);
        if (!eventExists && !isLoadingEvents) {
          warnings.push(
            `Stage ${i + 1}: Event "${stage.eventName}" not found in top 50 events (may have low/zero count)`
          );
        } else if (eventExists && eventExists.count === 0) {
          warnings.push(
            `Stage ${i + 1}: Event "${stage.eventName}" has 0 occurrences in last 30 days`
          );
        }
      }
    });

    // Combine errors and warnings
    setErrors([...newErrors, ...warnings]);
    
    // Only fail validation if there are actual errors (not warnings)
    return newErrors.length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      // Populate displayName with metric/event name if empty
      const processedStages = stages.map(s => {
        let displayName = s.displayName.trim();

        // If displayName is empty, use event name or metric label
        if (!displayName) {
          if (s.source === 'ga4' && s.metricKey === 'eventCount' && s.eventName) {
            displayName = s.eventName;
          } else {
            const metricLabel = SOURCE_METRICS[s.source].find(m => m.value === s.metricKey)?.label;
            displayName = metricLabel || s.metricKey;
          }
        }

        return { ...s, displayName, value: 0 };
      });

      const config: FunnelConfig = {
        id: initialConfig?.id || `funnel-${Date.now()}`,
        name: funnelName,
        channelIds: selectedChannelIds,
        stages: processedStages,
        totalCost: 0,
        dateRange: { startDate, endDate },
      };

      await onSave(config);
      onClose();
    } catch (error) {
      console.error('Failed to save funnel:', error);
      setErrors(['Failed to save funnel. Please try again.']);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialConfig ? 'Edit Funnel' : 'Create Funnel'}
          </DialogTitle>
          <DialogDescription>
            Build a custom funnel to track your marketing performance across platforms
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Error Messages */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm font-semibold text-red-800 mb-1">Please fix the following errors:</p>
              <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Templates */}
          <div>
            <Label>Use Template (Optional)</Label>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyTemplate('ecommerce')}
              >
                E-commerce
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyTemplate('appInstall')}
              >
                App Install
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyTemplate('leadGen')}
              >
                Lead Generation
              </Button>
            </div>
          </div>

          {/* Funnel Name */}
          <div>
            <Label htmlFor="funnel-name">Funnel Name</Label>
            <Input
              id="funnel-name"
              value={funnelName}
              onChange={(e) => setFunnelName(e.target.value)}
              placeholder="e.g., Q1 Campaign Funnel"
            />
          </div>

          {/* Channel Selector (Multi-select) */}
          <div>
            <Label>Media Channels</Label>
            <div className="text-sm text-gray-500 mb-2">
              Select channels to aggregate data from (or select all)
            </div>
            <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
              {/* All Channels Option */}
              <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                <input
                  type="checkbox"
                  checked={selectedChannelIds.length === availableChannels.length && availableChannels.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedChannelIds(availableChannels.map(c => c.id));
                    } else {
                      setSelectedChannelIds([]);
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="font-medium">All Channels ({availableChannels.length})</span>
              </label>
              
              <div className="border-t pt-2 mt-2">
                {availableChannels.map(channel => (
                  <label key={channel.id} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={selectedChannelIds.includes(channel.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedChannelIds([...selectedChannelIds, channel.id]);
                        } else {
                          setSelectedChannelIds(selectedChannelIds.filter(id => id !== channel.id));
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span>{channel.name}</span>
                    <span className="text-sm text-gray-500">({channel.platform})</span>
                  </label>
                ))}
              </div>
              
              {availableChannels.length === 0 && (
                <div className="text-sm text-gray-500 italic p-2">
                  No channels available. Please add channels in the media plan builder first.
                </div>
              )}
            </div>
            {selectedChannelIds.length > 0 && (
              <div className="text-sm text-gray-600 mt-2">
                {selectedChannelIds.length} channel{selectedChannelIds.length !== 1 ? 's' : ''} selected
              </div>
            )}
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Stages */}
          <div>
            <div className="mb-3">
              <Label>Funnel Stages ({stages.length})</Label>
            </div>

            {stages.length === 0 ? (
              <Card className="p-8 text-center text-slate-500">
                <p>No stages yet. Click "Add Stage" or use a template to get started.</p>
              </Card>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={stages.map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {stages.map((stage, index) => (
                    <SortableStageRow
                      key={stage.id}
                      stage={stage}
                      index={index}
                      onUpdate={updateStage}
                      onDelete={deleteStage}
                      ga4Events={ga4Events}
                      isLoadingEvents={isLoadingEvents}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}

            {/* Add Stage Button at Bottom */}
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addStage}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Stage
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Funnel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
