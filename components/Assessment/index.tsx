"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useMessages } from "next-intl";
import {
  DIMENSIONS,
  QUESTIONS,
  computeScores,
  type DimensionId,
} from "@/lib/assessment/data";
import { COMPANY } from "@/lib/config/company";
import { STORAGE_KEYS, safeSessionSet } from "@/lib/utils/storage";
import ResultsScreen from "./ResultsScreen";
import styles from "./Assessment.module.css";

interface Props {
  onClose: () => void;
  onComplete?: (scores: Record<DimensionId, number>, overallScore: number) => void;
  /** Render inside the surrounding layout (portal shell stays visible) instead of as a full-screen overlay. */
  embedded?: boolean;
}

type Screen = "intro" | "question" | "results";

type AssessmentI18n = {
  instrument: string;
  subtitle: string;
  intro: string;
  statsQuestions: string;
  statsDimensions: string;
  statsDuration: string;
  statsDurationLabel: string;
  beginButton: string;
  disclaimer: string;
  progressLabel: string;
  progressOf: string;
  scaleMin: string;
  scaleMax: string;
  back: string;
  next: string;
  seeResults: string;
  ariaClose: string;
  ariaRate: string;
  dimensions: Record<string, string>;
  questions: string[];
};

const emptyAnswers = () => Array<number | null>(QUESTIONS.length).fill(null);

