import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import styles from "../../portal.module.css";
import { getPublicClinicianProfile } from "@/lib/domain/clinician-profile";
import { PORTAL_ROUTES } from "@/lib/config/routes";
import { ISO_WEEKDAY_LABELS, type WeeklyHours } from "@/lib/config/scheduling";

type RouteContext = { params: Promise<{ clinicianId: string }> };

/** "09:00–12:00, 13:30–17:00" or "Closed" for one day's windows. */
function formatDayWindows(windows: [string, string][]): string {
  if (windows.length === 0) return "Closed";
  return windows.map(([start, end]) => `${start}–${end}`).join(", ");
}

function formatWeeklyHours(weeklyHours: WeeklyHours): { label: string; hours: string }[] {
  return Object.entries(ISO_WEEKDAY_LABELS).map(([iso, label]) => ({
    label,
    hours: formatDayWindows(weeklyHours[Number(iso)] ?? []),
  }));
}

export default async function ClinicianProfilePage({ params }: RouteContext) {
  const session = await auth();
  if (!session) return null;

  const { clinicianId } = await params;
  const profile = await getPublicClinicianProfile(clinicianId);
  if (!profile) notFound();

  const isSelf = clinicianId === session.user.id;
  const schedule = formatWeeklyHours(profile.weeklyHours);

  return (
    <div>
      <Link href={PORTAL_ROUTES.careTeam} className={styles.backLink}>
        ← Care Team
      </Link>

      <h1 className={styles.pageTitle}>
        {profile.name ?? "Clinician"}
        {isSelf && " (you)"}
      </h1>
      {profile.title && <p className={styles.pageSub}>{profile.title}</p>}

      {!profile.acceptingPatients && !isSelf && (
        <div className={styles.cardWarn}>
          Not currently accepting new patients. If they already treat you, this does not affect you.
        </div>
      )}

      {profile.bio && (
        <div className={`${styles.card} ${styles.cardGap}`}>
          <p className={styles.cardTitle}>About</p>
          <p className={styles.formHint}>{profile.bio}</p>
        </div>
      )}

      {profile.specialties.length > 0 && (
        <div className={`${styles.card} ${styles.cardGap}`}>
          <p className={styles.cardTitle}>Specialties</p>
          <div className="tags">
            {profile.specialties.map((s) => (
              <span key={s} className="tag">{s}</span>
            ))}
          </div>
        </div>
      )}

      <div className={`${styles.card} ${styles.cardGap}`}>
        <p className={styles.cardTitle}>Working hours</p>
        <p className={styles.metaSm}>
          Zürich time. Real-time availability may differ — see actual open slots when booking.
        </p>
        <div className={styles.listStack}>
          {schedule.map((d) => (
            <div key={d.label} className={styles.docRow}>
              <span className={styles.docTitle}>{d.label}</span>
              <span className={styles.docMeta}>{d.hours}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.formActions}>
        <Link href={`${PORTAL_ROUTES.messages}?to=${clinicianId}`} className={styles.btnSecondary}>
          Message
        </Link>
        <Link href={`${PORTAL_ROUTES.bookings}?clinicianId=${clinicianId}`} className={styles.btnPrimary}>
          Book
        </Link>
      </div>
    </div>
  );
}
