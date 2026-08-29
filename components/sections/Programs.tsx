import { getTranslations } from "next-intl/server";
import { COMPANY } from "@/lib/config/company";
import { PROGRAMME_ENUM_VALUES, PROGRAMME_CONFIG } from "@/lib/config/programmes";
import styles from "./Programs.module.css";

type ProgramItem = {
  note: string;
  desc: string;
  badge: string | null;
  btnLabel: string;
  features: string[];
};

export default async function Programs() {
  const t = await getTranslations("programs");
  const items = t.raw("items") as Record<string, ProgramItem>;

  return (
    <section id="pricing" className={styles.section}>
      <div className="section-inner">
        <div className="section-header">
          <div className="eyebrow">{t("eyebrow")}</div>
        </div>
        <h2 className="sec-title sec-title-center">
          {t("heading")} <em>{t("headingEm")}</em>
        </h2>

        <div className={styles.grid}>
          {PROGRAMME_ENUM_VALUES.map((key) => {
            const meta = PROGRAMME_CONFIG[key];
            const prog = items[key];
            if (!prog) return null;
            return (
              <div key={key} className={`${styles.prog} ${meta.featured ? styles.featured : ""}`}>
                {prog.badge && <div className={styles.badge}>{prog.badge}</div>}
                <div className={`${styles.name}${meta.featured ? ` ${styles.nameFeatured}` : ""}`}>
                  {meta.label}
                </div>
                <div className={styles.price}>{meta.price}</div>
                <div className={styles.note}>{prog.note}</div>
                <p className={styles.desc}>{prog.desc}</p>
                {prog.features.map((feature) => (
                  <div key={feature} className={styles.item}>
                    <span className={styles.check}>✦</span>
                    {feature}
                  </div>
                ))}
                <a
                  href={`mailto:${COMPANY.email}`}
                  className={`${styles.btn} ${
                    meta.btnStyle === "primary" ? styles.btnPrimary : styles.btnOutline
                  }`}
                >
                  {prog.btnLabel}
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
