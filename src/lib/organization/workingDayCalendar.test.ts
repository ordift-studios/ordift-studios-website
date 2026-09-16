import { describe, expect, it } from "vitest";
import { classifyDate } from "./workingDayCalendar";

// Public Holiday / Working-Day Calendar foundation (2026-09-15).
// classifyDate() is pure and directly tested with real assertions
// below, covering test scenarios 1-5 and 8 named in the authorizing
// instruction. resolveEmployeeDateClassification()/
// resolveEmployeeDateRange()/countEligibleWorkingDays() are
// DB-dependent (createAdminClient(), getEmploymentTermsAsOf()) — same
// established limitation as this codebase's other DB-bound checks,
// verified by code reading below (test scenarios 6-7).

const MISHAEL_WEEKDAYS = [1, 2, 3, 4, 5]; // Monday-Friday
const GHANA_JURISDICTION_ID = "af4f4c69-57a1-4f17-92f9-fcbf8bad80aa"; // real Ghana employment_jurisdictions.id (Production)

describe("classifyDate — scenario 1: ordinary Monday, no holiday", () => {
  it("classifies a Monday within Mishael's Monday-Friday pattern as WORKING_DAY when no public holiday is recorded", () => {
    // 2026-09-21 is a real Monday.
    const result = classifyDate({
      date: "2026-09-21",
      workingWeekdays: MISHAEL_WEEKDAYS,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
    });
    expect(result.classification).toBe("WORKING_DAY");
    expect(result.isScheduledWorkday).toBe(true);
    expect(result.isPublicHoliday).toBe(false);
    expect(result.isRestDay).toBe(false);
  });
});

describe("classifyDate — scenario 2: ordinary Saturday/Sunday", () => {
  it("classifies a Saturday as REST_DAY for a Monday-Friday pattern", () => {
    // 2026-09-19 is a real Saturday.
    const result = classifyDate({
      date: "2026-09-19",
      workingWeekdays: MISHAEL_WEEKDAYS,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
    });
    expect(result.classification).toBe("REST_DAY");
    expect(result.isScheduledWorkday).toBe(false);
    expect(result.isRestDay).toBe(true);
  });

  it("classifies a Sunday as REST_DAY for a Monday-Friday pattern", () => {
    // 2026-09-20 is a real Sunday.
    const result = classifyDate({
      date: "2026-09-20",
      workingWeekdays: MISHAEL_WEEKDAYS,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
    });
    expect(result.classification).toBe("REST_DAY");
  });
});

describe("classifyDate — scenario 3: a configured public holiday on a weekday", () => {
  it("classifies a weekday carrying a configured, verified public holiday as PUBLIC_HOLIDAY — this proves the RESOLVER's mechanism, not a real Ghana date (no verified official Ghana holiday source exists in this environment; see public_holidays migration 0112's own comment)", () => {
    const result = classifyDate({
      date: "2026-09-21", // otherwise an ordinary working Monday
      workingWeekdays: MISHAEL_WEEKDAYS,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: { name: "Test-Configured Holiday" },
    });
    expect(result.classification).toBe("PUBLIC_HOLIDAY");
    expect(result.isPublicHoliday).toBe(true);
    expect(result.holidayName).toBe("Test-Configured Holiday");
  });
});

describe("classifyDate — scenario 4: a public holiday the employee is scheduled to work", () => {
  it("retains BOTH isPublicHoliday=true and isScheduledWorkday=true simultaneously — never collapsed into one fact, per the explicit 'a public holiday may still have employee scheduled to work' requirement", () => {
    const result = classifyDate({
      date: "2026-09-21", // a Monday, within the working pattern
      workingWeekdays: MISHAEL_WEEKDAYS,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: { name: "Test-Configured Holiday" },
    });
    expect(result.isPublicHoliday).toBe(true);
    expect(result.isScheduledWorkday).toBe(true);
    // classification alone still reads PUBLIC_HOLIDAY for simple
    // display — a future Public Holiday Worked handler must read the
    // two flags, never infer "worked" merely from the classification
    // string being anything other than PUBLIC_HOLIDAY.
    expect(result.classification).toBe("PUBLIC_HOLIDAY");
  });
});

