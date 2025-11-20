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
import { MediaChannel } from "@/lib/types/media-plan";
import { parseISO, format, addDays, differenceInDays, isBefore, isAfter } from "date-fns";

interface MediaPlanTimeSeriesChartProps {
  channels: MediaChannel[];
  startDate: string;
  endDate: string;
}

interface ChartDataPoint {
  date: string;
  dateLabel: string;
  [key: string]: number | string; // Dynamic keys for each channel's planned/actual/projected
}

export function MediaPlanTimeSeriesChart({
  channels,
  startDate,
  endDate,
}: MediaPlanTimeSeriesChartProps) {
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

  // Generate daily data points
  const generateChartData = (): ChartDataPoint[] => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const data: ChartDataPoint[] = [];
    let currentDate = new Date(start);
    
    while (currentDate <= end) {
      const dateStr = format(currentDate, "yyyy-MM-dd");
      const dataPoint: ChartDataPoint = {
        date: dateStr,
        dateLabel: format(currentDate, "MMM d"),
      };
      
      // For each channel, calculate planned, actual, and projected spend
      channels.forEach((channel) => {
        const channelPrefix = channel.name;
        
        // Calculate cumulative spend up to this date
        let plannedSpend = 0;
        let actualSpend = 0;
        
        channel.timeFrames.forEach((tf) => {
          const tfStart = parseISO(tf.startDate);
          const tfEnd = parseISO(tf.endDate);
          
          // If timeframe is completely before current date, add full amounts
          if (isBefore(tfEnd, currentDate)) {
            plannedSpend += tf.planned;
            actualSpend += tf.actual;
          }
          // If current date is within timeframe, calculate proportional amounts
          else if (!isBefore(currentDate, tfStart) && !isAfter(currentDate, tfEnd)) {
            const totalDays = differenceInDays(tfEnd, tfStart);
            const daysElapsed = differenceInDays(currentDate, tfStart);
            const progress = totalDays > 0 ? Math.min(1, Math.max(0, daysElapsed / totalDays)) : 0;
            
            plannedSpend += tf.planned * progress;
            actualSpend += tf.actual * progress;
          }
          // If timeframe is after current date, don't add anything
        });
        
        // Set planned spend (always show for all dates within plan range)
        dataPoint[`${channelPrefix}_planned`] = plannedSpend;
        
        // Set actual spend only for dates up to today
        if (!isAfter(currentDate, today)) {
          dataPoint[`${channelPrefix}_actual`] = actualSpend;
        }
        
        // Set projected spend only for dates after today
        if (isAfter(currentDate, today)) {
          // Calculate projected spend based on current spend rate
          const totalPlanned = channel.timeFrames.reduce((sum, tf) => sum + tf.planned, 0);
          const totalActual = channel.timeFrames.reduce((sum, tf) => sum + tf.actual, 0);
          
          // Calculate spend rate up to today
          const daysFromStart = differenceInDays(today, start);
          const totalDays = differenceInDays(end, start);
          const timeProgress = totalDays > 0 ? Math.min(1, Math.max(0, daysFromStart / totalDays)) : 0;
          
          const expectedSpendToDate = totalPlanned * timeProgress;
          const spendRate = expectedSpendToDate > 0 ? totalActual / expectedSpendToDate : 1;
          
          // Project forward based on current spend rate
          const daysToCurrentDate = differenceInDays(currentDate, today);
          const dailyPlannedRate = totalPlanned / Math.max(totalDays, 1);
          const projectedIncrement = dailyPlannedRate * daysToCurrentDate * spendRate;
          
          dataPoint[`${channelPrefix}_projected`] = totalActual + projectedIncrement;
        }
      });
      
      data.push(dataPoint);
      currentDate = addDays(currentDate, 1);
    }
    
    return data;
  };

  const chartData = generateChartData();

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg max-w-xs">
          <p className="font-semibold mb-2">{formatDate(label)}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              <span className="font-medium">{entry.name}:</span>{" "}
              {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Convert hex color to RGB for opacity manipulation
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 59, g: 130, b: 246 }; // Default blue-500
  };

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            {channels.map((channel) => (
              <linearGradient
                key={`gradient-${channel.id}`}
                id={`colorPlanned-${channel.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor={channel.color}
                  stopOpacity={0.5}
                />
                <stop
                  offset="95%"
                  stopColor={channel.color}
                  stopOpacity={0.1}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="dateLabel"
            className="text-xs"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            interval="preserveStartEnd"
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

          {/* Render planned spend areas for each channel */}
          {channels.map((channel) => {
            const rgb = hexToRgb(channel.color);
            const plannedColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`;
            
            return (
              <Area
                key={`${channel.id}-planned`}
                type="monotone"
                dataKey={`${channel.name}_planned`}
                stroke={plannedColor}
                strokeWidth={2}
                fill={`url(#colorPlanned-${channel.id})`}
                fillOpacity={0.5}
                name={`${channel.name} (Planned)`}
              />
            );
          })}

          {/* Render actual spend lines for each channel (NO area) */}
          {channels.map((channel) => (
            <Line
              key={`${channel.id}-actual`}
              type="monotone"
              dataKey={`${channel.name}_actual`}
              stroke={channel.color}
              strokeWidth={3}
              dot={false}
              name={`${channel.name} (Actual)`}
            />
          ))}

          {/* Render projected spend lines for each channel */}
          {channels.map((channel) => (
            <Line
              key={`${channel.id}-projected`}
              type="monotone"
              dataKey={`${channel.name}_projected`}
              stroke={channel.color}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name={`${channel.name} (Projected)`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

