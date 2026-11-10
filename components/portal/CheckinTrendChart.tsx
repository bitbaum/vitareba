import { LineChart } from "@bitbaum/chartkit/react";
import { CHECKIN_METRICS, type MetricKey } from "@/lib/config/portal";
import { LOCALE } from "@/lib/utils/format";

type DataPoint = {
  /** The check-in day, ISO (YYYY-MM-DD). */
  date: string;
} & Record<MetricKey, number>;

type Props = {
  data: DataPoint[];
};

/**
 * Daily check-ins on @bitbaum/chartkit: one line per 1–5 metric, dated by
 * day, on a fixed 1–5 axis with integer ticks. Renders on the server; the values are in the chart's own table.
 */
export function CheckinTrendChart({ data }: Props) {
  const days = [...data].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <LineChart
      series={CHECKIN_METRICS.map(({ key, shortLabel }) => ({
        id: key,
        label: shortLabel,
        points: days.map((d) => ({ x: d.date, y: d[key] })),
      }))}
      caption={`Daily check-ins over ${days.length} day${days.length === 1 ? "" : "s"}, each metric on a 1–5 scale.`}
      height={220}
      yDomain={{ min: 1, max: 5, step: 1 }}
      markers="none"
      locale={LOCALE}
      periodLabel="Day"
    />
  );
}