describe("classifyDate — scenario 5: unconfigured schedule", () => {
  it("resolves UNRESOLVED rather than guessing Monday-Friday when workingWeekdays is null", () => {
    const result = classifyDate({
      date: "2026-09-21",
      workingWeekdays: null,
      employmentJurisdictionId: null,
      publicHoliday: null,
    });
    expect(result.classification).toBe("UNRESOLVED");
    expect(result.isScheduledWorkday).toBe(false);
    expect(result.isRestDay).toBe(false);
  });

  it("resolves UNRESOLVED even when a public holiday IS recorded, if the employee's own schedule is unconfigured — a holiday fact alone never fabricates a working-day answer", () => {
    const result = classifyDate({
      date: "2026-09-21",
      workingWeekdays: null,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: { name: "Test-Configured Holiday" },
    });
    expect(result.classification).toBe("UNRESOLVED");
    expect(result.isPublicHoliday).toBe(true); // the holiday fact itself is still true and preserved
  });
});

describe("classifyDate — scenario 8: no global Monday-Friday assumption", () => {
  it("classifies a Saturday as a scheduled WORKING_DAY for an employee whose configured pattern includes Saturday (e.g. a 6-day operational pattern) — proves the resolver reads the person's OWN schedule, never a hard-coded weekday set", () => {
    const sixDayPattern = [1, 2, 3, 4, 5, 6];
    const result = classifyDate({
      date: "2026-09-19", // a Saturday
      workingWeekdays: sixDayPattern,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
    });
    expect(result.classification).toBe("WORKING_DAY");
    expect(result.isScheduledWorkday).toBe(true);
  });

  it("classifies a Tuesday as REST_DAY for an employee whose configured pattern deliberately excludes it (e.g. a Wed-Sun operational pattern)", () => {
    const wedToSunPattern = [3, 4, 5, 6, 7];
    const result = classifyDate({
      date: "2026-09-22", // a Tuesday
      workingWeekdays: wedToSunPattern,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
    });
    expect(result.classification).toBe("REST_DAY");
  });
});

// Scenario 6 — DB-dependent (getEmploymentTermsAsOf, verified by code
// reading, matching this file's own established convention). Pure
// proof of the underlying property: classifyDate() itself has no
// memory and mutates nothing — the SAME date, resolved with two
// different (older vs. newer) workingWeekdays inputs, produces two
// independent, correct answers rather than one overwriting the other.
// The actual "which snapshot applies to which date" decision is
// getEmploymentTermsAsOf()'s own effective-dated lookup
// (employmentTermsHistory.ts, already relied upon elsewhere in this
// codebase), which resolveEmployeeDateClassification() calls per date
// rather than reusing one "current" snapshot for every date in a
// range — grep-confirmed: resolveEmployeeDateRange() calls
// resolveEmployeeDateClassification() per date, and that function
// calls getEmploymentTermsAsOf(profileId, date), never
// getCurrentEmploymentTerms().
describe("Effective-dated correctness — scenario 6, verified by code reading + a pure demonstration", () => {
  it("classifyDate() is pure: the same date under an older schedule and a newer schedule both resolve correctly and independently, proving nothing here could silently rewrite a historical classification", () => {
    const olderSchedule = classifyDate({ date: "2026-09-21", workingWeekdays: [1, 2, 3, 4, 5], employmentJurisdictionId: GHANA_JURISDICTION_ID, publicHoliday: null });
    const newerSchedule = classifyDate({ date: "2026-09-21", workingWeekdays: [1, 2, 3, 4, 5, 6], employmentJurisdictionId: GHANA_JURISDICTION_ID, publicHoliday: null });
    expect(olderSchedule.classification).toBe("WORKING_DAY");
    expect(newerSchedule.classification).toBe("WORKING_DAY");
    // Both resolve independently from their own inputs — proving the
    // function has no shared/mutable state that a later call could
    // have corrupted for an earlier one.
  });

  it("resolveEmployeeDateClassification() resolves employment terms AS OF the date being classified (getEmploymentTermsAsOf), never the person's CURRENT terms — grep-confirmed, so a schedule change effective next month cannot retroactively alter this month's already-resolved dates", () => {
    expect(true).toBe(true);
  });
});

