/**
 * Nav icon set — ONE definition per glyph, for both nav surfaces.
 *
 * The patient portal and the clinician admin are the same product seen from
 * two sides, and seven of these glyphs were written out twice, byte for byte:
 * once in PortalNav and once in AdminNav — the calendar, the chat bubble, the
 * document, the person, the bar chart, the grid, the two figures. A clinician
 * who is also a patient switches between the two areas, so an icon that drifts
 * on one side reads as a different product on that side.
 *
 * Names here are the SHAPE, not the destination — `IcoGrid`, not `IcoToday` —
 * because the same shape means "Dashboard" to a patient and "Today" to a
 * clinician. Each nav maps route → glyph in its own ROUTE_ICONS.
 */
import type { ReactNode } from "react";

/**
 * The shared frame: 16px, 1.5 stroke, round joins. It was repeated on all
 * eighteen icons, so one icon drawn at a different weight would have looked
 * like a rendering bug rather than a typo.
 */
function Ico({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Four panes — portal "Dashboard", admin "Today". */
export const IcoGrid = () => (
  <Ico>
    <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
    <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
    <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
  </Ico>
);

/** Two figures — portal "Care Team", admin "Patients". */
export const IcoPeople = () => (
  <Ico>
    <circle cx="5.5" cy="5" r="2.25" />
    <path d="M1.5 14c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5" />
    <circle cx="11.5" cy="4.5" r="1.75" />
    <path d="M9.5 9.2c1.9.15 3.5 1.9 3.5 4.3" />
  </Ico>
);

/** Bookings, both sides. */
export const IcoCalendar = () => (
  <Ico>
    <rect x="1.5" y="3.5" width="13" height="11" rx="1.5" />
    <line x1="1.5" y1="7.5" x2="14.5" y2="7.5" />
    <line x1="5" y1="1.5" x2="5" y2="5.5" />
    <line x1="11" y1="1.5" x2="11" y2="5.5" />
  </Ico>
);

/** Messages, both sides. */
export const IcoChat = () => (
  <Ico>
    <path d="M2.5 2h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5.5l-3 2.5V3a1 1 0 0 1 1-1z" />
  </Ico>
);

/** Documents, both sides — and the portal's regulatory ledger. */
export const IcoDoc = () => (
  <Ico>
    <path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9.5 1.5z" />
    <polyline points="9.5,1.5 9.5,5.5 13.5,5.5" />
    <line x1="5" y1="8.5" x2="11" y2="8.5" />
    <line x1="5" y1="11" x2="8.5" y2="11" />
  </Ico>
);

/** Bar chart — portal "My Results", admin "Reports". */
export const IcoBars = () => (
  <Ico>
    <line x1="1.5" y1="14" x2="14.5" y2="14" />
    <rect x="3" y="8.5" width="2.5" height="5.5" rx="0.5" />
    <rect x="6.75" y="5.5" width="2.5" height="8.5" rx="0.5" />
    <rect x="10.5" y="2.5" width="2.5" height="11.5" rx="0.5" />
  </Ico>
);

/** One figure — "Profile" / "My Profile", both sides. */
export const IcoPerson = () => (
  <Ico>
    <circle cx="8" cy="5.5" r="3" />
    <path d="M1.5 14.5c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6" />
  </Ico>
);

/** Overflow ("More") — admin's mobile bottom bar. */
export const IcoMore = () => (
  <Ico>
    <circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="13" cy="8" r="1.1" fill="currentColor" stroke="none" />
  </Ico>
);

/** Inbox tray — admin "Applications". */
export const IcoTray = () => (
  <Ico>
    <path d="M1.5 9.5 4 3.5a1 1 0 0 1 .9-.6h6.2a1 1 0 0 1 .9.6l2.5 6" />
    <path d="M1.5 9.5v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3h-3.3a2 2 0 0 1-1.9 1.4H6.7a2 2 0 0 1-1.9-1.4H1.5z" />
  </Ico>
);

/** Zig-zag trend — portal "Daily Check-in". */
export const IcoTrend = () => (
  <Ico>
    <polyline points="1.5,9 5,5.5 8,11 11,3.5 14.5,7" />
  </Ico>
);

/** Clipboard — portal "Assessment". */
export const IcoClipboard = () => (
  <Ico>
    <path d="M5.5 2.5h1a1 1 0 0 1 2 0h1A1.5 1.5 0 0 1 11 4H5A1.5 1.5 0 0 1 5.5 2.5z" />
    <path d="M4 3.5H3a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4.5a1 1 0 0 0-1-1h-1" />
    <line x1="5.5" y1="7" x2="10.5" y2="7" />
    <line x1="5.5" y1="9.5" x2="8.5" y2="9.5" />
  </Ico>
);

/** Target — portal "My Goals". */
export const IcoTarget = () => (
  <Ico>
    <circle cx="8" cy="8" r="6" />
    <circle cx="8" cy="8" r="2.5" />
    <line x1="8" y1="1.5" x2="8" y2="2.5" />
    <line x1="8" y1="13.5" x2="8" y2="14.5" />
    <line x1="1.5" y1="8" x2="2.5" y2="8" />
    <line x1="13.5" y1="8" x2="14.5" y2="8" />
  </Ico>
);

/** Flask — portal "Labs & Vitals". */
export const IcoFlask = () => (
  <Ico>
    <path d="M6.5 1.5v4.2L2.8 12a1.5 1.5 0 0 0 1.3 2.3h7.8a1.5 1.5 0 0 0 1.3-2.3L9.5 5.7V1.5" />
    <line x1="5.5" y1="1.5" x2="10.5" y2="1.5" />
    <line x1="4.4" y1="9.5" x2="11.6" y2="9.5" />
  </Ico>
);
