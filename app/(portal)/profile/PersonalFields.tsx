import styles from "../portal.module.css";
import profileStyles from "./profile.module.css";
import authStyles from "../../forms.module.css";
import { PROFILE_NAME_MAX_LENGTH, PROFILE_PHONE_MAX_LENGTH, PROFILE_CITY_MAX_LENGTH, PROFILE_OCCUPATION_MAX_LENGTH } from "@/lib/config/portal";
import { BIOLOGICAL_SEX_LABELS, BIOLOGICAL_SEX_VALUES } from "@/lib/config/measurements";
import type { ProfileData, FieldSetter } from "./profile-types";

export function PersonalFields({ form, set }: { form: ProfileData; set: FieldSetter }) {
  return (
    <div className={styles.card}>
      <p className={styles.cardTitle}>Personal</p>
      <div className={profileStyles.fieldGrid}>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="name">Full name</label>
          <input id="name" className={authStyles.input} value={form.name} onChange={set("name")} maxLength={PROFILE_NAME_MAX_LENGTH} />
        </div>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="dob">Date of birth</label>
          <input id="dob" className={authStyles.input} type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
        </div>
        <div className={authStyles.field}>
          {/* Asked for one reason only, and the label says so: several blood
              results are read against different ranges for women and men,
              and we would rather ask than guess wrong about your health. */}
          <label className={authStyles.label} htmlFor="sex">Sex — used for lab reference ranges</label>
          <select id="sex" className={authStyles.input} value={form.biologicalSex} onChange={set("biologicalSex")}>
            <option value="">Not recorded</option>
            {BIOLOGICAL_SEX_VALUES.map((v) => (
              <option key={v} value={v}>{BIOLOGICAL_SEX_LABELS[v]}</option>
            ))}
          </select>
        </div>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="phone">Phone</label>
          <input id="phone" className={authStyles.input} type="tel" value={form.phone} onChange={set("phone")} maxLength={PROFILE_PHONE_MAX_LENGTH} placeholder="+41 79 000 00 00" />
        </div>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="city">City</label>
          <input id="city" className={authStyles.input} value={form.city} onChange={set("city")} maxLength={PROFILE_CITY_MAX_LENGTH} placeholder="Zürich" />
        </div>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="occupation">Occupation</label>
          <input id="occupation" className={authStyles.input} value={form.occupation} onChange={set("occupation")} maxLength={PROFILE_OCCUPATION_MAX_LENGTH} placeholder="Founder, engineer, executive…" />
        </div>
      </div>
    </div>
  );
}
