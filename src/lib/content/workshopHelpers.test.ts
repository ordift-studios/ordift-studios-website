import { describe, expect, it } from "vitest";
import {
  getEffectiveWorkshopStatus,
  isRegistrationDeadlinePassed,
  isRegistrationOpen,
} from "./workshopHelpers";
import type { Workshop } from "./types";

// TD-034 — a manually-"open" workshop must close automatically once
// registrationDeadline passes, but a deadline in the future must never
// reopen a workshop staff closed manually.

type MinimalWorkshop = Pick<Workshop, "status" | "registrationDeadline">;

const NOW = new Date("2026-08-13T12:00:00.000Z");

function workshop(status: Workshop["status"], registrationDeadline: string | null): MinimalWorkshop {
  return { status, registrationDeadline };
}

describe("isRegistrationDeadlinePassed", () => {
  it("is false when there is no deadline", () => {
    expect(isRegistrationDeadlinePassed(workshop("open", null), NOW)).toBe(false);
  });

  it("is false when the deadline is in the future", () => {
    expect(isRegistrationDeadlinePassed(workshop("open", "2026-08-20"), NOW)).toBe(false);
  });

  it("is true when the deadline is in the past", () => {
    expect(isRegistrationDeadlinePassed(workshop("open", "2026-07-31"), NOW)).toBe(true);
  });

  it("is true at the exact deadline instant (date-only field parses as UTC midnight)", () => {
    expect(isRegistrationDeadlinePassed(workshop("open", "2026-08-13"), NOW)).toBe(true);
  });
});

describe("getEffectiveWorkshopStatus", () => {
  it("demotes a manually-open workshop to closed once its deadline has passed", () => {
    expect(getEffectiveWorkshopStatus(workshop("open", "2026-07-31"), NOW)).toBe("closed");
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
});
