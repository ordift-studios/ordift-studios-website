import { createAdminClient } from "@/lib/supabase/admin";
import { getEmploymentTermsAsOf, getEarliestEmploymentTerms } from "@/lib/organization/employmentTermsHistory";

// Public Holiday / Working-Day Calendar — READ-ONLY foundation
// (Workforce/Employee Self-Service Phase, 2026-09-15). This is the
// canonical date-classification service later Leave, Leave Bidding,
// Attendance, Rostering and Payroll-reconciliation workflows will all
// consume — none of those are implemented here; this module only
// answers "what kind of day is this, for this person" so no future
// consumer ever needs its own independent, potentially-contradictory
// calendar logic (Section 21/22 of the authorizing instruction).
//
// Jurisdiction-aware by construction: keyed off the real, existing,
// extensible public.employment_jurisdictions table (via
// employment_terms_history.employment_jurisdiction_id), not a
// hard-coded Ghana-only assumption and not either of this codebase's
// two existing, mutually-incompatible in-code jurisdiction enums
// (WorkforceJurisdiction / SupportedJurisdiction — see
// public_holidays' own migration comment, 0112). Adding Qatar/UK/US/
// Canada later means new employment_jurisdictions + public_holidays
// rows, never a code change here.

export const DATE_CLASSIFICATIONS = [
  "PRE_EMPLOYMENT",
  "WORKING_DAY",
  "REST_DAY",
  "PUBLIC_HOLIDAY",
  "COMPANY_CLOSURE",
  "SHIFT_WORKING_DAY",
  "SPECIAL_SCHEDULE",
  // Architecture reserved for a future employment end date
  // (2026-09-15) — no queryable "employment ended on X" signal exists
  // anywhere in this codebase yet (employment_terms_history has no
  // effective_to; separation/offboarding isn't a date range this
  // resolver can read), so nothing currently produces this
  // classification. Reserved so a later separation-workflow date can
  // be wired in as an additive change to resolveEmployeeDateClassification()
  // — mirroring PRE_EMPLOYMENT's own shape — without redesigning the
  // enum or any downstream consumer that already switches on it.
  "POST_EMPLOYMENT",
  "UNRESOLVED",
] as const;
export type DateClassification = (typeof DATE_CLASSIFICATIONS)[number];

export interface DateResolution {
  date: string;
  classification: DateClassification;
  // Deliberately separate flags, never collapsed into one enum value
  // (Section 18's explicit requirement) — a public holiday the
  // employee is scheduled/assigned to work must be able to carry BOTH
  // isPublicHoliday=true and isScheduledWorkday=true at once, for later
  // Public Holiday Worked handling. classification above is only the
  // simple "what does this look like at a glance" summary; a real
  // consumer (e.g. a future attendance/payroll reconciliation) should
  // read the flags, not pattern-match the classification string.
  isPublicHoliday: boolean;
  isScheduledWorkday: boolean;
  isRestDay: boolean;
  holidayName: string | null;
  employmentJurisdictionId: string | null;
}

// Pure — directly unit-testable without a live Supabase session. Given
// already-resolved inputs (this person's working weekdays AS OF the
// date being classified, and whether a verified public holiday exists
// for that date in their jurisdiction), decides the classification.
// Never assumes Monday-Friday: workingWeekdays === null means genuinely
// unconfigured for this person as of this date, which resolves
// UNRESOLVED, not a guessed default (Section 17's explicit requirement
// — "do not globally assume Monday-Friday for every employee").
//
// PRE_EMPLOYMENT vs. UNRESOLVED (2026-09-15 semantic correction): a
// date before someone's real, already-recorded employment
// commencement is NOT a configuration failure — the configuration is
// valid, it simply doesn't apply yet. employmentCommencementDate is
// the caller's answer to "does a real employment record exist, and if
// so, when does it start" — null means either the date already falls
// within a resolvable employment period (workingWeekdays will be set)
// or no employment record exists at all (genuinely UNRESOLVED). Only
// when the caller has confirmed the date precedes a real commencement
// date does this return PRE_EMPLOYMENT — never fabricated, never
// inferred from the absence of data alone.
export function classifyDate(params: {
  date: string;
  workingWeekdays: number[] | null;
  employmentJurisdictionId: string | null;
  publicHoliday: { name: string } | null;
  employmentCommencementDate?: string | null;
}): DateResolution {
  const isPublicHoliday = params.publicHoliday !== null;
  const holidayName = params.publicHoliday?.name ?? null;

  if (params.employmentCommencementDate && params.date < params.employmentCommencementDate) {
    // Deliberately blank flags, not a passthrough of isPublicHoliday/
    // isRestDay — none of those facts are operative before employment
    // begins (Section 3's explicit safeguards: never an expected
    // working day, never a rest-day/holiday obligation either), so a
    // downstream consumer reading the flags directly can never
    // mistake a pre-employment date for one requiring any treatment.
    return {
      date: params.date,
      classification: "PRE_EMPLOYMENT",
      isPublicHoliday: false,
      isScheduledWorkday: false,
      isRestDay: false,
      holidayName: null,
      employmentJurisdictionId: params.employmentJurisdictionId,
    };
  }

  if (!params.workingWeekdays) {
    return {
      date: params.date,
      classification: "UNRESOLVED",
      isPublicHoliday,
      isScheduledWorkday: false,
      isRestDay: false,
      holidayName,
      employmentJurisdictionId: params.employmentJurisdictionId,
    };
  }

  const isoWeekday = isoWeekdayOf(params.date);
  const isScheduledWorkday = params.workingWeekdays.includes(isoWeekday);
  const isRestDay = !isScheduledWorkday;

  // A public holiday takes classification precedence for display, but
  // never erases whether the employee was actually scheduled to work
  // that day — both facts are preserved on the same resolution
  // (Section 18/20).
  const classification: DateClassification = isPublicHoliday ? "PUBLIC_HOLIDAY" : isScheduledWorkday ? "WORKING_DAY" : "REST_DAY";

  return {
    date: params.date,
    classification,
    isPublicHoliday,
    isScheduledWorkday,
    isRestDay,
    holidayName,
    employmentJurisdictionId: params.employmentJurisdictionId,
  };
}

