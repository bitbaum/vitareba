import bookingStyles from "./bookings.module.css";

type Clinician = { id: string; name: string | null; acceptingPatients: boolean };

/** Two-letter monogram for the clinician avatar; falls back to a neutral mark. */
function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Props = {
  clinicians: Clinician[];
  clinicianId: string | null;
  careTeam: string[];
  selfId: string | null;
  /** Sorted ascending open days for the currently selected clinician — used only to preview "next free". */
  nextFreeDay: string | null;
  onSelect: (id: string) => void;
};

/** Step 1 of the booking picker: "who you'd like to see". */
export function ClinicianPicker({ clinicians, clinicianId, careTeam, selfId, nextFreeDay, onSelect }: Props) {
  if (clinicians.length === 0) return null;

  return (
    <div className={bookingStyles.pickerStep}>
      <p className={bookingStyles.stepLabel}>1 · Who you&apos;d like to see</p>
      <div className={bookingStyles.clinicianRow} role="radiogroup" aria-label="Choose your clinician">
        {clinicians.map((c) => {
          const active = c.id === clinicianId;
          const mine = careTeam.includes(c.id);
          // Still browsable — seeing when a closed doctor would have room is
          // useful on its own, and the clinic may take a patient by
          // exception. Confirming a NEW booking with them is what the server
          // (and the confirm button) refuses. A dual-role clinician can
          // always book themselves regardless of their own intake setting —
          // caught live: without this exemption, George's own card read
          // "not accepting" against himself.
          const closedToMe = !c.acceptingPatients && !mine && c.id !== selfId;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`${bookingStyles.clinicianCard}${active ? ` ${bookingStyles.clinicianCardActive}` : ""}${closedToMe ? ` ${bookingStyles.clinicianCardClosed}` : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <span className={bookingStyles.clinicianAvatar} aria-hidden="true">
                {initials(c.name)}
              </span>
              <span className={bookingStyles.clinicianText}>
                <span className={bookingStyles.clinicianName}>
                  {c.name ?? "Clinician"}
                  {mine && <span className={bookingStyles.clinicianBadge}>Your clinician</span>}
                  {closedToMe && (
                    <span className={bookingStyles.clinicianBadgeWarn}>Not accepting new patients</span>
                  )}
                </span>
                <span className={bookingStyles.clinicianMeta}>
                  {closedToMe
                    ? "Viewing only — contact the clinic to book"
                    : active
                      ? nextFreeDay
                        ? `Next free: ${nextFreeDay}`
                        : "No open times right now"
                      : "See available times"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
