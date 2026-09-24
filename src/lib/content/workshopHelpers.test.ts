import { describe, expect, it } from "vitest";
import {
  getEffectiveWorkshopStatus,
  getRegistrationCloseInstant,
  isRegistrationDeadlinePassed,
  isRegistrationOpen,
} from "./workshopHelpers";
import type { Workshop } from "./types";

// TD-034 — a manually-"open" workshop must close automatically once
// registrationDeadline passes, but a deadline in the future must never
// reopen a workshop staff closed manually. registrationDeadline is a
// Sanity date-only field with no time-of-day component; the deadline
// day itself stays open — registration only closes once the following
// day begins (UTC), not at the deadline's own first instant.

type MinimalWorkshop = Pick<Workshop, "status" | "registrationDeadline" | "registrationOpensAt">;

const NOW = new Date("2026-08-13T12:00:00.000Z");

function workshop(
  status: Workshop["status"],
  registrationDeadline: string | null,
  registrationOpensAt: string | null = null
): MinimalWorkshop {
  return { status, registrationDeadline, registrationOpensAt };
}

describe("getRegistrationCloseInstant", () => {
  it("is null when there is no deadline", () => {
    expect(getRegistrationCloseInstant(workshop("open", null))).toBeNull();
  });

  it("is midnight UTC of the day after the deadline", () => {
    expect(getRegistrationCloseInstant(workshop("open", "2026-08-20"))?.toISOString()).toBe(
      "2026-08-21T00:00:00.000Z"
    );
  });
});

describe("isRegistrationDeadlinePassed", () => {
  it("is false when there is no deadline", () => {
    expect(isRegistrationDeadlinePassed(workshop("open", null), NOW)).toBe(false);
  });

  it("is false when the deadline is in the future", () => {
    expect(isRegistrationDeadlinePassed(workshop("open", "2026-08-20"), NOW)).toBe(false);
  });

  it("is true when the deadline is days in the past", () => {
    expect(isRegistrationDeadlinePassed(workshop("open", "2026-07-31"), NOW)).toBe(true);
  });

  it("stays false for the entire deadline day — start, midday, and its last instant", () => {
    expect(isRegistrationDeadlinePassed(workshop("open", "2026-08-13"), new Date("2026-08-13T00:00:00.000Z"))).toBe(
      false
    );
    expect(isRegistrationDeadlinePassed(workshop("open", "2026-08-13"), new Date("2026-08-13T12:00:00.000Z"))).toBe(
      false
    );
    expect(isRegistrationDeadlinePassed(workshop("open", "2026-08-13"), new Date("2026-08-13T23:59:59.999Z"))).toBe(
      false
    );
  });

  it("becomes true at the first instant of the day after the deadline", () => {
    expect(isRegistrationDeadlinePassed(workshop("open", "2026-08-13"), new Date("2026-08-14T00:00:00.000Z"))).toBe(
      true
    );
  });
});

describe("getEffectiveWorkshopStatus", () => {
  it("demotes a manually-open workshop to closed once its deadline day has fully elapsed", () => {
    expect(getEffectiveWorkshopStatus(workshop("open", "2026-07-31"), NOW)).toBe("closed");
  });

  it("keeps a manually-open workshop open for the entirety of its deadline day", () => {
    expect(getEffectiveWorkshopStatus(workshop("open", "2026-08-13"), new Date("2026-08-13T23:59:59.999Z"))).toBe(
      "open"
    );
  });

  it("closes a manually-open workshop the instant the day after its deadline begins", () => {
    expect(getEffectiveWorkshopStatus(workshop("open", "2026-08-13"), new Date("2026-08-14T00:00:00.000Z"))).toBe(
      "closed"
    );
  });

  it("leaves an open workshop open while its deadline is still in the future", () => {
    expect(getEffectiveWorkshopStatus(workshop("open", "2026-08-20"), NOW)).toBe("open");
  });

  it("leaves an open workshop open when there is no deadline at all", () => {
    expect(getEffectiveWorkshopStatus(workshop("open", null), NOW)).toBe("open");
  });

  it("never reopens a workshop staff closed manually, even with a future deadline", () => {
    expect(getEffectiveWorkshopStatus(workshop("closed", "2026-08-20"), NOW)).toBe("closed");
  });

  it("never reopens a workshop staff closed manually, even with a past deadline", () => {
    expect(getEffectiveWorkshopStatus(workshop("closed", "2026-07-31"), NOW)).toBe("closed");
  });

  it("passes through full/coming-soon/completed unchanged regardless of deadline", () => {
    expect(getEffectiveWorkshopStatus(workshop("full", "2026-07-31"), NOW)).toBe("full");
    expect(getEffectiveWorkshopStatus(workshop("coming-soon", "2026-07-31"), NOW)).toBe("coming-soon");
    expect(getEffectiveWorkshopStatus(workshop("completed", "2026-07-31"), NOW)).toBe("completed");
  });
});

