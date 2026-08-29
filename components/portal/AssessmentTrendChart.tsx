"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type DataPoint = {
  date: string; // formatted display date
  score: number;
};

type Props = {
  data: DataPoint[];
};

function srSummary(data: DataPoint[]): string {
  if (data.length === 0) return "No assessment data available.";
  const first = data[0];
  const last = data[data.length - 1];
  if (data.length === 1) return `Assessment score: ${last.score}/100 on ${last.date}.`;
  const direction =
    last.score > first.score ? "up" : last.score < first.score ? "down" : "unchanged";
  return `Assessment score trend over ${data.length} assessments: ${first.score}/100 on ${first.date} to ${last.score}/100 on ${last.date} — ${direction}.`;
}

export function AssessmentTrendChart({ data }: Props) {
  return (
    <div role="img" aria-label={`Assessment score trend chart. ${srSummary(data)}`}>
      <p className="sr-only">{srSummary(data)}</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--muted)", fontFamily: "var(--font-dm-sans)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "var(--muted)", fontFamily: "var(--font-dm-sans)" }}
            axisLine={false}
            tickLine={false}
            ticks={[0, 25, 50, 75, 100]}
          />
          <Tooltip
            contentStyle={{
              background: "var(--white)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              fontSize: "0.8rem",
              fontFamily: "var(--font-dm-sans)",
            }}
            labelStyle={{ color: "var(--muted)", marginBottom: "0.25rem" }}
            formatter={(value) => [Number(value), "Score"]}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--teal)"
            strokeWidth={2}
            dot={{ fill: "var(--teal)", r: 4, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "var(--teal)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
