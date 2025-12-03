'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Plus, TrendingUp, Pencil } from 'lucide-react';
import RollingCalendar from '@/components/RollingCalendar';
import MediaChannels from '@/components/MediaChannels';
import { MediaPlanGrid } from '@/components/media-plan-builder/media-plan-grid';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getClients, getMediaPlans, getPlanById } from '@/lib/db/plans';
import Link from 'next/link';
import { format } from 'date-fns';
import PlanEditForm from '@/components/plan-entry/PlanEditForm';

interface Client {
  id: string;
  name: string;
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

  useEffect(() => {
    if (clientId) {
      loadData();
    }
  }, [clientId]);

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

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-[#f8fafc] font-sans flex items-center justify-center">
        <p className="text-[#64748b]">Loading...</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-[#22c55e] hover:bg-[#16a34a]';
      case 'draft':
        return 'bg-[#64748b] hover:bg-[#475569]';
      case 'completed':
        return 'bg-[#2563eb] hover:bg-[#1d4ed8]';
      default:
        return 'bg-[#64748b] hover:bg-[#475569]';
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#f8fafc] font-sans">
      <div className="container mx-auto max-w-7xl px-4 py-8">
        {/* Header Section */}
        <header role="banner" aria-label="Client dashboard header">
          <Card className="bg-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ease-in-out">
            <CardContent className="py-6">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Left Section - Client Info (60%) */}
                <div className="lg:col-span-3 flex items-start gap-4">
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
                    <h1 className="text-3xl font-bold text-[#0f172a] mb-1">
                      {client?.name || 'Client Name'}
                    </h1>
                    <p className="text-[#64748b] text-sm md:text-base">
                      Your trusted partner for strategic growth
                    </p>
                  </div>
                </div>

                {/* Right Section - Live Media Plans (40%) */}
                <div className="lg:col-span-2 border-l border-[#e2e8f0] pl-6">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-5 w-5 text-[#2563eb]" />
                    <h2 className="text-lg font-semibold text-[#0f172a]">Live Media Plans</h2>
                  </div>
                  
                  {plans.length > 0 ? (
                    <div className="space-y-2">
                      {plans.slice(0, 3).map((plan) => (
                        <div key={plan.id} className="relative group">
                          <Link href={`/plans/${plan.id}/dashboard`}>
                            <div className="p-3 rounded-lg bg-[#f8fafc] hover:bg-[#e2e8f0] transition-colors duration-200 border border-[#e2e8f0] hover:border-[#cbd5e1] cursor-pointer">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-[#0f172a] truncate">
                                    {plan.name}
                                  </p>
                                  <p className="text-xs text-[#64748b] mt-1">
                                    {format(new Date(plan.start_date), 'MMM d')} - {format(new Date(plan.end_date), 'MMM d, yyyy')}
                                  </p>
                                </div>
                                <Badge className={`${getStatusColor(plan.status)} text-white text-xs capitalize`}>
                                  {plan.status}
                                </Badge>
                              </div>
                            </div>
                          </Link>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-white hover:bg-[#e2e8f0] shadow-sm"
                            onClick={(e) => handleEditPlan(plan.id, e)}
                            disabled={loadingPlan}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {plans.length > 3 && (
                        <p className="text-xs text-[#64748b] text-center pt-2">
                          +{plans.length - 3} more
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-[#64748b] mb-3">No media plans</p>
                      <Link href={`/plan-entry?client=${clientId}`}>
                        <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                          <Plus className="h-4 w-4 mr-2" />
                          Create Plan
                        </Button>
                      </Link>
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
              <MediaPlanGrid />
            </CardContent>
          </Card>
        </section>

        {/* Media Channels Section */}
        <section className="mt-8" aria-label="Media channels budget pacing">
          <MediaChannels activePlan={activePlan} clientId={clientId} />
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