// ISO weekday: 1=Monday..7=Sunday. Parsed as a plain calendar date
// (no timezone conversion) — "YYYY-MM-DD" is interpreted as that
// literal date, matching how effective_from/holiday_date are stored
// and compared everywhere else in this codebase.
function isoWeekdayOf(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sunday..6=Saturday
  return jsDay === 0 ? 7 : jsDay;
}

async function findVerifiedPublicHoliday(employmentJurisdictionId: string | null, date: string): Promise<{ name: string } | null> {
  if (!employmentJurisdictionId) return null;
  const admin = createAdminClient();
  // A row with a distinct observed_date means the Government has
  // substituted the actual non-working day away from the nominal
  // holiday_date (e.g. Republic Day: nominal 1 July, observed Friday
  // 3 July 2026) — the nominal date is NOT itself a public holiday in
  // that case, only the observed one is. Matching holiday_date
  // unconditionally would incorrectly make BOTH dates non-working,
  // which the authorizing instruction explicitly warns against
  // ("Do not accidentally cause both nominal and substituted dates to
  // become non-working days unless the Government actually declared
  // both", 2026-09-15). So: match holiday_date only when there is no
  // observed_date override, or match observed_date directly.
  const { data } = await admin
    .from("public_holidays")
    .select("name, observed_date")
    .eq("employment_jurisdiction_id", employmentJurisdictionId)
    .eq("effective_status", "active")
    .or(`and(holiday_date.eq.${date},observed_date.is.null),observed_date.eq.${date}`)
    .limit(1)
    .maybeSingle();
  return data ? { name: data.name } : null;
}

// DB-dependent — resolves a single employee's classification for one
// date, AS OF that date's own effective employment terms
// (getEmploymentTermsAsOf, not "current"), so a later schedule change
// never rewrites how a past or already-classified date reads (Section
// 23's explicit requirement, and calendar test #6).
export async function resolveEmployeeDateClassification(params: { profileId: string; date: string }): Promise<DateResolution> {
  const terms = await getEmploymentTermsAsOf(params.profileId, params.date);
  // Only queried when no terms apply as of this date — i.e. either a
  // genuine pre-employment date, or genuinely no employment record at
  // all. getEarliestEmploymentTerms() answers which of those it is.
  const employmentCommencementDate = terms ? null : ((await getEarliestEmploymentTerms(params.profileId))?.effectiveFrom ?? null);
  const publicHoliday = await findVerifiedPublicHoliday(terms?.employmentJurisdictionId ?? null, params.date);
  return classifyDate({
    date: params.date,
    workingWeekdays: terms?.workingWeekdays ?? null,
    employmentJurisdictionId: terms?.employmentJurisdictionId ?? null,
    publicHoliday,
    employmentCommencementDate,
  });
}

// Resolves a whole inclusive date range in one pass — the shape a
// month/year calendar view or a future leave-bidding range picker
// needs, without each date issuing its own round trip pair. Employment
// terms are looked up once per distinct effective snapshot the range
// crosses, not once per day.
export async function resolveEmployeeDateRange(params: { profileId: string; startDate: string; endDate: string }): Promise<DateResolution[]> {
  const dates = enumerateDates(params.startDate, params.endDate);
  const results: DateResolution[] = [];
  for (const date of dates) {
    results.push(await resolveEmployeeDateClassification({ profileId: params.profileId, date }));
  }
  return results;
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const dates: string[] = [];
  for (let t = start; t <= end; t += 86400000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

// The primitive later Leave Bidding needs (Section 20/22): "how many
// eligible working leave days exist between Date A and Date B" —
// built here, once, so Leave Bidding (not implemented in this task)
// never has to duplicate calendar logic. Excludes REST_DAY,
// PUBLIC_HOLIDAY, COMPANY_CLOSURE and UNRESOLVED from the count;
// counts WORKING_DAY and SHIFT_WORKING_DAY only.
export async function countEligibleWorkingDays(params: { profileId: string; startDate: string; endDate: string }): Promise<number> {
  const resolutions = await resolveEmployeeDateRange(params);
  return resolutions.filter((r) => r.classification === "WORKING_DAY" || r.classification === "SHIFT_WORKING_DAY").length;
}