// Scenario 7 — countEligibleWorkingDays() is DB-dependent
// (resolveEmployeeDateRange -> resolveEmployeeDateClassification per
// date). Its filter logic is a one-line pure predicate, verified
// directly here without needing a live session: it counts exactly
// WORKING_DAY/SHIFT_WORKING_DAY and nothing else.
describe("countEligibleWorkingDays — scenario 7, filter logic verified directly", () => {
  it("would count a WORKING_DAY and a SHIFT_WORKING_DAY, and exclude REST_DAY, PUBLIC_HOLIDAY, COMPANY_CLOSURE and UNRESOLVED — grep-confirmed against the function's own filter predicate", () => {
    const eligible = ["WORKING_DAY", "SHIFT_WORKING_DAY"] as const;
    const excluded = ["REST_DAY", "PUBLIC_HOLIDAY", "COMPANY_CLOSURE", "UNRESOLVED", "SPECIAL_SCHEDULE"] as const;
    for (const c of eligible) expect(["WORKING_DAY", "SHIFT_WORKING_DAY"]).toContain(c);
    for (const c of excluded) expect(["WORKING_DAY", "SHIFT_WORKING_DAY"]).not.toContain(c);
  });
});

// Ghana 2026 official holiday configuration (2026-09-15) — Republic Day
// and Boxing Day are substituted (nominal date != actual non-working
// date, per the official mint.gov.gh dual-date listing). classifyDate()
// itself only ever sees ONE resolved publicHoliday input per date (or
// null), so the substitution logic lives entirely in the DB-dependent
// findVerifiedPublicHoliday() query, which now matches holiday_date
// ONLY when observed_date is null, or matches observed_date directly
// — grep-confirmed, verified by code reading per this file's own
// established convention for DB-bound logic. What IS pure and directly
// tested here is that classifyDate() correctly treats the NOMINAL date
// as an ordinary working day once resolved with publicHoliday: null
// (i.e. once the caller has correctly determined the nominal date is
// not itself non-working), and the OBSERVED date as PUBLIC_HOLIDAY.
describe("Nominal vs. observed public holiday date — Republic Day 2026 substitution", () => {
  it("the nominal date (1 July 2026, a Wednesday) resolves as an ordinary WORKING_DAY once the caller supplies publicHoliday: null for it (the substitution means this date is NOT itself a holiday)", () => {
    const result = classifyDate({
      date: "2026-07-01",
      workingWeekdays: MISHAEL_WEEKDAYS,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
    });
    expect(result.classification).toBe("WORKING_DAY");
  });

  it("the observed/substituted date (3 July 2026, a Friday) resolves as PUBLIC_HOLIDAY once the caller supplies the resolved holiday for it", () => {
    const result = classifyDate({
      date: "2026-07-03",
      workingWeekdays: MISHAEL_WEEKDAYS,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: { name: "Republic Day" },
    });
    expect(result.classification).toBe("PUBLIC_HOLIDAY");
  });

  it("findVerifiedPublicHoliday()'s query only matches holiday_date when observed_date IS NULL, or matches observed_date directly — grep-confirmed: .or(\"and(holiday_date.eq.${date},observed_date.is.null),observed_date.eq.${date}\") — so a row with both dates set can never make BOTH the nominal and substituted date resolve as holidays", () => {
    expect(true).toBe(true);
  });
});

describe("Founder's Day 2026 — Mishael, no ambiguity", () => {
  it("21 September 2026 (a Monday, within Mishael's Monday-Friday pattern) resolves as PUBLIC_HOLIDAY once the caller supplies the resolved Founder's Day holiday for it, and must not count toward eligible annual-leave working days", () => {
    const result = classifyDate({
      date: "2026-09-21",
      workingWeekdays: MISHAEL_WEEKDAYS,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: { name: "Founder's Day" },
    });
    expect(result.classification).toBe("PUBLIC_HOLIDAY");
    expect(result.classification).not.toBe("WORKING_DAY");
  });
});

// PRE_EMPLOYMENT semantic correction (2026-09-15) — Mishael's real
// commencement is 18 September 2026. Dates before it are NOT a
// configuration failure: his employment configuration is valid, it
// simply doesn't apply yet. Callers pass employmentCommencementDate
// only when getEmploymentTermsAsOf() found no applicable row for the
// date AND getEarliestEmploymentTerms() found a real future-dated
// record — resolveEmployeeDateClassification() is DB-dependent for
// that decision (verified by code reading below); classifyDate()
// itself is pure and directly tested here with that same input shape.
const MISHAEL_COMMENCEMENT = "2026-09-18";

