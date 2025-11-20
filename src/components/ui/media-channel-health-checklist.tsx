import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Checkbox } from "./checkbox";
import { Badge } from "./badge";
import { Button } from "./button";

interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  isCritical?: boolean;
}

interface MediaChannelHealthChecklistProps {
  title?: string;
  items: ChecklistItem[];
  onItemToggle: (itemId: string) => void;
  defaultExpanded?: boolean;
}

export function MediaChannelHealthChecklist({
  title = "Health Checklist",
  items,
  onItemToggle,
  defaultExpanded = false,
}: MediaChannelHealthChecklistProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const completedCount = items.filter((item) => item.checked).length;
  const totalCount = items.length;

  return (
    <div className="border rounded-lg shadow-sm">
      {/* Header */}
      <Button
        variant="ghost"
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        <div className="text-sm text-muted-foreground">
          {completedCount}/{totalCount} Complete
        </div>
      </Button>

      {/* Checklist Items */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 py-2 px-3 rounded hover:bg-muted/30 transition-colors"
            >
              <Checkbox
                id={item.id}
                checked={item.checked}
                onCheckedChange={() => onItemToggle(item.id)}
                className="flex-shrink-0"
              />
              <label
                htmlFor={item.id}
                className={`flex-1 text-sm cursor-pointer select-none ${
                  item.checked
                    ? "line-through text-muted-foreground"
                    : "text-foreground"
                }`}
              >
                {item.label}
              </label>
              {item.isCritical && (
                <Badge
                  variant="destructive"
                  className="flex-shrink-0 text-xs"
                >
                  Critical
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

