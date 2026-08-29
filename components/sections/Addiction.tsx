import { getTranslations } from "next-intl/server";
import { COMPANY } from "@/lib/config/company";
import styles from "./Addiction.module.css";

export default async function Addiction() {
  const t = await getTranslations("addiction");
  const cards = t.raw("cards") as Array<{ label: string; text: string }>;

  return (
    <section className={styles.section}>
      <div className="section-inner">
        <div className={styles.grid}>
          <div>
            <div className="eyebrow eyebrow-gold">{t("eyebrow")}</div>
            <h2 className="sec-title sec-title-light">
              {t("heading")}
              <br />
              {t("headingMid")} <em>{t("headingEm")}</em>
              <br />
              {t("headingEnd")}
            </h2>
          </div>

          <div>
            <p className={styles.body}>{t("body1")}</p>
            <p className={`${styles.body} ${styles.bodyMb}`}>{t("body2")}</p>

            <div className={styles.cards}>
              {cards.map((card) => (
                <div key={card.label} className={styles.card}>
                  <div className={styles.cardLabel}>{card.label}</div>
                  <div className={styles.cardText}>{card.text}</div>
                </div>
              ))}
            </div>

            <a href={`mailto:${COMPANY.email}`} className={styles.enquireLink}>
              {t("enquire")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
