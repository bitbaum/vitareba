"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Closes an open panel on an outside click or Escape. Extracted from
 * UserDropdown, which had this exact listener pair inline — now shared with
 * NotificationBell and the marketing mega menu, the third and what would have
 * been a fourth hand-copy of the same nine lines.
 *
 * `onClose` is read via a ref, not a dependency: an inline `() => setOpen(false)`
 * is a new function every render, and re-registering two document listeners on
 * every render (as opposed to once, on mount) is pure waste for a callback
 * this cheap to keep current in a ref instead.
 */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ref]);
}
