"use client";

import { usePathname } from "next/navigation";
import { useMessages } from "next-intl";
import {
  DIMENSIONS,
  getVerdict,
  getInterpretationKey,
  scoreColor,
  scoreClass,
  type DimensionId,
} from "@/lib/assessment/data";
import { COMPANY } from "@/lib/config/company";
import { AUTH_ROUTES } from "@/lib/config/routes";
import { routing } from "@/i18n/routing";
import { STORAGE_KEYS, safeSessionSet } from "@/lib/utils/storage";
import styles from "./Assessment.module.css";

interface ResultsScreenProps {
  scores: Record<DimensionId, number>;
  overall: number;
  onRestart: () => void;
}

type AssessmentResultsI18n = {
  dimensions: Record<string, string>;
  verdicts: Record<string, { name: string; text: string }>;
  interpretations: Record<string, { low: string; mid: string; high: string }>;
  results: {
    startingPoint: string;
    ctaSub: string;
    ctaNoCommitment: string;
    saveResults: string;
    retake: string;
  };
};

export default function ResultsScreen({
  scores,
  overall,
  onRestart,
}: ResultsScreenProps) {
  const verdict = getVerdict(overall);
  // Preserve the visitor's marketing-site locale through to /register so a
  // German visitor on /de/ taking the overlay doesn't suddenly land on
  // English /register. In portal context (no /[locale] prefix) we fall
  // through to the canonical AUTH_ROUTES.register.
  const pathname = usePathname();
  const seg = pathname.split("/")[1];
  const isLocalePrefixed = (routing.locales as readonly string[]).includes(seg);
  const registerHref = isLocalePrefixed
    ? `/${seg}${AUTH_ROUTES.register}`
    : AUTH_ROUTES.register;

  const msgs = useMessages() as unknown as { assessment: AssessmentResultsI18n };
  const i18n = msgs.assessment;

  const verdictName = i18n.verdicts[verdict.i18nKey]?.name ?? verdict.name;
  const verdictText = i18n.verdicts[verdict.i18nKey]?.text ?? verdict.text;

  // No patient exists here — this runs on the public marketing site. There is
  // nobody to look a clinician up for, so the copy speaks about the team rather
  // than naming a doctor the visitor has not been assigned.
  const ctaSub = i18n.results.ctaSub.replace("{shortName}", COMPANY.shortName);

  return (
    <div className={`${styles.ovScreen} ${styles.active}`}>
      <div className={styles.vCard}>
        <div className={styles.vScore}>
          {overall}
          <span>/100</span>
        </div>
        <div className={styles.vName}>{verdictName}</div>
        <p className={styles.vText}>{verdictText}</p>
      </div>

      <div className={styles.rScores}>
        {DIMENSIONS.map((dim) => {
          const score = scores[dim.id];
          return (
            <div key={dim.id} className={styles.rScoreCard}>
              <div className={styles.rScIcon}>{dim.icon}</div>
              <div className={styles.rScName}>{i18n.dimensions[dim.id] ?? dim.id}</div>
              <div className={`${styles.rScN} ${scoreClass(score)}`}>
                {score}
              </div>
              <div className={styles.rScBar}>
                <div
                  className={styles.rScFill}
                  style={{ width: `${score}%`, background: scoreColor(score) }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div>
        {DIMENSIONS.map((dim) => {
          const score = scores[dim.id];
          const interpKey = getInterpretationKey(dim.id, score);
          const interpText = i18n.interpretations[dim.id]?.[interpKey];
          return (
            <div key={dim.id} className={styles.rDim}>
              <div className={styles.rDimTop}>
                <div className={styles.rDimName}>
                  {dim.icon} {i18n.dimensions[dim.id] ?? dim.id}
                </div>
                <div
                  className={`${styles.rDimScore} ${scoreClass(score)}`}
                >
                  {score}
                </div>
              </div>
              <div className={styles.rDimBar}>
                <div
                  className={styles.rDimFill}
                  style={{ width: `${score}%`, background: scoreColor(score) }}
                />
              </div>
              <div className={styles.rDimText}>{interpText}</div>
            </div>
          );
        })}
      </div>

      <div className={styles.rCta}>
        <div className={styles.rCtaTitle}>{i18n.results.startingPoint}</div>
        <div className={styles.rCtaSub}>{ctaSub}</div>
        <div className={styles.rCtaSubSpaced}>{i18n.results.ctaNoCommitment}</div>
        <div className={styles.rCtaBtns}>
          <a
            href={registerHref}
            className={styles.rBtnP}
            onClick={() => {
              safeSessionSet(
                STORAGE_KEYS.pendingAssessment,
                JSON.stringify({ scores, overallScore: overall })
              );
            }}
          >
            {i18n.results.saveResults}
          </a>
          <button type="button" className={styles.rBtnO} onClick={onRestart}>
            {i18n.results.retake}
          </button>
        </div>
      </div>
    </div>
  );
}