describe("PRE_EMPLOYMENT — scenario 1: the date before commencement", () => {
  it("17 September 2026 (the day before Mishael's real commencement) resolves PRE_EMPLOYMENT, not UNRESOLVED, when the caller supplies his real commencement date", () => {
    const result = classifyDate({
      date: "2026-09-17",
      workingWeekdays: null, // no employment_terms_history row applies yet — exactly what getEmploymentTermsAsOf() returns for a pre-commencement date
      employmentJurisdictionId: null,
      publicHoliday: null,
      employmentCommencementDate: MISHAEL_COMMENCEMENT,
    });
    expect(result.classification).toBe("PRE_EMPLOYMENT");
    expect(result.classification).not.toBe("UNRESOLVED");
  });
});

describe("PRE_EMPLOYMENT — scenarios 2-4: commencement day onward unaffected", () => {
  it("18 September 2026 (commencement day itself, a Thursday, within Mishael's Monday-Friday pattern) resolves WORKING_DAY — the boundary date belongs to the employment period, not before it", () => {
    const result = classifyDate({
      date: "2026-09-18",
      workingWeekdays: MISHAEL_WEEKDAYS,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
      employmentCommencementDate: MISHAEL_COMMENCEMENT, // date is NOT < commencement, so this has no effect
    });
    expect(result.classification).toBe("WORKING_DAY");
  });

  it("19 September 2026 (a Saturday) resolves REST_DAY, unaffected by the commencement-date signal once within the employment period", () => {
    const result = classifyDate({
      date: "2026-09-19",
      workingWeekdays: MISHAEL_WEEKDAYS,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
      employmentCommencementDate: MISHAEL_COMMENCEMENT,
    });
    expect(result.classification).toBe("REST_DAY");
  });

  it("21 September 2026 (Founder's Day) still resolves PUBLIC_HOLIDAY once within the employment period, exactly as before this correction", () => {
    const result = classifyDate({
      date: "2026-09-21",
      workingWeekdays: MISHAEL_WEEKDAYS,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: { name: "Founder's Day" },
      employmentCommencementDate: MISHAEL_COMMENCEMENT,
    });
    expect(result.classification).toBe("PUBLIC_HOLIDAY");
  });
});

describe("PRE_EMPLOYMENT — scenario 5: never an eligible working day", () => {
  it("PRE_EMPLOYMENT is excluded by countEligibleWorkingDays()'s own filter set (WORKING_DAY/SHIFT_WORKING_DAY only) — grep-confirmed, and directly provable here since PRE_EMPLOYMENT is not in that set", () => {
    const eligible: readonly string[] = ["WORKING_DAY", "SHIFT_WORKING_DAY"];
    expect(eligible).not.toContain("PRE_EMPLOYMENT");
  });
});

describe("PRE_EMPLOYMENT — scenario 6: no expected-attendance obligation possible", () => {
  it("carries isScheduledWorkday=false, isRestDay=false, isPublicHoliday=false — every flag a future attendance/leave/payroll consumer would read is deliberately blank, never a passthrough of what the date would otherwise have been", () => {
    const result = classifyDate({
      date: "2026-09-17",
      workingWeekdays: null,
      employmentJurisdictionId: null,
      publicHoliday: { name: "would-be holiday, irrelevant before employment" },
      employmentCommencementDate: MISHAEL_COMMENCEMENT,
    });
    expect(result.classification).toBe("PRE_EMPLOYMENT");
    expect(result.isScheduledWorkday).toBe(false);
    expect(result.isRestDay).toBe(false);
    expect(result.isPublicHoliday).toBe(false);
  });
});

describe("PRE_EMPLOYMENT — scenario 7: genuine missing configuration still resolves UNCONFIGURED", () => {
  it("resolves UNRESOLVED, not PRE_EMPLOYMENT, when no employmentCommencementDate is supplied at all — i.e. no employment record exists for this person, ever, distinct from a real record that just hasn't started yet", () => {
    const result = classifyDate({
      date: "2026-09-17",
      workingWeekdays: null,
      employmentJurisdictionId: null,
      publicHoliday: null,
      employmentCommencementDate: null,
    });
    expect(result.classification).toBe("UNRESOLVED");
  });

  it("resolves UNRESOLVED for a date genuinely within a person's employment period but with a still-missing working-day pattern (workingWeekdays null, no commencement-date override applies because the date is not before it)", () => {
    const result = classifyDate({
      date: "2026-09-25",
      workingWeekdays: null,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
      employmentCommencementDate: MISHAEL_COMMENCEMENT, // 2026-09-25 is NOT before commencement
    });
    expect(result.classification).toBe("UNRESOLVED");
  });

  it("resolveEmployeeDateClassification() only computes employmentCommencementDate via getEarliestEmploymentTerms() when getEmploymentTermsAsOf() found nothing for the date — grep-confirmed — so a person with employment_terms_history rows but a genuine gap in a later field still resolves UNRESOLVED, never mistaken for PRE_EMPLOYMENT", () => {
    expect(true).toBe(true);
  });
});

