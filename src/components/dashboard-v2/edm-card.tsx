'use client';

import { useState } from 'react';
import { Mail, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';
import type { EdmActual } from '@/types/database';
import { format, subDays } from 'date-fns';
import InlineActionPoints from './inline-action-points';

interface EdmCardProps {
  channel: MediaPlanChannel;
  clientId: string;
  actuals: EdmActual[];
}

function getFrequencyLabel(sendFrequency: string | undefined): string {
  if (!sendFrequency) return 'Not set';
  if (sendFrequency.startsWith('custom:')) {
    const count = sendFrequency.split(':')[1];
    return `${count} sends/month`;
  }
  const labels: Record<string, string> = {
    weekly: 'Weekly',
    fortnightly: 'Fortnightly',
    monthly: 'Monthly',
  };
  return labels[sendFrequency] || sendFrequency;
}

function calculateOnTrackStatus(sendFrequency: string | undefined, actuals: EdmActual[], channelName: string): {
  status: 'on-track' | 'behind' | 'not-set';
  message: string;
} {
  if (!sendFrequency) {
    return { status: 'not-set', message: 'Frequency not set' };
  }

  const thirtyDaysAgo = subDays(new Date(), 30);
  const recentSends = actuals.filter(a => {
    const sendDate = new Date(a.send_date);
    return sendDate >= thirtyDaysAgo && a.channel_name === channelName;
  });

  if (sendFrequency === 'weekly') {
    const expected = 4; // ~4 weeks in 30 days
    if (recentSends.length >= expected) {
      return { status: 'on-track', message: `On track (${recentSends.length} sends in last 30 days)` };
    }
    return { status: 'behind', message: `Behind (${recentSends.length}/${expected} sends)` };
  }

  if (sendFrequency === 'fortnightly') {
    const expected = 2;
    if (recentSends.length >= expected) {
      return { status: 'on-track', message: `On track (${recentSends.length} sends in last 30 days)` };
    }
    return { status: 'behind', message: `Behind (${recentSends.length}/${expected} sends)` };
  }

  if (sendFrequency === 'monthly') {
    const expected = 1;
    if (recentSends.length >= expected) {
      return { status: 'on-track', message: `On track (${recentSends.length} sends in last 30 days)` };
    }
    return { status: 'behind', message: `Behind (${recentSends.length}/${expected} sends)` };
  }

  if (sendFrequency.startsWith('custom:')) {
    const expected = parseInt(sendFrequency.split(':')[1], 10);
    if (recentSends.length >= expected) {
      return { status: 'on-track', message: `On track (${recentSends.length} sends in last 30 days)` };
    }
    return { status: 'behind', message: `Behind (${recentSends.length}/${expected} sends)` };
  }

  return { status: 'not-set', message: 'Frequency not recognized' };
}

export default function EdmCard({ channel, clientId, actuals }: EdmCardProps) {
  const [isLogging, setIsLogging] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [sendDate, setSendDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [subject, setSubject] = useState('');

  const channelActuals = actuals
    .filter(a => a.channel_name === channel.channelName)
    .sort((a, b) => new Date(b.send_date).getTime() - new Date(a.send_date).getTime())
    .slice(0, 3);

  const frequencyLabel = getFrequencyLabel(channel.sendFrequency);
  const trackStatus = calculateOnTrackStatus(channel.sendFrequency, actuals, channel.channelName);

  const handleLogSend = async () => {
    if (!sendDate) return;

    setIsLogging(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/edm-actuals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_name: channel.channelName,
          send_date: sendDate,
          subject: subject || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to log send');
      }

      // Reset form
      setSendDate(format(new Date(), 'yyyy-MM-dd'));
      setSubject('');
      setShowLogForm(false);
      
      // Refresh would be handled by parent component refetching actuals
      window.location.reload(); // Simple refresh for now
    } catch (error) {
      console.error('Error logging EDM send:', error);
    } finally {
      setIsLogging(false);
    }
  };

  const statusColor = trackStatus.status === 'on-track' 
    ? 'bg-emerald-100 text-emerald-700'
    : trackStatus.status === 'behind'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-gray-100 text-gray-700';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-purple-100 text-purple-600">
            <Mail className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-900 truncate">EDM / Email</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                {trackStatus.status === 'on-track' ? '🟢' : trackStatus.status === 'behind' ? '🟡' : '⚪'} {trackStatus.message}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Frequency: {frequencyLabel}</p>
          </div>
        </div>

        {/* Recent sends */}
        {channelActuals.length > 0 && (
          <div className="mt-3 space-y-1">
            <label className="text-xs text-gray-600 font-medium">Recent Sends</label>
            <div className="space-y-1">
              {channelActuals.map((actual) => (
                <div key={actual.id} className="text-xs text-gray-600 flex items-center justify-between py-1 px-2 bg-gray-50 rounded">
                  <span>{format(new Date(actual.send_date), 'MMM d, yyyy')}</span>
                  {actual.subject && (
                    <span className="text-gray-500 truncate ml-2">{actual.subject}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Log a send button */}
        <div className="mt-3">
          {!showLogForm ? (
            <Button
              onClick={() => setShowLogForm(true)}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Plus className="w-3 h-3 mr-1" />
              Log a send
            </Button>
          ) : (
            <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <Label htmlFor="send-date" className="text-xs">Date</Label>
                <Input
                  id="send-date"
                  type="date"
                  value={sendDate}
                  onChange={(e) => setSendDate(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label htmlFor="subject" className="text-xs">Subject (optional)</Label>
                <Input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject line"
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleLogSend}
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  disabled={isLogging}
                >
                  {isLogging ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  onClick={() => {
                    setShowLogForm(false);
                    setSendDate(format(new Date(), 'yyyy-MM-dd'));
                    setSubject('');
                  }}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Points */}
      <InlineActionPoints
        channelType="EDM / Email"
        clientId={clientId}
        maxVisible={3}
      />
    </div>
  );
}
