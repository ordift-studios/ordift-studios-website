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

type MinimalWorkshop = Pick<Workshop, "status" | "registrationDeadline">;

const NOW = new Date("2026-08-13T12:00:00.000Z");

function workshop(status: Workshop["status"], registrationDeadline: string | null): MinimalWorkshop {
  return { status, registrationDeadline };
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
