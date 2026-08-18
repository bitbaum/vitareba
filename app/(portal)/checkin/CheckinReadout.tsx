import shared from "../portal.module.css";
import checkinStyles from "./checkin.module.css";
import { CHECKIN_SCALE_MAX, CHECKIN_SCALE_MIN } from "@/lib/config/portal";
import type { CheckinReadout as Readout, MetricReadout } from "@/lib/domain/checkin-readout";

const SCALE = Array.from(
  { length: CHECKIN_SCALE_MAX - CHECKIN_SCALE_MIN + 1 },
  (_, i) => i + CHECKIN_SCALE_MIN
);

/** "+0.8" / "−0.8" — a real minus sign, and never "-0". */
function deltaLabel(delta: number): string {
  const abs = Math.abs(delta);
  if (abs === 0) return "0";
  return `${delta > 0 ? "+" : "−"}${abs}`;
}

function deltaClass(m: MetricReadout): string {
  if (m.better === null) return checkinStyles.deltaFlat;
  return m.better ? checkinStyles.deltaBetter : checkinStyles.deltaWorse;
}

/**
 * Today's five numbers against the patient's own baseline — the answer to
 * "what did that tell me?", shown the moment they finish logging it.
 *
 * It states, it does not advise: the reading is arithmetic on the patient's
 * own data, while anything that reads like a recommendation belongs to the AI
 * (labelled, consented) or to the clinician who supervises it.
 */
export function CheckinReadout({ readout }: { readout: Readout }) {
  const { metrics, wellness, wellnessBaseline, baselineDays, headline } = readout;
  const wellnessDelta =
    wellnessBaseline === null ? null : Math.round((wellness - wellnessBaseline) * 10) / 10;

  return (
    <div className={shared.card}>
      <div className={checkinStyles.readoutTop}>
        <div className={checkinStyles.readoutScore}>
          <span className={`${shared.statValue} ${shared.statMd}`}>{wellness}</span>
          <span className={checkinStyles.readoutOutOf}>/ {CHECKIN_SCALE_MAX}</span>
        </div>
        <div>
          <p className={shared.cardTitleFlush}>Today&apos;s reading</p>
          <p className={checkinStyles.readoutBaseline}>
            {baselineDays === 0
              ? "No baseline yet"
              : wellnessDelta === null || wellnessDelta === 0
                ? `Level with your ${baselineDays}-day baseline of ${wellnessBaseline}`
                : `${deltaLabel(wellnessDelta)} on your ${baselineDays}-day baseline of ${wellnessBaseline}`}
          </p>
        </div>
      </div>

      <p className={checkinStyles.readoutHeadline}>{headline}</p>

      <ul className={checkinStyles.readoutRows}>
        {metrics.map((m) => (
          <li key={m.key} className={checkinStyles.readoutRow}>
            <span className={checkinStyles.readoutLabel}>{m.label}</span>
            <span className={checkinStyles.dots} aria-hidden="true">
              {SCALE.map((v) => (
                <span
                  key={v}
                  className={v <= m.value ? checkinStyles.dotFilled : checkinStyles.dot}
                />
              ))}
            </span>
            <span className={checkinStyles.readoutValue}>{m.value}</span>
            <span className={deltaClass(m)}>
              {m.delta === null ? "—" : deltaLabel(m.delta)}
              <span className={checkinStyles.srOnly}>
                {m.delta === null
                  ? " (no baseline yet)"
                  : ` versus a baseline of ${m.baseline}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