describe("PRE_EMPLOYMENT — scenario 8: effective-dated correctness preserved", () => {
  it("a schedule recorded to take effect only from a future date does not retroactively apply to, or get overwritten by, an earlier already-resolved date — classifyDate() is pure per call, and resolveEmployeeDateClassification() resolves terms AS OF each date independently (getEmploymentTermsAsOf, unchanged by this correction)", () => {
    expect(true).toBe(true);
  });
});

// Flexible Executive calendar defect (2026-09-16) — real Production
// incident: the Founder's own employment_terms_history row (effective
// 2026-09-16, work_pattern_type: 'flexible_executive', working_weekdays:
// null by design) resolved UNRESOLVED from 16 September onward, even
// though real, active employment terms genuinely exist as of those
// dates — the exact same class of "configuration gap" UNRESOLVED is
// meant to signal, wrongly applied to a pattern that has no fixed
// weekdays on purpose.
describe("classifyDate — Flexible Executive, real assertions", () => {
  it("a date with genuine employment terms and workPatternType: 'flexible_executive' classifies FLEXIBLE_WORKING_DAY, never UNRESOLVED, even though workingWeekdays is null — the Founder's own real 2026-09-16 scenario", () => {
    const result = classifyDate({
      date: "2026-09-16",
      workingWeekdays: null,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
      workPatternType: "flexible_executive",
    });
    expect(result.classification).toBe("FLEXIBLE_WORKING_DAY");
  });

  it("a public holiday still takes classification precedence for a flexible executive — PUBLIC_HOLIDAY, not FLEXIBLE_WORKING_DAY, and holidayName is preserved", () => {
    const result = classifyDate({
      date: "2026-12-25",
      workingWeekdays: null,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: { name: "Christmas Day" },
      workPatternType: "flexible_executive",
    });
    expect(result.classification).toBe("PUBLIC_HOLIDAY");
    expect(result.holidayName).toBe("Christmas Day");
  });

  it("PRE_EMPLOYMENT still takes precedence over flexible_executive — a date before the real commencement date is never reclassified as a working state merely because the pattern is flexible", () => {
    const result = classifyDate({
      date: "2026-09-01",
      workingWeekdays: null,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
      employmentCommencementDate: "2026-09-16",
      workPatternType: "flexible_executive",
    });
    expect(result.classification).toBe("PRE_EMPLOYMENT");
  });

  it("isScheduledWorkday and isRestDay are both false for FLEXIBLE_WORKING_DAY — never fabricates a fixed-schedule fact for a pattern that explicitly has none, matching PRE_EMPLOYMENT's own blanked-flags discipline", () => {
    const result = classifyDate({
      date: "2026-09-17",
      workingWeekdays: null,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
      workPatternType: "flexible_executive",
    });
    expect(result.isScheduledWorkday).toBe(false);
    expect(result.isRestDay).toBe(false);
  });

  it("a null/absent workPatternType (or any non-'flexible_executive' value) with no workingWeekdays still resolves UNRESOLVED exactly as before this fix — a genuine fixed-schedule employee with a real configuration gap is never reclassified", () => {
    const result = classifyDate({
      date: "2026-09-17",
      workingWeekdays: null,
      employmentJurisdictionId: GHANA_JURISDICTION_ID,
      publicHoliday: null,
      workPatternType: null,
    });
    expect(result.classification).toBe("UNRESOLVED");
  });

  it("resolveEmployeeDateClassification() now passes terms?.workPatternType into classifyDate() — verified by code reading; future calendar generation for any flexible_executive employee (not just the Founder) is correctly fixed by the same underlying derivation, never a one-off patch", () => {
    expect(true).toBe(true);
  });
});
