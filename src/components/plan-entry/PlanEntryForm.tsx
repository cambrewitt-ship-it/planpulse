// src/components/plan-entry/PlanEntryForm.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Calendar, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MediaChannel, CHANNEL_OPTIONS, getWeekCommencing, formatWeekCommencing } from '@/types/media-plan';
import { format, addWeeks, differenceInWeeks } from 'date-fns';
import { createMediaPlan, getClients, createClient } from '@/lib/db/plans';
import { useRouter } from 'next/navigation';
import WeekCommencingCalendar from './WeekCommencingCalendar';

interface Client {
  id: string;
  name: string;
}

interface PlanEntryFormProps {
  initialClientId?: string;
}

export default function PlanEntryForm({ initialClientId }: PlanEntryFormProps = {}) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createClientDialogOpen, setCreateClientDialogOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const [selectedChannelIndex, setSelectedChannelIndex] = useState<number | null>(null);
  
  // Get next Monday
  const getNextMonday = () => {
    const today = new Date();
    const monday = getWeekCommencing(today);
    if (monday <= today) {
      return addWeeks(monday, 1);
    }
    return monday;
  };

  const [channels, setChannels] = useState<MediaChannel[]>([{
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

  // Load clients on mount
  useEffect(() => {
    loadClients();
  }, [initialClientId]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await getClients();
      setClients(data || []);
      if (data && data.length > 0) {
        // Use initialClientId if provided, otherwise use first client
        if (initialClientId && data.some(c => c.id === initialClientId)) {
          setSelectedClient(initialClientId);
        } else {
          setSelectedClient(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
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
      const plan = await createMediaPlan(selectedClient, validChannels);
      alert('Plan saved successfully!');
      router.push('/plans');
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Error saving plan. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Media Plan Entry</h2>
              <div className="mt-2 flex gap-2 items-center">
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
                <Dialog open={createClientDialogOpen} onOpenChange={setCreateClientDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      New Client
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Client</DialogTitle>
                      <DialogDescription>
                        Enter the name of the new client to add them to your system.
                      </DialogDescription>
                    </DialogHeader>
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
                    <DialogFooter>
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
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Total Budget</p>
              <p className="text-2xl font-bold">${calculateTotal().toLocaleString()}</p>
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
              <Button onClick={handleSave} disabled={saving}>
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
  );
}