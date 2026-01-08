'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { User, Pencil, Check, X } from 'lucide-react';
import RollingCalendar from '@/components/RollingCalendar';
import MediaChannels from '@/components/MediaChannels';
import { MediaPlanGrid, MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';
import { useParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { getClients, getMediaPlans, getPlanById, updateClient } from '@/lib/db/plans';
import PlanEditForm from '@/components/plan-entry/PlanEditForm';
import AdPlatformConnector from '@/components/AdPlatformConnector';
import { UnifiedAnalyticsChart } from '@/components/ui/unified-analytics-chart';
import { fetchAnalyticsData, GA4DataPoint, SpendDataPoint } from '@/lib/api/analytics-data-integration';
import { subDays, format } from 'date-fns';

interface Client {
  id: string;
  name: string;
  notes?: string | null;
}

interface MediaPlan {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  total_budget: number;
  status: string;
  channels?: any[];
}

export default function NewClientDashboard() {
  const params = useParams();
  const clientId = params.id as string;
  
  const [client, setClient] = useState<Client | null>(null);
  const [plans, setPlans] = useState<MediaPlan[]>([]);
  const [activePlan, setActivePlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [mediaPlanBuilderChannels, setMediaPlanBuilderChannels] = useState<MediaPlanChannel[]>([]);
  const [commission, setCommission] = useState<number>(0);
  const [isLoadingMediaPlanBuilder, setIsLoadingMediaPlanBuilder] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const [isEditingClientName, setIsEditingClientName] = useState(false);
  const [editingClientName, setEditingClientName] = useState('');
  const [isSavingClientName, setIsSavingClientName] = useState(false);
  const [isEditingClientNotes, setIsEditingClientNotes] = useState(false);
  const [editingClientNotes, setEditingClientNotes] = useState('');
  const [isSavingClientNotes, setIsSavingClientNotes] = useState(false);
  const [ga4Data, setGa4Data] = useState<GA4DataPoint[]>([]);
  const [spendData, setSpendData] = useState<SpendDataPoint[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);
  const [ga4Error, setGa4Error] = useState<string | undefined>();
  const [ga4ActivationUrl, setGa4ActivationUrl] = useState<string | undefined>();
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    'activeUsers',    // Active users
    'eventCount',     // Total events
    'conversions',    // Key events (conversions)
  ]);
  const [analyticsDateRange, setAnalyticsDateRange] = useState({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    if (clientId) {
      loadData();
      loadMediaPlanBuilderData();
      loadAnalyticsData();
    }
  }, [clientId]);

  // Reload analytics when date range changes
  useEffect(() => {
    if (clientId && selectedMetrics.length > 0) {
      loadAnalyticsData(selectedMetrics);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsDateRange.startDate, analyticsDateRange.endDate, clientId]);

  const loadData = async () => {
    try {
      // Load client
      const clients = await getClients();
      const foundClient = clients?.find((c: Client) => c.id === clientId);
      setClient(foundClient || null);

      // Load plans for this client
      const clientPlans = await getMediaPlans(clientId);
      setPlans(clientPlans || []);

      // Find active plan and load its full data
      const activePlanData = clientPlans?.find((p: MediaPlan) => p.status?.toLowerCase() === 'active');
      if (activePlanData) {
        const fullPlanData = await getPlanById(activePlanData.id);
        setActivePlan(fullPlanData);
      } else {
        setActivePlan(null);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditPlan = async (planId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoadingPlan(true);
    try {
      const planData = await getPlanById(planId);
      setEditingPlan(planData);
    } catch (error) {
      console.error('Error loading plan:', error);
      alert('Error loading plan. Please try again.');
    } finally {
      setLoadingPlan(false);
    }
  };

  const handleClosePlanEdit = () => {
    setEditingPlan(null);
  };

  const handlePlanSaved = () => {
    loadData(); // Reload plans after save
  };

  const handleStartEditClientName = () => {
    if (client) {
      setEditingClientName(client.name);
      setIsEditingClientName(true);
    }
  };

  const handleSaveClientName = async () => {
    if (!client || !editingClientName.trim()) {
      return;
    }

    try {
      setIsSavingClientName(true);
      await updateClient(client.id, editingClientName.trim(), client.notes || null);
      setClient({ ...client, name: editingClientName.trim() });
      setIsEditingClientName(false);
    } catch (error) {
      console.error('Error updating client name:', error);
      alert('Failed to update client name. Please try again.');
    } finally {
      setIsSavingClientName(false);
    }
  };

  const handleCancelEditClientName = () => {
    setIsEditingClientName(false);
    setEditingClientName('');
  };

  const handleStartEditClientNotes = () => {
    if (client) {
      setEditingClientNotes(client.notes || '');
      setIsEditingClientNotes(true);
    }
  };

  const handleSaveClientNotes = async () => {
    if (!client) {
      return;
    }

    try {
      setIsSavingClientNotes(true);
      await updateClient(client.id, client.name, editingClientNotes.trim() || null);
      setClient({ ...client, notes: editingClientNotes.trim() || null });
      setIsEditingClientNotes(false);
    } catch (error) {
      console.error('Error updating client notes:', error);
      alert('Failed to update client notes. Please try again.');
    } finally {
      setIsSavingClientNotes(false);
    }
  };

  const handleCancelEditClientNotes = () => {
    setIsEditingClientNotes(false);
    setEditingClientNotes('');
  };

  // Load media plan builder data from the API
  const loadMediaPlanBuilderData = async () => {
    if (!clientId) return;
    
    setIsLoadingMediaPlanBuilder(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/media-plan-builder`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to load media plan builder data:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        // If there's an error, just start with empty state
        return;
      }
      const result = await response.json();
      
      if (result.data) {
        console.log('Loaded media plan builder data:', {
          channelsCount: result.data.channels?.length || 0,
          commission: result.data.commission,
          channels: result.data.channels
        });
        
        // Ensure flights have proper Date objects
        const processedChannels = (result.data.channels || []).map((channel: any) => ({
          ...channel,
          flights: (channel.flights || []).map((flight: any) => ({
            ...flight,
            startWeek: flight.startWeek ? new Date(flight.startWeek) : new Date(),
            endWeek: flight.endWeek ? new Date(flight.endWeek) : new Date(),
          })),
        }));
        
        setMediaPlanBuilderChannels(processedChannels);
        setCommission(result.data.commission || 0);
      }
    } catch (error) {
      console.error('Error loading media plan builder data:', error);
      // If there's an error, just start with empty state
    } finally {
      setIsLoadingMediaPlanBuilder(false);
      isInitialLoadRef.current = false;
    }
  };

  // Save media plan builder data to the API
  const saveMediaPlanBuilderData = async (channels: MediaPlanChannel[], commission: number) => {
    if (!clientId || isInitialLoadRef.current) return;
    
    try {
      // Serialize dates to ISO strings before sending
      const serializedChannels = channels.map(channel => ({
        ...channel,
        flights: (channel.flights || []).map((flight: any) => ({
          ...flight,
          startWeek: flight.startWeek instanceof Date 
            ? flight.startWeek.toISOString() 
            : (typeof flight.startWeek === 'string' ? flight.startWeek : new Date().toISOString()),
          endWeek: flight.endWeek instanceof Date 
            ? flight.endWeek.toISOString() 
            : (typeof flight.endWeek === 'string' ? flight.endWeek : new Date().toISOString()),
        })),
      }));

      const response = await fetch(`/api/clients/${clientId}/media-plan-builder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channels: serializedChannels,
          commission,
        }),
      });
      
      if (!response.ok) {
        let errorData: any = {};
        let responseText = '';
        try {
          responseText = await response.clone().text();
          if (responseText) {
            errorData = JSON.parse(responseText);
          }
        } catch (e) {
          // Response is not JSON
          errorData = { rawResponse: responseText || 'Empty response' };
        }
        
        console.error('Failed to save media plan builder data:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          responseText: responseText.substring(0, 500), // First 500 chars
          url: `/api/clients/${clientId}/media-plan-builder`,
          headers: Object.fromEntries(response.headers.entries())
        });
        // Don't throw - just log the error so auto-save doesn't break the UI
        return;
      }
      
      console.log('Media plan builder data saved successfully');
    } catch (error) {
      console.error('Error saving media plan builder data:', error);
    }
  };

  // Auto-save media plan builder data with debouncing
  useEffect(() => {
    // Skip auto-save on initial load
    if (isInitialLoadRef.current || isLoadingMediaPlanBuilder) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout to save after 1 second of no changes
    saveTimeoutRef.current = setTimeout(() => {
      saveMediaPlanBuilderData(mediaPlanBuilderChannels, commission);
    }, 1000);

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [mediaPlanBuilderChannels, commission, clientId, isLoadingMediaPlanBuilder]);

  // Wrapper to update channels and trigger auto-save
  const handleChannelsChange = (channels: MediaPlanChannel[]) => {
    setMediaPlanBuilderChannels(channels);
  };

  // Wrapper to update commission and trigger auto-save
  const handleCommissionChange = (value: number) => {
    setCommission(value);
  };

  // Load analytics data (GA4 + Spend)
  const loadAnalyticsData = async (metricsToFetch?: string[]) => {
    if (!clientId) return;
    
    setLoadingAnalytics(true);
    try {
      // Use provided metrics or default set
      const metrics = metricsToFetch || selectedMetrics.length > 0 
        ? selectedMetrics 
        : [
            'activeUsers',
            'conversions',
            'totalUsers',
            'sessions',
            'screenPageViews',
            'eventCount',
          ];

      const result = await fetchAnalyticsData({
        startDate: analyticsDateRange.startDate,
        endDate: analyticsDateRange.endDate,
        clientId: clientId,
        includeSpendData: true,
        metrics: metrics,
      });

      console.log('📊 Analytics data result:', {
        ga4DataLength: result.ga4Data?.length || 0,
        spendDataLength: result.spendData?.length || 0,
        ga4DataSample: result.ga4Data?.[0],
        ga4DataKeys: result.ga4Data?.[0] ? Object.keys(result.ga4Data[0]) : [],
        spendDataSample: result.spendData?.[0],
        requestedMetrics: metrics,
        errors: result.errors,
        ga4Error: result.ga4Error,
        ga4ErrorDetails: result.ga4ErrorDetails,
        ga4ActivationUrl: result.ga4ActivationUrl,
        fullResult: result,
      });
      
      // Check for GA4 API errors
      if (result.ga4Error) {
        setGa4Error(result.ga4Error);
        setGa4ActivationUrl(result.ga4ActivationUrl);
        setGa4Data([]);
        setSpendData(result.spendData || []);
        return; // Don't process further
      } else {
        setGa4Error(undefined);
        setGa4ActivationUrl(undefined);
      }
      
      if (result.errors && result.errors.length > 0) {
        const apiError = result.errors.find((e: string) => 
          e.includes('not enabled') || 
          e.includes('SERVICE_DISABLED') ||
          e.includes('has not been used')
        );
        
        if (apiError) {
          console.error('GA4 API not enabled error:', apiError);
          setGa4Error(apiError);
          setGa4Data([]);
          setSpendData(result.spendData || []);
          return; // Don't process further
        }
      }
      
      if (!result.ga4Data || result.ga4Data.length === 0) {
        console.error('No GA4 data returned!', {
          result,
          metrics,
          dateRange: analyticsDateRange,
        });
      }

      setGa4Data(result.ga4Data || []);
      
      // Enhance spend data with plan information
      const enhancedSpendData = (result.spendData || []).map(point => {
        // Try to match spend data to active plan based on date range
        const matchingPlan = plans.find(plan => {
          if (plan.status?.toLowerCase() !== 'active') return false;
          const planStart = new Date(plan.start_date);
          const planEnd = new Date(plan.end_date);
          const pointDate = new Date(point.date);
          return pointDate >= planStart && pointDate <= planEnd;
        });
        
        return {
          ...point,
          planId: matchingPlan?.id,
          planName: matchingPlan?.name,
        };
      });
      
      setSpendData(enhancedSpendData);

      // Update available metrics from the response
      if (result.ga4Data && result.ga4Data.length > 0) {
        const metricsInData = new Set<string>();
        result.ga4Data[0] && Object.keys(result.ga4Data[0]).forEach(key => {
          if (key !== 'date') {
            metricsInData.add(key);
          }
        });
        const newAvailableMetrics = Array.from(metricsInData);
        console.log('Available metrics from data:', newAvailableMetrics);
        setAvailableMetrics(newAvailableMetrics);
        
        // Ensure selected metrics that are in data are kept
        const validSelectedMetrics = selectedMetrics.filter(m => 
          newAvailableMetrics.includes(m) || metrics.includes(m)
        );
        if (validSelectedMetrics.length !== selectedMetrics.length) {
          setSelectedMetrics(validSelectedMetrics);
        }
      } else {
        console.warn('No GA4 data returned');
      }

      if (result.errors && result.errors.length > 0) {
        console.warn('Analytics data loading warnings:', result.errors);
      }
    } catch (error) {
      console.error('Error loading analytics data:', error);
      // Don't show error to user, just log it
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // Handle adding a new metric
  const handleAddMetric = async (metric: string) => {
    if (selectedMetrics.includes(metric)) {
      return; // Already selected
    }

    // Add to selected metrics first
    const newMetrics = [...selectedMetrics, metric];
    setSelectedMetrics(newMetrics);
    
    // Then fetch data with the new metric
    await loadAnalyticsData(newMetrics);
  };

  // Handle metrics change from chart
  const handleMetricsChange = (metrics: string[]) => {
    setSelectedMetrics(metrics);
    if (metrics.length > 0) {
      loadAnalyticsData(metrics);
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-[#f8fafc] font-sans flex items-center justify-center">
        <p className="text-[#64748b]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#f8fafc] font-sans">
      <div className="container mx-auto max-w-7xl px-4 py-8">
        {/* Header Section */}
        <header role="banner" aria-label="Client dashboard header">
          <Card className="bg-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ease-in-out">
            <CardContent className="py-6">
              <div className="flex items-start gap-4">
                  {/* Circular Avatar */}
                  <div 
                    className="flex-shrink-0 w-14 h-14 rounded-full bg-[#e2e8f0] flex items-center justify-center"
                    role="img"
                    aria-label="Client avatar placeholder"
                  >
                    <User className="w-8 h-8 text-[#64748b]" />
                  </div>
                  
                  {/* Client Info */}
                  <div className="flex-1">
                    {isEditingClientName ? (
                      <div className="flex items-center gap-2 mb-1">
                        <Input
                          value={editingClientName}
                          onChange={(e) => setEditingClientName(e.target.value)}
                          className="text-3xl font-bold h-auto py-1 px-2"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveClientName();
                            } else if (e.key === 'Escape') {
                              handleCancelEditClientName();
                            }
                          }}
                          disabled={isSavingClientName}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleSaveClientName}
                          disabled={isSavingClientName || !editingClientName.trim()}
                          className="h-8 w-8"
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleCancelEditClientName}
                          disabled={isSavingClientName}
                          className="h-8 w-8"
                        >
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <h1 className="text-3xl font-bold text-[#0f172a] mb-1">
                          {client?.name || 'Client Name'}
                        </h1>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleStartEditClientName}
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Edit client name"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {isEditingClientNotes ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={editingClientNotes}
                          onChange={(e) => setEditingClientNotes(e.target.value)}
                          placeholder="Add notes about this client..."
                          className="text-sm md:text-base min-h-[80px]"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              handleCancelEditClientNotes();
                            }
                          }}
                          disabled={isSavingClientNotes}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleSaveClientNotes}
                            disabled={isSavingClientNotes}
                            className="h-7 text-xs"
                          >
                            <Check className="h-3 w-3 mr-1 text-green-600" />
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCancelEditClientNotes}
                            disabled={isSavingClientNotes}
                            className="h-7 text-xs"
                          >
                            <X className="h-3 w-3 mr-1 text-red-600" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 group/notes">
                        {client?.notes && (
                          <p className="text-[#64748b] text-sm md:text-base whitespace-pre-wrap">
                            {client.notes}
                          </p>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleStartEditClientNotes}
                          className="h-6 w-6 mt-1 opacity-0 group-hover/notes:opacity-100 transition-opacity"
                          title="Edit notes"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
            </CardContent>
          </Card>
        </header>

        {/* Rolling Calendar Section */}
        <section className="mt-8" aria-label="Rolling calendar with daily tasks">
          <RollingCalendar activePlan={activePlan} />
        </section>

        {/* Media Plan Builder Section */}
        <section className="mt-8" aria-label="Media plan builder">
          <Card className="bg-white shadow-md">
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold text-[#0f172a] mb-4">Media Plan Builder</h2>
              {isLoadingMediaPlanBuilder ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-[#64748b]">Loading media plan builder...</p>
                </div>
              ) : (
                <MediaPlanGrid 
                  channels={mediaPlanBuilderChannels}
                  onChannelsChange={handleChannelsChange}
                  commission={commission}
                  onCommissionChange={handleCommissionChange}
                />
              )}
            </CardContent>
          </Card>
        </section>

        {/* Media Channels Section */}
        <section className="mt-8" aria-label="Media channels budget pacing">
          <MediaChannels 
            activePlan={activePlan} 
            clientId={clientId}
            mediaPlanBuilderChannels={mediaPlanBuilderChannels}
            commission={commission}
          />
        </section>

        {/* Ad Platform Connections Section */}
        <section className="mt-8" aria-label="Ad platform connections">
          <AdPlatformConnector clientId={clientId} />
        </section>

        {/* Analytics & Spend Overview Section */}
        <section className="mt-8" aria-label="Analytics and spend overview">
          {loadingAnalytics ? (
            <Card className="bg-white shadow-md">
              <CardContent className="p-6">
                <div className="flex items-center justify-center py-12">
                  <p className="text-[#64748b]">Loading analytics data...</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <UnifiedAnalyticsChart
              ga4Data={ga4Data}
              spendData={spendData}
              startDate={analyticsDateRange.startDate}
              endDate={analyticsDateRange.endDate}
              height={500}
              mediaPlans={plans}
              onAddMetric={handleAddMetric}
              availableMetrics={availableMetrics}
              selectedMetrics={selectedMetrics}
              onMetricsChange={handleMetricsChange}
              ga4Error={ga4Error}
              ga4ActivationUrl={ga4ActivationUrl}
            />
          )}
        </section>
      </div>

      {/* Edit Plan Modal */}
      {editingPlan && (
        <PlanEditForm
          plan={editingPlan}
          onClose={handleClosePlanEdit}
          onSave={handlePlanSaved}
          onDelete={handlePlanSaved}
        />
      )}
    </div>
  );
}

