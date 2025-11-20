import { useMemo } from "react";
import {
  format,
  isToday,
  isTomorrow,
  isThisWeek,
  parseISO,
  differenceInDays,
  startOfDay,
  addDays,
} from "date-fns";
import { AlertCircle, Calendar, CheckCircle2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Badge } from "./badge";
import { Button } from "./button";
import { MediaChannel } from "@/lib/types/media-plan";
import { calculatePacingScore, getPacingStatus } from "@/lib/utils/pacing-calculations";

interface ActionItem {
  id: string;
  type: "checklist" | "campaign-start" | "budget-review" | "pacing-alert";
  priority: "critical" | "important" | "routine";
  title: string;
  description: string;
  channelId: string;
  channelName: string;
  channelColor: string;
  date: Date;
  dateLabel: string;
}

interface ActionCalendarProps {
  channels: MediaChannel[];
  onChannelClick?: (channelId: string) => void;
}

export function ActionCalendar({
  channels,
  onChannelClick,
}: ActionCalendarProps) {
  const actions = useMemo(() => {
    const today = startOfDay(new Date());
    const actionItems: ActionItem[] = [];

    channels.forEach((channel) => {
      // 1. Check for incomplete critical checklist items
      channel.checklist
        .filter((item) => !item.completed && item.priority === "critical")
        .forEach((item, index) => {
          actionItems.push({
            id: `${channel.id}-checklist-${item.id}`,
            type: "checklist",
            priority: "critical",
            title: item.text,
            description: `Critical setup item for ${channel.name}`,
            channelId: channel.id,
            channelName: channel.name,
            channelColor: channel.color,
            date: today,
            dateLabel: "Today",
          });
        });

      // 2. Check for incomplete normal checklist items (routine)
      channel.checklist
        .filter(
          (item) => !item.completed && item.priority !== "critical"
        )
        .slice(0, 2) // Limit to avoid overwhelming
        .forEach((item) => {
          actionItems.push({
            id: `${channel.id}-checklist-${item.id}`,
            type: "checklist",
            priority: "routine",
            title: item.text,
            description: `Setup item for ${channel.name}`,
            channelId: channel.id,
            channelName: channel.name,
            channelColor: channel.color,
            date: today,
            dateLabel: "Today",
          });
        });

      // 3. Check for campaign starts this week
      channel.timeFrames.forEach((timeFrame) => {
        const startDate = startOfDay(parseISO(timeFrame.startDate));
        const daysUntilStart = differenceInDays(startDate, today);

        if (daysUntilStart >= 0 && daysUntilStart <= 7) {
          let dateLabel = "";
          if (isToday(startDate)) {
            dateLabel = "Today";
          } else if (isTomorrow(startDate)) {
            dateLabel = "Tomorrow";
          } else {
            dateLabel = format(startDate, "EEE, MMM d");
          }

          actionItems.push({
            id: `${channel.id}-start-${timeFrame.period}`,
            type: "campaign-start",
            priority: daysUntilStart <= 1 ? "important" : "routine",
            title: `${channel.name} campaign starts`,
            description: `${timeFrame.period} campaign period begins`,
            channelId: channel.id,
            channelName: channel.name,
            channelColor: channel.color,
            date: startDate,
            dateLabel,
          });
        }
      });

      // 4. Check for pacing alerts (over-spending or under-pacing channels)
      if (channel.status === "active") {
        const pacingScore = calculatePacingScore(channel, new Date());
        const pacingStatus = getPacingStatus(pacingScore);

        if (pacingStatus === "over") {
          actionItems.push({
            id: `${channel.id}-pacing-over`,
            type: "pacing-alert",
            priority: "critical",
            title: `${channel.name} is over-pacing`,
            description: `Channel is ${Math.abs(pacingScore).toFixed(1)}% over expected spend`,
            channelId: channel.id,
            channelName: channel.name,
            channelColor: channel.color,
            date: today,
            dateLabel: "Today",
          });
        } else if (pacingStatus === "under" && Math.abs(pacingScore) > 20) {
          actionItems.push({
            id: `${channel.id}-pacing-under`,
            type: "pacing-alert",
            priority: "important",
            title: `${channel.name} is under-pacing`,
            description: `Channel is ${Math.abs(pacingScore).toFixed(1)}% under expected spend`,
            channelId: channel.id,
            channelName: channel.name,
            channelColor: channel.color,
            date: today,
            dateLabel: "Today",
          });
        }
      }

      // 5. Budget review reminders (for active campaigns at mid-point)
      channel.timeFrames.forEach((timeFrame) => {
        const startDate = parseISO(timeFrame.startDate);
        const endDate = parseISO(timeFrame.endDate);
        const totalDays = differenceInDays(endDate, startDate);
        const midPoint = addDays(startDate, Math.floor(totalDays / 2));
        const daysToMidPoint = differenceInDays(midPoint, today);

        if (daysToMidPoint === 0 && timeFrame.actual > 0) {
          actionItems.push({
            id: `${channel.id}-review-${timeFrame.period}`,
            type: "budget-review",
            priority: "important",
            title: `Review ${channel.name} budget`,
            description: `Mid-point review for ${timeFrame.period} campaign`,
            channelId: channel.id,
            channelName: channel.name,
            channelColor: channel.color,
            date: today,
            dateLabel: "Today",
          });
        }
      });
    });

    // Sort by priority and date
    return actionItems.sort((a, b) => {
      const priorityOrder = { critical: 0, important: 1, routine: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.date.getTime() - b.date.getTime();
    });
  }, [channels]);

  const todayActions = actions.filter((action) => isToday(action.date));
  const upcomingActions = actions.filter(
    (action) => !isToday(action.date) && isThisWeek(action.date, { weekStartsOn: 1 })
  );

  const getActionIcon = (type: ActionItem["type"]) => {
    switch (type) {
      case "checklist":
        return <CheckCircle2 className="h-4 w-4" />;
      case "campaign-start":
        return <Calendar className="h-4 w-4" />;
      case "budget-review":
        return <TrendingUp className="h-4 w-4" />;
      case "pacing-alert":
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getPriorityConfig = (priority: ActionItem["priority"]) => {
    switch (priority) {
      case "critical":
        return {
          badge: "🔴 Critical",
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          textColor: "text-red-700",
        };
      case "important":
        return {
          badge: "🟡 Important",
          bgColor: "bg-yellow-50",
          borderColor: "border-yellow-200",
          textColor: "text-yellow-700",
        };
      case "routine":
        return {
          badge: "🟢 Routine",
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          textColor: "text-green-700",
        };
    }
  };

  const renderActionItem = (action: ActionItem) => {
    const config = getPriorityConfig(action.priority);

    return (
      <div
        key={action.id}
        className={`p-4 rounded-lg border ${config.bgColor} ${config.borderColor} hover:shadow-md transition-shadow cursor-pointer`}
        onClick={() => onChannelClick?.(action.channelId)}
      >
        <div className="flex items-start gap-3">
          {/* Channel Color Indicator */}
          <div
            className="w-1 h-full absolute left-0 top-0 bottom-0 rounded-l-lg"
            style={{ backgroundColor: action.channelColor }}
          />

          {/* Icon */}
          <div className={`mt-1 ${config.textColor}`}>
            {getActionIcon(action.type)}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm">{action.title}</h4>
              <Badge variant="outline" className="text-xs">
                {config.badge}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {action.description}
            </p>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: action.channelColor }}
              />
              <span className="text-xs font-medium">{action.channelName}</span>
            </div>
          </div>

          {/* Date Label (for upcoming items) */}
          {!isToday(action.date) && (
            <div className="text-xs text-muted-foreground">
              {action.dateLabel}
            </div>
          )}
        </div>
      </div>
    );
  };

  const criticalCount = actions.filter((a) => a.priority === "critical").length;
  const importantCount = actions.filter((a) => a.priority === "important").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Action Calendar
          </CardTitle>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {criticalCount} Critical
              </Badge>
            )}
            {importantCount > 0 && (
              <Badge
                variant="secondary"
                className="text-xs bg-yellow-100 text-yellow-800"
              >
                {importantCount} Important
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Today's Tasks */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
            Today
          </h3>
          {todayActions.length > 0 ? (
            <div className="space-y-3">
              {todayActions.map((action) => renderActionItem(action))}
            </div>
          ) : (
            <div className="p-4 text-center text-muted-foreground bg-gray-50 rounded-lg border border-dashed">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p className="text-sm">All caught up for today! 🎉</p>
            </div>
          )}
        </div>

        {/* Upcoming This Week */}
        {upcomingActions.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Upcoming This Week
            </h3>
            <div className="space-y-3">
              {upcomingActions.map((action) => renderActionItem(action))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {actions.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
            <h4 className="font-semibold mb-1">No actions needed</h4>
            <p className="text-sm">All campaigns are running smoothly!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

