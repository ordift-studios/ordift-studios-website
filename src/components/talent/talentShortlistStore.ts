// Ordift Talent — TALENT-SYS-2B, Phase 5 (2026-09-08). A minimal
// useSyncExternalStore-compatible wrapper around localStorage — the
// React-recommended way to subscribe to an external mutable source
// (avoids the "setState synchronously in an effect" anti-pattern a
// naive useEffect-based sync would trigger). Browser-local only: never
// sent to the server, never tied to an account — see
// TalentShortlistButton.tsx's own comment on why this is deliberately
// NOT the authenticated client casting workspace.

export const TALENT_SHORTLIST_STORAGE_KEY = "ordift_talent_shortlist";
const CHANGE_EVENT = "ordift-talent-shortlist-changed";

// Caches the last-seen raw string alongside its parsed array so
// useSyncExternalStore's getSnapshot returns a REFERENTIALLY STABLE
// array whenever the underlying storage hasn't actually changed —
// otherwise a fresh JSON.parse() on every call would produce a new
// array instance each render and useSyncExternalStore would treat that
// as a perpetual change, looping forever.
let cachedRaw: string | null = null;
let cachedParsed: string[] = [];

export function readTalentShortlist(): string[] {
  try {
    const raw = window.localStorage.getItem(TALENT_SHORTLIST_STORAGE_KEY);
    if (raw === cachedRaw) return cachedParsed;
    cachedRaw = raw;
    cachedParsed = raw ? (JSON.parse(raw) as string[]) : [];
    return cachedParsed;
  } catch {
    return cachedParsed;
  }
}

export function writeTalentShortlist(slugs: string[]): void {
  try {
    window.localStorage.setItem(TALENT_SHORTLIST_STORAGE_KEY, JSON.stringify(slugs));
    // Same-tab subscribers don't receive the native "storage" event —
    // that only fires in OTHER tabs — so a custom event bridges
    // same-tab updates.
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Private browsing / storage blocked — callers still work for this
    // page view, it just won't persist. No crash either way.
  }
}

export function subscribeTalentShortlist(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

// Cached snapshot for useSyncExternalStore's getServerSnapshot — always
// empty (no localStorage on the server), and a stable reference so a
// re-render never sees a "snapshot changed" warning from an object
// that's structurally the same but a new array instance every call.
const EMPTY_SNAPSHOT: string[] = [];
export function getServerTalentShortlist(): string[] {
  return EMPTY_SNAPSHOT;
}
