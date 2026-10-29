import { LineChart } from "@bitbaum/chartkit/react";
import { LOCALE } from "@/lib/utils/format";

type DataPoint = {
  /** The day the assessment was completed, ISO (YYYY-MM-DD). */
  date: string;
  score: number;
};

type Props = {
  data: DataPoint[];
};

/** The overall assessment score (0–100) over time, on @bitbaum/chartkit. */
export function AssessmentTrendChart({ data }: Props) {
  const results = [...data].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <LineChart
      series={[
        {
          id: "score",
          label: "Score",
          points: results.map((r) => ({ x: r.date, y: r.score })),
        },
      ]}
      caption={`Overall assessment score (0–100) over ${results.length} assessments.`}
      height={180}
      yFrom="zero"
      locale={LOCALE}
      periodLabel="Completed"
    />
  );
}
