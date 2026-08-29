"use client";

import Link from "next/link";
import shared from "../portal.module.css";
import styles from "./dashboard.module.css";
import { CheckinTrendChart } from "@/components/portal/CheckinTrendChart";
import { CHECKIN_METRICS, type MetricKey } from "@/lib/config/portal";
import { formatDateMonthDay } from "@/lib/utils/format";
import { PORTAL_ROUTES } from "@/lib/config/routes";

type CheckinRow = {
  date: string;
  sleep: number;
  energy: number;
  mood: number;
  focus: number;
  stress: number;
};

export function CheckinMiniTrend({ checkins }: { checkins: CheckinRow[] }) {
  if (checkins.length < 2) return null;

  // Checkins arrive newest-first from the DB; chart expects oldest-first
  const data = [...checkins].reverse().map((c) => ({
    date: formatDateMonthDay(c.date + "T00:00:00"),
    ...(Object.fromEntries(CHECKIN_METRICS.map(({ key }) => [key, c[key as MetricKey]])) as Record<
      MetricKey,
      number
    >),
  }));

  return (
    <div className={shared.card}>
      <div className={styles.trendCardHeader}>
        <p className={shared.cardTitle}>Wellbeing trend</p>
        <Link href={PORTAL_ROUTES.checkin} className={styles.trendCardLink}>
          Full history →
        </Link>
      </div>
      <CheckinTrendChart data={data} />
    </div>
  );
}
