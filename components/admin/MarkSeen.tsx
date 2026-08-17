"use client";

import { useEffect } from "react";

/**
 * "I've looked at this list" — clears one of the admin nav's seen-at gated
 * badges on mount. Renders nothing; used from server-component pages
 * (patients, applications) the same way the bookings page already fires its
 * own mark-seen call, but shared since this is now the 2nd and 3rd instance.
 */
export function MarkSeen({ navKey }: { navKey: "patients" | "applications" }) {
  useEffect(() => {
    fetch(`/api/admin/nav/mark-seen?key=${navKey}`, { method: "PATCH" }).catch(() => {});
  }, [navKey]);
  return null;
}
