"use client";

import { usePathname } from "next/navigation";
import styles from "@/app/(portal)/portal.module.css";
import { PORTAL_ROUTES, PORTAL_ROUTE_LABELS } from "@/lib/config/routes";

function getLabel(pathname: string): string {
  const label = (PORTAL_ROUTE_LABELS as Record<string, string>)[pathname];
  if (label) return label;
  if (pathname.startsWith(PORTAL_ROUTES.messages + "/")) return "Conversation";
  return "";
}

export function NavBreadcrumb() {
  const pathname = usePathname();
  const label = getLabel(pathname);
  if (!label) return null;

  return (
    <span className={styles.breadcrumb}>{label}</span>
  );
}