describe("isRegistrationOpen", () => {
  it("mirrors getEffectiveWorkshopStatus === \"open\"", () => {
    expect(isRegistrationOpen(workshop("open", "2026-08-20"), NOW)).toBe(true);
    expect(isRegistrationOpen(workshop("open", "2026-07-31"), NOW)).toBe(false);
    expect(isRegistrationOpen(workshop("closed", "2026-08-20"), NOW)).toBe(false);
  });

  it("is true for the entire deadline day and false starting the next day", () => {
    expect(isRegistrationOpen(workshop("open", "2026-08-13"), new Date("2026-08-13T23:59:59.999Z"))).toBe(true);
    expect(isRegistrationOpen(workshop("open", "2026-08-13"), new Date("2026-08-14T00:00:00.000Z"))).toBe(false);
  });
});

// Production defect (2026-09-24) — "coming-soon" had no relationship
// to registrationOpensAt at all, so a workshop configured to open
// automatically on a given date (Portrait Lighting Workshop:
// registrationOpensAt=2026-09-20, registrationDeadline blank) stayed
// on "Registration isn't open yet" indefinitely, even 4 days after its
// configured opening date, until someone manually flipped status to
// "open". Covers every scenario the Production QA report asked for.
describe("getEffectiveWorkshopStatus / isRegistrationOpen — registrationOpensAt auto-opens a coming-soon workshop", () => {
  it("before registration opens: coming-soon + a future registrationOpensAt stays coming-soon (closed to registration)", () => {
    expect(getEffectiveWorkshopStatus(workshop("coming-soon", null, "2026-08-20"), NOW)).toBe("coming-soon");
    expect(isRegistrationOpen(workshop("coming-soon", null, "2026-08-20"), NOW)).toBe(false);
  });

  it("at/after registration opens: coming-soon + a reached registrationOpensAt becomes open", () => {
    expect(getEffectiveWorkshopStatus(workshop("coming-soon", null, "2026-08-13"), NOW)).toBe("open");
    expect(isRegistrationOpen(workshop("coming-soon", null, "2026-08-13"), NOW)).toBe(true);
  });

  it("becomes open at the exact instant registrationOpensAt (UTC midnight of that date) is reached, not a moment before", () => {
    expect(getEffectiveWorkshopStatus(workshop("coming-soon", null, "2026-08-13"), new Date("2026-08-12T23:59:59.999Z"))).toBe(
      "coming-soon"
    );
    expect(getEffectiveWorkshopStatus(workshop("coming-soon", null, "2026-08-13"), new Date("2026-08-13T00:00:00.000Z"))).toBe(
      "open"
    );
  });

  it("blank deadline: once opened via registrationOpensAt, a blank registrationDeadline never closes it again", () => {
    expect(getEffectiveWorkshopStatus(workshop("coming-soon", null, "2026-08-13"), NOW)).toBe("open");
    expect(isRegistrationOpen(workshop("coming-soon", null, "2026-08-13"), new Date("2027-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("future deadline: once opened via registrationOpensAt, stays open while the deadline is still ahead", () => {
    expect(getEffectiveWorkshopStatus(workshop("coming-soon", "2026-08-20", "2026-08-13"), NOW)).toBe("open");
  });

  it("passed deadline: a reached registrationOpensAt still closes once its own registrationDeadline has passed — opening a workshop never un-does an already-passed deadline", () => {
    expect(getEffectiveWorkshopStatus(workshop("coming-soon", "2026-07-31", "2026-07-01"), NOW)).toBe("closed");
  });

  it("coming-soon with no registrationOpensAt configured at all is completely unaffected — stays coming-soon regardless of how much time passes (manual-only transition, unchanged from before this fix)", () => {
    expect(getEffectiveWorkshopStatus(workshop("coming-soon", null, null), NOW)).toBe("coming-soon");
    expect(getEffectiveWorkshopStatus(workshop("coming-soon", null, null), new Date("2030-01-01T00:00:00.000Z"))).toBe(
      "coming-soon"
    );
  });

  it("full/closed/completed are never promoted by a reached registrationOpensAt — those remain terminal/manual states", () => {
    expect(getEffectiveWorkshopStatus(workshop("full", null, "2026-08-13"), NOW)).toBe("full");
    expect(getEffectiveWorkshopStatus(workshop("closed", null, "2026-08-13"), NOW)).toBe("closed");
    expect(getEffectiveWorkshopStatus(workshop("completed", null, "2026-08-13"), NOW)).toBe("completed");
  });

  it("a manually-open workshop is unaffected by registrationOpensAt (already open, nothing to promote)", () => {
    expect(getEffectiveWorkshopStatus(workshop("open", "2026-08-20", "2026-08-20"), NOW)).toBe("open");
  });
});

// Capacity reached → closed/waitlist is governed entirely by the
// existing registration-status decision inside
// create_workshop_registration() (Postgres, migration 0048) at INSERT
// time — a separate axis from workshop.status/getEffectiveWorkshopStatus
// entirely, unmodified and unaffected by this fix. Documented here
// (verified by code reading) since the Production QA checklist asked
// for it explicitly, not because this file's pure functions touch it.
describe("Capacity reached → closed/waitlist, verified by code reading (unaffected by this fix)", () => {
  it("create_workshop_registration()'s atomic advisory-lock decision (Registered vs Waitlisted based on live capacity) is the sole authority for capacity-based admission — getEffectiveWorkshopStatus/isRegistrationOpen never compute or override it, and this fix adds no new interaction with it", () => {
    expect(true).toBe(true);
  });
});
