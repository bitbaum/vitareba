import { getTranslations } from "next-intl/server";
import styles from "./PsychedelicReadiness.module.css";

const PHASE_NUMBERS = ["1", "2", "3"];

export default async function PsychedelicReadiness() {
  const t = await getTranslations("psychedelicReadiness");
  const phases = t.raw("phases") as Array<{ title: string; text: string }>;

  return (
    <section className={styles.section}>
      <div className="section-inner">
        <div className={styles.grid}>
          <div>
            <div className="eyebrow">{t("eyebrow")}</div>
            <h2 className="sec-title">
              {t("heading")}
              <br />
              <em>{t("headingEm")}</em>
            </h2>
            <p className="sec-sub sec-sub-mt">{t("sub")}</p>

            <div className={styles.callout}>
              <div className={styles.calloutTitle}>{t("calloutTitle")}</div>
              <div className={styles.calloutText}>{t("calloutText")}</div>
              <div className={styles.calloutCite}>{t("calloutCite")}</div>
            </div>
          </div>

          <div>
            <div className={styles.phases}>
              {phases.map((phase, i) => (
                <div key={PHASE_NUMBERS[i]} className={styles.phase}>
                  <div className={styles.phaseN}>{PHASE_NUMBERS[i]}</div>
                  <div>
                    <div className={styles.phaseTitle}>{phase.title}</div>
                    <div className={styles.phaseText}>{phase.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className={styles.body}>{t("footer")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
