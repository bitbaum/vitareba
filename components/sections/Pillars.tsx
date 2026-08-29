import { getTranslations } from "next-intl/server";
import styles from "./Pillars.module.css";

const PILLAR_KEYS = ["metabolic", "adhd", "psychedelic"] as const;
type PillarKey = (typeof PILLAR_KEYS)[number];

const PILLAR_META: Record<PillarKey, { icon: string; featured: boolean }> = {
  metabolic: { icon: "🧬", featured: false },
  adhd: { icon: "⚡", featured: true },
  psychedelic: { icon: "🍄", featured: false },
};

type PillarItem = { name: string; desc: string; tags: string[] };

export default async function Pillars() {
  const t = await getTranslations("pillars");
  const items = t.raw("items") as Record<PillarKey, PillarItem>;

  return (
    <section id="pillars" className={styles.section}>
      <div className="section-inner">
        <div className="section-header">
          <div className="eyebrow">{t("eyebrow")}</div>
        </div>
        <h2 className="sec-title sec-title-center">
          {t("heading")} <em>{t("headingEm")}</em>
        </h2>
        <p className={`sec-sub ${styles.secSub}`}>{t("sub")}</p>
        <div className={styles.grid}>
          {PILLAR_KEYS.map((key) => {
            const meta = PILLAR_META[key];
            const item = items[key];
            if (!item) return null;
            return (
              <div key={key} className={`${styles.pillar} ${meta.featured ? styles.featured : ""}`}>
                <div className={styles.icon}>{meta.icon}</div>
                <div className={styles.name}>{item.name}</div>
                <p className={styles.desc}>{item.desc}</p>
                <div className="tags">
                  {item.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
