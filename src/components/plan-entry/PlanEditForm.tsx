// src/components/plan-entry/PlanEditForm.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { MediaChannel, CHANNEL_OPTIONS, getWeekCommencing, formatWeekCommencing } from '@/types/media-plan';
import { format, addWeeks, differenceInWeeks } from 'date-fns';
import { updateMediaPlanWithChannels, getClients, createClient, deleteMediaPlan } from '@/lib/db/plans';
import WeekCommencingCalendar from './WeekCommencingCalendar';

interface PlanDashboardData {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  total_budget: number;
  status: string;
  clients: {
    id: string;
    name: string;
  };
  channels: Array<{
    id: string;
    channel: string;
    detail: string;
    type: string;
    weekly_plans: Array<{
      id: string;
      week_commencing: string;
      week_number: number;
      budget_planned: number;
      budget_actual: number;
      posts_planned: number;
      posts_actual: number;
    }>;
  }>;
}

interface Client {
  id: string;
  name: string;
}

interface PlanEditFormProps {
  plan: PlanDashboardData;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

export default function PlanEditForm({ plan, onClose, onSave, onDelete }: PlanEditFormProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>(plan.clients.id);
  const [planName, setPlanName] = useState(plan.name);
  const [planStatus, setPlanStatus] = useState<'draft' | 'active' | 'completed'>(plan.status as 'draft' | 'active' | 'completed');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [createClientDialogOpen, setCreateClientDialogOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const [selectedChannelIndex, setSelectedChannelIndex] = useState<number | null>(null);
  
  // Convert plan channels to MediaChannel format
  const convertChannelsToMediaChannels = (): MediaChannel[] => {
    return plan.channels.map((channel) => {
      const firstWeek = channel.weekly_plans[0];
      const lastWeek = channel.weekly_plans[channel.weekly_plans.length - 1];
      const totalPlanned = channel.weekly_plans.reduce((sum, wp) => sum + (wp.budget_planned || 0), 0);
      const weeklyPlanned = firstWeek ? (firstWeek.budget_planned || 0) : 0;
      
      return {
        id: `db-${channel.id}`, // Prefix with db- to indicate existing channel
        channel: channel.channel,
        detail: channel.detail,
        weeklyBudget: weeklyPlanned / 100, // Convert from cents
        totalBudget: totalPlanned / 100, // Convert from cents
        startWeek: firstWeek ? firstWeek.week_commencing : format(new Date(), 'yyyy-MM-dd'),
        endWeek: lastWeek ? lastWeek.week_commencing : format(new Date(), 'yyyy-MM-dd'),
        numberOfWeeks: channel.weekly_plans.length,
        isOrganic: channel.type === 'organic',
        postsPerWeek: firstWeek ? (firstWeek.posts_planned || 0) : 0
      };
    });
  };

  const [channels, setChannels] = useState<MediaChannel[]>(convertChannelsToMediaChannels());

  // Get next Monday
  const getNextMonday = () => {
    const today = new Date();
    const monday = getWeekCommencing(today);
    if (monday <= today) {
      return addWeeks(monday, 1);
    }
    return monday;
  };

  // Load clients on mount
  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const data = await getClients();
      setClients(data || []);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      alert('Please enter a client name');
      return;
    }

    setCreatingClient(true);
    try {
      const newClient = await createClient(newClientName.trim());
      await loadClients(); // Reload clients list
      setSelectedClient(newClient.id);
      setNewClientName('');
      setCreateClientDialogOpen(false);
    } catch (error) {
      console.error('Error creating client:', error);
      alert('Error creating client. Please try again.');
    } finally {
      setCreatingClient(false);
    }
  };

  const addChannel = () => {
    setChannels([...channels, {
      id: crypto.randomUUID(),
      channel: '',
      detail: '',
      weeklyBudget: 0,
      totalBudget: 0,
      startWeek: format(getNextMonday(), 'yyyy-MM-dd'),
      endWeek: format(addWeeks(getNextMonday(), 3), 'yyyy-MM-dd'),
      numberOfWeeks: 4,
      isOrganic: false,
      postsPerWeek: 0
    }]);
  };

  const removeChannel = (index: number) => {
    if (channels.length > 1) {
      setChannels(channels.filter((_, i) => i !== index));
    }
  };

  const updateChannel = (index: number, field: keyof MediaChannel, value: any) => {
    const updated = [...channels];
    updated[index] = { ...updated[index], [field]: value };
    
    // Recalculate weeks when dates change
    if (field === 'startWeek' || field === 'endWeek') {
      const start = new Date(updated[index].startWeek);
      const end = new Date(updated[index].endWeek);
      const weeks = Math.max(1, differenceInWeeks(end, start) + 1);
      updated[index].numberOfWeeks = weeks;
      
      // Recalculate weekly budget
      if (updated[index].totalBudget > 0) {
        updated[index].weeklyBudget = Math.round(updated[index].totalBudget / weeks);
      }
    }
    
    // Update weekly budget when total changes
    if (field === 'totalBudget' && updated[index].numberOfWeeks > 0) {
      updated[index].weeklyBudget = Math.round(value / updated[index].numberOfWeeks);
    }
    
    setChannels(updated);
  };

