// src/app/plans/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { getMediaPlans } from '@/lib/db/plans';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, Calendar, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

export default function PlansPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const data = await getMediaPlans();
      setPlans(data || []);
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setLoading(false);
    }
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
          <h1 className="text-3xl font-bold" style={{ color: '#1C1917', ...serifFont }}>Media Plans</h1>
        </div>

      {plans.length === 0 ? (
        <Card style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC' }}>
          <CardContent className="text-center py-12">
            <p style={{ color: '#8A8578', marginBottom: 16 }}>No media plans yet</p>
            <p className="text-sm" style={{ color: '#B5B0A5' }}>Plans can be created from the client dashboard</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map(plan => (
            <Card key={plan.id} className="transition-shadow" style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}>
              <CardHeader>
                <CardTitle className="text-lg" style={{ color: '#1C1917' }}>
                  {plan.clients?.name || 'Unknown Client'}
                </CardTitle>
                <p className="text-sm" style={{ color: '#8A8578' }}>{plan.name}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" style={{ color: '#B5B0A5' }} />
                    <span style={{ color: '#1C1917' }}>
                      {format(new Date(plan.start_date), 'MMM d')} - 
                      {format(new Date(plan.end_date), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" style={{ color: '#B5B0A5' }} />
                    <span style={{ color: '#1C1917' }}>${(plan.total_budget / 100).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: '#8A8578' }}>Channels:</span>
                    <span style={{ color: '#1C1917' }}>{plan.channels?.length || 0}</span>
                  </div>
                </div>
                <div className="mt-4">
                  <Link href={`/plans/${plan.id}/dashboard`}>
                    <Button variant="outline" className="w-full">
                      View Dashboard
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}