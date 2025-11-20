import { MoreVertical } from "lucide-react";
import { Button } from "./button";
import { Badge } from "./badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

interface MonthData {
  month: string;
  planned: number;
  actual: number;
}

interface MediaChannelRowProps {
  channelName: string;
  channelDetails: string;
  scheduleDescription: string;
  colorDot: string;
  monthlyData: MonthData[];
  pacingScore: "over" | "on-track" | "under";
  onEdit?: () => void;
  onDelete?: () => void;
  onViewDetails?: () => void;
}

export function MediaChannelRow({
  channelName,
  channelDetails,
  scheduleDescription,
  colorDot,
  monthlyData,
  pacingScore,
  onEdit,
  onDelete,
  onViewDetails,
}: MediaChannelRowProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}k`;
    }
    return `$${value.toFixed(0)}`;
  };

  const getPacingBadgeVariant = (score: string) => {
    switch (score) {
      case "over":
        return "destructive";
      case "on-track":
        return "default";
      case "under":
        return "secondary";
      default:
        return "default";
    }
  };

  const getPacingLabel = (score: string) => {
    switch (score) {
      case "over":
        return "Over Budget";
      case "on-track":
        return "On Track";
      case "under":
        return "Under Pacing";
      default:
        return score;
    }
  };

  return (
    <div className="flex items-center gap-4 p-4 border-b hover:bg-muted/50 transition-colors">
      {/* Channel Info */}
      <div className="flex-shrink-0 w-64">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: colorDot }}
          />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">{channelName}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {channelDetails}
            </p>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="flex-shrink-0 w-48">
        <p className="text-xs text-muted-foreground">{scheduleDescription}</p>
      </div>

      {/* Monthly Timeline */}
      <div className="flex-1 flex gap-2 min-w-0">
        {monthlyData.map((month, index) => {
          const plannedPercent = Math.min(
            (month.planned / Math.max(...monthlyData.map((m) => m.planned))) *
              100,
            100
          );
          const actualPercent = Math.min(
            (month.actual / Math.max(...monthlyData.map((m) => m.planned))) *
              100,
            100
          );

          return (
            <div key={index} className="flex-1 min-w-0">
              <div className="text-xs text-center mb-1 text-muted-foreground">
                {formatCurrency(month.actual)} / {formatCurrency(month.planned)}
              </div>
              <div className="relative h-8 bg-gray-100 rounded overflow-hidden">
                {/* Background bar - Planned budget at 50% opacity */}
                <div
                  className="absolute inset-0 bg-blue-500 opacity-50 transition-all"
                  style={{ width: `${plannedPercent}%` }}
                />
                {/* Foreground bar - Actual spend at 90% opacity */}
                <div
                  className="absolute inset-0 bg-blue-600 opacity-90 transition-all"
                  style={{ width: `${actualPercent}%` }}
                />
              </div>
              <div className="text-xs text-center mt-1 text-muted-foreground truncate">
                {month.month}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pacing Badge */}
      <div className="flex-shrink-0">
        <Badge
          variant={getPacingBadgeVariant(pacingScore)}
          className={
            pacingScore === "on-track"
              ? "bg-green-500 hover:bg-green-600"
              : pacingScore === "under"
              ? "bg-yellow-500 hover:bg-yellow-600"
              : ""
          }
        >
          {getPacingLabel(pacingScore)}
        </Badge>
      </div>

      {/* Actions Menu */}
      <div className="flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onViewDetails && (
              <DropdownMenuItem onClick={onViewDetails}>
                View Details
              </DropdownMenuItem>
            )}
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

