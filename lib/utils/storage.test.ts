/// <reference types="vitest/globals" />
import { STORAGE_KEYS, safeSessionGet, safeSessionSet, safeSessionRemove } from "./storage";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    _store: store,
  };
}

// ─── STORAGE_KEYS ─────────────────────────────────────────────────────────────

describe("STORAGE_KEYS", () => {
  it("has the correct key strings", () => {
    expect(STORAGE_KEYS.pendingAssessment).toBe("pendingAssessment");
    expect(STORAGE_KEYS.pendingLeadId).toBe("pendingLeadId");
  });

  it("has exactly two keys", () => {
    expect(Object.keys(STORAGE_KEYS)).toHaveLength(2);
  });
});

// ─── safeSessionGet ───────────────────────────────────────────────────────────

describe("safeSessionGet", () => {
  it("returns null when sessionStorage is unavailable (Node env)", () => {
    // No stub — sessionStorage is undefined in the Node test environment
    expect(safeSessionGet("anyKey")).toBeNull();
  });

  it("returns the stored value when sessionStorage is available", () => {
    vi.stubGlobal("sessionStorage", makeStorage({ hello: "world" }));
    expect(safeSessionGet("hello")).toBe("world");
    vi.unstubAllGlobals();
  });

  it("returns null for a key that does not exist", () => {
    vi.stubGlobal("sessionStorage", makeStorage());
    expect(safeSessionGet("missing")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("returns null and does not throw when getItem throws", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(() => safeSessionGet("k")).not.toThrow();
    expect(safeSessionGet("k")).toBeNull();
    vi.unstubAllGlobals();
  });
});

// ─── safeSessionSet ───────────────────────────────────────────────────────────

describe("safeSessionSet", () => {
  it("does not throw when sessionStorage is unavailable (Node env)", () => {
    expect(() => safeSessionSet("k", "v")).not.toThrow();
  });

  it("persists the value so safeSessionGet can read it back", () => {
    const s = makeStorage();
    vi.stubGlobal("sessionStorage", s);
    safeSessionSet("token", "abc123");
    expect(s._store.get("token")).toBe("abc123");
    vi.unstubAllGlobals();
  });

  it("does not throw when setItem throws (e.g. QuotaExceededError)", () => {
    vi.stubGlobal("sessionStorage", {
      setItem: () => {
        throw new DOMException("QuotaExceeded");
      },
    });
    expect(() => safeSessionSet("k", "v")).not.toThrow();
    vi.unstubAllGlobals();
  });

  it("overwrites an existing value", () => {
    const s = makeStorage({ existing: "old" });
    vi.stubGlobal("sessionStorage", s);
    safeSessionSet("existing", "new");
    expect(s._store.get("existing")).toBe("new");
    vi.unstubAllGlobals();
  });
});

// ─── safeSessionRemove ────────────────────────────────────────────────────────

describe("safeSessionRemove", () => {
  it("does not throw when sessionStorage is unavailable (Node env)", () => {
    expect(() => safeSessionRemove("k")).not.toThrow();
  });

  it("removes an existing key", () => {
    const s = makeStorage({ gone: "yes" });
    vi.stubGlobal("sessionStorage", s);
    safeSessionRemove("gone");
    expect(s._store.has("gone")).toBe(false);
    vi.unstubAllGlobals();
  });

  it("does not throw when removing a key that does not exist", () => {
    vi.stubGlobal("sessionStorage", makeStorage());
    expect(() => safeSessionRemove("nonexistent")).not.toThrow();
    vi.unstubAllGlobals();
  });

  it("does not throw when removeItem throws", () => {
    vi.stubGlobal("sessionStorage", {
      removeItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(() => safeSessionRemove("k")).not.toThrow();
    vi.unstubAllGlobals();
  });

  it("leaves other keys intact when removing one", () => {
    const s = makeStorage({ keep: "this", remove: "me" });
    vi.stubGlobal("sessionStorage", s);
    safeSessionRemove("remove");
    expect(s._store.has("remove")).toBe(false);
    expect(s._store.get("keep")).toBe("this");
    vi.unstubAllGlobals();
  });
});
