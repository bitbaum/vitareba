"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./NotificationBell.module.css";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { MESSAGE_POLL_INTERVAL_MS, BADGE_MAX_COUNT } from "@/lib/config/portal";
import { formatRelativeTime } from "@/lib/utils/format";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

/**
 * One component, mounted in both the admin and portal headers — not two
 * per-shell copies. It reads its own session-scoped data from
 * /api/notifications, so neither layout needs to pass it anything but the
 * server-computed initial count (avoids a loading flash on first paint).
 */
export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const { data } = await res.json();
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // Silent — the bell staying stale until the next poll is a nuisance,
      // not a failure worth surfacing.
    } finally {
      setLoading(false);
    }
  }, []);

  const pollCount = useCallback(async () => {
    if (document.hidden) return;
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const { data } = await res.json();
      setUnreadCount(data.unreadCount);
      // Keep an already-open panel's list in sync too, not just the badge.
      setItems((prev) => (prev !== null ? data.items : prev));
    } catch {
      // Same as above — a missed poll is invisible, not broken.
    }
  }, []);

  useEffect(() => {
    const id = setInterval(pollCount, MESSAGE_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollCount]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && items === null) void fetchList();
  }

  async function markAllRead() {
    setUnreadCount(0);
    setItems(
      (prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? prev,
    );
    try {
      await fetch("/api/notifications/mark-all-read", { method: "PATCH" });
    } catch {
      // Optimistic update stands even if the write fails — worst case the
      // badge reappears on the next poll, which is self-correcting.
    }
  }

  async function markOneRead(id: string) {
    setItems(
      (prev) =>
        prev?.map((n) =>
          n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n,
        ) ?? prev,
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch("/api/notifications/mark-read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // Same reasoning as markAllRead.
    }
  }

  return (
    <div ref={ref} className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        onClick={toggle}
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className={styles.badge}>
            {unreadCount > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.header}>
            <p className={styles.headerTitle}>Notifications</p>
            {unreadCount > 0 && (
              <button type="button" className={styles.markAllBtn} onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>

          {loading && items === null && <p className={styles.stateMsg}>Loading…</p>}

          {items !== null && items.length === 0 && (
            <p className={styles.stateMsg}>You&rsquo;re all caught up.</p>
          )}

          {items !== null && items.length > 0 && (
            <ul className={styles.list}>
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationRow
                    item={n}
                    onOpen={() => markOneRead(n.id)}
                    onClose={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  onOpen,
  onClose,
}: {
  item: NotificationItem;
  onOpen: () => void;
  onClose: () => void;
}) {
  const unread = !item.readAt;
  const content = (
    <>
      <span className={styles.rowDot} data-unread={unread} aria-hidden="true" />
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{item.title}</span>
        {item.body && <span className={styles.rowMeta}>{item.body}</span>}
        <span className={styles.rowTime}>
          {formatRelativeTime(new Date(item.createdAt), new Date())}
        </span>
      </span>
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        className={styles.row}
        onClick={() => {
          onOpen();
          onClose();
        }}
      >
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={styles.row} onClick={onOpen}>
      {content}
    </button>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.73 21a2 2 0 0 1-3.46 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
