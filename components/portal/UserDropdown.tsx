"use client";

import { useState, useRef } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import styles from "./UserDropdown.module.css";
import { USER_ROLE, type UserRole } from "@/lib/config/auth";
import { ADMIN_ROUTES, PORTAL_ROUTES } from "@/lib/config/routes";
import { EMERGENCY_CONTACTS } from "@/lib/config/company";
import { useClickOutside } from "@/lib/hooks/useClickOutside";

interface Props {
  name: string;
  email: string;
  role: UserRole;
  /** Which shell the dropdown lives in — decides which side of the role switch to offer. */
  context?: "portal" | "admin";
}

function initials(name: string, email: string): string {
  if (name.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function UserDropdown({ name, email, role, context = "portal" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div ref={ref} className={styles.root}>
      <button
        type="button"
        className={styles.avatar}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="User menu"
      >
        {initials(name, email)}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.header}>
            <p className={styles.headerName}>{name || email}</p>
            {name && <p className={styles.headerEmail}>{email}</p>}
          </div>
          <div className={styles.items}>
            {role === USER_ROLE.admin && context === "portal" && (
              <Link href={ADMIN_ROUTES.root} className={styles.item} onClick={() => setOpen(false)}>
                Clinician area ↗
              </Link>
            )}
            {context === "admin" && (
              <Link
                href={PORTAL_ROUTES.dashboard}
                className={styles.item}
                onClick={() => setOpen(false)}
              >
                Patient portal ↗
              </Link>
            )}
            <Link
              href={PORTAL_ROUTES.checkin}
              className={styles.item}
              onClick={() => setOpen(false)}
            >
              Daily check-in
            </Link>
            <Link
              href={PORTAL_ROUTES.profile}
              className={styles.item}
              onClick={() => setOpen(false)}
            >
              Profile settings
            </Link>
          </div>
          {/* Persistent, not collapsible — reachable from any authed screen,
              which was the actual gap: EMERGENCY_CONTACTS existed but was
              never wired into either shell's chrome. */}
          <div className={styles.emergency}>
            <p className={styles.emergencyLabel}>In an emergency</p>
            {EMERGENCY_CONTACTS.map((c) => (
              <p key={`${c.region}-${c.number}`} className={styles.emergencyLine}>
                {c.number} <span className={styles.emergencyRegion}>· {c.label}</span>
              </p>
            ))}
          </div>
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.signOutBtn}
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
