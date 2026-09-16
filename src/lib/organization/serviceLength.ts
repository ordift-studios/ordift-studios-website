import { getEarliestEmploymentTerms } from "@/lib/organization/employmentTermsHistory";

// My Workspace HR Summary — Service Length (backlog sweep, 2026-09-16).
// Calendar-accurate years/months/days breakdown of genuine service,
// never a stored incrementing counter and never expressed in weeks
// (explicit requirement). Source of truth is the EARLIEST effective_from
// across a person's own employment_terms_history — the same "no
// separate hire_date field" convention longServiceBenefit.ts's
// calculateLongServiceBenefit() already established; this is the one
// genuine, already-recorded signal for "when did this person's real
// service begin," never invented or separately tracked.

export interface ServiceLengthBreakdown {
  years: number;
  months: number;
  days: number;
  totalDays: number;
}

// Adds `months` calendar months to a UTC date, clamping the day to the
// last day of the resulting month (e.g. Jan 31 + 1 month -> Feb 28/29,
// never a JS Date auto-rollover into March) — the same clamping rule
// every payroll/anniversary calculation implicitly relies on.
function addMonthsUTC(date: Date, months: number): Date {
  const totalMonths = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDayOfTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

// Pure — standard calendar (not naive day-division) year/month/day
// difference, so "1 year, 0 months, 3 days" reads the way a person
// actually experiences their own tenure, not an approximation. Finds
// the largest whole number of months that doesn't overshoot asOfDate
// (via the clamped month-adding above, so a Jan-31 start date is
// handled correctly against a 28/29-day February), then the remaining
// days are a plain date subtraction — never negative, never guessed.
export function computeServiceLengthBreakdown(startDate: string, asOfDate: string): ServiceLengthBreakdown {
  const start = new Date(`${startDate}T00:00:00Z`);
  const asOf = new Date(`${asOfDate}T00:00:00Z`);
  if (asOf < start) return { years: 0, months: 0, days: 0, totalDays: 0 };

  let totalMonths = (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12 + (asOf.getUTCMonth() - start.getUTCMonth());
  if (addMonthsUTC(start, totalMonths) > asOf) totalMonths -= 1;

  const anchor = addMonthsUTC(start, totalMonths);
  const days = Math.floor((asOf.getTime() - anchor.getTime()) / 86400000);
  const totalDays = Math.floor((asOf.getTime() - start.getTime()) / 86400000);

  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, days, totalDays };
}

// Pure formatting — never weeks. Drops leading zero components rather
// than always spelling out "0 years, 0 months": a two-week-old hire
// reads "14 days", not "0 years, 0 months, 14 days".
export function formatServiceLength(b: ServiceLengthBreakdown): string {
  if (b.years === 0 && b.months === 0) return `${b.totalDays} ${b.totalDays === 1 ? "day" : "days"}`;
  if (b.years === 0) return `${b.months} ${b.months === 1 ? "month" : "months"}, ${b.days} ${b.days === 1 ? "day" : "days"}`;
  return `${b.years} ${b.years === 1 ? "year" : "years"}, ${b.months} ${b.months === 1 ? "month" : "months"}, ${b.days} ${b.days === 1 ? "day" : "days"}`;
}

// DB-wiring: resolves the profile's genuine earliest employment-terms
// row and computes the breakdown against today. Returns null when no
// employment-terms history exists yet — never fabricates a start date.
export async function getServiceLengthSummary(
  profileId: string,
  asOfDate: string = new Date().toISOString().slice(0, 10)
): Promise<{ startDate: string; breakdown: ServiceLengthBreakdown; formatted: string } | null> {
  const earliest = await getEarliestEmploymentTerms(profileId);
  if (!earliest) return null;
  const breakdown = computeServiceLengthBreakdown(earliest.effectiveFrom, asOfDate);
  return { startDate: earliest.effectiveFrom, breakdown, formatted: formatServiceLength(breakdown) };
}
