import styles from "../portal.module.css";
import profileStyles from "./profile.module.css";
import authStyles from "../../forms.module.css";
import { PATIENT_NOTE_MAX_LENGTH } from "@/lib/config/portal";
import { COMPANY } from "@/lib/config/company";
import type { ProfileData, FieldSetter } from "./profile-types";

export function ClinicalContextFields({ form, set }: { form: ProfileData; set: FieldSetter }) {
  return (
    <div className={styles.card}>
      <p className={styles.cardTitle}>Clinical context</p>
      <div className={profileStyles.fieldStack}>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="concern">Main concern</label>
          <textarea id="concern" className={styles.formTextarea} value={form.mainConcern} onChange={set("mainConcern")} maxLength={PATIENT_NOTE_MAX_LENGTH} placeholder={`What brings you to ${COMPANY.shortName}?`} />
        </div>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="goals">Goals</label>
          <textarea id="goals" className={styles.formTextarea} value={form.goals} onChange={set("goals")} maxLength={PATIENT_NOTE_MAX_LENGTH} placeholder="What would success look like in 6 months?" />
        </div>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="diagnosis">Diagnosis history</label>
          <textarea id="diagnosis" className={styles.formTextarea} value={form.diagnosisHistory} onChange={set("diagnosisHistory")} maxLength={PATIENT_NOTE_MAX_LENGTH} placeholder="Any prior diagnoses (ADHD, anxiety, depression, etc.)" />
        </div>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="meds">Current medications</label>
          <textarea id="meds" className={styles.formTextarea} value={form.currentMedications} onChange={set("currentMedications")} maxLength={PATIENT_NOTE_MAX_LENGTH} placeholder="Name, dose, frequency — or 'none'" />
        </div>
        <div className={authStyles.field}>
          <label className={authStyles.label} htmlFor="supps">Current supplements</label>
          <textarea id="supps" className={styles.formTextarea} value={form.currentSupplements} onChange={set("currentSupplements")} maxLength={PATIENT_NOTE_MAX_LENGTH} placeholder="Omega-3, magnesium, creatine…" />
        </div>
      </div>
    </div>
  );
}
