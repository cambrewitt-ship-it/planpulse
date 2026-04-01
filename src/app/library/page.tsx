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
import { Plus, Facebook, Search, Linkedin, Music, Instagram, Radio, Edit2, Trash2, Check, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MetricsBenchmarksPanel } from '@/components/library/metrics-benchmarks-panel';

interface ActionPoint {
  id: string;
  text: string;
  completed: boolean;
  category: 'SET UP' | 'HEALTH CHECK';
  channel_type: string;
  frequency?: 'daily' | 'weekly' | 'fortnightly' | 'monthly' | null;
  days_before_live_due?: number | null;
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
  { value: 'Display Ads', label: 'Display Ads', icon: Radio },
  { value: 'Native Ads', label: 'Native Ads', icon: Radio },
  { value: 'LinkedIn Ads', label: 'LinkedIn Ads', icon: Linkedin },
  { value: 'TikTok Ads', label: 'TikTok Ads', icon: Music },
  { value: 'Instagram Ads', label: 'Instagram Ads', icon: Instagram },
  { value: 'Twitter Ads', label: 'Twitter Ads', icon: Radio },
  { value: 'YouTube Ads', label: 'YouTube Ads', icon: Radio },
  { value: 'Snapchat Ads', label: 'Snapchat Ads', icon: Radio },
  { value: 'Reddit Ads', label: 'Reddit Ads', icon: Radio },
  { value: 'Instagram (Organic)', label: 'Instagram (Organic)', icon: Instagram },
  { value: 'Facebook (Organic)', label: 'Facebook (Organic)', icon: Facebook },
  { value: 'LinkedIn (Organic)', label: 'LinkedIn (Organic)', icon: Linkedin },
  { value: 'EDM / Email', label: 'EDM / Email', icon: Radio },
  { value: 'OOH', label: 'OOH', icon: Radio },
  { value: 'Radio', label: 'Radio', icon: Radio },
  { value: 'Other', label: 'Other', icon: Radio },
];

