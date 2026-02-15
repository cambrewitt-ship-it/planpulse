'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Eye, Edit, Trash2, Download, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FunnelChart } from '@/components/funnel-chart';
import { FunnelBuilderModal } from '@/components/funnel-builder-modal';
import { FunnelConfig, FunnelStage, MediaPlanFunnel } from '@/lib/types/funnel';
import {
  CalculateFunnelResponse,
  ListFunnelsResponse,
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

export default function MediaPlanChannelPage() {
  const params = useParams();
  const router = useRouter();
  const channelId = params.id as string;

  const [funnels, setFunnels] = useState<MediaPlanFunnel[]>([]);
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
    loadFunnels();
  }, [channelId]);

  const loadFunnels = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/funnels?channelId=${channelId}`);
      const data: ListFunnelsResponse = await response.json();
      
      if (data.success && data.funnels) {
        setFunnels(data.funnels);
        
        // Auto-select first funnel if available
        if (data.funnels.length > 0 && !activeFunnelId) {
          setActiveFunnelId(data.funnels[0].id);
          await calculateFunnel(data.funnels[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load funnels:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateFunnel = async (funnelId: string, customStartDate?: string, customEndDate?: string) => {
    setIsCalculating(true);
    setActiveFunnelId(funnelId);
    
    try {
      const start = customStartDate || startDate;
      const end = customEndDate || endDate;
      
      const response = await fetch(
        `/api/funnels/${funnelId}/calculate?startDate=${start}&endDate=${end}`
      );
      const data: CalculateFunnelResponse = await response.json();
      
      if (data.success && data.funnel) {
        setCalculatedFunnel({
          config: data.funnel.config,
          stages: data.funnel.stages,
          totalCost: data.funnel.totalCost,
          dateRange: data.funnel.dateRange,
        });
      } else {
        console.error('Failed to calculate funnel:', data.error);
        alert(`Failed to calculate funnel: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to calculate funnel:', error);
      alert('Failed to calculate funnel. Please try again.');
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
          body: JSON.stringify({ name: config.name, config }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update funnel');
        }
      } else {
        // Create new funnel
        const response = await fetch('/api/funnels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId,
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
      await loadFunnels();
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
        await loadFunnels();
      } else {
        alert(`Failed to delete funnel: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to delete funnel:', error);
      alert('Failed to delete funnel. Please try again.');
    } finally {
      setDeletingFunnelId(null);
    }
  };

  const handleRecalculate = () => {
    if (activeFunnelId) {
      calculateFunnel(activeFunnelId, startDate, endDate);
    }
  };

  const handleDownloadPNG = async () => {
    const chartElement = document.getElementById('funnel-chart-container');
    if (!chartElement) return;
    
    try {
      const canvas = await html2canvas(chartElement, {
        backgroundColor: '#ffffff',
        scale: 2,
      });
      
      const link = document.createElement('a');
      link.download = `funnel-${calculatedFunnel?.config.name || 'chart'}-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Failed to download chart:', error);
      alert('Failed to download chart. Please try again.');
    }
  };

  const handleCopyToClipboard = () => {
    if (!calculatedFunnel) return;
    
    let text = `${calculatedFunnel.config.name}\n`;
    text += `Period: ${calculatedFunnel.dateRange.startDate} to ${calculatedFunnel.dateRange.endDate}\n`;
    text += `Total Spend: $${calculatedFunnel.totalCost.toFixed(2)}\n\n`;
    text += 'Funnel Stages:\n';
    text += '-'.repeat(80) + '\n';
    
    calculatedFunnel.stages.forEach((stage, i) => {
      text += `\n${i + 1}. ${stage.displayName}\n`;
      text += `   Value: ${stage.value.toLocaleString()}\n`;
      if (stage.conversionRate !== undefined) {
        text += `   Conversion Rate: ${stage.conversionRate.toFixed(2)}%\n`;
      }
      if (stage.costPerAction !== undefined) {
        text += `   Cost per Action: $${stage.costPerAction.toFixed(2)}\n`;
      }
      text += `   Source: ${stage.source}\n`;
    });
    
    navigator.clipboard.writeText(text);
    alert('Funnel metrics copied to clipboard!');
  };

  const calculateOverallConversion = (stages: FunnelStage[]): number => {
    if (stages.length < 2) return 0;
    const first = stages[0].value;
    const last = stages[stages.length - 1].value;
    return first > 0 ? (last / first) * 100 : 0;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Conversion Funnels</h1>
              <p className="text-slate-600 mt-1">
                Track your marketing performance across platforms
              </p>
            </div>
            
            <Button onClick={() => {
              setEditingFunnel(null);
              setIsBuilderOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Create Funnel
            </Button>
          </div>
        </div>

        {loading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-slate-500">Loading funnels...</p>
            </CardContent>
          </Card>
        ) : funnels.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-slate-500 mb-4">No funnels yet</p>
              <Button onClick={() => setIsBuilderOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Funnel
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={activeFunnelId || funnels[0]?.id} onValueChange={setActiveFunnelId}>
            <TabsList className="mb-6">
              {funnels.map((funnel) => (
                <TabsTrigger key={funnel.id} value={funnel.id}>
                  {funnel.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {funnels.map((funnel) => (
              <TabsContent key={funnel.id} value={funnel.id}>
                {/* Funnel Management Card */}
                <Card className="mb-6">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{funnel.name}</CardTitle>
                        <CardDescription>
                          {funnel.config.stages.length} stages •{' '}
                          {calculatedFunnel && activeFunnelId === funnel.id
                            ? `${calculateOverallConversion(calculatedFunnel.stages).toFixed(2)}% overall conversion`
                            : 'Not calculated yet'}
                        </CardDescription>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingFunnel(funnel);
                            setIsBuilderOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeletingFunnelId(funnel.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Date Range Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
                      <div className="flex items-end">
                        <Button
                          onClick={handleRecalculate}
                          disabled={isCalculating}
                          className="w-full"
                        >
                          <RefreshCw className={`h-4 w-4 mr-2 ${isCalculating ? 'animate-spin' : ''}`} />
                          {isCalculating ? 'Calculating...' : 'Recalculate'}
                        </Button>
                      </div>
                    </div>

                    {/* Export Actions */}
                    {calculatedFunnel && activeFunnelId === funnel.id && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadPNG}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download as PNG
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyToClipboard}
                        >
                          Copy to Clipboard
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Funnel Chart */}
                {isCalculating ? (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-slate-400" />
                      <p className="text-slate-500">Calculating funnel metrics...</p>
                      <p className="text-sm text-slate-400 mt-2">
                        Fetching data from Meta, Google Ads, and GA4
                      </p>
                    </CardContent>
                  </Card>
                ) : calculatedFunnel && activeFunnelId === funnel.id ? (
                  <div id="funnel-chart-container">
                    <FunnelChart
                      funnelStages={calculatedFunnel.stages}
                      totalCost={calculatedFunnel.totalCost}
                      dateRange={calculatedFunnel.dateRange}
                    />
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <p className="text-slate-500 mb-4">
                        Click "Recalculate" to load funnel data
                      </p>
                      <Button
                        onClick={() => calculateFunnel(funnel.id)}
                        variant="outline"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Funnel
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Funnel Builder Modal */}
        <FunnelBuilderModal
          open={isBuilderOpen}
          onOpenChange={(open) => {
            setIsBuilderOpen(open);
            if (!open) setEditingFunnel(null);
          }}
          onSave={handleSaveFunnel}
          initialConfig={editingFunnel?.config || null}
          channelId={channelId}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingFunnelId} onOpenChange={() => setDeletingFunnelId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Funnel?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the funnel
                and all its configuration.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingFunnelId && handleDeleteFunnel(deletingFunnelId)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
