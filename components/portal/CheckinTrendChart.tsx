"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CHECKIN_METRICS, type MetricKey } from "@/lib/config/portal";

type DataPoint = {
  date: string;
} & Record<MetricKey, number>;

type Props = {
  data: DataPoint[];
};

function srSummary(data: DataPoint[]): string {
  if (data.length === 0) return "No check-in data available.";
  const last = data[data.length - 1];
  const metrics = CHECKIN_METRICS.map(
    ({ key, label }) => `${label}: ${(last as DataPoint)[key]}/5`,
  ).join(", ");
  return `Daily check-in trend over ${data.length} day${data.length === 1 ? "" : "s"}. Most recent (${last.date}): ${metrics}.`;
}

export function CheckinTrendChart({ data }: Props) {
  return (
    <div role="img" aria-label={`Check-in trend chart. ${srSummary(data)}`}>
      <p className="sr-only">{srSummary(data)}</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "var(--muted)", fontFamily: "var(--font-dm-sans)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tick={{ fontSize: 10, fill: "var(--muted)", fontFamily: "var(--font-dm-sans)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--white)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              fontSize: "0.78rem",
              fontFamily: "var(--font-dm-sans)",
            }}
            labelStyle={{ color: "var(--muted)", marginBottom: "0.25rem" }}
          />
          <Legend
            iconType="circle"
            iconSize={7}
            wrapperStyle={{ fontSize: "0.72rem", fontFamily: "var(--font-dm-sans)" }}
          />
          {CHECKIN_METRICS.map(({ key, shortLabel, color }) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={shortLabel}
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
