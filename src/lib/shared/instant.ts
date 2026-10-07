// Timestamps must be compared as real instants, never as wall-clock
// strings. A <input type="datetime-local"> yields "2026-10-07T17:00" —
// no offset. `new Date()` on a server running in UTC reads that as
// 17:00 UTC, which for a user in Doha (UTC+3, so 14:00 UTC) is three
// hours in the FUTURE; that was the Crew Support QA bug where a valid
// past acceptance time was rejected as "in the future" (2026-10-07).
//
// The fix is structural, not an offset: the browser — the only place
// that knows the user's timezone — converts the entered local time to
// an ISO instant (with a Z/offset) before submitting, and the server
// accepts ONLY strings that carry an explicit offset. A naive string is
// rejected with a clear message instead of being guessed at.
const EXPLICIT_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

export function parseInstant(value: string): Date | null {
  const v = value.trim();
  if (!v || !EXPLICIT_OFFSET.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Browser-side: "2026-10-07T17:00" (the user's local wall time) → the
// exact instant as ISO-8601 UTC. Returns "" for blank/invalid input.
export function localInputToIso(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

// Browser-side: an ISO instant → the value a datetime-local input shows
// for the viewer's own timezone.
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
