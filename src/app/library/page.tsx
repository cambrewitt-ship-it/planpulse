'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
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
import { Plus, Facebook, Search, Linkedin, Music, Instagram, Radio, Edit2, Trash2, Check, X, Upload, FileText, BookOpen } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MetricsBenchmarksPanel } from '@/components/library/metrics-benchmarks-panel';
import { getChannelLogo } from '@/lib/utils/channel-icons';

const PLAYBOOK_CATEGORIES: { value: string; label: string }[] = [
  { value: 'process', label: 'Process' },
  { value: 'sop', label: 'SOP' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'brand_guidelines', label: 'Brand Guidelines' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'reporting', label: 'Reporting' },
  { value: 'billing', label: 'Billing' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'other', label: 'Other' },
];

interface LibraryDocument {
  id: string;
  file_name: string;
  file_url: string;
  doc_category: string;
  is_text_doc: boolean;
  uploaded_at: string;
  uploader_name: string;
  text_content: string | null;
}

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
  { value: 'Linear TV', label: 'Linear TV', icon: Radio },
  { value: 'SVOD', label: 'SVOD', icon: Radio },
  { value: 'BVOD', label: 'BVOD', icon: Radio },
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
  const [activeTab, setActiveTab] = useState<'channels' | 'benchmarks' | 'playbooks'>('channels');

  // Playbooks state
  const [playbookDocs, setPlaybookDocs] = useState<LibraryDocument[]>([]);
  const [playbooksLoading, setPlaybooksLoading] = useState(false);
  const [isPlaybookDialogOpen, setIsPlaybookDialogOpen] = useState(false);
  const [playbookUploadMode, setPlaybookUploadMode] = useState<'file' | 'text'>('file');
  const [playbookFile, setPlaybookFile] = useState<File | null>(null);
  const [playbookCategory, setPlaybookCategory] = useState('other');
  const [playbookTextName, setPlaybookTextName] = useState('');
  const [playbookTextContent, setPlaybookTextContent] = useState('');
  const [playbookUploading, setPlaybookUploading] = useState(false);
  const playbookDropRef = useRef<HTMLDivElement>(null);
  const [playbookDragOver, setPlaybookDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const searchBlurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  interface SearchResult {
    type: 'channel' | 'action-point' | 'spec';
    entryId: string;
    entryTitle: string;
    matchText: string;
    subtitle: string;
  }

  const searchResults = useMemo((): SearchResult[] => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    for (const entry of libraryEntries) {
      if (
        entry.title.toLowerCase().includes(q) ||
        entry.channel_type.toLowerCase().includes(q) ||
        (entry.notes && entry.notes.toLowerCase().includes(q))
      ) {
        results.push({ type: 'channel', entryId: entry.id, entryTitle: entry.title, matchText: entry.title, subtitle: entry.channel_type });
      }
      for (const ap of actionPoints[entry.channel_type] || []) {
        if (ap.text.toLowerCase().includes(q)) {
          results.push({ type: 'action-point', entryId: entry.id, entryTitle: entry.title, matchText: ap.text, subtitle: `${entry.title} · ${ap.category}` });
        }
      }
      for (const spec of specs[entry.id] || []) {
        if (spec.spec_text.toLowerCase().includes(q)) {
          results.push({ type: 'spec', entryId: entry.id, entryTitle: entry.title, matchText: spec.spec_text, subtitle: `${entry.title} · Spec` });
        }
      }
    }
    return results.slice(0, 12);
  }, [searchQuery, libraryEntries, actionPoints, specs]);

  const handleSearchResultClick = useCallback((result: SearchResult) => {
    setSearchQuery('');
    setShowSearchResults(false);
    // Switch to channels tab if needed
    setActiveTab('channels');
    setTimeout(() => {
      const el = cardRefs.current.get(result.entryId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedEntryId(result.entryId);
        setTimeout(() => setHighlightedEntryId(null), 1800);
      }
    }, 50);
  }, []);

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

  const loadPlaybooks = async () => {
    setPlaybooksLoading(true);
    try {
      const res = await fetch('/api/library/documents');
      if (res.ok) {
        const { documents } = await res.json();
        setPlaybookDocs(documents || []);
      }
    } catch (err) {
      console.error('Failed to load playbooks:', err);
    } finally {
      setPlaybooksLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'playbooks' && playbookDocs.length === 0 && !playbooksLoading) {
      loadPlaybooks();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handlePlaybookUpload = async () => {
    setPlaybookUploading(true);
    try {
      if (playbookUploadMode === 'text') {
        if (!playbookTextName.trim() || !playbookTextContent.trim()) return;
        const res = await fetch('/api/library/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_name: playbookTextName.trim(),
            doc_category: playbookCategory,
            text_content: playbookTextContent.trim(),
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Upload failed');
      } else {
        if (!playbookFile) return;
        const form = new FormData();
        form.append('file', playbookFile);
        form.append('doc_category', playbookCategory);
        const res = await fetch('/api/library/documents', { method: 'POST', body: form });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Upload failed');
      }
      setIsPlaybookDialogOpen(false);
      setPlaybookFile(null);
      setPlaybookTextName('');
      setPlaybookTextContent('');
      setPlaybookCategory('other');
      loadPlaybooks();
    } catch (err: any) {
      alert(err.message ?? 'Upload failed');
    } finally {
      setPlaybookUploading(false);
    }
  };

  const handleDeletePlaybook = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/library/documents/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setPlaybookDocs(prev => prev.filter(d => d.id !== id));
    } else {
      alert('Failed to delete document');
    }
  };

  const categoryLabel = (cat: string) =>
    PLAYBOOK_CATEGORIES.find(c => c.value === cat)?.label ?? cat;

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

    const isPlatformBrand =
      l.includes('meta') || l.includes('facebook') || l.includes('google') ||
      l.includes('linkedin') || l.includes('tiktok') || l.includes('instagram') ||
      l.includes('twitter') || l === 'x' || l.includes('x ads') || l.includes('x-ads') ||
      l.includes('youtube') || l.includes('snapchat') || l.includes('reddit') ||
      l.includes('pinterest');
    if (isPlatformBrand) {
      return getChannelLogo(channelType, className);
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

    if (l.includes('linear tv') || l.includes('linear-tv')) {
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Linear TV">
          <rect x="2" y="4" width="20" height="14" rx="2" stroke="#7C3AED" strokeWidth="2" fill="none"/>
          <rect x="5" y="7" width="14" height="8" rx="1" fill="#7C3AED" fillOpacity="0.15"/>
          <path d="M9 11l3-2v4l-3-2zM8 21h8M12 18v3" stroke="#7C3AED" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }

    if (l === 'svod') {
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="SVOD">
          <rect x="2" y="4" width="20" height="14" rx="2" stroke="#9333EA" strokeWidth="2" fill="none"/>
          <rect x="5" y="7" width="14" height="8" rx="1" fill="#9333EA" fillOpacity="0.15"/>
          <circle cx="12" cy="11" r="3" stroke="#9333EA" strokeWidth="1.5" fill="none"/>
          <path d="M10.5 11l1.5-1v2l-1.5-1zM8 21h8M12 18v3" stroke="#9333EA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }

    if (l === 'bvod') {
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="BVOD">
          <rect x="2" y="4" width="20" height="14" rx="2" stroke="#A855F7" strokeWidth="2" fill="none"/>
          <rect x="5" y="7" width="14" height="8" rx="1" fill="#A855F7" fillOpacity="0.15"/>
          <path d="M9 9l6 2-6 2V9z" stroke="#A855F7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M8 21h8M12 18v3" stroke="#A855F7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
  const serifFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', ...pageFont }}>
        <div style={{ textAlign: 'center', color: '#8A8578', fontSize: 17 }}>Loading...</div>
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
        {activeTab === 'playbooks' && (
          <Button onClick={() => setIsPlaybookDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Playbook
          </Button>
        )}
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

      {/* Search bar */}
      <div className="relative mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#A09890' }} />
          <input
            type="text"
            placeholder="Search channels, action points, specs…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowSearchResults(true); }}
            onFocus={() => setShowSearchResults(true)}
            onBlur={() => {
              searchBlurTimeout.current = setTimeout(() => setShowSearchResults(false), 180);
            }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); setShowSearchResults(false); } }}
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              borderRadius: 12,
              border: '1px solid rgba(232,228,220,0.9)',
              background: '#FDFCF8',
              fontSize: 16,
              color: '#1C1917',
              outline: 'none',
              boxShadow: showSearchResults && searchResults.length > 0 ? '0 2px 12px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
              transition: 'box-shadow 0.15s',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setShowSearchResults(false); }}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#A09890', background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {showSearchResults && searchQuery.trim() && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              background: '#FDFCF8',
              border: '1px solid rgba(232,228,220,0.9)',
              borderRadius: 14,
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              zIndex: 50,
              overflow: 'hidden',
              maxHeight: 380,
              overflowY: 'auto',
            }}
          >
            {searchResults.length === 0 ? (
              <div style={{ padding: '16px 16px', color: '#A09890', fontSize: 15 }}>No results for &ldquo;{searchQuery}&rdquo;</div>
            ) : (
              <>
                {searchResults.map((result, i) => (
                  <button
                    key={`${result.type}-${result.entryId}-${i}`}
                    onClick={() => handleSearchResultClick(result)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '10px 14px',
                      background: 'none',
                      border: 'none',
                      borderBottom: i < searchResults.length - 1 ? '1px solid rgba(232,228,220,0.5)' : 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F5F3EF')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <div style={{ flexShrink: 0, color: result.type === 'channel' ? '#6B7280' : result.type === 'action-point' ? '#7C3AED' : '#0891B2' }}>
                      {result.type === 'channel' && getChannelIcon(result.entryTitle, 'w-4 h-4')}
                      {result.type === 'action-point' && (
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                      {result.type === 'spec' && (
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M4 4V3M8 4V2M12 4V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, color: '#1C1917', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {result.matchText}
                      </div>
                      <div style={{ fontSize: 13, color: '#A09890', marginTop: 1 }}>{result.subtitle}</div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M8 4l3 3-3 3" stroke="#C4BEB6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 mb-6" style={{ background: '#EEECE8', padding: 4, borderRadius: 12, display: 'inline-flex' }}>
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
        <Button
          size="sm"
          variant={activeTab === 'playbooks' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('playbooks')}
          className="h-8 text-sm px-4"
        >
          Company Playbook
        </Button>
      </div>

      {activeTab === 'benchmarks' && <MetricsBenchmarksPanel />}

      {activeTab === 'playbooks' && (
        <div>
          {playbooksLoading ? (
            <div style={{ textAlign: 'center', color: '#8A8578', padding: '48px 0', fontSize: 17 }}>Loading...</div>
          ) : playbookDocs.length === 0 ? (
            <div
              style={{
                background: '#FDFCF8', border: '2px dashed rgba(196,168,130,0.4)', borderRadius: 18,
                padding: '48px 32px', textAlign: 'center',
              }}
            >
              <BookOpen style={{ width: 40, height: 40, margin: '0 auto 12px', color: '#C4A882' }} />
              <p style={{ color: '#8A8578', marginBottom: 16, fontSize: 17 }}>No playbooks uploaded yet</p>
              <Button onClick={() => setIsPlaybookDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload your first playbook
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {playbookDocs.map(doc => (
                <div
                  key={doc.id}
                  style={{
                    background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
                    padding: '20px 20px 16px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      flexShrink: 0, width: 36, height: 36, borderRadius: 10,
                      background: 'rgba(196,168,130,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FileText style={{ width: 18, height: 18, color: '#C4A882' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 16, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.file_name}
                      </div>
                      <div style={{ fontSize: 14, color: '#8A8578', marginTop: 2 }}>
                        {categoryLabel(doc.doc_category)}
                        {' · '}
                        {doc.is_text_doc ? 'Text' : 'File'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeletePlaybook(doc.id, doc.file_name)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C4BEB6', padding: 4, display: 'flex', borderRadius: 6 }}
                      title="Delete"
                    >
                      <Trash2 style={{ width: 15, height: 15 }} />
                    </button>
                  </div>

                  {doc.text_content && (
                    <div style={{
                      background: '#F5F3EF', borderRadius: 10, padding: '10px 12px',
                      fontSize: 14, color: '#6B6460', lineHeight: 1.6,
                      maxHeight: 80, overflow: 'hidden',
                      display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
                    }}>
                      {doc.text_content}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                    <span style={{ fontSize: 13, color: '#A09890' }}>
                      {new Date(doc.uploaded_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}
                      {doc.uploader_name}
                    </span>
                    {!doc.is_text_doc && doc.file_url && (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 13, color: '#C4A882', textDecoration: 'none', fontWeight: 500 }}
                      >
                        Download
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload Playbook Dialog */}
      <Dialog open={isPlaybookDialogOpen} onOpenChange={(open) => { setIsPlaybookDialogOpen(open); if (!open) { setPlaybookFile(null); setPlaybookTextName(''); setPlaybookTextContent(''); setPlaybookCategory('other'); } }}>
        <DialogContent style={{ maxWidth: 500 }}>
          <DialogHeader>
            <DialogTitle>Upload Playbook</DialogTitle>
            <DialogDescription>
              Add a process doc, SOP, or blueprint for your agency. The AI will reference it in chat.
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 4, background: '#EEECE8', padding: 4, borderRadius: 10, marginBottom: 4 }}>
            <button
              onClick={() => setPlaybookUploadMode('file')}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 500,
                background: playbookUploadMode === 'file' ? '#FDFCF8' : 'transparent',
                color: playbookUploadMode === 'file' ? '#1C1917' : '#8A8578',
                boxShadow: playbookUploadMode === 'file' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Upload File
            </button>
            <button
              onClick={() => setPlaybookUploadMode('text')}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 500,
                background: playbookUploadMode === 'text' ? '#FDFCF8' : 'transparent',
                color: playbookUploadMode === 'text' ? '#1C1917' : '#8A8578',
                boxShadow: playbookUploadMode === 'text' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Paste Text
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={playbookCategory} onValueChange={setPlaybookCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAYBOOK_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {playbookUploadMode === 'file' ? (
              <div
                ref={playbookDropRef}
                onDragOver={(e) => { e.preventDefault(); setPlaybookDragOver(true); }}
                onDragLeave={() => setPlaybookDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setPlaybookDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) setPlaybookFile(f);
                }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.pdf,.docx,.txt,.md,.csv';
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) setPlaybookFile(f);
                  };
                  input.click();
                }}
                style={{
                  border: `2px dashed ${playbookDragOver ? '#C4A882' : 'rgba(196,168,130,0.4)'}`,
                  borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
                  background: playbookDragOver ? 'rgba(196,168,130,0.07)' : '#FDFCF8',
                  transition: 'all 0.15s',
                }}
              >
                {playbookFile ? (
                  <div>
                    <FileText style={{ width: 28, height: 28, margin: '0 auto 8px', color: '#C4A882' }} />
                    <p style={{ fontSize: 15, color: '#1C1917', fontWeight: 500 }}>{playbookFile.name}</p>
                    <p style={{ fontSize: 13, color: '#A09890', marginTop: 2 }}>
                      {(playbookFile.size / 1024).toFixed(0)} KB · Click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <Upload style={{ width: 28, height: 28, margin: '0 auto 8px', color: '#C4A882' }} />
                    <p style={{ fontSize: 15, color: '#8A8578' }}>Drop a file here or click to browse</p>
                    <p style={{ fontSize: 13, color: '#A09890', marginTop: 4 }}>PDF, DOCX, TXT, MD, CSV · Max 50 MB</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Document Name</Label>
                  <Input
                    placeholder="e.g. Google Ads Onboarding Process"
                    value={playbookTextName}
                    onChange={(e) => setPlaybookTextName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea
                    placeholder="Paste your process doc, SOP, or notes here…"
                    value={playbookTextContent}
                    onChange={(e) => setPlaybookTextContent(e.target.value)}
                    rows={8}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPlaybookDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handlePlaybookUpload}
              disabled={
                playbookUploading ||
                (playbookUploadMode === 'file' ? !playbookFile : !playbookTextName.trim() || !playbookTextContent.trim())
              }
            >
              {playbookUploading ? 'Uploading…' : 'Save Playbook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeTab === 'channels' ? (libraryEntries.length === 0 ? (
        <Card style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)' }}>
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
              <div
                key={entry.id}
                ref={(el) => { if (el) cardRefs.current.set(entry.id, el); else cardRefs.current.delete(entry.id); }}
                style={{ borderRadius: 18, transition: 'box-shadow 0.3s, outline 0.3s', outline: highlightedEntryId === entry.id ? '2px solid #C4A882' : '2px solid transparent', outlineOffset: 2 }}
              >
              <Card className="transition-shadow" style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18, boxShadow: highlightedEntryId === entry.id ? '0 0 0 4px rgba(196,168,130,0.2), 0 4px 24px rgba(0,0,0,0.07)' : '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)' }}>
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
              </div>
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

