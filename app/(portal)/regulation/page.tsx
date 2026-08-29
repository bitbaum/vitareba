import styles from "../portal.module.css";
import regStyles from "./regulation.module.css";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { REGULATORY_BLOCKS } from "@/lib/config/regulation";

export const metadata = { title: "Regulatory ledger" };

/**
 * The regulatory ledger: every feature this product built but may not switch
 * on (or must gate), with the law responsible, the people who passed it, and
 * who benefits. House rule — no silent missing features.
 */
export default function RegulationPage() {
  return (
    <div>
      <PortalPageHeader
        title={
          <>
            Switched off <em>by law</em>
          </>
        }
        subtitle="The regulatory ledger of this product"
      />

      <p className={regStyles.intro}>
        Some things this portal could do for you today are disabled — not because we didn&apos;t
        build them (we did; the code ships with every deployment), but because a law says they may
        not run, or may not run yet. We think you deserve to know exactly which law, who passed it,
        and who benefits — and to judge for yourself whether the trade was worth it. Some of these
        rules genuinely protect you. Some mostly protect an industry. We label our view of each; the
        facts below are checkable either way.
      </p>

      {REGULATORY_BLOCKS.map((block) => (
        <section key={block.id} id={block.id} className={regStyles.blockCard}>
          <div className={regStyles.blockHeader}>
            <h2 className={regStyles.blockFeature}>{block.feature}</h2>
            <span className={block.status === "blocked" ? styles.pillGold : styles.pillTeal}>
              {block.status === "blocked" ? "Fully blocked" : "Gated"}
            </span>
          </div>

          <p className={regStyles.blockWould}>
            <strong>What it would do:</strong> {block.whatItWouldDo}
          </p>
          <p className={regStyles.blockStatus}>{block.statusDetail}</p>

          <div className={regStyles.lawList}>
            {block.laws.map((law) => (
              <p key={law.cite} className={regStyles.law}>
                ⚖ <strong>{law.name}</strong> — passed by {law.passedBy}; {law.keyPeople}. In force:{" "}
                {law.inForce}. <span className={regStyles.lawCite}>{law.cite}</span>
              </p>
            ))}
          </div>

          <div className={regStyles.verdictGrid}>
            <div>
              <p className={regStyles.verdictLabel}>Intended to protect</p>
              <p className={regStyles.verdictText}>{block.intendedToProtect}</p>
            </div>
            <div>
              <p className={regStyles.verdictLabel}>Who benefits in practice</p>
              <p className={regStyles.verdictText}>{block.whoBenefitsInPractice}</p>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
