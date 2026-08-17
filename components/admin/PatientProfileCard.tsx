import styles from "@/app/(admin)/admin.module.css";
import { EXERCISE_FREQUENCY_OPTIONS } from "@/lib/config/portal";
import { formatDateLong } from "@/lib/utils/format";

type Profile = {
  phone?: string | null;
  dateOfBirth?: string | null;
  city?: string | null;
  occupation?: string | null;
  mainConcern?: string | null;
  goals?: string | null;
  diagnosisHistory?: string | null;
  currentMedications?: string | null;
  currentSupplements?: string | null;
  sleepHoursAvg?: number | null;
  exerciseFrequency?: string | null;
  referralSource?: string | null;
  notes?: string | null;
};

function getExerciseLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return EXERCISE_FREQUENCY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** dateOfBirth is a bare "YYYY-MM-DD" string — was rendered raw. Appending a
 * time anchors it to local midnight rather than UTC midnight, the same fix
 * already applied to check-in dates on this page, so the displayed day never
 * shifts by one depending on the server's timezone. */
function formatBirthDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return formatDateLong(`${value}T00:00:00`);
}

function ProfileRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <tr>
      <td className={styles.profileTdLabel}>{label}</td>
      <td className={styles.profileTdValue}>
        {value || <span className={styles.cellFaint}>—</span>}
      </td>
    </tr>
  );
}

export function PatientProfileCard({ profile }: { profile: Profile | null | undefined }) {
  const pr = profile;
  return (
    <div className={styles.card}>
      <p className={styles.cardLabel}>Profile</p>

      <p className={styles.profileSubLabel}>Contact</p>
      <table className={styles.profileTable}>
        <tbody>
          <ProfileRow label="Phone" value={pr?.phone} />
          <ProfileRow label="Date of birth" value={formatBirthDate(pr?.dateOfBirth)} />
          <ProfileRow label="City" value={pr?.city} />
          <ProfileRow label="Occupation" value={pr?.occupation} />
        </tbody>
      </table>

      <p className={styles.profileSubLabel}>Clinical</p>
      <table className={styles.profileTable}>
        <tbody>
          <ProfileRow label="Main concern" value={pr?.mainConcern} />
          <ProfileRow label="Goals" value={pr?.goals} />
          <ProfileRow label="Diagnosis history" value={pr?.diagnosisHistory} />
          <ProfileRow label="Medications" value={pr?.currentMedications} />
          <ProfileRow label="Supplements" value={pr?.currentSupplements} />
        </tbody>
      </table>

      <p className={styles.profileSubLabel}>Lifestyle</p>
      <table className={pr?.notes || pr?.referralSource ? styles.profileTable : styles.profileTableLast}>
        <tbody>
          <tr>
            <td className={styles.profileTdLabel}>Sleep avg</td>
            <td className={styles.profileTdValue}>
              {pr?.sleepHoursAvg != null
                ? `${pr.sleepHoursAvg}h/night`
                : <span className={styles.cellFaint}>—</span>}
            </td>
          </tr>
          <tr>
            <td className={styles.profileTdLabel}>Exercise</td>
            <td className={styles.profileTdValue}>{getExerciseLabel(pr?.exerciseFrequency)}</td>
          </tr>
        </tbody>
      </table>

      {(pr?.notes || pr?.referralSource) && (
        <>
          <p className={styles.profileSubLabel}>Notes</p>
          <table className={styles.profileTableLast}>
            <tbody>
              {pr?.notes && <ProfileRow label="Patient notes" value={pr.notes} />}
              {pr?.referralSource && <ProfileRow label="Referred by" value={pr.referralSource} />}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
