import { describe, expect, it } from "vitest";
import {
  TALENT_CANDIDACY_STATUSES,
  isValidCandidacyTransition,
  isTerminalCandidacyStatus,
  isValidCandidacyStatus,
} from "./talentCandidacyLifecycle";

describe("TALENT_CANDIDACY_STATUSES", () => {
  it("is exactly the Founder-approved 8 statuses, in order", () => {
    expect(TALENT_CANDIDACY_STATUSES).toEqual([
      "candidate",
      "shortlisted",
      "contacted",
      "selected",
      "booked",
      "declined",
      "unavailable",
      "withdrawn",
    ]);
  });
});

describe("isValidCandidacyStatus", () => {
  it("rejects an unknown status", () => {
    expect(isValidCandidacyStatus("interviewing")).toBe(false);
  });
  it("accepts every real status", () => {
    for (const s of TALENT_CANDIDACY_STATUSES) expect(isValidCandidacyStatus(s)).toBe(true);
  });
});

describe("isValidCandidacyTransition — linear happy path, no skipping", () => {
  it("candidate can only move forward to shortlisted, or exit", () => {
    expect(isValidCandidacyTransition("candidate", "shortlisted")).toBe(true);
    expect(isValidCandidacyTransition("candidate", "declined")).toBe(true);
    expect(isValidCandidacyTransition("candidate", "unavailable")).toBe(true);
    expect(isValidCandidacyTransition("candidate", "withdrawn")).toBe(true);
    // never allowed to skip straight past shortlisted/contacted
    expect(isValidCandidacyTransition("candidate", "contacted")).toBe(false);
    expect(isValidCandidacyTransition("candidate", "selected")).toBe(false);
    expect(isValidCandidacyTransition("candidate", "booked")).toBe(false);
  });

  it("shortlisted can only move forward to contacted, or exit", () => {
    expect(isValidCandidacyTransition("shortlisted", "contacted")).toBe(true);
    expect(isValidCandidacyTransition("shortlisted", "declined")).toBe(true);
    expect(isValidCandidacyTransition("shortlisted", "candidate")).toBe(false);
    expect(isValidCandidacyTransition("shortlisted", "selected")).toBe(false);
  });

  it("contacted can only move forward to selected, or exit", () => {
    expect(isValidCandidacyTransition("contacted", "selected")).toBe(true);
    expect(isValidCandidacyTransition("contacted", "withdrawn")).toBe(true);
    expect(isValidCandidacyTransition("contacted", "booked")).toBe(false);
  });

  it('selected can only move forward to booked, or exit — never back to a lighter state', () => {
    expect(isValidCandidacyTransition("selected", "booked")).toBe(true);
    expect(isValidCandidacyTransition("selected", "declined")).toBe(true);
    expect(isValidCandidacyTransition("selected", "unavailable")).toBe(true);
    expect(isValidCandidacyTransition("selected", "withdrawn")).toBe(true);
    expect(isValidCandidacyTransition("selected", "contacted")).toBe(false);
    expect(isValidCandidacyTransition("selected", "candidate")).toBe(false);
  });

  it("selected and booked are distinct — selected never silently implies booked, and vice versa", () => {
    expect(isValidCandidacyTransition("candidate", "booked")).toBe(false);
    expect(isValidCandidacyTransition("shortlisted", "booked")).toBe(false);
    expect(isValidCandidacyTransition("contacted", "booked")).toBe(false);
    // the ONLY path into booked is from selected
    for (const from of TALENT_CANDIDACY_STATUSES) {
      if (from === "selected") continue;
      expect(isValidCandidacyTransition(from, "booked")).toBe(false);
    }
  });

  it("terminal statuses (booked/declined/unavailable/withdrawn) have no forward transitions at all", () => {
    for (const status of ["booked", "declined", "unavailable", "withdrawn"] as const) {
      for (const target of TALENT_CANDIDACY_STATUSES) {
        expect(isValidCandidacyTransition(status, target)).toBe(false);
      }
    }
  });
});

describe("isTerminalCandidacyStatus", () => {
  it("true only for booked/declined/unavailable/withdrawn", () => {
    expect(isTerminalCandidacyStatus("booked")).toBe(true);
    expect(isTerminalCandidacyStatus("declined")).toBe(true);
    expect(isTerminalCandidacyStatus("unavailable")).toBe(true);
    expect(isTerminalCandidacyStatus("withdrawn")).toBe(true);
    expect(isTerminalCandidacyStatus("candidate")).toBe(false);
    expect(isTerminalCandidacyStatus("shortlisted")).toBe(false);
    expect(isTerminalCandidacyStatus("contacted")).toBe(false);
    expect(isTerminalCandidacyStatus("selected")).toBe(false);
  });
});