export default function LibraryPage() {
  const [libraryEntries, setLibraryEntries] = useState<MediaChannelLibraryEntry[]>([]);
  const [actionPoints, setActionPoints] = useState<Record<string, ActionPoint[]>>({});
  const [specs, setSpecs] = useState<Record<string, MediaChannelSpec[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newChannelTitle, setNewChannelTitle] = useState('');
  const [newChannelNotes, setNewChannelNotes] = useState('');
  const [newChannelType, setNewChannelType] = useState('Google Ads');
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [editingActionPointId, setEditingActionPointId] = useState<string | null>(null);
  const [editingActionPointText, setEditingActionPointText] = useState('');
  const [editingActionPointDaysBefore, setEditingActionPointDaysBefore] = useState<number | ''>('');
  const [editingActionPointFrequency, setEditingActionPointFrequency] = useState<'daily' | 'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [addingActionPointChannelType, setAddingActionPointChannelType] = useState<string | null>(null);
  const [newActionPointText, setNewActionPointText] = useState('');
  const [newActionPointCategory, setNewActionPointCategory] = useState<'SET UP' | 'HEALTH CHECK'>('SET UP');
  const [newActionPointFrequency, setNewActionPointFrequency] = useState<'daily' | 'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [newActionPointDaysBefore, setNewActionPointDaysBefore] = useState<number | ''>('');
  const [actionPointFilter, setActionPointFilter] = useState<Record<string, 'SET UP' | 'HEALTH CHECK'>>({});
  const [editingSpecId, setEditingSpecId] = useState<string | null>(null);
  const [editingSpecText, setEditingSpecText] = useState('');
  const [addingSpecChannelId, setAddingSpecChannelId] = useState<string | null>(null);
  const [newSpecText, setNewSpecText] = useState('');
  const [activeTab, setActiveTab] = useState<'channels' | 'benchmarks'>('channels');

  useEffect(() => {
    loadLibraryEntries();
  }, []);

  useEffect(() => {
    // Load action points and specs for each library entry
    const loadActionPointsAndSpecs = async () => {
      setLoadingDetails(true);
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
      setLoadingDetails(false);
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

      // Reset form
      setNewActionPointText('');
      setNewActionPointCategory('SET UP');
      setNewActionPointFrequency('weekly');
      setNewActionPointDaysBefore('');
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

  const handleStartEditActionPoint = (ap: ActionPoint) => {
    setEditingActionPointId(ap.id);
    setEditingActionPointText(ap.text);
    setEditingActionPointDaysBefore(ap.days_before_live_due ?? '');
    setEditingActionPointFrequency(ap.frequency || 'weekly');
  };

  const handleCancelEditActionPoint = () => {
    setEditingActionPointId(null);
    setEditingActionPointText('');
    setEditingActionPointDaysBefore('');
    setEditingActionPointFrequency('weekly');
  };

  const handleSaveEditActionPoint = async (ap: ActionPoint) => {
    if (!editingActionPointId || !editingActionPointText.trim()) return;

    try {
      setIsSaving(true);
      const updateBody: any = {
        id: editingActionPointId,
        text: editingActionPointText.trim(),
      };

      if (ap.category === 'SET UP') {
        updateBody.days_before_live_due =
          editingActionPointDaysBefore !== '' ? Number(editingActionPointDaysBefore) : null;
      }

      if (ap.category === 'HEALTH CHECK') {
        updateBody.frequency = editingActionPointFrequency;
      }

      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateBody),
      });

      if (!response.ok) {
        throw new Error('Failed to update action point');
      }

      // Reload action points for this channel type
      const actionPointsResponse = await fetch(
        `/api/action-points?channel_type=${encodeURIComponent(ap.channel_type)}`
      );
      if (actionPointsResponse.ok) {
        const { data } = await actionPointsResponse.json();
        setActionPoints((prev) => ({
          ...prev,
          [ap.channel_type]: data || [],
        }));
      }

      handleCancelEditActionPoint();
    } catch (error) {
      console.error('Error updating action point:', error);
      alert('Failed to update action point. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteActionPoint = async (ap: ActionPoint) => {
    if (!confirm('Delete this action point template? This will remove it from all clients.')) return;

    try {
      setIsSaving(true);
      const response = await fetch(`/api/action-points?id=${encodeURIComponent(ap.id)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete action point');
      }

      const actionPointsResponse = await fetch(
        `/api/action-points?channel_type=${encodeURIComponent(ap.channel_type)}`
      );
      if (actionPointsResponse.ok) {
        const { data } = await actionPointsResponse.json();
        setActionPoints((prev) => ({
          ...prev,
          [ap.channel_type]: data || [],
        }));
      }
    } catch (error) {
      console.error('Error deleting action point:', error);
      alert('Failed to delete action point. Please try again.');
    } finally {
      setIsSaving(false);
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

  const getChannelIcon = (channelType: string, iconClass?: string) => {
    const l = channelType.toLowerCase();
    const className = iconClass ?? "w-5 h-5";

    if (l.includes('meta') || l.includes('facebook')) {
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Meta">
          <path d="M12 2.04C6.477 2.04 2 6.516 2 12.04c0 5.012 3.657 9.168 8.438 9.896V14.89h-2.54v-2.851h2.54v-2.17c0-2.509 1.493-3.893 3.775-3.893 1.094 0 2.238.196 2.238.196v2.459h-1.26c-1.243 0-1.63.772-1.63 1.563v1.845h2.773l-.443 2.85h-2.33v7.046C18.343 21.208 22 17.052 22 12.04c0-5.524-4.477-10-10-10z" fill="#1877F2"/>
        </svg>
      );
    }

    if (l.includes('google') || l.includes('google ads')) {
      return (
        <svg className={className} viewBox="0 0 24 24" aria-label="Google Ads">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      );
    }

    if (l.includes('linkedin') || l.includes('linkedin ads')) {
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="LinkedIn">
          <rect width="24" height="24" rx="3" fill="#0A66C2"/>
          <path d="M7.75 9.5h-2.5v8h2.5v-8zM6.5 8.5a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM17.5 13.25c0-1.938-.938-3.75-3-3.75-1.188 0-2 .625-2.375 1.188V9.5H9.75v8h2.375v-4.375c0-.875.563-1.625 1.438-1.625.875 0 1.187.75 1.187 1.563V17.5H17.5v-4.25z" fill="white"/>
        </svg>
      );
    }

    if (l.includes('tiktok') || l.includes('tiktok ads')) {
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="TikTok">
          <rect width="24" height="24" rx="4" fill="#010101"/>
          <path d="M17.5 7.5c-.833-.583-1.292-1.542-1.333-2.5H14v9.583c0 1.084-.917 1.917-2 1.834-1.083-.084-1.833-1.084-1.667-2.167.167-1.083 1.167-1.833 2.25-1.666V10.5c-2.583-.25-4.75 1.583-4.75 4.25 0 2.5 2.083 4.25 4.667 4.167C14.917 18.833 17 16.917 17 14.583V9.75c.75.5 1.583.75 2.5.75V8c-.75 0-1.5-.167-2-.5z" fill="white"/>
        </svg>
      );
    }

    if (l.includes('instagram')) {
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Instagram">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.26 0 12 0zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zM12 16c-2.209 0-4-1.79-4-4s1.791-4 4-4 4 1.79 4 4-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" fill="#E4405F"/>
        </svg>
      );
    }

    if (l.includes('twitter')) {
      return (
        <svg className={className} viewBox="0 0 24 24" aria-label="X / Twitter">
          <rect width="24" height="24" rx="4" fill="#000"/>
          <path d="M17.75 4h-2.6l-3.45 4.6L8.3 4H3.5l5.9 8.1L3.5 20H6.1l3.75-5 3.85 5H18.5l-6.1-8.4L17.75 4zm-1.05 14.3-9.6-12.9h1.35l9.6 12.9h-1.35z" fill="white"/>
        </svg>
      );
    }

    if (l.includes('youtube')) {
      return (
        <svg className={className} viewBox="0 0 24 24" aria-label="YouTube">
          <path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.55 3.5 12 3.5 12 3.5s-7.55 0-9.38.55A3.02 3.02 0 00.5 6.19C0 8.03 0 12 0 12s0 3.97.5 5.81a3.02 3.02 0 002.12 2.14C4.45 20.5 12 20.5 12 20.5s7.55 0 9.38-.55a3.02 3.02 0 002.12-2.14C24 15.97 24 12 24 12s0-3.97-.5-5.81zM9.75 15.5v-7l6.5 3.5-6.5 3.5z" fill="#FF0000"/>
        </svg>
      );
    }

    if (l.includes('snapchat')) {
      return (
        <svg className={className} viewBox="0 0 24 24" aria-label="Snapchat">
          <rect width="24" height="24" rx="4" fill="#FFFC00"/>
          <path d="M12 3.5c-2.21 0-4 2.24-4 4.5v1c-.55 0-1 .45-1 1s.45 1 1 1c-.28.83-.83 1.5-1.5 1.5-.28 0-.5.22-.5.5s.22.5.5.5c1.1 0 2.05-.7 2.6-1.75.28.1.58.25.9.25s.62-.15.9-.25c.55 1.05 1.5 1.75 2.6 1.75.28 0 .5-.22.5-.5s-.22-.5-.5-.5c-.67 0-1.22-.67-1.5-1.5.55 0 1-.45 1-1s-.45-1-1-1V8c0-2.26-1.79-4.5-4-4.5z" fill="#000" opacity=".85"/>
        </svg>
      );
    }

    if (l.includes('reddit')) {
      return (
        <svg className={className} viewBox="0 0 24 24" aria-label="Reddit">
          <circle cx="12" cy="12" r="12" fill="#FF4500"/>
          <path d="M20 12a2 2 0 00-2-2 1.98 1.98 0 00-1.37.55C15.12 9.77 13.38 9.3 11.5 9.2l.8-3.74 2.58.55a1.5 1.5 0 103-0.01 1.5 1.5 0 00-2.8-.64l-2.88-.62a.25.25 0 00-.3.19l-.9 4.17c-1.92.08-3.68.56-5.14 1.36A1.98 1.98 0 004 12a2 2 0 001.1 1.78c-.04.2-.06.41-.06.62 0 3.14 3.58 5.7 8 5.7s8-2.56 8-5.7c0-.21-.02-.42-.06-.62A2 2 0 0020 12zm-13 1a1 1 0 112 0 1 1 0 01-2 0zm5.5 3.25c-.83.83-2.17.83-3 0a.25.25 0 01.35-.35c.55.55 1.75.55 2.3 0a.25.25 0 01.35.35zm-.5-2.25a1 1 0 110-2 1 1 0 010 2z" fill="white"/>
        </svg>
      );
    }

    if (l.includes('display')) {
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Display Ads">
          <rect x="2" y="3" width="20" height="14" rx="2" stroke="#06B6D4" strokeWidth="2" fill="none"/>
          <path d="M8 21h8M12 17v4" stroke="#06B6D4" strokeWidth="2" strokeLinecap="round"/>
          <rect x="6" y="7" width="5" height="6" rx="1" fill="#06B6D4" opacity=".4"/>
          <rect x="13" y="7" width="3" height="2" rx=".5" fill="#06B6D4"/>
          <rect x="13" y="11" width="3" height="2" rx=".5" fill="#06B6D4"/>
        </svg>
      );
    }

    if (l.includes('native')) {
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Native Ads">
          <rect x="3" y="3" width="8" height="8" rx="1.5" fill="#14B8A6" opacity=".5"/>
          <rect x="13" y="3" width="8" height="4" rx="1" fill="#14B8A6"/>
          <rect x="13" y="9" width="8" height="2" rx="1" fill="#14B8A6" opacity=".5"/>
          <rect x="3" y="13" width="18" height="2" rx="1" fill="#14B8A6" opacity=".4"/>
          <rect x="3" y="17" width="12" height="2" rx="1" fill="#14B8A6" opacity=".3"/>
          <rect x="17" y="15" width="4" height="4" rx="1" fill="#14B8A6"/>
        </svg>
      );
    }

    if (l.includes('edm') || l.includes('email')) {
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="EDM / Email">
          <rect x="2" y="4" width="20" height="16" rx="2" stroke="#7C3AED" strokeWidth="2" fill="none"/>
          <path d="M2 7l10 7 10-7" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }

    if (l.includes('ooh')) {
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="OOH">
          <rect x="2" y="3" width="20" height="11" rx="2" stroke="#F97316" strokeWidth="2" fill="none"/>
          <path d="M8 14v6M16 14v6M5 20h14" stroke="#F97316" strokeWidth="2" strokeLinecap="round"/>
          <path d="M7 7h10M7 10h6" stroke="#F97316" strokeWidth="1.5" strokeLinecap="round" opacity=".6"/>
        </svg>
      );
    }

    if (l === 'radio') {
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Radio">
          <rect x="2" y="10" width="20" height="11" rx="2" stroke="#D97706" strokeWidth="2" fill="none"/>
          <circle cx="8" cy="15.5" r="2" stroke="#D97706" strokeWidth="1.5" fill="none"/>
          <path d="M13 13h5M13 16h3" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M6.34 6.34A8 8 0 0117.66 6.34" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M8.46 8.46a4 4 0 017.07 0" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    }

    // Other / generic fallback
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Other">
        <circle cx="12" cy="12" r="9" stroke="#6B7280" strokeWidth="2" fill="none"/>
        <path d="M12 8v4l3 3" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  };

  const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
  const serifFont: React.CSSProperties = { fontFamily: "'DM Serif Display', Georgia, serif" };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', ...pageFont }}>
        <div style={{ textAlign: 'center', color: '#8A8578', fontSize: 15 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F3EF', ...pageFont }}>
      <div className="container mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#1C1917', ...serifFont }}>Library</h1>
            <p className="mt-1" style={{ color: '#8A8578' }}>Manage media channel information and action points</p>
          </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          {activeTab === 'channels' ? (
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Media Channel
              </Button>
            </DialogTrigger>
          ) : null}
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
                    {CHANNEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          {getChannelIcon(option.value, 'w-4 h-4')}
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
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

      {/* Tab toggle */}
      <div className="flex gap-1 mb-6" style={{ background: '#EEECE8', padding: 4, borderRadius: 8, display: 'inline-flex' }}>
        <Button
          size="sm"
          variant={activeTab === 'channels' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('channels')}
          className="h-8 text-sm px-4"
        >
          Channels
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'benchmarks' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('benchmarks')}
          className="h-8 text-sm px-4"
        >
          Metrics & Benchmarks
        </Button>
      </div>

      {activeTab === 'benchmarks' && <MetricsBenchmarksPanel />}

      {activeTab === 'channels' ? (libraryEntries.length === 0 ? (
        <Card style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}>
          <CardContent className="text-center py-12">
            <p style={{ color: '#8A8578', marginBottom: 16 }}>No media channels in library yet</p>
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
              <Card key={entry.id} className="transition-shadow" style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}>
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
                            <CardTitle className="text-lg mb-1" style={{ color: '#1C1917' }}>{entry.title}</CardTitle>
                            <Badge variant="outline" className="text-xs" style={{ border: '0.5px solid #E8E4DC', color: '#8A8578' }}>
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
                          HEALTH CHECK
                        </Button>
                      </div>
                    )}
                    {loadingDetails && actionPoints[entry.channel_type] === undefined ? (
                      <div className="space-y-2 animate-pulse">
                        {[1,2,3].map(i => (
                          <div key={i} className="h-8 rounded-lg bg-gray-100" />
                        ))}
                      </div>
                    ) : channelActionPoints.length === 0 ? (
                      <p className="text-xs text-gray-500">No {currentFilter.toLowerCase()} action points for this channel</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {channelActionPoints.map((actionPoint) => (
                          <div
                            key={actionPoint.id}
                            className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors group"
                          >
                            <Checkbox
                              checked={actionPoint.completed}
                              onCheckedChange={() =>
                                handleToggleActionPoint(actionPoint.id, actionPoint.channel_type, actionPoint.completed)
                              }
                              disabled={true}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              {editingActionPointId === actionPoint.id ? (
                                <div className="space-y-2">
                                  <Input
                                    value={editingActionPointText}
                                    onChange={(e) => setEditingActionPointText(e.target.value)}
                                    className="text-xs h-7"
                                    placeholder="Action point text"
                                  />
                                  {actionPoint.category === 'SET UP' && (
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs text-gray-600 whitespace-nowrap">
                                        Days before:
                                      </Label>
                                      <Input
                                        type="number"
                                        min={0}
                                        value={editingActionPointDaysBefore}
                                        onChange={(e) =>
                                          setEditingActionPointDaysBefore(
                                            e.target.value === '' ? '' : Number(e.target.value)
                                          )
                                        }
                                        className="text-xs h-7 w-20"
                                      />
                                    </div>
                                  )}
                                  {actionPoint.category === 'HEALTH CHECK' && (
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs text-gray-600 whitespace-nowrap">
                                        Frequency:
                                      </Label>
                                      <Select
                                        value={editingActionPointFrequency}
                                        onValueChange={(
                                          value: 'daily' | 'weekly' | 'fortnightly' | 'monthly'
                                        ) => setEditingActionPointFrequency(value)}
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
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 text-emerald-600 hover:text-emerald-700"
                                      disabled={isSaving || !editingActionPointText.trim()}
                                      onClick={() => handleSaveEditActionPoint(actionPoint)}
                                    >
                                      <Check className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 text-gray-500 hover:text-gray-700"
                                      disabled={isSaving}
                                      onClick={handleCancelEditActionPoint}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-start justify-between gap-2">
                                    <p
                                      className={`text-xs ${
                                        actionPoint.completed
                                          ? 'line-through text-gray-400'
                                          : 'text-gray-900'
                                      }`}
                                    >
                                      {actionPoint.text}
                                    </p>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-gray-400 hover:text-gray-700"
                                        onClick={() => handleStartEditActionPoint(actionPoint)}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-red-500 hover:text-red-700"
                                        onClick={() => handleDeleteActionPoint(actionPoint)}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge
                                      variant={actionPoint.category === 'SET UP' ? 'secondary' : 'default'}
                                      className="text-xs"
                                    >
                                      {actionPoint.category}
                                    </Badge>
                                    {actionPoint.category === 'SET UP' &&
                                      actionPoint.days_before_live_due != null && (
                                        <span className="text-xs text-gray-500">
                                          {actionPoint.days_before_live_due} days before go-live
                                        </span>
                                      )}
                                    {actionPoint.category === 'HEALTH CHECK' &&
                                      actionPoint.frequency && (
                                        <span className="text-xs text-gray-500">
                                          {actionPoint.frequency}
                                        </span>
                                      )}
                                  </div>
                                </>
                              )}
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
                        {loadingDetails && specs[entry.id] === undefined ? (
                          <div className="space-y-1 animate-pulse">
                            {[1,2].map(i => <div key={i} className="h-7 rounded-lg bg-gray-100" />)}
                          </div>
                        ) : (specs[entry.id] || []).length === 0 ? (
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
      )) : null}

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
              <Select
                value={newActionPointCategory}
                onValueChange={(value: 'SET UP' | 'HEALTH CHECK') => {
                  setNewActionPointCategory(value);
                  // Reset category-specific fields when switching
                  if (value === 'SET UP') {
                    setNewActionPointFrequency('weekly');
                  } else {
                    setNewActionPointDaysBefore('');
                  }
                }}
              >
                <SelectTrigger id="action-point-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SET UP">SET UP</SelectItem>
                  <SelectItem value="HEALTH CHECK">HEALTH CHECK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newActionPointCategory === 'SET UP' && (
              <div className="space-y-2">
                <Label htmlFor="action-point-days-before">Days before go-live</Label>
                <Input
                  id="action-point-days-before"
                  type="number"
                  min={0}
                  value={newActionPointDaysBefore}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewActionPointDaysBefore(val === '' ? '' : Number(val));
                  }}
                  className="text-sm"
                  placeholder="e.g. 2"
                />
                <p className="text-xs text-gray-500">
                  Used to calculate when this setup task is due relative to the channel start date.
                </p>
              </div>
            )}
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
    </div>
  );
}

