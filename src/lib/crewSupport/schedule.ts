// Schedule maths for assignments. Pure.
//
// A Crew Support job's schedule is stored as a calendar date + a free-text call time, with NO timezone.
// Everything time-sensitive (the 12-hour unanswered-readiness flag now; reminders in B2) therefore needs an
// explicit timezone: management's per-assignment override, else the market default (Qatar / Ghana).

export const MARKET_TIMEZONES: Record<string, string> = { QA: "Asia/Qatar", GH: "Africa/Accra" };
export const COMMON_TIMEZONES = ["Asia/Qatar", "Africa/Accra", "Asia/Dubai", "Europe/London", "UTC"];

export function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type EffectiveTimezone = { timezone: string | null; source: "override" | "market" | "unresolved" };

export function effectiveTimezone(input: { override: string | null | undefined; paymentCountry: string | null | undefined }): EffectiveTimezone {
  if (input.override && isValidTimeZone(input.override)) return { timezone: input.override, source: "override" };
  const market = input.paymentCountry ? MARKET_TIMEZONES[input.paymentCountry.toUpperCase()] : undefined;
  if (market) return { timezone: market, source: "market" };
  return { timezone: null, source: "unresolved" };
}

// "10:00", "9:30", "10:00 AM", "6pm" -> {h, m}; anything else -> null (call times are free text).
export function parseClock(raw: string | null | undefined): { h: number; m: number } | null {
  if (!raw) return null;
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*$/i.exec(raw);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase().replace(/\./g, "");
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  } else if (h > 23) return null;
  return { h, m: min };
}

// Offset (ms, local minus UTC) of `tz` at the UTC instant `utcMs`.
function offsetAt(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// Wall-clock `dateStr` (YYYY-MM-DD) + h:m in `tz` -> UTC milliseconds.
export function zonedToUtcMs(dateStr: string, h: number, m: number, tz: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  let utc = guess - offsetAt(guess, tz);
  utc = guess - offsetAt(utc, tz); // second pass settles daylight-saving boundaries
  return utc;
}

export type ScheduleStart = { startMs: number | null; callTimeKnown: boolean };

// The instant the assignment starts. An unreadable/missing call time falls back to the START OF THE DAY in
// the job's timezone — the earliest it could begin, so nothing is ever flagged late because of it — and the
// caller is told (callTimeKnown = false) so the interface can say so.
export function scheduleStart(input: { startDate: string; callTime: string | null; timezone: string | null }): ScheduleStart {
  if (!input.timezone) return { startMs: null, callTimeKnown: false };
  const clock = parseClock(input.callTime);
  return { startMs: zonedToUtcMs(input.startDate, clock?.h ?? 0, clock?.m ?? 0, input.timezone), callTimeKnown: Boolean(clock) };
}

// The end of the scheduled end date in the job's timezone (exclusive).
export function scheduleEndMs(input: { endDate: string; timezone: string | null }): number | null {
  if (!input.timezone) return null;
  const [y, mo, d] = input.endDate.split("-").map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10);
  return zonedToUtcMs(next, 0, 0, input.timezone);
}

// schedule_version is DERIVED (1 + number of recorded changes), never stored, so it cannot drift.
export function scheduleVersionFromChangeCount(changeCount: number): number {
  return Math.max(0, Math.floor(changeCount)) + 1;
}

export function formatInZone(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
}