export default function Assessment({ onClose, onComplete, embedded = false }: Props) {
  const [screen, setScreen] = useState<Screen>("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(emptyAnswers());

  const msgs = useMessages() as unknown as { assessment: AssessmentI18n };
  const i18n = msgs.assessment;

  useEffect(() => {
    // Only the full-screen overlay locks page scroll — embedded mode scrolls with the page.
    if (embedded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [embedded]);

  const start = useCallback(() => {
    setCurrentQ(0);
    setAnswers(emptyAnswers());
    setScreen("question");
  }, []);

  const selectAnswer = useCallback(
    (value: number) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[currentQ] = value;
        return next;
      });
    },
    [currentQ]
  );

  const goNext = useCallback(() => {
    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ((q) => q + 1);
    } else {
      setScreen("results");
    }
  }, [currentQ]);


  const goPrev = useCallback(() => {
    if (currentQ > 0) setCurrentQ((q) => q - 1);
  }, [currentQ]);

  const restart = useCallback(() => {
    setScreen("intro");
    setCurrentQ(0);
    setAnswers(emptyAnswers());
  }, []);

  const { scores: dimScores, overallScore } = useMemo(
    () => computeScores(answers),
    [answers]
  );

  // Keep ref in sync with latest onComplete (avoids stale closure without re-subscribing)
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    if (screen !== "results") return;
    // Notify parent (portal assessment page) if a callback is provided
    onCompleteRef.current?.(dimScores, overallScore);
    // For the guest overlay (no onComplete = anonymous visitor), record a lead
    // so Manuel can see how many visitors complete the assessment vs. register.
    if (!onCompleteRef.current) {
      fetch("/api/assessment-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overallScore }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.data?.id) {
            safeSessionSet(STORAGE_KEYS.pendingLeadId, data.data.id);
          }
        })
        .catch(() => {
          // Non-critical — don't break the results screen if tracking fails
        });
    }
  }, [screen, dimScores, overallScore]);

  const q = QUESTIONS[currentQ];
  const dim = DIMENSIONS.find((d) => d.id === q?.dimension);
  const answered = answers[currentQ];
  const progress = ((currentQ + 1) / QUESTIONS.length) * 100;
  const dimIndex = DIMENSIONS.findIndex((d) => d.id === q?.dimension);

  const handleAnswerKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setAnswers((prev) => {
          const next = [...prev];
          const cur = prev[currentQ];
          next[currentQ] = cur === null ? 1 : Math.min(5, cur + 1);
          return next;
        });
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setAnswers((prev) => {
          const next = [...prev];
          const cur = prev[currentQ];
          next[currentQ] = cur === null ? 5 : Math.max(1, cur - 1);
          return next;
        });
      } else if (e.key === "Enter" && answered !== null) {
        goNext();
      }
    },
    [currentQ, answered, goNext]
  );

  const introText = i18n.intro
    .replace("{count}", String(QUESTIONS.length))
    .replace("{dims}", String(DIMENSIONS.length));

  return (
    <div
      className={embedded ? `${styles.overlay} ${styles.embedded}` : styles.overlay}
      role={embedded ? "region" : "dialog"}
      aria-modal={embedded ? undefined : "true"}
      aria-labelledby="assessment-title"
    >
      <div className={styles.ovPb}>
        <div
          className={styles.ovPbFill}
          style={{
            width:
              screen === "results"
                ? "100%"
                : screen === "question"
                ? `${progress}%`
                : "0%",
          }}
        />
      </div>
      <button
        type="button"
        className={styles.ovClose}
        onClick={onClose}
        aria-label={i18n.ariaClose}
      >
        ×
      </button>

      {/* INTRO */}
      {screen === "intro" && (
        <div className={`${styles.ovScreen} ${styles.active}`}>
          <div className={styles.ovEyebrow}>
            {COMPANY.shortName} · {i18n.instrument}
          </div>
          <div className={styles.ovH1} id="assessment-title">
            Inflection
            <br />
            <em>Edge</em>
          </div>
          <div className={styles.ovH2}>{i18n.subtitle}</div>
          <p className={styles.ovSub}>{introText}</p>
          <div className={styles.ovStats}>
            <div>
              <div className={styles.ovStatN}>{QUESTIONS.length}</div>
              <div className={styles.ovStatL}>{i18n.statsQuestions}</div>
            </div>
            <div>
              <div className={styles.ovStatN}>{DIMENSIONS.length}</div>
              <div className={styles.ovStatL}>{i18n.statsDimensions}</div>
            </div>
            <div>
              <div className={styles.ovStatN}>{i18n.statsDuration}</div>
              <div className={styles.ovStatL}>{i18n.statsDurationLabel}</div>
            </div>
          </div>
          <div className={styles.ovDims}>
            {DIMENSIONS.map((d) => (
              <div key={d.id} className={styles.ovDim}>
                <div className={styles.ovDimIcon}>{d.icon}</div>
                <div className={styles.ovDimName}>{i18n.dimensions[d.id] ?? d.id}</div>
              </div>
            ))}
          </div>
          <button type="button" className={styles.ovStartBtn} onClick={start}>
            {i18n.beginButton}
          </button>
          <p className={styles.ovDisc}>{i18n.disclaimer}</p>
        </div>
      )}

      {/* QUESTION */}
      {screen === "question" && q && dim && (
        <div className={`${styles.ovScreen} ${styles.active}`}>
          <div className={styles.qDimLabel}>
            {dim.icon} {i18n.dimensions[dim.id] ?? dim.id}
          </div>
          <div
            className={styles.qProg}
            aria-live="polite"
            aria-atomic="true"
          >
            {currentQ + 1} / {QUESTIONS.length} · {i18n.progressLabel} {dimIndex + 1} {i18n.progressOf}{" "}
            {DIMENSIONS.length}
          </div>
          <div className={styles.qTrack}>
            <div
              className={styles.qTrackFill}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className={styles.qText}>{i18n.questions[currentQ] ?? q.text}</div>
          <div className={styles.qBtns} onKeyDown={handleAnswerKey}>
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                className={`${styles.qBtn}${answered === v ? ` ${styles.selected}` : ""}`}
                onClick={() => selectAnswer(v)}
                aria-label={i18n.ariaRate.replace("{n}", String(v))}
                aria-pressed={answered === v}
              >
                {v}
              </button>
            ))}
          </div>
          <div className={styles.qScale}>
            <span>{i18n.scaleMin}</span>
            <span>{i18n.scaleMax}</span>
          </div>
          <div className={styles.qNav}>
            <button
              type="button"
              className={styles.qPrev}
              onClick={goPrev}
              disabled={currentQ === 0}
            >
              {i18n.back}
            </button>
            <button
              type="button"
              className={`${styles.qNext}${answered !== null ? ` ${styles.enabled}` : ""}`}
              onClick={goNext}
              disabled={answered === null}
            >
              {currentQ === QUESTIONS.length - 1 ? i18n.seeResults : i18n.next}
            </button>
          </div>
        </div>
      )}

      {/* RESULTS */}
      {screen === "results" && (
        <ResultsScreen
          scores={dimScores}
          overall={overallScore}
          onRestart={restart}
        />
      )}
    </div>
  );
}