  const calculateTotal = () => {
    return channels.reduce((sum, ch) => sum + (ch.totalBudget || 0), 0);
  };

  const handleSave = async () => {
    if (!selectedClient) {
      alert('Please select a client');
      return;
    }

    const validChannels = channels.filter(ch => ch.channel && ch.detail);
    if (validChannels.length === 0) {
      alert('Please add at least one complete channel');
      return;
    }

    setSaving(true);
    try {
      await updateMediaPlanWithChannels(
        plan.id,
        selectedClient,
        {
          name: planName,
          status: planStatus
        },
        validChannels
      );
      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Error saving plan. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteMediaPlan(plan.id);
      if (onDelete) {
        onDelete();
      }
      onClose();
    } catch (error) {
      console.error('Error deleting plan:', error);
      alert('Error deleting plan. Please try again.');
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-7xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <h2 className="text-2xl font-bold">Edit Media Plan</h2>
                <div className="mt-4 flex gap-4 items-center">
                  <div className="grid gap-2">
                    <Label htmlFor="plan-name">Plan Name</Label>
                    <Input
                      id="plan-name"
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      className="w-64"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="plan-status">Status</Label>
                    <Select value={planStatus} onValueChange={(v) => setPlanStatus(v as 'draft' | 'active' | 'completed')}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="client">Client</Label>
                    <div className="flex gap-2">
                      <Select value={selectedClient} onValueChange={setSelectedClient}>
                        <SelectTrigger className="w-64">
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map(client => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreateClientDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        New Client
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right mr-4">
                  <p className="text-sm text-gray-600">Total Budget</p>
                  <p className="text-2xl font-bold">${calculateTotal().toLocaleString()}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
            {/* Left Column - Form */}
            <div className="space-y-4">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 text-sm font-semibold border-b pb-2">
                <div className="col-span-3">Channel</div>
                <div className="col-span-3">Service Details</div>
                <div className="col-span-2">$/Total</div>
                <div className="col-span-1">Organic</div>
                <div className="col-span-2">Posts/Wk</div>
                <div className="col-span-1">Actions</div>
              </div>

              {/* Rows */}
              {channels.map((channel, index) => (
                <div 
                  key={channel.id} 
                  className={`grid grid-cols-12 gap-2 items-center p-2 rounded transition-colors ${
                    selectedChannelIndex === index ? 'bg-blue-50 border border-blue-200' : ''
                  }`}
                  onClick={() => setSelectedChannelIndex(index)}
                >
                <div className="col-span-3">
                  <Select
                    value={channel.channel}
                    onValueChange={(value) => updateChannel(index, 'channel', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNEL_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="col-span-3">
                  <Input
                    value={channel.detail}
                    onChange={(e) => updateChannel(index, 'detail', e.target.value)}
                    placeholder="e.g., Management"
                  />
                </div>
                
                <div className="col-span-2">
                  <Input
                    type="number"
                    value={channel.totalBudget || ''}
                    onChange={(e) => updateChannel(index, 'totalBudget', Number(e.target.value))}
                    placeholder="$0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    ${channel.weeklyBudget}/wk
                  </p>
                </div>
                
                <div className="col-span-1 flex justify-center">
                  <Checkbox
                    checked={channel.isOrganic}
                    onCheckedChange={(checked) => updateChannel(index, 'isOrganic', checked)}
                  />
                </div>
                
                <div className="col-span-2">
                  <Input
                    type="number"
                    value={channel.postsPerWeek || ''}
                    onChange={(e) => updateChannel(index, 'postsPerWeek', Number(e.target.value))}
                    disabled={!channel.isOrganic}
                  />
                </div>
                
                <div className="col-span-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeChannel(index)}
                    disabled={channels.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

              {/* Action Buttons */}
              <div className="flex justify-between pt-4 border-t">
                <Button onClick={addChannel} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Channel
                </Button>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={saving || deleting}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Plan
                  </Button>
                  <Button variant="outline" onClick={onClose} disabled={saving || deleting}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving || deleting}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Plan
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Right Column - Calendar */}
            <div>
              <WeekCommencingCalendar
                channels={channels}
                selectedChannelIndex={selectedChannelIndex}
                onDateRangeChange={(channelIndex, start, end) => {
                  updateChannel(channelIndex, 'startWeek', start);
                  updateChannel(channelIndex, 'endWeek', end);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Delete Media Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 mb-4">
                Are you sure you want to delete "{planName}"? This action cannot be undone and will delete all associated channels and weekly plans.
              </p>
            </CardContent>
            <div className="flex justify-end gap-2 p-6 border-t">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleDelete} 
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Plan
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Create Client Dialog */}
      {createClientDialogOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Create New Client</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="client-name">Client Name</Label>
                  <Input
                    id="client-name"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Enter client name"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateClient();
                      }
                    }}
                  />
                </div>
              </div>
            </CardContent>
            <div className="flex justify-end gap-2 p-6 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setCreateClientDialogOpen(false);
                  setNewClientName('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateClient} disabled={creatingClient || !newClientName.trim()}>
                {creatingClient ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Client'
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
