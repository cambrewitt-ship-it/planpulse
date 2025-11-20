import { TrendingUp, DollarSign, Percent, CheckCircle } from "lucide-react";
import { Card } from "./card";

interface MediaPlanSummaryCardsProps {
  totalBudget: number;
  actualSpend: number;
  spendRate: number;
  onTrackCount: number;
  totalChannels: number;
}

export function MediaPlanSummaryCards({
  totalBudget,
  actualSpend,
  spendRate,
  onTrackCount,
  totalChannels,
}: MediaPlanSummaryCardsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Budget Card */}
      <Card className="border shadow-sm rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Total Budget
            </p>
            <p className="text-2xl font-bold mt-2">
              {formatCurrency(totalBudget)}
            </p>
          </div>
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </Card>

      {/* Actual Spend Card */}
      <Card className="border shadow-sm rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Actual Spend
            </p>
            <p className="text-2xl font-bold mt-2">
              {formatCurrency(actualSpend)}
            </p>
          </div>
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-green-600" />
          </div>
        </div>
      </Card>

      {/* Spend Rate Card */}
      <Card className="border shadow-sm rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Spend Rate
            </p>
            <p className="text-2xl font-bold mt-2">{formatPercent(spendRate)}</p>
          </div>
          <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
            <Percent className="h-6 w-6 text-purple-600" />
          </div>
        </div>
      </Card>

      {/* On Track Card */}
      <Card className="border shadow-sm rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              On Track
            </p>
            <p className="text-2xl font-bold mt-2">
              {onTrackCount} / {totalChannels}
            </p>
          </div>
          <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-emerald-600" />
          </div>
        </div>
      </Card>
    </div>
  );
}

