import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface ChartDataPoint {
  date: string;
  planned: number;
  actual: number;
  projected: number;
}

interface MediaChannelSpendChartProps {
  data: ChartDataPoint[];
  channelColor: string;
  channelName?: string;
}

export function MediaChannelSpendChart({
  data,
  channelColor,
  channelName,
}: MediaChannelSpendChartProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{formatDate(label)}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              <span className="font-medium capitalize">{entry.name}:</span>{" "}
              {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Use consistent colors matching MediaChannelCard: blue for actual, gray for planned
  const plannedColor = "#94a3b8"; // Gray - matches MediaChannelCard
  const actualColor = "#2563eb"; // Blue - matches MediaChannelCard
  const projectedColor = "#93c5fd"; // Light blue - matches MediaChannelCard

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={`colorPlanned-${channelName}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={plannedColor}
                stopOpacity={0.5}
              />
              <stop
                offset="95%"
                stopColor={plannedColor}
                stopOpacity={0.5}
              />
            </linearGradient>
            <linearGradient id={`colorActual-${channelName}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={actualColor}
                stopOpacity={0.9}
              />
              <stop
                offset="95%"
                stopColor={actualColor}
                stopOpacity={0.3}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            className="text-xs"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            tickFormatter={(value) => formatCurrency(value)}
            className="text-xs"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: "20px" }}
            iconType="line"
          />
          
          {/* Planned spend - gray dashed line with area fill */}
          <Area
            type="monotone"
            dataKey="planned"
            stroke={plannedColor}
            strokeWidth={2}
            strokeDasharray="5 5"
            fill={`url(#colorPlanned-${channelName})`}
            connectNulls={false}
            name="Planned"
          />
          
          {/* Actual spend - blue solid line with area fill */}
          <Area
            type="monotone"
            dataKey="actual"
            stroke={actualColor}
            strokeWidth={2.5}
            fill={`url(#colorActual-${channelName})`}
            connectNulls={false}
            name="Actual"
          />
          
          {/* Projected - light blue dashed line */}
          <Line
            type="linear"
            dataKey="projected"
            stroke={projectedColor}
            strokeWidth={2}
            strokeDasharray="3 3"
            dot={false}
            connectNulls={false}
            name="Projected"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

