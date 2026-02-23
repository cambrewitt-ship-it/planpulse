'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Facebook, Search, Linkedin, Music, Instagram, Radio, Edit2, Trash2, Check } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ActionPoint {
  id: string;
  text: string;
  completed: boolean;
  category: 'SET UP' | 'HEALTH CHECK';
  channel_type: string;
}

interface MediaChannelLibraryEntry {
  id: string;
  title: string;
  notes: string | null;
  channel_type: string;
  created_at: string;
  updated_at: string;
}

interface MediaChannelSpec {
  id: string;
  media_channel_library_id: string;
  spec_text: string;
  created_at: string;
  updated_at: string;
}

const CHANNEL_OPTIONS = [
  { value: 'Google Ads', label: 'Google Ads', icon: Search },
  { value: 'Meta Ads', label: 'Meta Ads', icon: Facebook },
  { value: 'LinkedIn Ads', label: 'LinkedIn Ads', icon: Linkedin },
  { value: 'TikTok Ads', label: 'TikTok Ads', icon: Music },
  { value: 'Instagram Ads', label: 'Instagram Ads', icon: Instagram },
];

export default function LibraryPage() {
  const [libraryEntries, setLibraryEntries] = useState<MediaChannelLibraryEntry[]>([]);
  const [actionPoints, setActionPoints] = useState<Record<string, ActionPoint[]>>({});
  const [specs, setSpecs] = useState<Record<string, MediaChannelSpec[]>>({});
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newChannelTitle, setNewChannelTitle] = useState('');
  const [newChannelNotes, setNewChannelNotes] = useState('');
  const [newChannelType, setNewChannelType] = useState('Google Ads');
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [addingActionPointChannelType, setAddingActionPointChannelType] = useState<string | null>(null);
  const [newActionPointText, setNewActionPointText] = useState('');
  const [newActionPointCategory, setNewActionPointCategory] = useState<'SET UP' | 'HEALTH CHECK'>('SET UP');
  const [newActionPointFrequency, setNewActionPointFrequency] = useState<'daily' | 'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [actionPointFilter, setActionPointFilter] = useState<Record<string, 'SET UP' | 'HEALTH CHECK'>>({});
  const [editingSpecId, setEditingSpecId] = useState<string | null>(null);
  const [editingSpecText, setEditingSpecText] = useState('');
  const [addingSpecChannelId, setAddingSpecChannelId] = useState<string | null>(null);
  const [newSpecText, setNewSpecText] = useState('');

  useEffect(() => {
    loadLibraryEntries();
  }, []);

  useEffect(() => {
    // Load action points and specs for each library entry
    const loadActionPointsAndSpecs = async () => {
      const channelTypes = new Set(libraryEntries.map(entry => entry.channel_type));
      const actionPointsMap: Record<string, ActionPoint[]> = {};
      const specsMap: Record<string, MediaChannelSpec[]> = {};

      // Load action points by channel type
      for (const channelType of channelTypes) {
        try {
          const response = await fetch(`/api/action-points?channel_type=${encodeURIComponent(channelType)}`);
          if (response.ok) {
            const { data } = await response.json();
            actionPointsMap[channelType] = data || [];
          }
        } catch (error) {
          console.error(`Error fetching action points for ${channelType}:`, error);
          actionPointsMap[channelType] = [];
        }
      }

      // Load specs by library entry id
      for (const entry of libraryEntries) {
        try {
          const response = await fetch(`/api/media-channel-specs?media_channel_library_id=${encodeURIComponent(entry.id)}`);
          if (response.ok) {
            const { data } = await response.json();
            specsMap[entry.id] = data || [];
          }
        } catch (error) {
          console.error(`Error fetching specs for ${entry.id}:`, error);
          specsMap[entry.id] = [];
        }
      }

      setActionPoints(actionPointsMap);
      setSpecs(specsMap);
    };

    if (libraryEntries.length > 0) {
      loadActionPointsAndSpecs();
    }
  }, [libraryEntries]);

  const loadLibraryEntries = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/media-channel-library');
      if (response.ok) {
        const { data } = await response.json();
        setLibraryEntries(data || []);
      }
    } catch (error) {
      console.error('Error loading library entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!newChannelTitle.trim()) {
      alert('Please enter a title');
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch('/api/media-channel-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newChannelTitle.trim(),
          notes: newChannelNotes.trim() || null,
          channel_type: newChannelType,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create media channel');
      }

      setNewChannelTitle('');
      setNewChannelNotes('');
      setNewChannelType('Google Ads');
      setIsDialogOpen(false);
      loadLibraryEntries();
    } catch (error) {
      console.error('Error creating media channel:', error);
      alert('Failed to create media channel. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (entry: MediaChannelLibraryEntry) => {
    setEditingId(entry.id);
    setEditingTitle(entry.title);
    setEditingNotes(entry.notes || '');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingTitle.trim()) {
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch('/api/media-channel-library', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          title: editingTitle.trim(),
          notes: editingNotes.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update media channel');
      }

      setEditingId(null);
      setEditingTitle('');
      setEditingNotes('');
      loadLibraryEntries();
    } catch (error) {
      console.error('Error updating media channel:', error);
      alert('Failed to update media channel. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this media channel?')) {
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch(`/api/media-channel-library?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete media channel');
      }

      loadLibraryEntries();
    } catch (error) {
      console.error('Error deleting media channel:', error);
      alert('Failed to delete media channel. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddActionPoint = async (channelType: string) => {
    if (!newActionPointText.trim()) {
      alert('Please enter action point text');
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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create action point');
      }

      // Reset form
      setNewActionPointText('');
      setNewActionPointCategory('SET UP');
      setNewActionPointFrequency('weekly');
      setAddingActionPointChannelType(null);

      // Reload action points for this channel type
      const actionPointsResponse = await fetch(`/api/action-points?channel_type=${encodeURIComponent(channelType)}`);
      if (actionPointsResponse.ok) {
        const { data } = await actionPointsResponse.json();
        setActionPoints((prev) => ({
          ...prev,
          [channelType]: data || [],
        }));
      }
    } catch (error: any) {
      console.error('Error creating action point:', error);
      alert(error.message || 'Failed to create action point. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActionPoint = async (actionPointId: string, channelType: string, completed: boolean) => {
    const newCompleted = !completed;

    // Optimistically update local state
    setActionPoints((prev) => {
      const updated = { ...prev };
      if (updated[channelType]) {
        updated[channelType] = updated[channelType].map((ap) =>
          ap.id === actionPointId ? { ...ap, completed: newCompleted } : ap
        );
      }
      return updated;
    });

    try {
      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: actionPointId,
          completed: newCompleted,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update action point');
      }

      // Reload action points to ensure consistency
      const actionPointsResponse = await fetch(`/api/action-points?channel_type=${encodeURIComponent(channelType)}`);
      if (actionPointsResponse.ok) {
        const { data } = await actionPointsResponse.json();
        setActionPoints((prev) => ({
          ...prev,
          [channelType]: data || [],
        }));
      }
    } catch (error) {
      console.error('Error updating action point:', error);
      // Reload on error to revert optimistic update
      const actionPointsResponse = await fetch(`/api/action-points?channel_type=${encodeURIComponent(channelType)}`);
      if (actionPointsResponse.ok) {
        const { data } = await actionPointsResponse.json();
        setActionPoints((prev) => ({
          ...prev,
          [channelType]: data || [],
        }));
      }
    }
  };

  const handleAddSpec = async (channelId: string) => {
    if (!newSpecText.trim()) {
      alert('Please enter a spec (e.g., 1920 x 1080 px)');
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch('/api/media-channel-specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_channel_library_id: channelId,
          spec_text: newSpecText.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create spec');
      }

      const { data } = await response.json();
      setSpecs((prev) => ({
        ...prev,
        [channelId]: [...(prev[channelId] || []), data],
      }));

      setNewSpecText('');
      setAddingSpecChannelId(null);
    } catch (error) {
      console.error('Error creating spec:', error);
      alert('Failed to create spec. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEditSpec = (spec: MediaChannelSpec) => {
    setEditingSpecId(spec.id);
    setEditingSpecText(spec.spec_text);
  };

  const handleSaveEditSpec = async (channelId: string) => {
    if (!editingSpecId || !editingSpecText.trim()) {
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch('/api/media-channel-specs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingSpecId,
          spec_text: editingSpecText.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update spec');
      }

      const { data } = await response.json();
      setSpecs((prev) => ({
        ...prev,
        [channelId]: (prev[channelId] || []).map((s) => (s.id === editingSpecId ? data : s)),
      }));

      setEditingSpecId(null);
      setEditingSpecText('');
    } catch (error) {
      console.error('Error updating spec:', error);
      alert('Failed to update spec. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSpec = async (specId: string, channelId: string) => {
    if (!confirm('Are you sure you want to delete this spec?')) {
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch(`/api/media-channel-specs?id=${specId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete spec');
      }

      setSpecs((prev) => ({
        ...prev,
        [channelId]: (prev[channelId] || []).filter((s) => s.id !== specId),
      }));
    } catch (error) {
      console.error('Error deleting spec:', error);
      alert('Failed to delete spec. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const getChannelIcon = (channelType: string) => {
    const option = CHANNEL_OPTIONS.find(opt => opt.value === channelType);
    if (option) {
      const Icon = option.icon;
      return <Icon className="w-5 h-5" />;
    }
    return <Radio className="w-5 h-5 text-gray-500" />;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div className="flex justify-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Library</h1>
          <p className="text-gray-600 mt-1">Manage media channel information and action points</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Media Channel
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Media Channel</DialogTitle>
              <DialogDescription>
                Create a new media channel entry with title and notes
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="channel-type">Channel Type</Label>
                <Select value={newChannelType} onValueChange={setNewChannelType}>
                  <SelectTrigger id="channel-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" />
                            {option.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Enter channel title"
                  value={newChannelTitle}
                  onChange={(e) => setNewChannelTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Enter notes about this channel"
                  value={newChannelNotes}
                  onChange={(e) => setNewChannelNotes(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddChannel} disabled={isSaving || !newChannelTitle.trim()}>
                {isSaving ? 'Saving...' : 'Add Channel'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {libraryEntries.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 mb-4">No media channels in library yet</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Media Channel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {libraryEntries.map((entry) => {
            const allChannelActionPoints = actionPoints[entry.channel_type] || [];
            const currentFilter = actionPointFilter[entry.channel_type] || 'SET UP';
            const channelActionPoints = allChannelActionPoints.filter(ap => ap.category === currentFilter);
            const isEditing = editingId === entry.id;

            return (
              <Card key={entry.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex-shrink-0 mt-1">
                        {getChannelIcon(entry.channel_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="space-y-2">
                            <Input
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              className="h-8 text-sm"
                              autoFocus
                            />
                            <Textarea
                              value={editingNotes}
                              onChange={(e) => setEditingNotes(e.target.value)}
                              rows={3}
                              className="text-sm"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={handleSaveEdit}
                                disabled={isSaving || !editingTitle.trim()}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditingTitle('');
                                  setEditingNotes('');
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <CardTitle className="text-lg mb-1">{entry.title}</CardTitle>
                            <Badge variant="outline" className="text-xs">
                              {entry.channel_type}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                    {!isEditing && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartEdit(entry)}
                          disabled={isSaving}
                          className="h-8 w-8 p-0"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(entry.id)}
                          disabled={isSaving}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {!isEditing && entry.notes && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{entry.notes}</p>
                    </div>
                  )}
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-900">Action Points</h4>
                      {!isEditing && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAddingActionPointChannelType(entry.channel_type)}
                          className="h-7 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      )}
                    </div>
                    
                    {/* Category Toggle */}
                    {!isEditing && (
                      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                        <Button
                          size="sm"
                          variant={currentFilter === 'SET UP' ? 'default' : 'ghost'}
                          onClick={() => setActionPointFilter(prev => ({ ...prev, [entry.channel_type]: 'SET UP' }))}
                          className="h-7 text-xs flex-1"
                        >
                          Set Up
                        </Button>
                        <Button
                          size="sm"
                          variant={currentFilter === 'HEALTH CHECK' ? 'default' : 'ghost'}
                          onClick={() => setActionPointFilter(prev => ({ ...prev, [entry.channel_type]: 'HEALTH CHECK' }))}
                          className="h-7 text-xs flex-1"
                        >
                          Health Check
                        </Button>
                      </div>
                    )}
                    {channelActionPoints.length === 0 ? (
                      <p className="text-xs text-gray-500">No {currentFilter.toLowerCase()} action points for this channel</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {channelActionPoints.map((actionPoint) => (
                          <div
                            key={actionPoint.id}
                            className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                          >
                            <Checkbox
                              checked={actionPoint.completed}
                              onCheckedChange={() =>
                                handleToggleActionPoint(actionPoint.id, actionPoint.channel_type, actionPoint.completed)
                              }
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-xs ${
                                  actionPoint.completed
                                    ? 'line-through text-gray-400'
                                    : 'text-gray-900'
                                }`}
                              >
                                {actionPoint.text}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge
                                  variant={actionPoint.category === 'SET UP' ? 'secondary' : 'default'}
                                  className="text-xs"
                                >
                                  {actionPoint.category}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Specs Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-900">Specs</h4>
                      {!isEditing && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAddingSpecChannelId(entry.id)}
                          className="h-7 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      )}
                    </div>
                    {!isEditing && (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {(specs[entry.id] || []).length === 0 ? (
                          <p className="text-xs text-gray-500">No specs for this channel</p>
                        ) : (
                          (specs[entry.id] || []).map((spec) => {
                            const isEditingSpec = editingSpecId === spec.id;
                            return (
                              <div
                                key={spec.id}
                                className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                              >
                                {isEditingSpec ? (
                                  <>
                                    <Input
                                      value={editingSpecText}
                                      onChange={(e) => setEditingSpecText(e.target.value)}
                                      className="h-7 text-xs flex-1"
                                      autoFocus
                                      placeholder="e.g., 1920 x 1080 px"
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleSaveEditSpec(entry.id)}
                                      disabled={isSaving || !editingSpecText.trim()}
                                      className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                                    >
                                      <Check className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setEditingSpecId(null);
                                        setEditingSpecText('');
                                      }}
                                      className="h-7 w-7 p-0"
                                    >
                                      ×
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-xs text-gray-900 flex-1">{spec.spec_text}</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleStartEditSpec(spec)}
                                      disabled={isSaving}
                                      className="h-7 w-7 p-0"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleDeleteSpec(spec.id, entry.id)}
                                      disabled={isSaving}
                                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Action Point Dialog */}
      <Dialog open={addingActionPointChannelType !== null} onOpenChange={(open) => !open && setAddingActionPointChannelType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Action Point</DialogTitle>
            <DialogDescription>
              {addingActionPointChannelType && `Add a new action point for ${addingActionPointChannelType}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="action-point-text">Action Point Text</Label>
              <Textarea
                id="action-point-text"
                placeholder="Enter action point description"
                value={newActionPointText}
                onChange={(e) => setNewActionPointText(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="action-point-category">Category</Label>
              <Select value={newActionPointCategory} onValueChange={(value: 'SET UP' | 'HEALTH CHECK') => setNewActionPointCategory(value)}>
                <SelectTrigger id="action-point-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SET UP">SET UP</SelectItem>
                  <SelectItem value="HEALTH CHECK">HEALTH CHECK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newActionPointCategory === 'HEALTH CHECK' && (
              <div className="space-y-2">
                <Label htmlFor="action-point-frequency">Frequency</Label>
                <Select value={newActionPointFrequency} onValueChange={(value: 'daily' | 'weekly' | 'fortnightly' | 'monthly') => setNewActionPointFrequency(value)}>
                  <SelectTrigger id="action-point-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="fortnightly">Fortnightly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAddingActionPointChannelType(null);
              setNewActionPointText('');
              setNewActionPointCategory('SET UP');
              setNewActionPointFrequency('weekly');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => addingActionPointChannelType && handleAddActionPoint(addingActionPointChannelType)} 
              disabled={isSaving || !newActionPointText.trim() || !addingActionPointChannelType}
            >
              {isSaving ? 'Adding...' : 'Add Action Point'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Spec Dialog */}
      <Dialog open={addingSpecChannelId !== null} onOpenChange={(open) => !open && setAddingSpecChannelId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Spec</DialogTitle>
            <DialogDescription>
              Enter the spec dimensions (e.g., 1920 x 1080 px)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="spec-text">Spec</Label>
              <Input
                id="spec-text"
                placeholder="e.g., 1920 x 1080 px"
                value={newSpecText}
                onChange={(e) => setNewSpecText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSpecText.trim() && addingSpecChannelId) {
                    handleAddSpec(addingSpecChannelId);
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAddingSpecChannelId(null);
              setNewSpecText('');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={() => addingSpecChannelId && handleAddSpec(addingSpecChannelId)} 
              disabled={isSaving || !newSpecText.trim() || !addingSpecChannelId}
            >
              {isSaving ? 'Adding...' : 'Add Spec'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

