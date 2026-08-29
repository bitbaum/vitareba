import styles from "../portal.module.css";
import profileStyles from "./profile.module.css";
import authStyles from "../../forms.module.css";
import { EXERCISE_FREQUENCY_OPTIONS, SLEEP_HOURS_MIN, SLEEP_HOURS_MAX } from "@/lib/config/portal";
import type { ProfileData, FieldSetter } from "./profile-types";

export function LifestyleFields({ form, set }: { form: ProfileData; set: FieldSetter }) {
  return (
    <div className={styles.card}>
      <p className={styles.cardTitle}>Lifestyle baseline</p>
      <div className={profileStyles.fieldGrid}>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="sleep">
            Average sleep (hours/night)
          </label>
          <input
            id="sleep"
            className={authStyles.input}
            type="number"
            min={SLEEP_HOURS_MIN}
            max={SLEEP_HOURS_MAX}
            value={form.sleepHoursAvg}
            onChange={set("sleepHoursAvg")}
            placeholder="7"
          />
        </div>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="exercise">
            Exercise frequency
          </label>
          <select
            id="exercise"
            className={authStyles.input}
            value={form.exerciseFrequency}
            onChange={set("exerciseFrequency")}
          >
            <option value="">Select…</option>
            {EXERCISE_FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
