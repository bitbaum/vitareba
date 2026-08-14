// Programme and phase definitions — SSOT for all labels and descriptions
//
// Phase descriptions are addressed to one patient about their own care, so they
// must name that patient's doctor — which config cannot know. They carry a
// {clinician} placeholder instead; render them through `phaseDescription()`
// with a label resolved from care_team (lib/domain/clinician-label.ts).

/** Placeholder that `phaseDescription()` substitutes. */
export const CLINICIAN_PLACEHOLDER = "{clinician}";

export const PROGRAMME_ENUM_VALUES = [
  "edge_diagnostic",
  "riding_the_wave",
  "total_longevity",
] as const;

export const PHASE_ENUM_VALUES = [
  "intake",
  "assessment",
  "planning",
  "active",
  "review",
  "completed",
] as const;

export type ProgrammeKey = (typeof PROGRAMME_ENUM_VALUES)[number];
export type PhaseKey = (typeof PHASE_ENUM_VALUES)[number];

export const PROGRAMME_CONFIG: Record<
  ProgrammeKey,
  { label: string; description: string; duration: string; price: string; featured: boolean; btnStyle: "primary" | "outline" }
> = {
  edge_diagnostic: {
    label: "Edge Diagnostic",
    description:
      "Comprehensive metabolic and neuropsychological profiling to map your ADHD phenotype. Includes full biomarker panel, Inflection Edge assessment, and a detailed clinical report.",
    duration: "4–6 weeks",
    price: "CHF 2,400",
    featured: false,
    btnStyle: "outline",
  },
  riding_the_wave: {
    label: "Riding the Wave",
    description:
      "Structured 12-week optimisation programme targeting the specific bottlenecks in your neurotype. Combines metabolic intervention, environment design, and regular check-ins with your clinician.",
    duration: "12 weeks",
    price: "CHF 8,500",
    featured: true,
    btnStyle: "primary",
  },
  total_longevity: {
    label: "Full Ocean",
    description:
      "Full systemic health and cognitive longevity programme. Deep metabolic work, cognitive enhancement stack, and long-term monitoring. For patients committed to sustained peak performance.",
    duration: "Ongoing",
    price: "CHF 18,000",
    featured: false,
    btnStyle: "outline",
  },
};

export const PHASE_CONFIG: Record<
  PhaseKey,
  { label: string; description: string }
> = {
  intake: {
    label: "Intake",
    description:
      "{clinician} is reviewing your profile and assessment results. You will hear from them shortly to discuss next steps.",
  },
  assessment: {
    label: "Assessment",
    description:
      "Diagnostic phase underway. Complete your Inflection Edge assessment and check in daily so {clinician} has the full picture.",
  },
  planning: {
    label: "Planning",
    description:
      "{clinician} is designing your personalised protocol based on your profile. Expect your plan within the next few days.",
  },
  active: {
    label: "Active",
    description:
      "Your programme is underway. Follow your protocol, check in daily, and message {clinician} if anything changes.",
  },
  review: {
    label: "Review",
    description:
      "Progress review in progress. {clinician} is evaluating your outcomes against your baseline. A follow-up consultation will be scheduled.",
  },
  completed: {
    label: "Completed",
    description:
      "Programme completed. Your results are in your portal. Book a follow-up consultation to discuss ongoing support.",
  },
};

/**
 * A phase description with the patient's own clinician named in it.
 *
 * The only supported way to read `PHASE_CONFIG[...].description` for display —
 * reading it raw leaks a literal "{clinician}" to the patient. `clinician`
 * comes from `clinicianLabelFor(patientId)`; pass its neutral fallback when
 * there is no patient in context (an admin previewing a phase, for instance).
 */
export function phaseDescription(phase: PhaseKey, clinician: string): string {
  return PHASE_CONFIG[phase].description.replaceAll(CLINICIAN_PLACEHOLDER, clinician);
}
