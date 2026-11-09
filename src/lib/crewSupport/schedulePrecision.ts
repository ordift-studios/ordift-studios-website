import { isValidTimeZone, parseClock, zonedToUtcMs } from "./schedule";

// SCHEDULE PRECISION FOR CONFLICTS (pure). A Crew Support assignment already carries OPTIONAL call and finish times and a timezone (call_time, finish_time, event_timezone: free text, so some are unreadable).
// When both times are readable, the finish is after the call on the same day, and the timezone is known, the assignment occupies that daily window on EACH date from its start to its end date.
// In every other case (date-only assignments, unreadable or missing times, an overnight window, no timezone, an absurdly long range) the assignment is treated CONSERVATIVELY as the whole of each calendar
// date. Times are never inferred for historical records. Windows are half-open: an assignment that starts exactly when another ends does not overlap it.

export type Schedule = { start: string; end: string; callTime?: string | null; finishTime?: string | null; timezone?: string | null };
export const MAX_PRECISE_DAYS = 366;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function datesBetween(start: string, end: string): string[] | null {
  if (!DATE.test(start) || !DATE.test(end) || start > end) return null;
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) { out.push(new Date(t).toISOString().slice(0, 10)); if (out.length > MAX_PRECISE_DAYS) return null; }
  return out;
}

// the daily windows in UTC milliseconds, or null when the schedule must be handled conservatively
export function preciseWindows(s: Schedule): [number, number][] | null {
  if (!s.timezone || !isValidTimeZone(s.timezone)) return null;
  const call = parseClock(s.callTime), fin = parseClock(s.finishTime);
  if (!call || !fin || fin.h * 60 + fin.m <= call.h * 60 + call.m) return null;
  const dates = datesBetween(s.start, s.end);
  if (!dates) return null;
  return dates.map((d) => [zonedToUtcMs(d, call.h, call.m, s.timezone!), zonedToUtcMs(d, fin.h, fin.m, s.timezone!)] as [number, number]);
}
export const isPrecise = (s: Schedule) => preciseWindows(s) !== null;

const rangesOverlap = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

export function schedulesOverlap(a: Schedule, b: Schedule): boolean {
  const wa = preciseWindows(a), wb = preciseWindows(b);
  if (wa && wb) return wa.some((x) => wb.some((y) => rangesOverlap(x, y)));
  return a.start <= b.end && a.end >= b.start;                               // conservative: whole calendar dates, inclusive
}

export function localDateOf(ms: number, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// a confirmed ordinary booking segment (exact instants, in its own timezone) against an assignment's schedule
export function bookingOverlapsSchedule(seg: { startsAt: string; endsAt: string; timezone: string }, s: Schedule): boolean {
  const a = Date.parse(seg.startsAt), b = Date.parse(seg.endsAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;                       // unreadable: assume the worst
  const w = preciseWindows(s);
  if (w) return w.some((x) => rangesOverlap(x, [a, b]));
  const tz = isValidTimeZone(seg.timezone) ? seg.timezone : "UTC";
  return localDateOf(a, tz) <= s.end && localDateOf(b, tz) >= s.start;       // conservative
}
