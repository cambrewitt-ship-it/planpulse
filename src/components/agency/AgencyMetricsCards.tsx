// src/components/agency/AgencyMetricsCards.tsx
// Summary metric cards for agency dashboard

import { Users, DollarSign, AlertCircle, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { TrafficLight } from './TrafficLight';

interface AgencyMetricsCardsProps {
  metrics: {
    totalClients: number;
    statusBreakdown: {
      red: number;
      amber: number;
      green: number;
    };
    totalBudgetCents: number;
    totalOverdueTasks: number;
    totalAtRiskTasks: number;
  };
}

export function AgencyMetricsCards({ metrics }: AgencyMetricsCardsProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Total Clients Card */}
      <Card className="border shadow-sm rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Total Clients
            </p>
            <p className="text-2xl font-bold mt-2">{metrics.totalClients}</p>
          </div>
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </Card>

      {/* Status Breakdown Card */}
      <Card className="border shadow-sm rounded-lg p-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-3">
            Health Status
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <TrafficLight status="red" size="small" />
              <span className="text-lg font-semibold">
                {metrics.statusBreakdown.red}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrafficLight status="amber" size="small" />
              <span className="text-lg font-semibold">
                {metrics.statusBreakdown.amber}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrafficLight status="green" size="small" />
              <span className="text-lg font-semibold">
                {metrics.statusBreakdown.green}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Budget Health Card */}
      <Card className="border shadow-sm rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Total Budget
            </p>
            <p className="text-2xl font-bold mt-2">
              {formatCurrency(metrics.totalBudgetCents)}
            </p>
          </div>
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-green-600" />
          </div>
        </div>
      </Card>

      {/* Tasks Card */}
      <Card className="border shadow-sm rounded-lg p-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-3">
            Task Status
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-muted-foreground">Overdue</span>
              </div>
              <span
                className={`text-lg font-semibold ${
                  metrics.totalOverdueTasks > 0
                    ? 'text-red-600'
                    : 'text-muted-foreground'
                }`}
              >
                {metrics.totalOverdueTasks}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">At Risk</span>
              </div>
              <span
                className={`text-lg font-semibold ${
                  metrics.totalAtRiskTasks > 0
                    ? 'text-amber-600'
                    : 'text-muted-foreground'
                }`}
              >
                {metrics.totalAtRiskTasks}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
