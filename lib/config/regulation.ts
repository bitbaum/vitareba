/**
 * Regulatory ledger — SSOT for every feature this product built but cannot
 * switch on (or must gate) because of a law. Rendered by /regulation and
 * referenced by API 451 responses (HTTP 451: Unavailable For Legal Reasons).
 *
 * House rule: when regulation blocks a feature, we build it anyway, disable
 * it at the exact moment it would run, and tell the user which law did it,
 * who passed that law, and who benefits. No silent missing features.
 *
 * Facts only: statutes, dates, institutions and named public officeholders
 * (rapporteurs steering a law through parliament are public actors). The
 * "who benefits" lines name categories, not villains — judge for yourself.
 */

export type Law = {
  name: string;
  cite: string;
  passedBy: string;
  keyPeople: string;
  inForce: string;
};

export type RegulatoryBlock = {
  id: string;
  feature: string;
  whatItWouldDo: string;
  status: "blocked" | "gated";
  /** Shown on the ledger next to the status. */
  statusDetail: string;
  laws: Law[];
  intendedToProtect: string;
  whoBenefitsInPractice: string;
};

export const REGULATORY_BLOCKS: RegulatoryBlock[] = [
  {
    id: "ai-diagnosis",
    feature: "AI diagnosis (shipped as the Differential Discussion Aid)",
    whatItWouldDo:
      "Read your check-ins, Inflection Edge profile and history, and propose differential diagnoses and treatment options for your clinician — in seconds, at every visit.",
    status: "gated",
    statusDetail:
      "Software intended to DIAGNOSE is legally a medical device: CE conformity assessment through a notified body plus high-risk AI obligations — a seven-figure, multi-year path no two-person clinic can walk. So we shipped it as what it lawfully is: a discussion aid that surfaces hypotheses with for/against evidence for a qualified clinician to judge. It runs — and every single output carries the not-a-medical-device warning, so nobody can pretend they weren't told.",
    laws: [
      {
        name: "EU Medical Device Regulation (MDR)",
        cite: "Regulation (EU) 2017/745",
        passedBy: "European Parliament and the Council of the EU, 5 April 2017",
        keyPeople: "EP rapporteur Dame Glenis Willmott (S&D, UK)",
        inForce: "applies since 26 May 2021",
      },
      {
        name: "EU Artificial Intelligence Act",
        cite: "Regulation (EU) 2024/1689",
        passedBy: "European Parliament (13 March 2024) and the Council of the EU",
        keyPeople: "EP rapporteurs Brando Benifei (S&D, IT) and Dragoş Tudorache (Renew, RO)",
        inForce: "in force since 1 August 2024, high-risk duties phasing in",
      },
      {
        name: "Swiss Medical Devices Ordinance (MedDO/MepV)",
        cite: "SR 812.213",
        passedBy: "Swiss Federal Council (mirrors the MDR)",
        keyPeople: "Federal Council collective decision",
        inForce: "1 May 2021",
      },
    ],
    intendedToProtect: "Patients from unproven diagnostic software.",
    whoBenefitsInPractice:
      "Notified bodies and certification consultancies charging for CE marking; large medtech incumbents who can amortise the process; regulatory law firms. Small clinics and their patients wait.",
  },
  {
    id: "cloud-ai-processing",
    feature: "AI analysis of your clinical record",
    whatItWouldDo:
      "Summarise your trends for you and prepare an AI brief for your clinician before every consultation, so appointments start with insight instead of paperwork.",
    status: "gated",
    statusDetail:
      "Built and running. The consent the law demands is collected at the moment you first click generate — one click, timestamped, withdrawable in your profile. If the AI provider lacks a signed EU/CH data-processing agreement, the feature still runs, and every output carries a warning saying exactly which line your data crossed and with whose blessing (yours).",
    laws: [
      {
        name: "EU General Data Protection Regulation (GDPR)",
        cite: "Regulation (EU) 2016/679 — Art. 9 (health data), Art. 28 (processors), Ch. V (transfers)",
        passedBy: "European Parliament and the Council of the EU, 27 April 2016",
        keyPeople: "EP rapporteur Jan Philipp Albrecht (Greens, DE)",
        inForce: "25 May 2018",
      },
      {
        name: "Schrems II judgment",
        cite: "CJEU C-311/18",
        passedBy: "Court of Justice of the EU, 16 July 2020",
        keyPeople: "case brought by privacy activist Max Schrems; struck down the EU–US Privacy Shield",
        inForce: "immediate",
      },
      {
        name: "Swiss Federal Act on Data Protection (revFADP)",
        cite: "SR 235.1",
        passedBy: "Swiss Federal Assembly, 25 September 2020",
        keyPeople: "drafted under Federal Councillor Karin Keller-Sutter's justice department",
        inForce: "1 September 2023",
      },
      {
        name: "Medical professional secrecy",
        cite: "Swiss Criminal Code Art. 321",
        passedBy: "Swiss Federal Assembly, 21 December 1937",
        keyPeople: "the 1937 legislature — the oldest rule on this page, and the strictest",
        inForce: "1 January 1942",
      },
    ],
    intendedToProtect: "The confidentiality of your health data — genuinely.",
    whoBenefitsInPractice:
      "EU/CH-hosted cloud and AI vendors (compliance is their moat); privacy-compliance consultancies; and, in fairness, you — this is the one gate on this page we would keep even if it fell.",
  },
  {
    id: "instant-deletion",
    feature: "One-click permanent account erasure",
    whatItWouldDo:
      "A single button that immediately and irreversibly deletes your account and every byte of your data.",
    status: "gated",
    statusDetail:
      "Deletion is a managed request instead of an instant button: Swiss law obliges the clinic to retain medical records for 10 years, so your GDPR right to erasure and a criminal-law retention duty have to be reconciled by a human, not a DELETE statement.",
    laws: [
      {
        name: "GDPR right to erasure",
        cite: "Regulation (EU) 2016/679, Art. 17",
        passedBy: "European Parliament and the Council of the EU, 27 April 2016",
        keyPeople: "EP rapporteur Jan Philipp Albrecht (Greens, DE)",
        inForce: "25 May 2018",
      },
      {
        name: "Medical record retention (10 years)",
        cite: "Zürich Gesundheitsgesetz (health act) record-keeping duties; CO Art. 958f for business records",
        passedBy: "Cantonal parliament of Zürich / Swiss Federal Assembly",
        keyPeople: "cantonal legislature of Zürich",
        inForce: "long-standing",
      },
    ],
    intendedToProtect:
      "Erasure protects your autonomy; retention protects patients in malpractice disputes and continuity of care. The two collide, and retention wins for clinical records.",
    whoBenefitsInPractice:
      "Liability insurers and the malpractice-litigation system (records outlive disputes); archival-storage vendors; occasionally you, ten years later, when you need your own history.",
  },
];

export function getRegulatoryBlock(id: string): RegulatoryBlock | undefined {
  return REGULATORY_BLOCKS.find((b) => b.id === id);
}
