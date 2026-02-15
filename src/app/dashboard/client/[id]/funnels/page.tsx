'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Eye, Edit, Trash2, Download, RefreshCw, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FunnelChart } from '@/components/funnel-chart';
import { FunnelBuilderModal } from '@/components/funnel-builder-modal';
import { FunnelConfig, FunnelStage, MediaPlanFunnel } from '@/lib/types/funnel';
import {
  CalculateFunnelResponse,
  DeleteFunnelResponse,
} from '@/lib/types/funnel-api';
import { formatDistanceToNow } from 'date-fns';
import html2canvas from 'html2canvas';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MediaChannel {
  id: string;
  name: string;
  platform: string;
}

export default function ClientFunnelsPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [channels, setChannels] = useState<MediaChannel[]>([]);
  const [allFunnels, setAllFunnels] = useState<MediaPlanFunnel[]>([]);
  const [filteredFunnels, setFilteredFunnels] = useState<MediaPlanFunnel[]>([]);
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [activeFunnelId, setActiveFunnelId] = useState<string | null>(null);
  const [calculatedFunnel, setCalculatedFunnel] = useState<{
    config: FunnelConfig;
    stages: FunnelStage[];
    totalCost: number;
    dateRange: { startDate: string; endDate: string };
  } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingFunnel, setEditingFunnel] = useState<MediaPlanFunnel | null>(null);
  const [deletingFunnelId, setDeletingFunnelId] = useState<string | null>(null);
  
  // Date range for calculation
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  useEffect(() => {
    loadChannelsAndFunnels();
  }, [clientId]);

  useEffect(() => {
    // Filter funnels when channel filter changes
    if (selectedChannelFilter === 'all') {
      setFilteredFunnels(allFunnels);
    } else {
      setFilteredFunnels(allFunnels.filter(f => f.channelId === selectedChannelFilter));
    }
  }, [selectedChannelFilter, allFunnels]);

  const loadChannelsAndFunnels = async () => {
    setLoading(true);
    try {
      // Load all media channels for this client
      const channelsResponse = await fetch(`/api/media-plan/channels?clientId=${clientId}`);
      const channelsData = await channelsResponse.json();
      
      if (channelsData.success && channelsData.channels) {
        setChannels(channelsData.channels);

        // Load funnels for all channels
        const funnelsPromises = channelsData.channels.map((channel: MediaChannel) =>
          fetch(`/api/funnels?channelId=${channel.id}`).then(r => r.json())
        );

        const funnelsResults = await Promise.all(funnelsPromises);
        const allFunnelsData: MediaPlanFunnel[] = [];

        funnelsResults.forEach((result) => {
          if (result.success && result.funnels) {
            allFunnelsData.push(...result.funnels);
          }
        });

        setAllFunnels(allFunnelsData);
        setFilteredFunnels(allFunnelsData);

        // Auto-select first funnel if available
        if (allFunnelsData.length > 0 && !activeFunnelId) {
          setActiveFunnelId(allFunnelsData[0].id);
          await calculateFunnel(allFunnelsData[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load channels and funnels:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateFunnel = async (funnelId: string) => {
    setIsCalculating(true);
    try {
      const response = await fetch(
        `/api/funnels/${funnelId}/calculate?startDate=${startDate}&endDate=${endDate}`
      );
      const data: CalculateFunnelResponse = await response.json();
      
      if (data.success) {
        setCalculatedFunnel({
          config: data.config,
          stages: data.stages,
          totalCost: data.totalCost,
          dateRange: { startDate, endDate },
        });
      }
    } catch (error) {
      console.error('Failed to calculate funnel:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSaveFunnel = async (config: FunnelConfig) => {
    try {
      if (editingFunnel) {
        // Update existing funnel
        const response = await fetch(`/api/funnels/${editingFunnel.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: config.name,
            config,
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error || errorData.details || 'Failed to update funnel';
          console.error('API Error:', errorMessage, errorData);
          throw new Error(errorMessage);
        }
      } else {
        // Create new funnel
        const response = await fetch('/api/funnels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: config.channelId,
            name: config.name,
            config,
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error || errorData.details || 'Failed to create funnel';
          console.error('API Error:', errorMessage, errorData);
          throw new Error(errorMessage);
        }
      }
      
      // Reload funnels
      await loadChannelsAndFunnels();
      setEditingFunnel(null);
    } catch (error) {
      console.error('Failed to save funnel:', error);
      throw error;
    }
  };

  const handleDeleteFunnel = async (funnelId: string) => {
    try {
      const response = await fetch(`/api/funnels/${funnelId}`, {
        method: 'DELETE',
      });
      
      const data: DeleteFunnelResponse = await response.json();
      
      if (data.success) {
        // Clear active funnel if it was deleted
        if (activeFunnelId === funnelId) {
          setActiveFunnelId(null);
          setCalculatedFunnel(null);
        }
        
        // Reload funnels
        await loadChannelsAndFunnels();
      }
    } catch (error) {
      console.error('Failed to delete funnel:', error);
    }
  };

  const handleViewFunnelDetails = async (funnelId: string) => {
    setActiveFunnelId(funnelId);
    await calculateFunnel(funnelId);
  };

  const handleRecalculate = async () => {
    if (activeFunnelId) {
      await calculateFunnel(activeFunnelId);
    }
  };

  const handleExportPNG = async () => {
    const chartElement = document.getElementById('funnel-chart');
    if (chartElement) {
      const canvas = await html2canvas(chartElement);
      const link = document.createElement('a');
      link.download = `funnel-${activeFunnelId}-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  const handleCopyToClipboard = () => {
    if (!calculatedFunnel) return;
    
    const text = calculatedFunnel.stages
      .map(
        (stage, idx) =>
          `${idx + 1}. ${stage.displayName}: ${stage.value.toLocaleString()} ${
            stage.conversionRate ? `(${stage.conversionRate.toFixed(2)}% conversion)` : ''
          }`
      )
      .join('\n');
    
    navigator.clipboard.writeText(text);
  };

  const getChannelName = (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    return channel ? channel.name : 'Unknown Channel';
  };

  const getChannelPlatform = (channelId: string) => {
    const channel = channels.find(c => c.id === channelId);
    return channel ? channel.platform : '';
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">Conversion Funnels</h1>
        </div>
        <p>Loading funnels...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">Conversion Funnels</h1>
        </div>
        <Button onClick={() => {
          setEditingFunnel(null);
          setIsBuilderOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Create Funnel
        </Button>
      </div>

      {/* Channel Filter */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Filter className="h-5 w-5 text-muted-foreground" />
            <Label htmlFor="channel-filter">Filter by Channel:</Label>
            <Select value={selectedChannelFilter} onValueChange={setSelectedChannelFilter}>
              <SelectTrigger id="channel-filter" className="w-[300px]">
                <SelectValue placeholder="All Channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                {channels.map(channel => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name} ({channel.platform})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary">
              {filteredFunnels.length} {filteredFunnels.length === 1 ? 'funnel' : 'funnels'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funnels List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Your Funnels</CardTitle>
              <CardDescription>
                {filteredFunnels.length === 0 ? 'No funnels yet' : `${filteredFunnels.length} total`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredFunnels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Create your first funnel to track conversions across channels.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredFunnels.map((funnel) => (
                    <Card
                      key={funnel.id}
                      className={`cursor-pointer transition-colors ${
                        activeFunnelId === funnel.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-primary/50'
                      }`}
                      onClick={() => handleViewFunnelDetails(funnel.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold">{funnel.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {getChannelName(funnel.channelId)}
                            </p>
                            <Badge variant="outline" className="mt-2">
                              {getChannelPlatform(funnel.channelId)}
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-2">
                              {funnel.config.stages.length} stages
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Updated {formatDistanceToNow(new Date(funnel.updatedAt))} ago
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingFunnel(funnel);
                                setIsBuilderOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingFunnelId(funnel.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Funnel Details / Chart */}
        <div className="lg:col-span-2">
          {activeFunnelId && calculatedFunnel ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{calculatedFunnel.config.name}</CardTitle>
                    <CardDescription>
                      {getChannelName(calculatedFunnel.config.channelId)}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRecalculate}
                      disabled={isCalculating}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isCalculating ? 'animate-spin' : ''}`} />
                      Recalculate
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportPNG}>
                      <Download className="h-4 w-4 mr-2" />
                      PNG
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCopyToClipboard}>
                      Copy
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Date Range Selector */}
                <div className="grid grid-cols-2 gap-4 mb-6">
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

                {/* Funnel Chart */}
                <div id="funnel-chart">
                  <FunnelChart
                    funnelStages={calculatedFunnel.stages}
                    totalCost={calculatedFunnel.totalCost}
                    dateRange={calculatedFunnel.dateRange}
                    isLoading={isCalculating}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-[400px]">
                <div className="text-center">
                  <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Select a funnel to view details
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Funnel Builder Modal */}
      <FunnelBuilderModal
        isOpen={isBuilderOpen}
        onClose={() => {
          setIsBuilderOpen(false);
          setEditingFunnel(null);
        }}
        onSave={handleSaveFunnel}
        initialConfig={editingFunnel?.config}
        availableChannels={channels}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingFunnelId} onOpenChange={() => setDeletingFunnelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Funnel</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this funnel? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingFunnelId) {
                  handleDeleteFunnel(deletingFunnelId);
                  setDeletingFunnelId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
