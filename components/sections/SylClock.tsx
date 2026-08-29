import { getTranslations } from "next-intl/server";
import styles from "./SylClock.module.css";

const DIM_KEYS = ["health", "mindset", "relationships", "career"] as const;
type DimKey = (typeof DIM_KEYS)[number];

const DIM_META: Record<DimKey, { icon: string }> = {
  health: { icon: "💚" },
  mindset: { icon: "🧠" },
  relationships: { icon: "🤝" },
  career: { icon: "🚀" },
};

type DimItem = { name: string; text: string };

export default async function SylClock() {
  const t = await getTranslations("sylClock");
  const dimensions = t.raw("dimensions") as Record<DimKey, DimItem>;

  return (
    <section id="longevity" className={styles.section}>
      <div className="section-inner">
        <div className={styles.grid}>
          <div>
            <div className={`eyebrow ${styles.eyebrowDim}`}>{t("eyebrow")}</div>
            <h2 className="sec-title sec-title-light">
              {t("heading")}
              <br />
              <em>{t("headingEm")}</em>
            </h2>
            <p className={styles.body}>{t("body")}</p>
          </div>

          <div>
            <div className={styles.dims}>
              {DIM_KEYS.map((key) => {
                const meta = DIM_META[key];
                const dim = dimensions[key];
                if (!dim) return null;
                return (
                  <div key={key} className={styles.dim}>
                    <div className={styles.dimIcon}>{meta.icon}</div>
                    <div className={styles.dimName}>{dim.name}</div>
                    <div className={styles.dimText}>{dim.text}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
