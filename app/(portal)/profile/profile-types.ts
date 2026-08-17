import type { ExerciseFrequency } from "@/lib/config/portal";
import type { BiologicalSex } from "@/lib/config/measurements";

export type ProfileData = {
  name: string;
  phone: string;
  dateOfBirth: string;
  biologicalSex: BiologicalSex | "";
  city: string;
  occupation: string;
  mainConcern: string;
  goals: string;
  diagnosisHistory: string;
  currentMedications: string;
  currentSupplements: string;
  sleepHoursAvg: number | "";
  exerciseFrequency: ExerciseFrequency | "";
  referralSource: string;
  notes: string;
  digestOptOut: boolean;
  reminderOptOut: boolean;
};

/** The shape of ProfileForm's `set(field)` helper — shared by every field-group so each one stays a pure renderer over the parent's single `form` state, not a second source of truth. */
export type FieldSetter = (
  field: keyof ProfileData
) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
